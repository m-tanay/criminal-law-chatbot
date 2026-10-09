#!/usr/bin/env python3
"""
Tanay Control Hub — single tailnet-only dashboard for the whole RAG system.
Stdlib only. Binds to the Tailscale IP so only Tanay's devices can reach it.
Shows live health, lets you browse the law DB, chat runs, node code, logs.
"""
import json, os, sqlite3, subprocess, urllib.request, html, time, base64, hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

# ---- auth (basic-auth gate for public exposure) ----
# Enabled when HUB_USER and HUB_PASS are set in the environment. When unset the
# hub stays open (original tailnet-only behaviour).
HUB_USER = os.environ.get("HUB_USER", "")
HUB_PASS = os.environ.get("HUB_PASS", "")
AUTH_ON = bool(HUB_USER and HUB_PASS)

def _auth_ok(handler):
    if not AUTH_ON:
        return True
    hdr = handler.headers.get("authorization", "")
    if not hdr.startswith("Basic "):
        return False
    try:
        user, _, pw = base64.b64decode(hdr[6:]).decode("utf-8", "ignore").partition(":")
    except Exception:
        return False
    return hmac.compare_digest(user, HUB_USER) and hmac.compare_digest(pw, HUB_PASS)

def _send_401(handler):
    handler.send_response(401)
    handler.send_header("WWW-Authenticate", 'Basic realm="Virtual Lawyer Control Hub"')
    handler.send_header("content-type", "text/plain; charset=utf-8")
    handler.end_headers()
    handler.wfile.write(b"401 Unauthorized")

# ---- config ----
TAILNET_IP = "100.123.31.44"
PORT = 8099
N8N_DB = os.path.expanduser("~/.openclaw/workspace/services/n8n-tanay/data/database.sqlite")
QDRANT = "http://127.0.0.1:6340"          # lawyer qdrant (qdrant-tanay)
OLLAMA = "http://127.0.0.1:11434"
COLLECTION = "criminal_code_cth"
N8N_URL = f"https://invisible-kernel.tail55e1ea.ts.net:8443"  # funnel editor
N8N_LOCAL = "http://127.0.0.1:5679"
WF_ID = "virtuallawyerclean1"
INGEST_DIR = os.path.expanduser("~/.openclaw/workspace/services/qdrant-tanay/ingest")

