#!/usr/bin/env python3
"""Shared helpers for the AU Criminal-Law RAG ingest pipeline.

Embeddings via local Ollama nomic-embed-text (768-dim); Qdrant upsert against
the isolated qdrant-tanay instance. Legislation HTML parsing lives here too so
the Cth and NSW ingesters share one section-aware chunker.

All hosts are localhost-only. No secrets. legislation.gov.au / legislation.nsw.gov.au
are the only external hosts, both legally clean for automated + AI ingest
(CC BY 4.0 Cth; open NSW point-in-time). Crawl politely (Crawl-delay 10 on Cth).
"""
from __future__ import annotations

import html as html_lib
import re
import time
import uuid
from dataclasses import dataclass, field

import requests

# ---------------------------------------------------------------------------
# Config (localhost-only)
# ---------------------------------------------------------------------------
OLLAMA_URL = "http://127.0.0.1:11434"
EMBED_MODEL = "nomic-embed-text"
EMBED_DIM = 768
QDRANT_URL = "http://127.0.0.1:6340"  # qdrant-tanay host port

MAX_CHARS = 2200          # target chunk size before splitting a long section
OVERLAP_CHARS = 250       # overlap between sub-chunks of a long section

SESSION = requests.Session()
SESSION.headers.update(
    {"User-Agent": "tanay-legal-rag-research/1.0 (private research; localhost)"}
)

# Stable namespace so re-runs produce identical point IDs (idempotent upserts).
POINT_NS = uuid.UUID("6f3c0b9e-1a2b-4c3d-8e4f-a1b2c3d4e5f6")


# ---------------------------------------------------------------------------
# Section model (jurisdiction-agnostic)
# ---------------------------------------------------------------------------
@dataclass
class Section:
    sect_no: str
    title: str
    act: str
    jurisdiction: str          # "Commonwealth" | "New South Wales"
    source_url: str
    point_in_time: str         # as-at / in-force date, YYYY-MM-DD
    version: str               # compilation number / currency label
    chapter: str = ""
    part: str = ""
    division: str = ""
    subdivision: str = ""
    body: str = ""
    citation_override: str = ""

    @property
    def citation(self) -> str:
        if self.citation_override:
            return self.citation_override
        return f"s {self.sect_no} {self.act}"

    @property
    def hierarchy(self) -> str:
        bits = [b for b in (self.chapter, self.part, self.division, self.subdivision) if b]
        return " > ".join(bits)


@dataclass
class Chunk:
    text: str
    payload: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# HTML cleaning
# ---------------------------------------------------------------------------
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"[ \t ]+")


def clean_text(fragment: str) -> str:
    txt = TAG_RE.sub(" ", fragment)
    txt = html_lib.unescape(txt)
    txt = txt.replace("\xa0", " ")
    txt = WS_RE.sub(" ", txt)
    txt = re.sub(r" *\n *", "\n", txt)
    return txt.strip()


# ---------------------------------------------------------------------------
# Self-identifying chunking (shared)
# ---------------------------------------------------------------------------
def section_header(s: Section) -> str:
    h = f"{s.citation}"
    if s.title:
        h += f" — {s.title}"
    if s.hierarchy:
        h += f"\n[{s.hierarchy}]"
    return h


def chunk_sections(sections: list[Section]) -> list[Chunk]:
    chunks: list[Chunk] = []
    for s in sections:
        header = section_header(s)
        body = s.body.strip()
        full = f"{header}\n\n{body}".strip()

        if len(full) <= MAX_CHARS or not body:
            pieces = [full]
        else:
            pieces = []
            start = 0
            blen = len(body)
            while start < blen:
                end = min(start + MAX_CHARS, blen)
                nl = body.rfind("\n", start + int(MAX_CHARS * 0.6), end)
                if nl != -1 and end < blen:
                    end = nl
                seg = body[start:end].strip()
                pieces.append(f"{header}\n\n{seg}")
                if end >= blen:
                    break
                start = max(end - OVERLAP_CHARS, start + 1)

        total = len(pieces)
        for i, text in enumerate(pieces):
            payload = {
                "citation": s.citation,
                "section_number": s.sect_no,
                "title": s.title,
                "chapter": s.chapter,
                "part": s.part,
                "division": s.division,
                "subdivision": s.subdivision,
                "hierarchy": s.hierarchy,
                "act": s.act,
                "jurisdiction": s.jurisdiction,
                "point_in_time": s.point_in_time,
                "version": s.version,
                "in_force": True,
                "source_url": s.source_url,
                "chunk_index": i,
                "chunk_total": total,
                "text": text,
                "content": text,  # alias: n8n vectorStoreQdrant reads `content`
            }
            chunks.append(Chunk(text=text, payload=payload))
    return chunks


