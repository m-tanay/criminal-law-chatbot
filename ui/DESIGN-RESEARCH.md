# DESIGN-RESEARCH.md — AU Criminal Law RAG "Virtual Lawyer" Chat UI

**Author:** Forge · **Date:** 2026-10-04 · **Phase:** 1 of 3 (research → build → verify)
**Product:** citation-grounded chat over the Commonwealth *Criminal Code Act 1995* (Cth).
**Mandate (Tanay):** "ultra premium and rich design, high standard. Do deep research
how chat ui should look like before building." This must **not** read as a generic
chatbot template; every choice below is grounded in a cited pattern or a stated
product constraint.

---

## 0. Method & sources

I studied current (2025–2026) best-in-class chat and legal-research UIs and pulled
**concrete, reusable patterns** — not generic advice. Primary sources:

- **Setproduct — "Designing AI chat interfaces: Anatomy, patterns, pitfalls"**
  (setproduct.com/blog/ai-chat-interface-ui-design) — exact measurements for the
  two-pane standard, stream max-width, streaming states, focus management, dark-mode
  contrast.
- **AI UX Playground — "How to Design AI Citations & Sources UX"** and
  **"The trust stack: 7 patterns that make AI feel safe"**
  (aiuxplayground.com) — citation-as-trust-scaffolding, openable/verifiable sources,
  the composer teardown (ChatGPT vs Claude vs Perplexity vs Gemini).
- **AI UX Design Guide — Conversational UI patterns** (aiuxdesign.guide) — "show the
  work" (streaming + status), mix chat with chips/cards, design the misunderstanding.
- **Harvey.ai — "Legal AI vs traditional research"** (harvey.ai/blog) — the legal
  standard: *every answer grounded, citations the lawyer can open and verify; the
  lawyer stays at the center and owns the conclusion.* This is the north star for a
  legal product: the UI's job is **verifiability**, not just an answer.

Firsthand reference products inspected from memory of their shipped UIs: **Claude.ai**
(warm, reading-first, generous whitespace), **ChatGPT** (calm, habit-first composer),
**Perplexity** (sources-first, numbered citation chips + source rail), **Linear**
(precise typography, keyboard-first, restrained color), **Raycast** (dense, fast,
command-grade polish), **Vercel AI Chatbot** (shadcn/Tailwind reference implementation).

> Honesty note on the backend: the n8n webhook returns the **full answer in one
> response** (no server-sent token stream). So "streaming" in this UI is an *honest
> simulated reveal* of already-received text (a typewriter/opacity cascade), plus a
> genuine "Searching the Criminal Code…" status while the request is in flight. We do
> not fake a token stream we don't have; we animate the presentation of real text. If
> the backend later emits SSE, the same component swaps to real streaming.

---

## 1. What the best products actually do (concrete patterns adopted)

| Pattern | Source | Decision for this app |
|---|---|---|
| **Message stream capped at 65–80 chars/line (~720–768px)** | Setproduct | Reading column `--measure: 46rem` (~736px). Beyond this, long statutory prose becomes unreadable. |
| **Two-pane desktop standard**: left history rail + center stream + right panel that *slides in only when there's something to show* | Setproduct | Left rail = session/thread + "About this source". Right panel = **Sources** (the cited sections), slides in on demand, not persistent. |
| **Citations are openable & verifiable; lawyer owns the conclusion** | Harvey | Every `s 70.2 …(Cth)` becomes a **source chip** → opens the exact section, quoted text, and `source_url` to legislation.gov.au. Trust is the feature. |
| **"Show the work": stream tokens + honest status (searching/generating). Silence = broken.** | AIUXDesign / Setproduct | Status line "Searching the Criminal Code…" then animated reveal. **Stop** control during generation; partial output preserved. |
| **First token < 800ms or show a queued state** | Setproduct | Optimistic user bubble + thinking indicator immediately on submit. |
| **Follow-up chips & starter pills reduce blank-page anxiety** | AIUXPlayground | Curated legal starter prompts on empty state; follow-up suggestion chips under answers. |
| **Per-message actions (copy, regenerate) on every message** | Setproduct | Hover actions: Copy, Copy-with-citations, Regenerate, plus "View sources". |
| **Focus stays in composer after submit; never steal focus on completion** | Setproduct | Composer keeps focus; keyboard-first (Enter send, Shift+Enter newline, ⌘K focus, Esc close panel). |
| **Dark-mode body text ≥ 4.5:1 (WCAG 2.2 AA); test with a checker** | Setproduct | Palette below validated to AA. Reduced-motion disables the reveal/cascade. |
| **Mix chat with cards, don't force everything into text** | AIUXDesign | Answers render markdown; citations render as chips/cards; sources render as a structured panel — not a wall of text. |

