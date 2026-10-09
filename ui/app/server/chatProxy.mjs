// Shared chat-proxy handler used by BOTH the Vite dev middleware and the
// standalone Node preview server. The browser never talks to n8n directly;
// it POSTs to /api/chat on this app, and we forward to the n8n webhook.
//
// Config via env (with safe localhost defaults):
//   N8N_WEBHOOK_URL  full webhook chat URL
//                    default http://127.0.0.1:5679/webhook/virtual-lawyer-clean-v1/chat
//   PROXY_TIMEOUT_MS request timeout to n8n (default 120000)

const DEFAULT_WEBHOOK =
  "http://127.0.0.1:5679/webhook/virtual-lawyer-clean-v1/chat";

export function getWebhookUrl() {
  return process.env.N8N_WEBHOOK_URL || DEFAULT_WEBHOOK;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1_000_000) {
        reject(new Error("payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(body);
}

// Normalises n8n's various possible response shapes into { output }.
function extractOutput(payload) {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload.output === "string") return payload.output;
  if (typeof payload.text === "string") return payload.text;
  if (Array.isArray(payload) && payload.length) {
    return extractOutput(payload[0]);
  }
  if (payload.data) return extractOutput(payload.data);
  return "";
}

// Pulls the structured `sources` array (retrieved statute sections with real
// text) out of the same shapes extractOutput handles. Always an array.
function extractSources(payload) {
  if (payload == null) return [];
  if (Array.isArray(payload.sources)) return payload.sources;
  if (Array.isArray(payload) && payload.length) return extractSources(payload[0]);
  if (payload.data) return extractSources(payload.data);
  return [];
}

export async function handleChat(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }

  let input;
  try {
    const raw = await readBody(req);
    input = raw ? JSON.parse(raw) : {};
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }

  const chatInput = typeof input.chatInput === "string" ? input.chatInput.trim() : "";
  if (!chatInput) {
    sendJson(res, 400, { error: "empty_message" });
    return;
  }
  const sessionId =
    typeof input.sessionId === "string" && input.sessionId
      ? input.sessionId
      : "ui-" + Math.random().toString(36).slice(2);

  const timeoutMs = Number(process.env.PROXY_TIMEOUT_MS || 120000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const upstream = await fetch(getWebhookUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "sendMessage", sessionId, chatInput }),
      signal: controller.signal,
    });

    const textBody = await upstream.text();
    let parsed;
    try {
      parsed = textBody ? JSON.parse(textBody) : null;
    } catch {
      parsed = textBody; // non-JSON upstream body
    }

    if (!upstream.ok) {
      sendJson(res, 502, {
        error: "upstream_error",
        status: upstream.status,
        detail: typeof parsed === "string" ? parsed.slice(0, 500) : parsed,
      });
      return;
    }

    const output = extractOutput(parsed);
    if (!output) {
      sendJson(res, 502, {
        error: "empty_upstream",
        detail: "The workflow returned no answer text.",
      });
      return;
    }
    const sources = extractSources(parsed);
    sendJson(res, 200, { output, sessionId, sources });
  } catch (err) {
    const aborted = err && err.name === "AbortError";
    sendJson(res, aborted ? 504 : 502, {
      error: aborted ? "timeout" : "proxy_failure",
      detail: aborted
        ? "The Criminal Code service did not respond in time."
        : String(err && err.message ? err.message : err),
    });
  } finally {
    clearTimeout(timer);
  }
}
