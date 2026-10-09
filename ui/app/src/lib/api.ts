import type { SourceSection } from "./types";

export interface ChatResponse {
  output: string;
  sessionId: string;
  /** Retrieved statute sections (real text) backing the answer's citations. */
  sources: SourceSection[];
}

export class ChatError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function friendly(code: string, detail?: string): string {
  switch (code) {
    case "timeout":
      return "The Criminal Code service didn't respond in time. Please try again.";
    case "upstream_error":
      return `The workflow returned an error${detail ? `: ${detail}` : "."}`;
    case "empty_upstream":
      return "The workflow returned no answer. Try rephrasing your question.";
    case "empty_message":
      return "Please enter a question.";
    case "proxy_failure":
      return `Couldn't reach the Criminal Code service${detail ? `: ${detail}` : "."}`;
    default:
      return detail || "Something went wrong. Please try again.";
  }
}

/** POST to our own /api/chat proxy (never to n8n directly from the browser). */
export async function sendChat(
  chatInput: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.BASE_URL}api/chat`.replace(/\/\/api/, "/api"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chatInput, sessionId }),
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    throw new ChatError("proxy_failure", friendly("proxy_failure"));
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  const obj = (data ?? {}) as Record<string, unknown>;

  if (!res.ok) {
    const code = (obj.error as string) || "proxy_failure";
    throw new ChatError(code, friendly(code, obj.detail as string));
  }
  const output = typeof obj.output === "string" ? obj.output : "";
  if (!output) throw new ChatError("empty_upstream", friendly("empty_upstream"));
  const sources = Array.isArray(obj.sources)
    ? (obj.sources as SourceSection[])
    : [];
  return { output, sessionId: (obj.sessionId as string) || sessionId, sources };
}

export function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "ui-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