def get_json(url, timeout=5, data=None):
    try:
        req = urllib.request.Request(url, data=(json.dumps(data).encode() if data else None),
                                     headers={"content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except Exception as e:
        return {"_error": str(e)}

def db(q, args=()):
    try:
        con = sqlite3.connect(f"file:{N8N_DB}?mode=ro", uri=True, timeout=5)
        con.row_factory = sqlite3.Row
        rows = con.execute(q, args).fetchall()
        con.close()
        return rows
    except Exception as e:
        return [{"error": str(e)}]

def port_up(port):
    try:
        out = subprocess.run(["ss", "-ltn"], capture_output=True, text=True, timeout=4).stdout
        return f":{port} " in out or f":{port}\n" in out
    except Exception:
        return False

# ---------------- data collectors ----------------
def health():
    h = {}
    h["n8n (5679)"] = port_up(5679)
    h["Qdrant lawyer (6340)"] = port_up(6340)
    h["Ollama (11434)"] = port_up(11434)
    # qdrant collection
    col = get_json(f"{QDRANT}/collections/{COLLECTION}")
    h["law_chunks"] = col.get("result", {}).get("points_count", "?") if "_error" not in col else "ERR"
    # runs
    r = db("SELECT COUNT(*) c, MAX(startedAt) m FROM execution_entity")
    h["total_runs"] = r[0]["c"] if r and "error" not in r[0].keys() else "ERR"
    h["last_run"] = r[0]["m"] if r and "c" in r[0].keys() else "?"
    # ollama models
    om = get_json(f"{OLLAMA}/api/tags")
    h["ollama_models"] = ", ".join(m["name"] for m in om.get("models", [])) if "_error" not in om else "ERR"
    return h

def recent_runs(n=25):
    return db("SELECT id, status, finished, startedAt, stoppedAt FROM execution_entity ORDER BY startedAt DESC LIMIT ?", (n,))

def law_sample(limit=20, offset=None):
    body = {"limit": limit, "with_payload": True, "with_vector": False}
    if offset:
        body["offset"] = offset
    res = get_json(f"{QDRANT}/collections/{COLLECTION}/points/scroll", data=body)
    return res.get("result", {})

def law_search(query, k=8):
    emb = get_json(f"{OLLAMA}/api/embeddings", data={"model": "nomic-embed-text", "prompt": query})
    vec = emb.get("embedding")
    if not vec:
        return {"_error": "embed failed: " + str(emb.get("_error", emb))}
    res = get_json(f"{QDRANT}/collections/{COLLECTION}/points/search",
                   data={"vector": vec, "limit": k, "with_payload": True})
    return res.get("result", [])

def nodes_list():
    r = db("SELECT nodes FROM workflow_entity WHERE id=?", (WF_ID,))
    if not r or "error" in r[0].keys():
        return []
    try:
        return json.loads(r[0]["nodes"])
    except Exception:
        return []

def node_code(name):
    for n in nodes_list():
        if n.get("name") == name:
            p = n.get("parameters", {})
            return p.get("jsCode") or p.get("functionCode") or json.dumps(p, indent=2)
    return "(not found)"

def docker_logs(container="tanays-selfhosted-automation", n=80):
    try:
        out = subprocess.run(["docker", "logs", "--tail", str(n), container],
                             capture_output=True, text=True, timeout=8)
        return (out.stdout + out.stderr) or "(no output / docker needs sudo)"
    except Exception as e:
        return f"(docker logs unavailable: {e})"

def ingest_files():
    try:
        return sorted(os.listdir(INGEST_DIR))
    except Exception as e:
        return [f"err: {e}"]

# ---------------- HTML ----------------
CSS = """
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#07070c;--bg2:#0b0b14;--glass:rgba(22,22,34,.55);--glass-br:rgba(255,255,255,.07);
  --ink:#e7e9f5;--ink-dim:#8b8fa8;--accent:#7c6cff;--accent2:#4dd0ff;--gold:#ffd166;
  --green:#4ade80;--red:#ff5d7a;
}
html{scroll-behavior:smooth}
body{
  background:var(--bg);color:var(--ink);
  font-family:'Inter',system-ui,sans-serif;font-size:14px;line-height:1.55;min-height:100vh;
  background-image:
    radial-gradient(900px 500px at 12% -10%,rgba(124,108,255,.18),transparent 60%),
    radial-gradient(800px 500px at 110% 0%,rgba(77,208,255,.12),transparent 55%),
    radial-gradient(700px 600px at 50% 120%,rgba(255,93,122,.08),transparent 60%);
  background-attachment:fixed;
}
header{
  padding:22px 34px 18px;position:sticky;top:0;z-index:20;
  background:linear-gradient(180deg,rgba(7,7,12,.92),rgba(7,7,12,.6));
  backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
  border-bottom:1px solid var(--glass-br);
}
header .brand{display:flex;align-items:center;gap:13px}
header .logo{
  width:40px;height:40px;border-radius:12px;display:grid;place-items:center;font-size:21px;
  background:linear-gradient(135deg,var(--accent),var(--accent2));
  box-shadow:0 8px 24px rgba(124,108,255,.45),inset 0 1px 0 rgba(255,255,255,.3);
}
header h1{font-size:19px;font-weight:800;letter-spacing:-.3px;
  background:linear-gradient(90deg,#fff,#b9b4ff);-webkit-background-clip:text;background-clip:text;color:transparent}
header .sub{color:var(--ink-dim);font-size:12px;margin-top:3px;display:flex;align-items:center;gap:7px}
.live-dot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 0 0 rgba(74,222,128,.6);animation:pulse 2s infinite}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(74,222,128,.55)}70%{box-shadow:0 0 0 9px rgba(74,222,128,0)}100%{box-shadow:0 0 0 0 rgba(74,222,128,0)}}
nav{display:flex;gap:6px;padding:14px 34px;flex-wrap:wrap;position:sticky;top:76px;z-index:15;
  background:rgba(7,7,12,.55);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
nav a{color:var(--ink-dim);text-decoration:none;padding:8px 16px;border-radius:999px;font-size:13px;font-weight:500;
  border:1px solid transparent;transition:all .18s ease}
nav a:hover{color:var(--ink);background:rgba(255,255,255,.04);border-color:var(--glass-br)}
nav a.on{color:#fff;background:linear-gradient(135deg,rgba(124,108,255,.9),rgba(77,208,255,.75));
  box-shadow:0 6px 18px rgba(124,108,255,.4);border-color:transparent}
main{padding:26px 34px 60px;max-width:1240px;margin:0 auto}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px;margin-bottom:8px}
.card{
  position:relative;background:var(--glass);border:1px solid var(--glass-br);border-radius:18px;padding:18px 20px;
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);overflow:hidden;
  box-shadow:0 10px 30px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.06);
  transition:transform .2s ease,box-shadow .2s ease}
.card:hover{transform:translateY(-3px);box-shadow:0 18px 44px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.1)}
.card::before{content:"";position:absolute;inset:0;border-radius:18px;padding:1px;
  background:linear-gradient(135deg,rgba(124,108,255,.5),transparent 40%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:.6}
.card .lbl{color:var(--ink-dim);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.8px}
.card .val{font-size:26px;font-weight:800;margin-top:6px;letter-spacing:-.5px;
  background:linear-gradient(90deg,#fff,#c6c2ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.card .val.up{background:none!important;-webkit-text-fill-color:initial;color:var(--green)!important;text-shadow:0 0 18px rgba(74,222,128,.5)}
.card .val.down{background:none!important;-webkit-text-fill-color:initial;color:var(--red)!important;text-shadow:0 0 18px rgba(255,93,122,.5)}
table{width:100%;border-collapse:separate;border-spacing:0;background:var(--glass);border:1px solid var(--glass-br);
  border-radius:16px;overflow:hidden;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
th,td{padding:12px 16px;text-align:left;font-size:13px;border-bottom:1px solid rgba(255,255,255,.05)}
th{background:rgba(255,255,255,.03);color:var(--accent2);font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.9px}
tbody tr:last-child td,tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(124,108,255,.06)}
a.btn{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.05);color:var(--ink);
  padding:9px 18px;border-radius:11px;text-decoration:none;margin:5px 8px 5px 0;font-size:13px;font-weight:600;
  border:1px solid var(--glass-br);transition:all .18s ease}
a.btn:hover{background:linear-gradient(135deg,rgba(124,108,255,.9),rgba(77,208,255,.7));color:#fff;transform:translateY(-2px);box-shadow:0 10px 24px rgba(124,108,255,.4);border-color:transparent}
pre{background:rgba(5,5,10,.7);border:1px solid var(--glass-br);border-radius:14px;padding:18px;overflow:auto;
  font:12.5px/1.6 'JetBrains Mono',monospace;color:#b9bdd6;max-height:620px}
.sec{background:var(--glass);border:1px solid var(--glass-br);border-radius:20px;padding:24px;margin-bottom:22px;
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 10px 30px rgba(0,0,0,.3)}
.sec h2{color:var(--ink);font-size:17px;font-weight:700;margin-bottom:16px;letter-spacing:-.3px;display:flex;align-items:center;gap:9px}
.sec h2::before{content:"";width:4px;height:18px;border-radius:3px;background:linear-gradient(180deg,var(--accent),var(--accent2))}
form{margin-bottom:18px;display:flex;gap:10px;flex-wrap:wrap}
input[type=text]{background:rgba(5,5,10,.6);border:1px solid var(--glass-br);color:var(--ink);padding:13px 18px;
  border-radius:13px;flex:1;min-width:260px;font-size:14px;font-family:inherit;transition:border .18s,box-shadow .18s}
input[type=text]:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 4px rgba(124,108,255,.18)}
button{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border:0;padding:13px 26px;
  border-radius:13px;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer;
  box-shadow:0 8px 22px rgba(124,108,255,.4);transition:transform .18s}
button:hover{transform:translateY(-2px)}
.score{color:var(--green);font-weight:800;font-family:'JetBrains Mono',monospace}
.cite{color:var(--gold);font-weight:600}
small{color:var(--ink-dim)}
code{background:rgba(255,255,255,.06);padding:2px 7px;border-radius:6px;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent2)}
::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-thumb{background:rgba(124,108,255,.35);border-radius:10px}::-webkit-scrollbar-track{background:transparent}
.hero{display:grid;grid-template-columns:1fr auto;align-items:center;gap:20px;margin-bottom:24px;
  background:linear-gradient(135deg,rgba(124,108,255,.14),rgba(77,208,255,.06));
  border:1px solid var(--glass-br);border-radius:22px;padding:24px 28px;backdrop-filter:blur(16px)}
.hero h3{font-size:22px;font-weight:800;letter-spacing:-.5px}
.hero p{color:var(--ink-dim);margin-top:5px;font-size:13.5px}
.badge{display:inline-flex;align-items:center;gap:6px;background:rgba(74,222,128,.14);color:var(--green);
  padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid rgba(74,222,128,.25)}
header{display:flex;align-items:center;justify-content:space-between;gap:16px}
.theme-toggle{flex:none;width:42px;height:42px;border-radius:12px;border:1px solid var(--glass-br);
  background:var(--glass);color:var(--ink);font-size:19px;cursor:pointer;backdrop-filter:blur(12px);
  transition:transform .18s,background .18s;line-height:1}
.theme-toggle:hover{transform:translateY(-2px) rotate(-12deg);background:rgba(255,255,255,.08)}
/* ---------- LIGHT THEME ---------- */
:root[data-theme="light"]{
  --bg:#f4f5fb;--bg2:#ffffff;--glass:rgba(255,255,255,.72);--glass-br:rgba(16,18,40,.1);
  --ink:#1a1c2e;--ink-dim:#5b6076;--accent:#6b5cff;--accent2:#1e9fd8;--gold:#b7791f;
  --green:#15914b;--red:#d32a4e;
}
:root[data-theme="light"] body{
  background-image:
    radial-gradient(900px 500px at 12% -10%,rgba(124,108,255,.14),transparent 60%),
    radial-gradient(800px 500px at 110% 0%,rgba(30,159,216,.1),transparent 55%),
    radial-gradient(700px 600px at 50% 120%,rgba(211,42,78,.06),transparent 60%);
}
:root[data-theme="light"] header{background:linear-gradient(180deg,rgba(244,245,251,.95),rgba(244,245,251,.7))}
:root[data-theme="light"] nav{background:rgba(244,245,251,.6)}
:root[data-theme="light"] h1{background:linear-gradient(90deg,#1a1c2e,#6b5cff);-webkit-background-clip:text;background-clip:text;color:transparent}
:root[data-theme="light"] .card .val{background:linear-gradient(90deg,#1a1c2e,#6b5cff);-webkit-background-clip:text;background-clip:text;color:transparent}
:root[data-theme="light"] pre{background:rgba(16,18,40,.05);color:#2a2d44}
:root[data-theme="light"] input[type=text]{background:rgba(16,18,40,.04);color:var(--ink)}
:root[data-theme="light"] ::-webkit-scrollbar-thumb{background:rgba(107,92,255,.35)}
"""

def nav(active):
    items = [("/", "Overview"), ("/runs", "Chat Runs"), ("/law", "Law DB"),
             ("/search", "Search Law"), ("/nodes", "Node Code"),
             ("/logs", "Logs"), ("/ingest", "Ingest/Add Law"), ("/doors", "All Doors")]
    return "<nav>" + "".join(
        f'<a href="{u}" class="{"on" if u==active else ""}">{html.escape(t)}</a>' for u, t in items
    ) + "</nav>"

def page(title, body, active="/"):
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)} · Control Hub</title><style>{CSS}</style>
<script>
(function(){{try{{var t=localStorage.getItem('hubTheme')||'dark';document.documentElement.setAttribute('data-theme',t);}}catch(e){{}}}})();
function toggleTheme(){{var h=document.documentElement;var t=h.getAttribute('data-theme')==='light'?'dark':'light';h.setAttribute('data-theme',t);try{{localStorage.setItem('hubTheme',t);}}catch(e){{}}var b=document.getElementById('themeBtn');if(b)b.textContent=t==='light'?'🌙':'☀';}}
</script></head>
<body><header><div class="brand"><div class="logo">⚖</div>
<div><h1>Bot Control Hub</h1>
<div class="sub"><span class="live-dot"></span>Virtual Lawyer · AU Criminal Law · tailnet-only · {TAILNET_IP}:{PORT}</div></div></div>
<button id="themeBtn" class="theme-toggle" onclick="toggleTheme()" title="Toggle light/dark">☀</button></header>
{nav(active)}<main>{body}</main>
<script>(function(){{var t=document.documentElement.getAttribute('data-theme');var b=document.getElementById('themeBtn');if(b)b.textContent=t==='light'?'🌙':'☀';}})();</script>
</body></html>"""

def e(x):
    return html.escape(str(x))

# ---------------- views ----------------
def view_overview():
    h = health()
    def chip(k):
        v = h.get(k)
        cls = "up" if v is True else "down" if v is False else ""
        txt = "● UP" if v is True else "● DOWN" if v is False else e(v)
        return f'<div class="card"><div class="lbl">{e(k)}</div><div class="val {cls}">{txt}</div></div>'
    cards = "".join(chip(k) for k in ["n8n (5679)", "Qdrant lawyer (6340)", "Ollama (11434)"])
    stats = "".join(
        f'<div class="card"><div class="lbl">{e(k)}</div><div class="val">{e(h.get(k))}</div></div>'
        for k in ["law_chunks", "total_runs", "last_run", "ollama_models"])
    all_up = all(h.get(k) is True for k in ["n8n (5679)", "Qdrant lawyer (6340)", "Ollama (11434)"])
    status_badge = '<span class="badge"><span class="live-dot"></span>All systems operational</span>' if all_up else '<span class="badge" style="background:rgba(255,93,122,.14);color:var(--red);border-color:rgba(255,93,122,.25)">⚠ Degraded</span>'
    body = f"""<div class="hero"><div>
      <h3>Virtual Lawyer RAG</h3>
      <p>{e(h.get('law_chunks'))} law chunks · {e(h.get('total_runs'))} chat runs · NSW criminal statutes · fully local & private</p></div>
      <div>{status_badge}</div></div>
    <div class="sec"><h2>Service Health</h2><div class="grid">{cards}</div></div>
    <div class="sec"><h2>System Stats</h2><div class="grid">{stats}</div></div>
    <div class="sec"><h2>Quick Doors</h2>
    <a class="btn" href="/n8n/" target="_blank">↗ n8n Editor</a>
    <a class="btn" href="/runs">▸ Chat Runs</a>
    <a class="btn" href="/search">⌕ Search the Law</a>
    <a class="btn" href="/law">▤ Browse Law DB</a>
    <a class="btn" href="/nodes">{{}} Node Code</a></div>"""
    return page("Overview", body, "/")

def view_runs():
    rows = recent_runs(30)
    trs = ""
    for r in rows:
        if "error" in r.keys():
            trs = f"<tr><td>{e(r['error'])}</td></tr>"; break
        st = r["status"] or ("done" if r["finished"] else "?")
        cls = "up" if st == "success" else "down" if st in ("error", "failed") else ""
        trs += (f"<tr><td>#{e(r['id'])}</td><td class='{cls}'>{e(st)}</td>"
                f"<td>{e(r['startedAt'])}</td><td><a class='btn' href='/run?id={e(r['id'])}'>view</a></td></tr>")
    body = f"""<div class="sec"><h2>Recent Chat Runs (newest 30 of {health().get('total_runs')})</h2>
    <table><tr><th>Run</th><th>Status</th><th>Started</th><th></th></tr>{trs}</table></div>"""
    return page("Chat Runs", body, "/runs")

def view_run(rid):
    r = db("SELECT data FROM execution_data WHERE executionId=?", (rid,))
    if not r or "error" in r[0].keys():
        return page("Run", f"<div class='sec'>No data for run {e(rid)}</div>", "/runs")
    raw = r[0]["data"]
    try:
        parsed = json.dumps(json.loads(raw), indent=2)[:40000]
    except Exception:
        parsed = raw[:40000]
    body = f"""<div class="sec"><h2>Run #{e(rid)} — raw node data</h2>
    <small>n8n packs each node's input/output here. Search for node names like "Qdrant Search", "Gemini Draft".</small>
    <pre>{e(parsed)}</pre></div>"""
    return page(f"Run {rid}", body, "/runs")

def view_law(offset=None):
    res = law_sample(25, offset)
    pts = res.get("points", [])
    nxt = res.get("next_page_offset")
    trs = ""
    for p in pts:
        pl = p.get("payload", {})
        # text = "citation — title\n[hierarchy]\n\nBODY". Show the BODY (after blank line), not the repeated header.
        raw = str(pl.get("text", ""))
        body_txt = raw.split("\n\n", 1)[1] if "\n\n" in raw else raw
        body_txt = body_txt.strip() or "(no body text)"
        trs += (f"<tr><td class='cite'>{e(pl.get('citation',''))}</td>"
                f"<td>{e(pl.get('title',''))}</td><td>{e(pl.get('jurisdiction',''))}</td>"
                f"<td><small>{e(body_txt[:160])}</small></td></tr>")
    more = f"<a class='btn' href='/law?offset={e(json.dumps(nxt))}'>Next page →</a>" if nxt else ""
    body = f"""<div class="sec"><h2>Law Library — {COLLECTION} (3117 chunks)</h2>
    <small>Each row = one law chunk stored as a vector. Payload shown below.</small>
    <table><tr><th>Citation</th><th>Title</th><th>Juris</th><th>Law text (body)</th></tr>{trs}</table>
    <div style="margin-top:12px">{more}</div></div>"""
    return page("Law DB", body, "/law")

def view_search(q=None):
    form = f"""<form method="get" action="/search">
    <input type="text" name="q" placeholder="Ask a legal question, e.g. penalty for assault NSW" value="{e(q or '')}">
    <button>Search</button></form>"""
    results = ""
    if q:
        hits = law_search(q, 8)
        if isinstance(hits, dict) and "_error" in hits:
            results = f"<pre>{e(hits['_error'])}</pre>"
        else:
            rows = ""
            for hH in hits:
                pl = hH.get("payload", {})
                rows += (f"<tr><td class='score'>{hH.get('score',0):.3f}</td>"
                         f"<td class='cite'>{e(pl.get('citation',''))}</td>"
                         f"<td><small>{e(str(pl.get('text',''))[:200])}</small></td></tr>")
            results = (f"<h2>Top matches for: {e(q)}</h2><table>"
                       f"<tr><th>Score</th><th>Citation</th><th>Text</th></tr>{rows}</table>"
                       f"<small>This is exactly what the bot's Qdrant Search step returns. Score ≥0.55 = answer, else refuse.</small>")
    body = f'<div class="sec"><h2>Search the Law (same path as the bot)</h2>{form}{results}</div>'
    return page("Search Law", body, "/search")

def view_nodes(sel=None):
    ns = nodes_list()
    links = "".join(f'<a class="btn" href="/nodes?n={e(n["name"])}">{e(n["name"])}</a>' for n in ns)
    code = ""
    if sel:
        code = f"<h2>{e(sel)}</h2><pre>{e(node_code(sel))}</pre>"
    body = f'<div class="sec"><h2>Workflow Nodes — click to see real code/config</h2>{links}</div><div class="sec">{code}</div>'
    return page("Node Code", body, "/nodes")

def view_logs():
    body = f"""<div class="sec"><h2>n8n container logs (last 80 lines)</h2>
    <pre>{e(docker_logs())}</pre></div>"""
    return page("Logs", body, "/logs")

def view_ingest():
    files = ingest_files()
    lst = "".join(f"<li>{e(f)}</li>" for f in files)
    body = f"""<div class="sec"><h2>Law Ingestion — how law gets loaded</h2>
    <small>Scripts in <code>services/qdrant-tanay/ingest/</code>. Run one to embed + load more law into Qdrant.</small>
    <ul style="margin:12px 0 0 20px">{lst}</ul>
    <p style="margin-top:14px"><small>To add law: drop new acts into corpus, run <code>ingest_criminal_code.py</code> → it chunks, embeds via Ollama, pushes to Qdrant <code>{COLLECTION}</code>.</small></p></div>"""
    return page("Ingest", body, "/ingest")

def view_doors():
    # Links route through this hub's own gated proxy (/px/...), so they work over the
    # public funnel behind the single login — no separate tailnet ports needed.
    doors = [
        ("Chat UI (lawyer)", "/lawyer/", "Public lawyer chatbot — the live demo"),
        ("n8n Editor", "/n8n/", "Visual workflow + executions (lawyer n8n, isolated) — same login"),
        ("Qdrant dashboard", "/dashboard/", "Vector DB UI — criminal_code_cth"),
        ("Ollama models", "/ollama/api/tags", "Embedding engine JSON"),
    ]
    rows = "".join(f'<tr><td>{e(n)}</td><td><a class="btn" href="{u}" target="_blank">open</a></td><td><small>{e(d)}</small></td></tr>' for n, u, d in doors)
    paths = [
        ("n8n DB", "/workspace/services/n8n-tanay/data/database.sqlite"),
        ("Qdrant law data", "/workspace/services/qdrant-tanay/data/collections/criminal_code_cth"),
        ("Ingest scripts", "/workspace/services/qdrant-tanay/ingest"),
        ("DB backups", "/workspace/services/n8n-tanay/data/*.bak (13 snapshots)"),
    ]
    prows = "".join(f"<tr><td>{e(n)}</td><td><code>{e(p)}</code></td></tr>" for n, p in paths)
    body = f"""<div class="sec"><h2>All Doors — every service</h2>
    <table><tr><th>Service</th><th></th><th>What</th></tr>{rows}</table></div>
    <div class="sec"><h2>Key File Paths</h2><table>{prows}</table></div>"""
    return page("All Doors", body, "/doors")

# ---------------- reverse proxy ----------------
# maps /px/<key>/<rest> -> loopback service, so your browser reaches them via the
# hub's single tailnet door. No new ports exposed.
PROXY_MAP = {
    "lawyer":   "http://127.0.0.1:5190",   # lawyer chat UI (React SPA)
    "n8n":      "http://127.0.0.1:5679",   # lawyer n8n (tanays-selfhosted-automation) — isolated from jh
    "qdrant":   "http://127.0.0.1:6340",
    "ollama":   "http://127.0.0.1:11434",
}

def proxy(handler, key, rest, method="GET"):
    base = PROXY_MAP.get(key)
    if not base:
        handler._send(page("404", "<div class='sec'>Unknown service</div>"), 404); return
    target = base + "/" + rest
    if handler.path.find("?") >= 0:
        target += "?" + handler.path.split("?", 1)[1]
    try:
        body = None
        if method in ("POST", "PUT", "PATCH"):
            ln = int(handler.headers.get("content-length", 0) or 0)
            body = handler.rfile.read(ln) if ln else None
        req = urllib.request.Request(target, data=body, method=method)
        for hdr in ("content-type", "accept", "authorization"):
            if handler.headers.get(hdr):
                req.add_header(hdr, handler.headers[hdr])
        with urllib.request.urlopen(req, timeout=20) as r:
            data = r.read()
            ct = r.headers.get("content-type", "application/octet-stream")
            # rewrite root-absolute asset refs so SPA assets load through the proxy prefix
            if "text/html" in ct:
                pref = f"/px/{key}/".encode()
                data = data.replace(b'href="/', b'href="' + pref).replace(b'src="/', b'src="' + pref)
                data = data.replace(b'href="./', b'href="' + pref).replace(b'src="./', b'src="' + pref)
            handler.send_response(r.status)
            handler.send_header("content-type", ct)
            handler.end_headers()
            handler.wfile.write(data)
    except urllib.error.HTTPError as ex:
        handler.send_response(ex.code); handler.send_header("content-type", "text/plain"); handler.end_headers()
        handler.wfile.write(ex.read())
    except Exception as ex:
        handler._send(page("Proxy error", f"<div class='sec'><pre>{e(repr(ex))}</pre></div>"), 502)

# ---------------- server ----------------
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, body, code=200):
        self.send_response(code)
        self.send_header("content-type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(body.encode())
    def do_POST(self):
        if not _auth_ok(self):
            _send_401(self); return
        u = urlparse(self.path)
        if u.path.startswith("/px/"):
            parts = u.path[4:].split("/", 1)
            proxy(self, parts[0], parts[1] if len(parts) > 1 else "", "POST"); return
        self._send(page("404", "<div class='sec'>Not found</div>"), 404)
    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/healthz":
            self._send("ok"); return
        if not _auth_ok(self):
            _send_401(self); return
        q = parse_qs(u.query)
        try:
            if u.path.startswith("/px/"):
                parts = u.path[4:].split("/", 1)
                proxy(self, parts[0], parts[1] if len(parts) > 1 else "", "GET"); return
            if u.path == "/": out = view_overview()
            elif u.path == "/runs": out = view_runs()
            elif u.path == "/run": out = view_run(q.get("id", [""])[0])
            elif u.path == "/law":
                off = q.get("offset", [None])[0]
                off = json.loads(off) if off else None
                out = view_law(off)
            elif u.path == "/search": out = view_search(q.get("q", [None])[0])
            elif u.path == "/nodes": out = view_nodes(q.get("n", [None])[0])
            elif u.path == "/logs": out = view_logs()
            elif u.path == "/ingest": out = view_ingest()
            elif u.path == "/doors": out = view_doors()
            elif u.path == "/healthz": self._send("ok"); return
            else: self._send(page("404", "<div class='sec'>Not found</div>"), 404); return
            self._send(out)
        except Exception as ex:
            self._send(page("Error", f"<div class='sec'><pre>{e(repr(ex))}</pre></div>"), 500)

if __name__ == "__main__":
    # Bind host: default tailnet-IP (original behaviour). Set HUB_BIND=0.0.0.0 to
    # let the Tailscale Funnel (localhost) reach it — only do this with AUTH_ON.
    bind = os.environ.get("HUB_BIND", TAILNET_IP)
    srv = ThreadingHTTPServer((bind, PORT), H)
    gate = "AUTH ON" if AUTH_ON else "OPEN (no auth)"
    print(f"Control Hub on http://{bind}:{PORT}  [{gate}]")
    srv.serve_forever()
