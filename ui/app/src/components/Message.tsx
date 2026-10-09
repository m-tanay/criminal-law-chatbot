import { useState } from "react";
import type { ChatMessage } from "../lib/types";
import { MarkdownWithCitations } from "./MarkdownWithCitations";

interface AssistantProps {
  message: ChatMessage;
  onOpenSource: (key: string) => void;
  onRegenerate: () => void;
}

export function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end animate-rise-in">
      <div className="max-w-[85%] rounded-2xl rounded-br-md border border-border bg-user-bubble px-4 py-2.5 font-sans text-[0.95rem] leading-relaxed text-text">
        {content}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
    >
      {children}
    </button>
  );
}

export function AssistantMessage({
  message,
  onOpenSource,
  onRegenerate,
}: AssistantProps) {
  const [copied, setCopied] = useState(false);
  const count = message.citations?.length ?? 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard may be blocked; ignore */
    }
  };

  if (message.error) {
    return (
      <div className="animate-rise-in rounded-xl border border-danger/40 bg-danger/10 px-4 py-3">
        <div className="flex items-center gap-2 font-sans text-sm font-medium text-danger">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 8v5M12 16.5v.5M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Request failed
        </div>
        <p className="mt-1 font-sans text-sm text-text-muted">{message.error}</p>
        <button
          type="button"
          onClick={onRegenerate}
          className="mt-2.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition-colors hover:bg-surface-2"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="group animate-rise-in">
      <div className="mb-2 flex items-center gap-2">
        <span className="brand-emblem grid h-6 w-6 place-items-center rounded-md text-accent">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 3v18M7 21h10M4 8h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 8l-2 5a3 3 0 0 0 4 0L4 8Zm16 0-2 5a3 3 0 0 0 4 0l-2-5Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="font-sans text-xs font-medium uppercase tracking-wide text-text-muted">
          Virtual Lawyer
        </span>
      </div>

      <div className="prose-legal">
        <MarkdownWithCitations
          content={message.content}
          citations={message.citations ?? []}
          onOpenSource={onOpenSource}
        />
      </div>

      <div className="mt-3 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
        <ActionButton label={copied ? "Copied" : "Copy answer"} onClick={copy}>
          {copied ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Copy
            </>
          )}
        </ActionButton>
        <ActionButton label="Regenerate answer" onClick={onRegenerate}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Regenerate
        </ActionButton>
        {count > 0 && (
          <ActionButton
            label="View cited sources"
            onClick={() => onOpenSource(message.citations![0].groupId)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 5h16M4 12h16M4 19h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            {count} source{count > 1 ? "s" : ""}
          </ActionButton>
        )}
      </div>
    </div>
  );
}
