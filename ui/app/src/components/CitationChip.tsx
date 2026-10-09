import * as Popover from "@radix-ui/react-popover";
import type { Citation } from "../lib/types";
import { sourceUrlForCitation, registerLabel } from "../lib/legislation";

interface Props {
  citation: Citation;
  /** Click opens the Sources panel scrolled to this section. */
  onOpenSource: (key: string) => void;
}

/**
 * Inline, legal-grade citation chip: understated monospace pill "§ 70.2(1)".
 * Hover/focus -> popover that shows the ACTUAL quoted statutory statement this
 * reference supports (pulled from the answer), plus a verify link. Click ->
 * opens the Sources panel scrolled to this section for the full audit trail.
 */
export function CitationChip({ citation, onOpenSource }: Props) {
  const display = "§ " + citation.key;
  const href = sourceUrlForCitation(citation);
  const quote = citation.quote?.trim();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          onClick={() => onOpenSource(citation.groupId)}
          className="citation-chip group mx-0.5 inline-flex -translate-y-px items-center gap-1 rounded-full border border-accent/30 bg-accent-weak px-2 py-0.5 align-baseline font-mono text-[0.8em] font-medium text-accent transition-all duration-150 hover:border-accent/60 hover:bg-accent/15 hover:shadow-[0_0_0_3px_var(--accent-ring)] focus-visible:border-accent focus-visible:outline-none"
          aria-label={`Citation: section ${citation.key}, ${citation.act} (${citation.jurisdiction}). Open sources to verify.`}
        >
          <span className="tabular-nums">{display}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={8}
          collisionPadding={16}
          className="z-50 w-80 max-w-[92vw] animate-pop rounded-xl border border-border bg-surface-2 p-0 shadow-2xl shadow-black/50"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3.5 py-2.5">
            <span className="flex items-center gap-2">
              <span className="grid h-5 min-w-5 place-items-center rounded-md bg-legal/15 px-1 font-mono text-[0.7rem] font-semibold text-legal">
                {citation.index}
              </span>
              <span className="font-mono text-sm font-medium text-text">
                § {citation.key}
              </span>
            </span>
            <span
              className={`font-mono text-[0.62rem] font-semibold uppercase tracking-wide ${
                citation.jurisdiction === "Cth" ? "text-accent" : "text-legal"
              }`}
            >
              {citation.jurisdiction}
            </span>
          </div>

          <div className="px-3.5 py-3">
            {quote ? (
              <blockquote className="border-l-2 border-accent/50 pl-3 font-serif text-[0.9rem] leading-relaxed text-text/90">
                “{quote}”
              </blockquote>
            ) : (
              <p className="font-sans text-xs leading-relaxed text-text-muted">
                This reference is quoted inline in the answer. Open the Act to
                read section&nbsp;{citation.section} in full.
              </p>
            )}
            <p className="mt-2.5 font-sans text-[0.68rem] leading-relaxed text-text-muted">
              Attributed to s&nbsp;{citation.key} of the{" "}
              <span className="italic">{citation.act}</span> ({citation.jurisdiction})
              — verify against the Act.
            </p>
            <div className="mt-2.5 flex items-center justify-between">
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-sans text-xs font-medium text-accent hover:underline"
              >
                Open on {registerLabel(citation.jurisdiction)}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M7 17L17 7M17 7H9M17 7V15"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
              <button
                type="button"
                onClick={() => onOpenSource(citation.groupId)}
                className="font-sans text-xs font-medium text-text-muted transition-colors hover:text-text"
              >
                All sources →
              </button>
            </div>
          </div>
          <Popover.Arrow className="fill-[var(--surface-2)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
