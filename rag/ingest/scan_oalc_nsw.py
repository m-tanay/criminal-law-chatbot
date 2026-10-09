#!/usr/bin/env python3
"""Stream the Open Australian Legal Corpus and characterise its NSW statute slice.

Does NOT download the whole 9.4 GB file to disk. Streams line-delimited JSON,
keeps only NSW primary legislation records, and (a) counts them, (b) saves the
matching records to data/nsw_oalc_raw.jsonl for the ingester, (c) prints whether
the core criminal acts (Crimes Act 1900, drug/road-transport/etc.) are present.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import requests

RESOLVE = ("https://huggingface.co/datasets/isaacus/open-australian-legal-corpus"
           "/resolve/main/corpus.jsonl")
OUT = Path(__file__).resolve().parent.parent / "data" / "nsw_oalc_primary.jsonl"

# Criminal-relevant NSW acts we want to confirm are present.
WANT = {
    "crimes act 1900": False,
    "crimes (sentencing procedure) act 1999": False,
    "crimes (domestic and personal violence) act 2007": False,
    "drug misuse and trafficking act 1985": False,
    "road transport act 2013": False,
    "summary offences act 1988": False,
    "bail act 2013": False,
    "criminal procedure act 1986": False,
}

def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    kept = 0
    seen = 0
    nsw_primary = 0
    citations: list[str] = []
    headers = {"User-Agent": "tanay-legal-rag-research/1.0 (private research)"}
    with requests.get(RESOLVE, headers=headers, stream=True, timeout=600) as r:
        r.raise_for_status()
        r.encoding = "utf-8"
        with OUT.open("w", encoding="utf-8") as out:
            for line in r.iter_lines(decode_unicode=True):
                if not line:
                    continue
                seen += 1
                try:
                    d = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if d.get("jurisdiction") != "new_south_wales":
                    continue
                if d.get("type") != "primary_legislation":
                    continue
                nsw_primary += 1
                cite = (d.get("citation") or "").strip()
                low = cite.lower()
                for w in WANT:
                    if w in low:
                        WANT[w] = True
                # keep the record
                out.write(json.dumps(d, ensure_ascii=False) + "\n")
                kept += 1
                if kept <= 50:
                    citations.append(cite)
                if seen % 200000 == 0:
                    print(f"[scan] seen={seen:,} nsw_primary={nsw_primary:,}", flush=True)
    print(f"[done] total_records={seen:,} nsw_primary_kept={kept:,}", flush=True)
    print("[want] core criminal acts present?", flush=True)
    for w, found in WANT.items():
        print(f"   {'YES' if found else 'no '}  {w}", flush=True)
    print("[sample citations]", flush=True)
    for c in citations[:50]:
        print("   ", c, flush=True)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