# ---------------------------------------------------------------------------
# Embeddings via Ollama
# ---------------------------------------------------------------------------
def embed(text: str) -> list[float]:
    r = SESSION.post(
        f"{OLLAMA_URL}/api/embeddings",
        json={"model": EMBED_MODEL, "prompt": text},
        timeout=120,
    )
    r.raise_for_status()
    vec = r.json()["embedding"]
    if len(vec) != EMBED_DIM:
        raise RuntimeError(f"unexpected embed dim {len(vec)}")
    return vec


# ---------------------------------------------------------------------------
# Qdrant
# ---------------------------------------------------------------------------
def ensure_collection(collection: str, recreate: bool = False) -> None:
    exists = SESSION.get(f"{QDRANT_URL}/collections/{collection}", timeout=30).status_code == 200
    if recreate and exists:
        SESSION.delete(f"{QDRANT_URL}/collections/{collection}", timeout=30)
        exists = False
    if not exists:
        r = SESSION.put(
            f"{QDRANT_URL}/collections/{collection}",
            json={"vectors": {"size": EMBED_DIM, "distance": "Cosine"}},
            timeout=30,
        )
        r.raise_for_status()
        print(f"[qdrant] collection '{collection}' created (dim={EMBED_DIM}, cosine)")
    # Payload indexes for hard metadata pre-filtering (jurisdiction + in_force + section).
    for field_name, schema in (
        ("jurisdiction", "keyword"),
        ("in_force", "bool"),
        ("section_number", "keyword"),
        ("act", "keyword"),
        ("part", "keyword"),
    ):
        SESSION.put(
            f"{QDRANT_URL}/collections/{collection}/index?wait=true",
            json={"field_name": field_name, "field_schema": schema},
            timeout=30,
        )


def delete_by_jurisdiction(collection: str, jurisdiction: str) -> None:
    """Remove only one jurisdiction's points (so re-ingesting Cth doesn't wipe NSW)."""
    r = SESSION.post(
        f"{QDRANT_URL}/collections/{collection}/points/delete?wait=true",
        json={"filter": {"must": [{"key": "jurisdiction", "match": {"value": jurisdiction}}]}},
        timeout=120,
    )
    r.raise_for_status()
    print(f"[qdrant] cleared existing '{jurisdiction}' points from '{collection}'")


def upsert_batch(collection: str, points: list[dict]) -> None:
    r = SESSION.put(
        f"{QDRANT_URL}/collections/{collection}/points?wait=true",
        json={"points": points},
        timeout=180,
    )
    r.raise_for_status()


def embed_and_upsert(collection: str, chunks: list[Chunk], id_prefix: str) -> int:
    batch: list[dict] = []
    done = 0
    for ch in chunks:
        vec = embed(ch.text)
        key = f"{id_prefix}:{ch.payload['section_number']}#{ch.payload['chunk_index']}"
        pid = str(uuid.uuid5(POINT_NS, key))
        batch.append({"id": pid, "vector": vec, "payload": ch.payload})
        if len(batch) >= 64:
            upsert_batch(collection, batch)
            done += len(batch)
            print(f"[upsert] {done}/{len(chunks)}")
            batch = []
    if batch:
        upsert_batch(collection, batch)
        done += len(batch)
        print(f"[upsert] {done}/{len(chunks)}")
    return done


def points_count(collection: str) -> int:
    info = SESSION.get(f"{QDRANT_URL}/collections/{collection}", timeout=30).json()
    return info["result"]["points_count"]