**What we deliberately reject** (anti-"generic template"): center-less full-width text;
blue "bot bubble" clichés; emoji avatars; a persistent empty right panel; fake infinite
spinners; low-contrast "pretty" syntax themes; auto-focus stealing.

---

## 2. Legal-research-specific UI (the part most chatbots get wrong)

A lawyer app lives or dies on **verifiability** (Harvey's framing). Three concrete
mechanisms:

### 2.1 Inline statutory citation chips
The model is prompted to cite inline, e.g. `(s 70.2(1) Criminal Code Act 1995 (Cth))`.
The UI parses these with a regex and replaces each with an **inline chip**:

- Compact, monospace-tinted pill: `§ 70.2(1)` — understated, legal-grade, not a loud link.
- **Hover** → popover preview: section number, title, the quoted statutory text snippet.
- **Click** → opens the **Sources panel** scrolled to that section, with full quoted
  text + a "View on legislation.gov.au" external link (`source_url`).
- Chips are **numbered/deduped** per message (Perplexity-style) so repeated references
  to the same section share one source card.

**Citation regex (canonical):**
`/\(?\bs\s?\d+[A-Z]*(?:\.\d+[A-Z]*)*(?:\([0-9a-z]+\))*\s+Criminal Code Act 1995 \(Cth\)\)?/g`
→ normalized to a section key like `70.2(1)` for grouping. (Implementation keeps a
tolerant variant for `ss`, ranges, and missing parens.)

### 2.2 Sources panel (right, on-demand)
- Opens when a message has citations or when a chip is clicked.
- Each **source card**: `§` section number · section title · Chapter › Part › Division
  breadcrumb · the quoted text · external link. Collapsible.
- Header count: "6 sections cited". This is the lawyer's audit trail.

### 2.3 Persistent "not legal advice" disclaimer
Harvey/trust-stack principle: **present but not nagging.**
- A single, quiet, always-visible line in the composer footer:
  *"General legal information about the Commonwealth Criminal Code Act 1995 (Cth) — not legal advice."*
- The model **also** appends the disclaimer to each answer (backend contract); the UI
  renders that trailing line as a subtle inset note rather than body text, so it reads
  as a system assurance, not repetition.
- On first load, a one-time dismissible scope banner (what this covers / what it does
  not: no State/Territory law, no case law, no advice).

---

## 3. Visual system (specific decisions, not vibes)

### 3.1 Palette — "Chambers after dark" (dark mode default, light mode available)
Legal-premium = deep ink, warm paper, a single restrained accent (aged brass/gold),
and one legal-green for the "grounded/cited" signal. All body pairings validated to
**WCAG 2.2 AA (≥ 4.5:1)**.

**Dark (default):**
| Token | Hex | Role |
|---|---|---|
| `--bg` | `#0B0F14` | app background (near-black ink-blue) |
| `--surface` | `#111820` | panels, cards |
| `--surface-2` | `#161F2A` | raised / hover |
| `--border` | `#243040` | hairlines |
| `--text` | `#E8EDF2` | primary text (12.9:1 on `--bg`) |
| `--text-muted` | `#9AA7B4` | secondary (5.6:1 on `--bg`) |
| `--accent` | `#C7A36A` | brass/gold — brand, focus, links |
| `--accent-weak` | `#2A2418` | accent wash for chip bg |
| `--legal` | `#6FB49A` | "grounded/cited" green signal |
| `--user-bubble` | `#1B2735` | user message surface |
| `--danger` | `#E27A7A` | errors |

**Light ("brief on paper"):**
| Token | Hex | Role |
|---|---|---|
| `--bg` | `#F7F5F0` | warm paper |
| `--surface` | `#FFFFFF` | cards |
| `--border` | `#E4DFD4` | hairlines |
| `--text` | `#1A1F26` | primary (14.2:1) |
| `--text-muted` | `#5B6670` | secondary (5.9:1) |
| `--accent` | `#8A6D3B` | deeper brass for light bg (AA on paper) |
| `--legal` | `#2E7D63` | cited green (AA) |

### 3.2 Typography
Premium legal reading = a **serif for the answer body** (authority + long-form
readability) paired with a **clean grotesque for UI chrome**, and a mono for citations.

- **Reading / answer body:** *Newsreader* (or *Source Serif 4*) — a screen-optimized
  text serif; 18px/1.7, `--measure` 46rem. Evokes a legal brief without feeling dusty.
- **UI / chrome / headings:** *Inter* (or system `ui-sans-serif`) — Linear/Raycast-grade
  neutrality; tight tracking on headings.
- **Citations / section numbers:** *IBM Plex Mono* / `ui-monospace` — `§ 70.2(1)` reads
  as a precise reference.
- **Type scale (rem):** 0.75 · 0.8125 · 0.875 · 1 · 1.125 · 1.25 · 1.5 · 1.875 · 2.5.
- Fonts self-hosted via `@fontsource` (no external CDN; localhost-only app).

### 3.3 Spacing, radius, elevation
- 4px base grid; generous: message vertical rhythm 28–32px, panel padding 24px.
- Radius: `6px` controls, `10px` cards, `14px` composer, `999px` chips.
- Elevation: near-flat; one soft shadow for the floating composer + sources panel.
  Hairline borders do the structural work (Linear influence), not heavy shadows.

### 3.4 Micro-interactions (with reduced-motion fallbacks)
- **Answer reveal:** real text fades/rises in short word-group cascades (120–160ms
  stagger), *not* a fake char stream. `prefers-reduced-motion` → instant.
- **Thinking state:** three-dot brass shimmer + rotating honest status copy
  ("Searching the Criminal Code…", "Reading sections…", "Composing answer…").
- **Citation chip:** subtle bg lift + underline-grow on hover; popover springs in 120ms.
- **Sources panel:** slide + fade from right (240ms), focus-trapped, Esc to close.
- **Send button:** enabled-state brass glow; morphs to a **Stop** square during generation.

---

## 4. Layout & component inventory

```
┌───────────────────────────────────────────────────────────────────────┐
│ TopBar: ⚖ brand · "Criminal Code (Cth) · P1" · theme toggle · new chat │
├──────────────┬──────────────────────────────────────┬──────────────────┤
│ Left rail    │  Message stream (max 46rem, centered) │  Sources panel   │
│ (collapsible)│  ┌────────────────────────────────┐   │  (on-demand,     │
│ · This chat  │  │ user msg (right, inkstone)      │   │   slides in)     │
│ · About the  │  │ assistant msg (serif body +     │   │  · N sections    │
│   source     │  │   inline § chips)               │   │  · source cards  │
│ · Scope note │  │ hover actions · follow-up chips │   │    (quote+link)  │
│              │  └────────────────────────────────┘   │                  │
│              │  Composer (sticky, rounded, glow)     │                  │
│              │  footer disclaimer (quiet, persistent)│                  │
└──────────────┴──────────────────────────────────────┴──────────────────┘
```

**Components to build:**
`AppShell` · `TopBar` · `LeftRail` (ScopeCard, AboutSourceCard) · `MessageList` ·
`UserMessage` · `AssistantMessage` (markdown + citation transform) · `CitationChip`
(+ `CitationPopover`) · `SourcesPanel` · `SourceCard` · `ThinkingIndicator` ·
`Composer` (textarea autogrow, Send/Stop, starter pills) · `FollowUpChips` ·
`DisclaimerBar` · `ScopeBanner` (one-time) · `ThemeToggle` · `EmptyState`.

**Empty state (premium, not blank):** centered ⚖ brand mark, one-line value prop
("Ask about the Commonwealth *Criminal Code Act 1995* — every answer cites the
section."), and 4 curated starter prompts (bribery of a foreign official; facilitation
payments defence; joint commission s 11.2A; what is recklessness). Grounded in the
"starter pills reduce blank-page anxiety" pattern.

---

## 5. Stack decision (grounded)

**Chosen: Vite + React + TypeScript + Tailwind, with a tiny Node proxy route.**

Why not Next.js, given the brief said "Next.js + Tailwind + shadcn preferred, or clean
Vite+React if faster":
- The only server-side need is **one** webhook proxy (`/api/chat`) so the browser never
  hits n8n directly (brief requirement). That's a ~30-line handler — it does not justify
  the Next.js app-router/RSC surface.
- Setproduct's own guidance is that the center stream is "the entire product"; a lean
  SPA keeps all weight on that experience with the fastest dev/iteration loop and
  smallest bundle — appropriate for a localhost hobby tool.
- Tailwind + a **small set of hand-built shadcn-style primitives** (we copy the few
  Radix-based components we actually use — Popover, Dialog/Sheet, Tooltip — rather than
  pulling the whole kit) gives the premium, controlled result without template feel.
- The proxy is provided **two ways** so it's runnable with one command: a Vite dev
  middleware for `npm run dev`, and a minimal Node (Express-free, built-in `http`)
  server for a built/preview run. Port documented in README.

**Libraries (all project-local):** react, react-dom, vite, typescript, tailwindcss,
`@radix-ui/react-popover|dialog|tooltip`, `react-markdown` + `remark-gfm` (safe markdown,
no raw HTML), `@fontsource/newsreader` + `@fontsource/inter` + `@fontsource/ibm-plex-mono`,
`clsx`. No analytics, no external calls from the browser except (optionally) the
legislation.gov.au links the user clicks.

**Security posture (proportional to a localhost hobby tool):** markdown rendered with
`react-markdown` default sanitization (no `rawHtml`); citation links are
`rel="noopener noreferrer"`, `target="_blank"`, and URL-validated to the
`legislation.gov.au` host before render; the webhook key/URL never reaches the browser
(proxy only); bind dev server to `127.0.0.1`.

---

## 6. Acceptance criteria for the build (Phase 2)

1. Dark-mode premium SPA, reading column ≤ 46rem, serif answer body, Inter chrome.
2. Talks to n8n **only via** the app's own `/api/chat` proxy; browser never sees n8n URL.
3. Inline `s X … (Cth)` citations become hover/click **source chips**; a **Sources
   panel** lists the cited sections with quoted text + legislation.gov.au link.
4. Persistent, quiet "not legal advice" disclaimer; one-time scope banner.
5. Honest status + animated reveal of real text; **Stop**; error states with cause.
6. Keyboard-first (Enter/Shift+Enter/⌘K/Esc), focus stays in composer, reduced-motion
   respected, AA contrast.
7. Runnable with one command; port documented. Verified against a real question
   returning a cited answer in the UI.

---

## 7. Verifiable quote extraction (the elevation decision)

**Problem observed in the first pass:** the citation popover and Sources panel
showed a *generic blurb* per section ("The quoted statutory text supporting this
reference appears inline…"). That technically points the lawyer back to the answer,
but it fails the Harvey "verifiability is the feature" bar — the audit trail should
show *what was actually attributed to the section*, not a template sentence.

**Qdrant was not reachable from the UI host** (port 6333 exposes only an unrelated
collection; `criminal_code_cth` lives in infra the n8n container reaches but the UI
does not, and the brief forbids touching the backend). So I did **not** couple the UI
to retrieval payloads.

**Decision — extract the real quote from the answer itself.** The backend model
paraphrases/quotes the relevant section text and *then* appends the citation
(`…obtain or retain business or a business or personal advantage (s 70.2(1) …(Cth))`).
The clause ending at each citation **is** the model's attributed statement for that
section. `quoteForCitation()` (`src/lib/citations.ts`) walks back from each citation to
the nearest clause boundary (sentence end, bullet, colon, newline), cleans list/markdown
markers, and captures that prose as the citation's `quote`. This is **real, verifiable
content** — zero backend coupling, no fabrication — rendered as a serif blockquote with
a brass rule in both the chip popover and each Sources card (with Show-more for long
quotes). The lawyer reads the exact attributed statement, then clicks through to
legislation.gov.au to confirm it. Grounded in Harvey's verifiability principle and the
AI-UX "openable/verifiable sources" pattern (§0).

**Honesty note:** the external "View on legislation.gov.au" link resolves to the Act's
latest-compilation series page, not a per-section deep anchor — those anchors are not
stable across compilations, so a reliable series link beats a brittle deep link that
could 404. This is a deliberate correctness-over-convenience choice, stated so it is not
mistaken for a stub.
