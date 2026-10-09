import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  autoFocusKey?: number;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  autoFocusKey,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Autogrow
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  // Keep focus in composer (research: focus stays after submit; never stolen).
  useEffect(() => {
    ref.current?.focus();
  }, [autoFocusKey]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!busy && value.trim()) onSend();
    }
  };

  return (
    <div className="card-sheen rounded-2xl border border-border bg-surface shadow-xl shadow-black/25 transition-colors focus-within:border-accent/50">
      <div className="flex items-end gap-2 px-3 py-2.5">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Ask about an offence, penalty, defence or court process…"
          className="max-h-[200px] flex-1 resize-none bg-transparent px-1 py-1.5 font-sans text-[0.95rem] leading-relaxed text-text placeholder:text-text-faint focus:outline-none"
          aria-label="Ask a question about Australian criminal law"
        />
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 text-text transition-colors hover:bg-surface"
          >
            <span className="h-3 w-3 rounded-[3px] bg-text" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!value.trim()}
            aria-label="Send"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-[#1a140a] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-border px-4 py-2">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-text-faint">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12 11v5M12 8v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <p className="flex-1 font-sans text-[0.72rem] leading-tight text-text-faint">
          General legal information on Commonwealth &amp; NSW criminal law —{" "}
          <span className="font-medium text-text-muted">not legal advice</span>.
        </p>
        <kbd className="hidden shrink-0 items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[0.62rem] text-text-faint sm:inline-flex">
          ⌘K
        </kbd>
      </div>
    </div>
  );
}
