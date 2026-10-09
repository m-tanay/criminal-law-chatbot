// Standalone production server: serves built dist/ as static files and handles
// /api/chat with the SAME proxy used in dev. Zero external deps (node:http only).
//
//   node server/serve.mjs            -> http://127.0.0.1:5190
//   PORT=... HOST=... to override.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handleChat, getWebhookUrl } from "./chatProxy.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST = join(__dirname, "..", "dist");
const PORT = Number(process.env.PORT || 5190);
const HOST = process.env.HOST || "127.0.0.1";
// Optional URL prefix when mounted behind a reverse proxy under a subpath,
// e.g. APP_BASE=/lawyer/ . Must match vite `base`. Normalised to "/x" (no trailing slash).
const RAW_BASE = process.env.APP_BASE || "/";
const BASE = RAW_BASE === "/" ? "" : ("/" + RAW_BASE.replace(/^\/+|\/+$/g, ""));
function stripBase(p) {
  if (!BASE) return p;
  if (p === BASE) return "/";
  if (p.startsWith(BASE + "/")) return p.slice(BASE.length);
  return p;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

async function serveStatic(req, res) {
  // Strip query, prevent path traversal.
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  if (rel === "/" || rel === "") rel = "/index.html";
  let filePath = join(DIST, rel);
  if (!filePath.startsWith(DIST)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }
  try {
    let s = await stat(filePath);
    if (s.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    // SPA fallback -> index.html
    filePath = join(DIST, "index.html");
  }
  try {
    const data = await readFile(filePath);
    res.statusCode = 200;
    res.setHeader("content-type", MIME[extname(filePath)] || "application/octet-stream");
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
}

const server = createServer((req, res) => {
  const path = stripBase((req.url || "").split("?")[0]);
  if (path === "/api/chat") {
    handleChat(req, res).catch(() => {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "proxy_crash" }));
    });
    return;
  }
  // Rewrite req.url so serveStatic sees the base-stripped path.
  if (BASE) {
    const q = (req.url || "").split("?")[1];
    req.url = path + (q ? "?" + q : "");
  }
  serveStatic(req, res).catch(() => {
    res.statusCode = 500;
    res.end("Server error");
  });
});

server.listen(PORT, HOST, () => {
  console.log(`\n  ⚖  Criminal Code RAG UI`);
  console.log(`     serving  http://${HOST}:${PORT}`);
  console.log(`     proxying /api/chat  ->  ${getWebhookUrl()}\n`);
});
