interface Props {
  onNewChat: () => void;
  messageCount: number;
}

const COVERAGE = [
  { j: "NSW", a: "Crimes Act 1900" },
  { j: "NSW", a: "Crimes (Sentencing Procedure) Act 1999" },
  { j: "NSW", a: "Bail Act 2013" },
  { j: "NSW", a: "Drug Misuse & Trafficking Act 1985" },
  { j: "NSW", a: "Road Transport Act 2013" },
  { j: "NSW", a: "Summary Offences Act 1988" },
  { j: "NSW", a: "Crimes (Domestic & Personal Violence) Act 2007" },
  { j: "Cth", a: "Criminal Code Act 1995" },
];

export function LeftRail({ onNewChat, messageCount }: Props) {
  const questions = Math.ceil(messageCount / 2);
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-bg-elev md:flex">
      <div className="flex items-center gap-2.5 px-5 py-4">
        <span className="brand-emblem grid h-9 w-9 place-items-center rounded-xl border border-accent/20 text-accent">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 3v18M7 21h10M4 8h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 8l-2 5a3 3 0 0 0 4 0L4 8Zm16 0-2 5a3 3 0 0 0 4 0l-2-5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="4" r="1.3" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <div className="leading-tight">
          <div className="font-sans text-sm font-semibold text-text">
            Virtual Lawyer
          </div>
          <div className="font-sans text-[0.7rem] text-text-muted">
            AU Criminal Law · Cth + NSW
          </div>
        </div>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={onNewChat}
          className="card-sheen flex w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 font-sans text-sm font-medium text-text transition-colors hover:border-accent/40 hover:bg-surface-2"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden className="text-accent">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          New conversation
        </button>
      </div>

      <div className="mt-6 flex-1 overflow-y-auto px-5">
        <h3 className="font-sans text-[0.7rem] font-semibold uppercase tracking-wider text-text-faint">
          This conversation
        </h3>
        <p className="mt-2 font-sans text-xs leading-relaxed text-text-muted">
          {messageCount === 0
            ? "No questions yet — pick a starter or type your own."
            : `${questions} question${questions === 1 ? "" : "s"} so far.`}
        </p>

        <h3 className="mt-8 font-sans text-[0.7rem] font-semibold uppercase tracking-wider text-text-faint">
          What I cover
        </h3>
        <ul className="mt-3 flex flex-col gap-1.5">
          {COVERAGE.map(({ j, a }) => (
            <li key={a} className="flex items-start gap-2">
              <span
                className={`mt-px grid h-4 min-w-[1.9rem] place-items-center rounded px-1 font-mono text-[0.6rem] font-semibold uppercase tracking-wide ${
                  j === "Cth" ? "text-accent" : "text-legal"
                }`}
                style={{
                  background:
                    j === "Cth" ? "var(--accent-soft)" : "var(--legal-weak)",
                }}
              >
                {j}
              </span>
              <span className="font-sans text-[0.72rem] leading-snug text-text-muted">
                {a}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 font-sans text-[0.68rem] leading-relaxed text-text-faint">
          Not other states or territories, unrelated Acts, or case law.
        </p>
      </div>

      <div className="border-t border-border px-5 py-3.5">
        <p className="flex items-start gap-1.5 font-sans text-[0.68rem] leading-relaxed text-text-faint">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="mt-px shrink-0">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 11v5M12 8v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          General legal information, not legal advice. Verify every section cited.
        </p>
      </div>
    </aside>
  );
}
