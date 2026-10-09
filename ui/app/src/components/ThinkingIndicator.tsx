import { useEffect, useState } from "react";

const STATUSES = [
  "Searching the Criminal Code…",
  "Reading sections…",
  "Composing answer…",
];

/** Honest in-flight status: real network call is happening; copy rotates. */
export function ThinkingIndicator() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % STATUSES.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-3 py-1" aria-live="polite">
      <span className="flex items-center gap-1" aria-hidden>
        {[0, 1, 2].map((d) => (
          <span
            key={d}
            className="h-1.5 w-1.5 rounded-full bg-accent animate-shimmer"
            style={{ animationDelay: `${d * 0.18}s` }}
          />
        ))}
      </span>
      <span className="font-sans text-sm text-text-muted">{STATUSES[i]}</span>
    </div>
  );
}
