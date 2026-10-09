import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, Citation } from "./lib/types";
import { sendChat, newSessionId, ChatError } from "./lib/api";
import { extractCitations } from "./lib/citations";
import { useTheme } from "./lib/useTheme";
import { LeftRail } from "./components/LeftRail";
import { ScopeBanner } from "./components/ScopeBanner";
import { EmptyState } from "./components/EmptyState";
import { UserMessage, AssistantMessage } from "./components/Message";
import { ThinkingIndicator } from "./components/ThinkingIndicator";
import { Composer } from "./components/Composer";
import { SourcesPanel } from "./components/SourcesPanel";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function App() {
  const { theme, toggle } = useTheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState(() => newSessionId());
  const [panelOpen, setPanelOpen] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [focusComposer, setFocusComposer] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastQuestionRef = useRef<string>("");

  // Aggregate all citations across assistant messages for the Sources panel.
  const allCitations = useMemo(() => {
    const map = new Map<string, Citation>();
    for (const m of messages) {
      if (m.role === "assistant" && m.citations) {
        for (const c of m.citations) if (!map.has(c.groupId)) map.set(c.groupId, c);
      }
    }
    // Re-number sequentially for the panel.
    return [...map.values()].map((c, i) => ({ ...c, index: i + 1 }));
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, busy, scrollToBottom]);

  // Global shortcuts: Cmd/Ctrl+K focuses composer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setFocusComposer((n) => n + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runQuery = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      lastQuestionRef.current = q;

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: q,
        createdAt: Date.now(),
      };
      setMessages((m) => [...m, userMsg]);
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const { output, sources } = await sendChat(q, sessionId, controller.signal);
        const citations = extractCitations(output, sources);
        const assistant: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: output,
          citations,
          createdAt: Date.now(),
        };
        setMessages((m) => [...m, assistant]);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          // User stopped; leave the thread as-is.
        } else {
          const msg =
            err instanceof ChatError ? err.message : "Something went wrong.";
          setMessages((m) => [
            ...m,
            {
              id: uid(),
              role: "assistant",
              content: "",
              error: msg,
              createdAt: Date.now(),
            },
          ]);
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
        setFocusComposer((n) => n + 1);
      }
    },
    [busy, sessionId],
  );

  const onSend = () => {
    const q = draft;
    setDraft("");
    void runQuery(q);
  };

  const onStop = () => {
    abortRef.current?.abort();
    setBusy(false);
  };

  const onRegenerate = () => {
    if (lastQuestionRef.current) {
      // Drop the last assistant message, re-ask.
      setMessages((m) => {
        const copy = [...m];
        if (copy.length && copy[copy.length - 1].role === "assistant") copy.pop();
        return copy;
      });
      void runQuery(lastQuestionRef.current);
    }
  };

  const onNewChat = () => {
    onStop();
    setMessages([]);
    setSessionId(newSessionId());
    setPanelOpen(false);
    setDraft("");
    setFocusComposer((n) => n + 1);
  };

  const openSource = (key: string) => {
    setFocusKey(key);
    setPanelOpen(true);
  };

  const empty = messages.length === 0;

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg text-text">
      <LeftRail onNewChat={onNewChat} messageCount={messages.length} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="relative flex items-center justify-between border-b border-border px-4 py-3 md:px-6">
          <div className="pointer-events-none absolute inset-0" style={{ background: "var(--header-grad)" }} aria-hidden />
          <div className="relative flex items-center gap-2 md:hidden">
            <span className="brand-emblem grid h-7 w-7 place-items-center rounded-lg text-accent">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 3v18M7 21h10M4 8h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 8l-2 5a3 3 0 0 0 4 0L4 8Zm16 0-2 5a3 3 0 0 0 4 0l-2-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="font-sans text-sm font-semibold">Virtual Lawyer</span>
          </div>
          <div className="relative hidden items-center gap-2.5 font-sans text-sm text-text-muted md:flex">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[0.72rem] font-medium text-text">
              <span className="h-1.5 w-1.5 rounded-full bg-legal" aria-hidden />
              Commonwealth + NSW criminal law
            </span>
            <span className="hidden text-[0.78rem] text-text-faint lg:inline">
              Citation-grounded · every answer cites its section
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPanelOpen((o) => !o)}
              className={`hidden items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-sans text-xs transition-colors md:inline-flex ${
                allCitations.length
                  ? "border-border bg-surface text-text hover:bg-surface-2"
                  : "cursor-not-allowed border-border/60 text-text-muted/60"
              }`}
              disabled={!allCitations.length}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 5h16M4 12h16M4 19h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Sources{allCitations.length ? ` (${allCitations.length})` : ""}
            </button>
            <button
              type="button"
              onClick={toggle}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              className="rounded-lg border border-border bg-surface p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              {theme === "dark" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </header>

        {/* Message stream */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {empty ? (
            <EmptyState onPick={(q) => void runQuery(q)} />
          ) : (
            <div className="mx-auto max-w-measure px-4 py-6 md:py-8">
              <ScopeBanner />
              <div className="flex flex-col gap-7">
                {messages.map((m) =>
                  m.role === "user" ? (
                    <UserMessage key={m.id} content={m.content} />
                  ) : (
                    <AssistantMessage
                      key={m.id}
                      message={m}
                      onOpenSource={openSource}
                      onRegenerate={onRegenerate}
                    />
                  ),
                )}
                {busy && (
                  <div className="animate-fade-in">
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
                    <ThinkingIndicator />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-border bg-bg-elev/80 px-4 py-4 backdrop-blur md:px-6">
          <div className="mx-auto max-w-measure">
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={onSend}
              onStop={onStop}
              busy={busy}
              autoFocusKey={focusComposer}
            />
          </div>
        </div>
      </div>

      <SourcesPanel
        open={panelOpen}
        citations={allCitations}
        focusKey={focusKey}
        onClose={() => setPanelOpen(false)}
      />
    </div>
  );
}
