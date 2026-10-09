# Virtual Lawyer — Criminal Code (Cth) Chat UI

An ultra-premium, citation-grounded web chat UI for the AU Criminal Law RAG
assistant (Commonwealth *Criminal Code Act 1995* (Cth)). Talks to the existing
n8n RAG workflow through the app's own proxy — the browser never contacts n8n
directly.

Design rationale and the research behind every visual/UX decision:
see **`../DESIGN-RESEARCH.md`**.

## Run it (one command)

Production (build + serve on one port):

```bash
npm install        # first time only
npm run serve      # builds, then serves http://127.0.0.1:5190
```

`npm run serve` = `npm run build && node server/serve.mjs`.
If `dist/` is already built, just `npm start`.

Dev (hot reload, same proxy via Vite middleware):

```bash
npm run dev        # http://127.0.0.1:5190
```

**Port: `5190`** (bound to `127.0.0.1`). Override with `PORT=... HOST=...`.

## How it connects

- Browser → `POST /api/chat` on **this app**.
- The app proxies to the n8n chat webhook
  `http://127.0.0.1:5679/webhook/criminalcode-rag-chat-p1/chat`
  with body `{"action":"sendMessage","chatInput","sessionId"}` and returns
  `{"output"}`. The webhook URL stays server-side (never shipped to the browser).
- Override the upstream with `N8N_WEBHOOK_URL=...` and timeout with
  `PROXY_TIMEOUT_MS=...`.

The same proxy handler (`server/chatProxy.mjs`) backs both the Vite dev
middleware and the standalone Node server, so dev and prod behave identically.

## What it does

- **Inline citation chips** — `(s 70.2(1) Criminal Code Act 1995 (Cth))` in the
  model's answer is parsed into an understated `§ 70.2(1)` chip. Hovering shows a
  popover with the **actual quoted statement** attributed to that section (the prose
  preceding the citation in the answer) plus a verify link; clicking opens the
  **Sources panel** scrolled to that section.
- **Sources panel** (right, on-demand) — numbered cards, one per cited section, each
  showing the real quoted statement (serif blockquote, Show-more for long quotes) and
  a link to the authoritative Federal Register of Legislation for verification. See
  `../DESIGN-RESEARCH.md §7` for how the quote is extracted (and why not from Qdrant).
- **Persistent "not legal advice" disclaimer** in the composer footer, plus a
  one-time scope banner; the model's trailing disclaimer line is rendered as a
  quiet inset note.
- Dark mode default ("Chambers after dark") + light mode ("brief on paper"),
  serif reading body (Newsreader) with Inter chrome and Plex Mono citations,
  honest in-flight status, Stop control, error states, keyboard-first
  (Enter / Shift+Enter / ⌘K / Esc), reduced-motion support, AA contrast.

## Honesty notes

- The n8n webhook returns the **complete answer in one response** (no SSE token
  stream). The UI therefore shows a genuine "Searching the Criminal Code…" status
  while the request is in flight, then renders the real answer. It does **not**
  fake a token-by-token stream it doesn't receive. If the backend later emits SSE,
  the render path can switch to true streaming.
- Source links point to the Act's series page on legislation.gov.au (reliable
  across compilations), not a per-section deep anchor — the lawyer opens and
  verifies the cited section there.
- `playwright` is a **dev-only** dependency used solely for verification
  screenshots (`npm run shoot`); it is not part of the shipped app.

## Stack

Vite + React + TypeScript + Tailwind, with hand-picked Radix primitives
(Popover) and `react-markdown` (+ `remark-gfm`, no raw HTML) for safe rendering.
Zero-dependency Node server for production. See `../DESIGN-RESEARCH.md §5` for why
Vite over Next.js here.

## Scripts

| command | does |
|---|---|
| `npm run dev` | dev server + proxy on :5190 |
| `npm run build` | typecheck + production build to `dist/` |
| `npm start` | serve existing `dist/` + proxy on :5190 |
| `npm run serve` | build then serve |
| `npm run shoot` | Playwright verification screenshots → `../screenshots/` |
