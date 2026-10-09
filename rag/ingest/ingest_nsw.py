#!/usr/bin/env python3
"""Section-aware ingest of NSW criminal statute into qdrant-tanay.

Source: Open Australian Legal Corpus (isaacus/open-australian-legal-corpus),
CC BY 4.0. legislation.nsw.gov.au itself is Cloudflare-Turnstile walled for
bots, so we use OALC's permission-sourced NSW slice instead. OALC text is
already cleaned plain text (sections laid out as `\\n\\n<no> <Heading>\\n body`).

Scope = a curated set of NSW CRIMINAL statutes (not all NSW legislation). Only
these acts are ingested; everything else in the NSW primary slice is skipped.

Writes only the "New South Wales" slice of the shared `criminal_code_cth`
collection (Commonwealth points preserved). Each chunk carries the OALC
`date` as point_in_time and a snapshot marker in `version` so the 2024 currency
caveat travels with the data.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from lib.common import (  # noqa: E402
    Section,
    chunk_sections,
    delete_by_jurisdiction,
    embed_and_upsert,
    ensure_collection,
    points_count,
)

COLLECTION = "criminal_code_cth"
JURISDICTION = "New South Wales"
RAW = Path(__file__).resolve().parent.parent / "data" / "nsw_oalc_primary.jsonl"

# Curated NSW criminal statutes (lowercased citation substrings → short act label).
# These are the core of NSW criminal law: offences, procedure, sentencing, bail,
# evidence, drugs, DV, firearms, road-transport (drink/drug driving).
WANTED_ACTS: dict[str, str] = {
    "crimes act 1900": "Crimes Act 1900 (NSW)",
    "crimes (sentencing procedure) act 1999": "Crimes (Sentencing Procedure) Act 1999 (NSW)",
    "crimes (domestic and personal violence) act 2007": "Crimes (Domestic and Personal Violence) Act 2007 (NSW)",
    "crimes (administration of sentences) act 1999": "Crimes (Administration of Sentences) Act 1999 (NSW)",
    "criminal procedure act 1986": "Criminal Procedure Act 1986 (NSW)",
    "drug misuse and trafficking act 1985": "Drug Misuse and Trafficking Act 1985 (NSW)",
    "summary offences act 1988": "Summary Offences Act 1988 (NSW)",
    "bail act 2013": "Bail Act 2013 (NSW)",
    "evidence act 1995": "Evidence Act 1995 (NSW)",
    "firearms act 1996": "Firearms Act 1996 (NSW)",
    "road transport act 2013": "Road Transport Act 2013 (NSW)",
    "law enforcement (powers and responsibilities) act 2002": "Law Enforcement (Powers and Responsibilities) Act 2002 (NSW)",
}

# A section heading in OALC NSW text starts a line as: "<number><optional letter> <Title>"
# e.g. "18 Murder and manslaughter defined", "61HA Consent", "117 Punishment for larceny".
# We split the act body on these. Divisions/Parts appear as "Part 3 Offences..." lines.
SECTION_RE = re.compile(r"^(?P<no>\d+[A-Z]{0,3}(?:\.\d+)?)\s+(?P<title>\S.*)$")
PART_RE = re.compile(r"^(Part|Division|Chapter|Subdivision)\s+[0-9A-Za-z.\-]+\b.*$")


def match_act(citation: str) -> tuple[str, str] | None:
    low = citation.lower()
    for sub, label in WANTED_ACTS.items():
        if sub in low:
            # Guard against matching amending acts ("... Amendment Act")
            if "amendment" in low and sub not in ("crimes act 1900",):
                # still allow if the amendment act *is* one we explicitly want; none are
                return None
            return sub, label
    return None


def parse_act_sections(text: str, act_label: str, url: str, date: str) -> list[Section]:
    """Split one act's plain text into section records, tracking Part/Division."""
    lines = text.split("\n")
    sections: list[Section] = []
    cur: Section | None = None
    ctx = {"part": "", "division": "", "subdivision": ""}

    for raw_line in lines:
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped:
            if cur is not None:
                cur.body += "\n"
            continue

        # Part/Division/Chapter headings update context (only when line is a bare heading,
        # i.e. not indented body text — OALC indents body with 4 spaces).
        is_heading_indent = not raw_line.startswith(" ")
        if is_heading_indent and PART_RE.match(stripped):
            kind = stripped.split()[0].lower()
            if kind == "chapter":
                ctx = {"part": stripped, "division": "", "subdivision": ""}
            elif kind == "part":
                ctx["part"] = stripped
                ctx["division"] = ""
                ctx["subdivision"] = ""
            elif kind == "division":
                ctx["division"] = stripped
                ctx["subdivision"] = ""
            else:
                ctx["subdivision"] = stripped
            continue

        m = SECTION_RE.match(stripped) if is_heading_indent else None
        if m:
            # new section
            if cur is not None:
                sections.append(cur)
            cur = Section(
                sect_no=m.group("no"),
                title=m.group("title").strip(),
                act=act_label,
                jurisdiction=JURISDICTION,
                source_url=url,
                point_in_time=date,
                version="OALC 2024-09 snapshot",
                chapter="",
                part=ctx["part"],
                division=ctx["division"],
                subdivision=ctx["subdivision"],
                citation_override=f"s {m.group('no')} {act_label}",
            )
            continue

        # body line of current section
        if cur is not None:
            cur.body += ("\n" if cur.body else "") + stripped

    if cur is not None:
        sections.append(cur)

    # keep sections with real content; drop headnote fragments with no number
    sections = [s for s in sections if s.sect_no and (s.body.strip() or s.title)]
    return sections


def main() -> int:
    if not RAW.exists():
        print(f"[fatal] {RAW} not found — run scan_oalc_nsw.py first", file=sys.stderr)
        return 2

    picked: dict[str, dict] = {}  # act_label -> record (latest date wins)
    with RAW.open(encoding="utf-8") as f:
        for line in f:
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue
            mt = match_act(d.get("citation", ""))
            if not mt:
                continue
            _, label = mt
            prev = picked.get(label)
            if prev is None or (d.get("date", "") > prev.get("date", "")):
                picked[label] = d

    if not picked:
        print("[fatal] none of the wanted NSW acts found in corpus slice", file=sys.stderr)
        return 2

    print(f"[select] {len(picked)} NSW criminal acts matched:")
    all_sections: list[Section] = []
    for label, rec in sorted(picked.items()):
        secs = parse_act_sections(rec["text"], label, rec.get("url", ""), rec.get("date", ""))
        print(f"   {label}: {len(secs)} sections  (date {rec.get('date')}, {len(rec['text']):,} chars)")
        all_sections.extend(secs)

    print(f"[parse] {len(all_sections)} NSW sections total")
    chunks = chunk_sections(all_sections)
    print(f"[chunk] {len(chunks)} NSW chunks")

    ensure_collection(COLLECTION, recreate=False)
    delete_by_jurisdiction(COLLECTION, JURISDICTION)
    done = embed_and_upsert(COLLECTION, chunks, id_prefix="nsw")
    print(f"[done] upserted {done} NSW chunks; collection total now {points_count(COLLECTION)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
