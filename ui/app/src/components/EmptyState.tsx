// Starter questions a real person would actually ask a criminal lawyer —
// a deliberate mix of NSW offences/procedure and Commonwealth offences.
interface Starter {
  q: string;
  tag: string;
  icon: "gavel" | "shield" | "scale" | "pill" | "car" | "cuffs";
}

const STARTERS: Starter[] = [
  {
    q: "What's the maximum penalty for assault occasioning actual bodily harm in NSW?",
    tag: "NSW · Crimes Act 1900",
    icon: "gavel",
  },
  {
    q: "Is there a defence to a drink-driving charge?",
    tag: "NSW · Road Transport Act",
    icon: "car",
  },
  {
    q: "What happens at a bail hearing?",
    tag: "NSW · Bail Act 2013",
    icon: "scale",
  },
  {
    q: "What's the penalty for supplying a prohibited drug in NSW?",
    tag: "NSW · Drug Misuse & Trafficking Act",
    icon: "pill",
  },
  {
    q: "Importing a commercial quantity of a border-controlled drug (Cth)?",
    tag: "Cth · Criminal Code 1995",
    icon: "shield",
  },
  {
    q: "What are the elements of murder?",
    tag: "NSW · Crimes Act 1900",
    icon: "cuffs",
  },
];

function StarterIcon({ name }: { name: Starter["icon"] }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true,
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "gavel":
      return (
        <svg {...common}>
          <path d="m14 13-7.5 7.5a2.1 2.1 0 0 1-3-3L11 10" />
          <path d="m13 7 4 4M9.5 10.5l4 4M15.5 4.5l4 4M11 21h10" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3 5 6v5c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6l-7-3Z" />
          <path d="m9.5 12 1.8 1.8L15 10" />
        </svg>
      );
    case "scale":
      return (
        <svg {...common}>
          <path d="M12 4v16M7 20h10M4 8h16M4 8l-2 5a3 3 0 0 0 4 0L4 8Zm16 0-2 5a3 3 0 0 0 4 0l-2-5Z" />
        </svg>
      );
    case "pill":
      return (
        <svg {...common}>
          <rect x="3" y="8" width="18" height="8" rx="4" />
          <path d="M12 8v8" />
        </svg>
      );
    case "car":
      return (
        <svg {...common}>
          <path d="M5 11l1.5-4.2A2 2 0 0 1 8.4 5.5h7.2a2 2 0 0 1 1.9 1.3L19 11" />
          <path d="M4 11h16v5H4zM7 16v2M17 16v2" />
          <path d="M7 13.5h.01M17 13.5h.01" />
        </svg>
      );
    case "cuffs":
      return (
        <svg {...common}>
          <circle cx="7" cy="15" r="4" />
          <circle cx="17" cy="15" r="4" />
          <path d="M7 11V7a2 2 0 0 1 2-2M17 11V7a2 2 0 0 0-2-2" />
        </svg>
      );
  }
}

function TrustPill({
  children,
  tone = "accent",
}: {
  children: React.ReactNode;
  tone?: "accent" | "legal";
}) {
  return (
    <span className="trust-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-sans text-[0.72rem] font-medium text-text-muted">
      <span className={tone === "legal" ? "text-legal" : "text-accent"} aria-hidden>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {children}
    </span>
  );
}

export function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="relative">
      <div className="hero-aura" aria-hidden />

      <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center px-5 py-6 text-center animate-fade-in">
        {/* Brand lockup */}
        <div className="brand-emblem grid place-items-center rounded-2xl border border-accent/25" style={{ height: "3rem", width: "3rem" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden className="text-accent">
            <path d="M12 3v18M7 21h10M4 8h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 8l-2 5a3 3 0 0 0 4 0L4 8Zm16 0-2 5a3 3 0 0 0 4 0l-2-5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="4" r="1.4" fill="currentColor" stroke="none" />
          </svg>
        </div>

        <p className="mt-3.5 font-sans text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-accent/90">
          Virtual Lawyer
        </p>
        <h1 className="mt-2 max-w-2xl font-serif text-[1.85rem] font-medium leading-[1.12] tracking-tight text-text sm:text-[2.35rem]">
          Clear answers on Australian criminal law.
        </h1>
        <p className="mt-3.5 max-w-xl font-sans text-[0.98rem] leading-relaxed text-text-muted">
          Ask about an offence, a penalty, a defence or what happens in court.
          I'll give you a straight, plain-English answer grounded in the
          legislation — and cite the exact section so you can check it yourself.
        </p>

        {/* Trust signals */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <TrustPill>Every answer cites its section</TrustPill>
          <TrustPill tone="legal">Verifiable on legislation.gov.au</TrustPill>
          <TrustPill>Commonwealth + NSW law</TrustPill>
        </div>

        {/* Divider */}
        <div className="rule-emblem mt-7 w-full max-w-md font-sans text-[0.7rem] font-medium uppercase tracking-[0.18em]">
          Start with a question
        </div>

        {/* Starter cards */}
        <div className="mt-5 grid w-full gap-3 sm:grid-cols-2">
          {STARTERS.map((s) => (
            <button
              key={s.q}
              type="button"
              onClick={() => onPick(s.q)}
              className="starter-card card-sheen group flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-left hover:border-accent/45 hover:bg-surface-2"
            >
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 text-accent transition-colors group-hover:border-accent/40">
                <StarterIcon name={s.icon} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-sans text-[0.92rem] font-medium leading-snug text-text">
                  {s.q}
                </span>
                <span className="mt-1 block font-mono text-[0.68rem] uppercase tracking-wide text-text-faint">
                  {s.tag}
                </span>
              </span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
                className="mt-1 shrink-0 text-text-faint opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-accent group-hover:opacity-100"
              >
                <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>

        {/* Woven-in disclaimer */}
        <p className="mt-7 max-w-lg font-sans text-[0.76rem] leading-relaxed text-text-faint">
          This covers the Commonwealth{" "}
          <span className="italic">Criminal Code Act 1995</span> and NSW criminal
          legislation only — not other states or case law. It gives general legal
          information to help you understand the law, not legal advice for your
          situation. For that, speak to a solicitor.
        </p>
      </div>
    </div>
  );
}
