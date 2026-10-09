import { useEffect, useRef, useState } from "react";
import type { Citation } from "../lib/types";
import { sourceUrlForCitation, registerLabel } from "../lib/legislation";

interface Props {
  open: boolean;
  citations: Citation[];
  /** Section key to scroll to / highlight when opened via a chip. */
  focusKey: string | null;
  onClose: () => void;
}

const QUOTE_CLAMP = 240;

function SourceCard({ c, flash }: { c: Citation; flash: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const quote = c.quote?.trim() ?? "";
  const long = quote.length > QUOTE_CLAMP;
  const shown = !long || expanded ? quote : quote.slice(0, QUOTE_CLAMP).trimEnd() + "…";
  const href = sourceUrlForCitation(c);

  return (
    <li
      data-key={c.groupId}
      className={`card-sheen rounded-xl border bg-surface-2 p-4 transition-all duration-300 ${
        flash ? "border-accent/60 ring-1 ring-accent/60" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="grid h-6 min-w-6 place-items-center rounded-md bg-legal/15 px-1.5 font-mono text-xs font-semibold text-legal">
          {c.index}
        </span>
        <span className="font-mono text-sm font-medium text-text">§ {c.key}</span>
        <span
          className={`ml-auto font-mono text-[0.62rem] font-semibold uppercase tracking-wide ${
            c.jurisdiction === "Cth" ? "text-accent" : "text-legal"
          }`}
        >
          {c.jurisdiction}
        </span>
      </div>
      <p className="mt-1.5 font-serif text-[0.82rem] italic leading-snug text-text-muted">
        {c.act}
      </p>

      {quote ? (
        <blockquote className="mt-3 border-l-2 border-accent/50 pl-3 font-serif text-[0.92rem] leading-relaxed text-text/90">
          “{shown}”
          {long && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="ml-1 font-sans text-xs font-medium text-accent hover:underline"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </blockquote>
      ) : (
        <p className="mt-2 font-sans text-xs leading-relaxed text-text-muted">
          Quoted inline in the answer. Open the Act to read section&nbsp;
          {c.section} in full and confirm.
        </p>
      )}

      <p className="mt-2.5 font-sans text-[0.68rem] leading-relaxed text-text-muted">
        Attributed to section&nbsp;{c.section} as cited in the answer. Open the
        legislation to confirm the quote.
      </p>

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 font-sans text-xs font-medium text-accent hover:underline"
      >
        Open on {registerLabel(c.jurisdiction)}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M7 17L17 7M17 7H9M17 7V15"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>
    </li>
  );
}

/**
 * Right-hand Sources panel — the lawyer's audit trail. Opens on demand (never
 * persistent), focus-trapped, Esc to close. Each card = one cited section with
 * its REAL quoted statement (from the answer) and a verifiable link to
 * legislation.gov.au.
 */
export function SourcesPanel({ open, citations, focusKey, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && focusKey && panelRef.current) {
      const el = panelRef.current.querySelector<HTMLElement>(
        `[data-key="${CSS.escape(focusKey)}"]`,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        setFlashKey(focusKey);
        const t = setTimeout(() => setFlashKey(null), 1600);
        return () => clearTimeout(t);
      }
    }
  }, [open, focusKey, citations]);

  return (
    <>
      {/* Scrim (mobile / overlay) */}
      <div
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        ref={panelRef}
        aria-label="Cited sources"
        className={`fixed right-0 top-0 z-40 flex h-full w-[min(26rem,92vw)] flex-col border-l border-border bg-surface shadow-2xl shadow-black/40 transition-transform duration-240 lg:static lg:z-auto lg:w-[24rem] lg:shadow-none ${
          open ? "translate-x-0" : "translate-x-full lg:hidden"
        }`}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-sans text-sm font-semibold text-text">Sources</h2>
            <p className="font-sans text-xs text-text-muted">
              {citations.length} section{citations.length === 1 ? "" : "s"} cited ·
              Cth &amp; NSW criminal legislation
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sources"
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {citations.length === 0 ? (
            <p className="px-1 py-8 text-center font-sans text-sm text-text-muted">
              Citations from an answer will appear here, each with the quoted
              statement so you can verify it against the Act.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {citations.map((c) => (
                <SourceCard key={c.groupId} c={c} flash={flashKey === c.groupId} />
              ))}
            </ul>
          )}
        </div>

        <footer className="border-t border-border px-5 py-3">
          <p className="font-sans text-[0.7rem] leading-relaxed text-text-muted">
            Links open the authoritative Commonwealth and NSW legislation
            registers so you can verify each section yourself.
          </p>
        </footer>
      </aside>
    </>
  );
}
