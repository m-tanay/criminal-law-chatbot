import { useState } from "react";

const KEY = "ccrag-scope-dismissed";

/** One-time dismissible scope banner: what this covers / what it does not. */
export function ScopeBanner() {
  const [shown, setShown] = useState(
    () => localStorage.getItem(KEY) !== "1",
  );
  if (!shown) return null;

  const dismiss = () => {
    localStorage.setItem(KEY, "1");
    setShown(false);
  };

  return (
    <div className="card-sheen mx-auto mb-5 flex max-w-measure items-start gap-3 rounded-xl border border-accent/25 bg-surface px-4 py-3.5 animate-fade-in">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-accent" style={{ background: "var(--accent-soft)" }} aria-hidden>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v18M7 21h10M4 8h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 8l-2 5a3 3 0 0 0 4 0L4 8Zm16 0-2 5a3 3 0 0 0 4 0l-2-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="flex-1">
        <p className="font-sans text-sm font-semibold text-text">
          How to read these answers
        </p>
        <p className="mt-1 font-sans text-[0.8rem] leading-relaxed text-text-muted">
          I answer from the Commonwealth{" "}
          <span className="italic">Criminal Code Act 1995</span> and NSW criminal
          legislation (Crimes Act 1900, sentencing, bail, drugs, road transport
          and related Acts), and I cite the exact section each time. I don't cover
          other states or territories, unrelated Acts, or case law — and this is
          general legal information, not legal advice for your situation.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
