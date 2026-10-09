#!/usr/bin/env python3
"""Full section-aware ingest of the Commonwealth Criminal Code Act 1995.

Source: Federal Register of Legislation (legislation.gov.au), CC BY 4.0,
robots allows *, Crawl-delay 10. Current in-force compilation resolved via the
OData API, then the authorised HTML is fetched.

ROOT-CAUSE FIX (vs the earlier incomplete ingest): the Code's HTML compilation
is split across MULTIPLE EPUB documents (document_1..document_N). The previous
script fetched only document_1 (Chapters 1,2,4,5,7), silently dropping Chapters
8, 9 (incl. Part 9.1 Serious Drug Offences) and 10. This version discovers and
parses EVERY document_N, so the whole Act is ingested.

Writes only the "Commonwealth" slice of the shared `criminal_code_cth`
collection (NSW points, if present, are preserved).
"""
from __future__ import annotations

import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.common import (  # noqa: E402
    SESSION,
    Section,
    chunk_sections,
    clean_text,
    delete_by_jurisdiction,
    embed_and_upsert,
    ensure_collection,
    points_count,
)

TITLE_ID = "C2004A04868"
API_BASE = "https://api.prod.legislation.gov.au/v1"
COLLECTION = "criminal_code_cth"
ACT = "Criminal Code Act 1995 (Cth)"
JURISDICTION = "Commonwealth"
CRAWL_DELAY = 10  # legislation.gov.au robots Crawl-delay
MAX_DOCS = 12     # safety bound when probing document_N


def resolve_current_version() -> dict:
    today = time.strftime("%Y-%m-%d")
    url = f"{API_BASE}/versions/find(titleid='{TITLE_ID}',asat={today})"
    r = SESSION.get(url, headers={"Accept": "application/json"}, timeout=60)
    r.raise_for_status()
    v = r.json()
    start = v["start"][:10]
    print(f"[version] compilation {v.get('compilationNumber')} start={start} "
          f"isLatest={v.get('isLatest')}")
    return {"start": start, "compilation": str(v.get("compilationNumber")),
            "isLatest": v.get("isLatest")}


def doc_url(start: str, n: int) -> str:
    return (f"https://www.legislation.gov.au/{TITLE_ID}/{start}/{start}"
            f"/text/original/epub/OEBPS/document_{n}/document_{n}.html")


def discover_and_download(start: str) -> list[tuple[int, str, str]]:
    """Return [(n, url, html)] for every existing document_N."""
    docs: list[tuple[int, str, str]] = []
    for n in range(1, MAX_DOCS + 1):
        url = doc_url(start, n)
        r = SESSION.get(url, timeout=180)
        if r.status_code == 404:
            print(f"[download] document_{n}: 404 (end of documents)")
            break
        r.raise_for_status()
        r.encoding = "utf-8"  # register mislabels charset; bytes are UTF-8
        print(f"[download] document_{n}: {len(r.text):,} chars")
        docs.append((n, url, r.text))
        time.sleep(CRAWL_DELAY)
    return docs


# --- HTML heading parsing (ported from the proven original parser) ---
BLOCK_RE = re.compile(
    r'<p\b[^>]*class="(?P<cls>[^"]+)"[^>]*>(?P<inner>.*?)</p>', re.S | re.I
)
HEAD_TAGS = {"ActHead1", "ActHead2", "ActHead3", "ActHead4", "ActHead5"}


def extract_lead_label(inner: str) -> tuple[str, str, str]:
    span_classes = re.findall(r'<span\s+class="(Char[A-Za-z]+)"', inner)
    kind_map = {
        "CharChapNo": "chapter",
        "CharPartNo": "part",
        "CharDivNo": "part",      # ActHead3 uses CharDivNo but labels "Part"
        "CharSubdNo": "division", # ActHead4 uses CharSubdNo but labels "Division"
        "CharSectno": "section",
    }
    kind = ""
    for sc in span_classes:
        if sc in kind_map:
            kind = kind_map[sc]
            break
    spans = re.findall(r"<span[^>]*>(.*?)</span>", inner, re.S)
    texts = [clean_text(s) for s in spans]
    texts = [t for t in texts if t]
    label = texts[0] if texts else ""
    title = " ".join(texts[1:]).strip() if len(texts) > 1 else ""
    return kind, label, title


def parse_document(doc: str, ctx: dict, acc: list[Section], meta: dict) -> dict:
    """Parse one document_N, continuing the Chapter/Part context across docs.

    Each document is self-contained for sections (a section never spans two
    documents), so the current-section accumulator starts empty per document;
    only the Chapter/Part/Division `ctx` carries across documents.
    """
    cur: Section | None = None

    for m in BLOCK_RE.finditer(doc):
        cls = m.group("cls").split()[0]
        inner = m.group("inner")

        if cls == "ActHead5":  # section
            if cur is not None:
                acc.append(cur)
            _, num, title = extract_lead_label(inner)
            cur = Section(
                sect_no=num, title=title, act=ACT, jurisdiction=JURISDICTION,
                source_url=meta["source_url_map"].get(num, meta["primary_url"]),
                point_in_time=meta["start"], version=meta["version"], **ctx,
            )
            continue

        if cls in ("ActHead1", "ActHead2", "ActHead3", "ActHead4"):
            kind, _num, _title = extract_lead_label(inner)
            label = clean_text(inner)
            if kind == "chapter":
                ctx.update(chapter=label, part="", division="", subdivision="")
            elif kind == "part":
                ctx.update(part=label, division="", subdivision="")
            elif kind == "division":
                ctx.update(division=label, subdivision="")
            else:
                ctx["subdivision"] = label
            if cur is not None:
                acc.append(cur)
                cur = None
            continue

        if cur is not None:
            frag = clean_text(inner)
            if frag:
                cur.body += ("\n" if cur.body else "") + frag

    if cur is not None:
        acc.append(cur)
    return ctx


def main() -> int:
    ver = resolve_current_version()
    docs = discover_and_download(ver["start"])
    if not docs:
        print("[fatal] no documents downloaded", file=sys.stderr)
        return 2
    print(f"[download] {len(docs)} documents total")

    sections: list[Section] = []
    ctx = {"chapter": "", "part": "", "division": "", "subdivision": ""}
    meta = {
        "start": ver["start"],
        "version": f"Compilation {ver['compilation']}",
        "primary_url": docs[0][1],
        "source_url_map": {},  # per-doc url resolution happens below
    }
    # Parse each document in order; Chapter/Part context carries forward.
    for n, url, html in docs:
        meta["primary_url"] = url
        before = len(sections)
        ctx = parse_document(html, ctx, sections, meta)
        print(f"[parse] document_{n}: +{len(sections) - before} sections "
              f"(running total {len(sections)})")

    # keep real numbered operative sections
    sections = [s for s in sections if s.sect_no and (s.body or s.title)]
    print(f"[parse] {len(sections)} sections total")
    if len(sections) < 300:
        print("[fatal] suspiciously few sections — aborting", file=sys.stderr)
        return 2

    chunks = chunk_sections(sections)
    print(f"[chunk] {len(chunks)} chunks")

    ensure_collection(COLLECTION, recreate=False)
    delete_by_jurisdiction(COLLECTION, JURISDICTION)
    done = embed_and_upsert(COLLECTION, chunks, id_prefix="cth")
    print(f"[done] upserted {done} Commonwealth chunks; "
          f"collection total now {points_count(COLLECTION)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
