# Secure AI Virtual Lawyer — Australian Criminal Law (Cth + NSW)

A retrieval-augmented, citation-grounded question-answering system for Australian
criminal law. It answers natural-language questions using **only** the text of ingested
legislation and attaches a verifiable citation to every statement; when the governing law
is not in scope it refuses rather than guessing.

> Academic project (VIT ICT803 Professional Internship Project). Information only — **not legal advice**.

## Architecture

```
Browser (React SPA)
   │  HTTPS
serve.mjs (static + /api/chat proxy)
   │
n8n workflow  "Virtual Lawyer — AU Criminal Law (clean v1)"  (10 nodes)
   ├─ Injection Guard (sanitise input)
   ├─ Embed (Ollama · nomic-embed-text, 768-d)
   ├─ Qdrant Search (top-k 8 · collection criminal_code_cth)
   ├─ Score Gate (≥ 0.55)  ── fail ─► Refusal
   ├─ Gemini Draft (OpenRouter · google/gemini-2.5-flash, T=0.1)  "use only retrieved text"
   ├─ Groundedness Guard (block citations not in retrieved context)
   └─ Persist + Respond (JSONL audit log)
```

### Stack
| Layer | Technology |
|-------|-----------|
| Front end | React 19, Vite, TypeScript, Tailwind, Radix UI |
| Delivery | `serve.mjs` (node:http) + Tailscale Funnel |
| Orchestration | n8n (self-hosted, Docker) |
| Embeddings | Ollama `nomic-embed-text` (local, CPU, 768-d) |
| Vector store | Qdrant — collection `criminal_code_cth` (cosine) |
| Answer model | `google/gemini-2.5-flash` via OpenRouter |

### Guardrails
1. **Injection guard** — treats user input as data, strips injection patterns.
2. **Score gate (≥ 0.55)** — refuses when no section is a strong match.
3. **Retrieved-text-only prompt** — model may not use outside knowledge.
4. **Groundedness guard** — blocks any citation not present in the retrieved context.

## Repository Layout

| Path | Description |
|------|-------------|
| `ui/app/` | React + Vite front end (chat UI, citation chips, source panel). |
| `ui/screenshots/` | UI screenshots (chat, citations, refusal, light mode). |
| `ui/DESIGN-RESEARCH.md` | UI/design research notes. |
| `rag/ingest/` | Section-aware ingestion scripts (Commonwealth + NSW). |
| `rag/lib/` | Shared ingestion helpers. |
| `n8n/virtual-lawyer-clean-v1.workflow.json` | The n8n workflow (importable). |
| `control-hub/hub.py` | Control Hub dashboard (health, law DB browse, runs, proxy). |
| `docs/` | Corpus statistics and environment output. |

## Knowledge Base

- Qdrant collection `criminal_code_cth`: **3,117 points**, 768-dimension, cosine.
- **11 Acts** across two jurisdictions — Commonwealth (784) + NSW (2,333).
- Sources: Federal Register of Legislation (CC BY 4.0) and the Open Australian Legal
  Corpus (NSW, CC BY 4.0). See `docs/corpus_stats.json`.

## Running (outline)

1. Start Qdrant + n8n (Docker) and Ollama; pull `nomic-embed-text`.
2. Ingest legislation: `rag/ingest/ingest_cth.py`, `rag/ingest/ingest_nsw.py`
   (NSW data via the Open Australian Legal Corpus; large data files are not committed).
3. Import `n8n/virtual-lawyer-clean-v1.workflow.json` into n8n; set credentials
   (OpenRouter key; Qdrant/Ollama hosts) in n8n's credential store.
4. Build + serve the UI: in `ui/app/`, `npm install` then
   `APP_BASE=/lawyer/ npm run build` and run `server/serve.mjs`.

## Security Notes

- No secrets are committed. API keys live in n8n's encrypted credential store;
  Control Hub credentials come from environment (`hub.env`, git-ignored).
- The backend binds to localhost; public access is via an authenticated reverse proxy.

## Not Yet Complete

- Independent **hallucination / groundedness evaluation** (LLM-as-judge) — planned,
  numbers to be produced for the Test Report.
- Long multi-chunk sections are split on a character window; re-chunking on clean
  sentence boundaries is a known improvement.
