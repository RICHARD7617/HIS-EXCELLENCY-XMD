const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestWaWebVersion,
  DisconnectReason,
  Browsers,
} = require("@whiskeysockets/baileys");

const C = require("./config");

const logger = pino({ level: "silent" });
const log = (...a) => console.log(`[${new Date().toISOString()}] [pair]`, ...a);
const digits = (s) => String(s || "").replace(/\D/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const jobs = new Map();
const ipHits = new Map();

const encodeSession = (json) => C.SESSION_PREFIX + Buffer.from(json).toString("base64");

function decodeSession(id) {
  let raw = String(id || "").trim();
  if (raw.startsWith(C.SESSION_PREFIX)) raw = raw.slice(C.SESSION_PREFIX.length);
  const json = Buffer.from(raw, "base64").toString("utf8");
  JSON.parse(json);
  return json;
}

function finish(job, state, message) {
  if (job.done) return;
  job.done = true;
  job.state = state;
  job.message = message || "";
  clearTimeout(job.timer);
  try { job.sock && job.sock.end(new Error("pairing finished")); } catch (_) {}
  setTimeout(() => { try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch (_) {} }, 1500);
  setTimeout(() => jobs.delete(job.id), 10 * 60 * 1000).unref();
}

async function onLinked(job, sock) {
  if (job.done || job.linking) return;
  job.linking = true;
  try {
    await sleep(3000);
    const json = fs.readFileSync(path.join(job.dir, "creds.json"), "utf8");
    const session = encodeSession(json);
    const jid = `${job.number}@s.whatsapp.net`;
    try {
      await sock.sendMessage(jid, {
        text: `✅ *${C.BOT_NAME}* linked!\n\nCopy the next message and set it as your *SESSION_ID* when you deploy.\n⚠️ Never share it: whoever has it controls your WhatsApp.`,
      });
      await sock.sendMessage(jid, { text: session });
      await sleep(2000);
      finish(job, "linked", "Session ID sent to your WhatsApp.");
    } catch (e) {
      log("send failed:", e.message);
      job.session = session;
      finish(job, "linked", "Linked, but the message could not be sent. Copy the Session ID below.");
    }
  } catch (e) {
    log("onLinked failed:", e.message);
    finish(job, "failed", "Linked, but the session could not be read. Please try again.");
  }
}

async function connect(job) {
  const { state, saveCreds } = await useMultiFileAuthState(job.dir);

  let version;
  try {
    ({ version } = await fetchLatestWaWebVersion());
  } catch (error) {
    log("Version fetch failed:", error.message);
  }

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: Browsers.ubuntu("Chrome"),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    getMessage: async () => undefined,
  });

  job.sock = sock;

  sock.ev.process(async (events) => {
    if (job.sock !== sock || job.done) return;

    if (events["creds.update"]) {
      try {
        await saveCreds();
      } catch (error) {
        finish(job, "failed", "Could not save pairing credentials. Please try again.");
        return;
      }
    }

    if (events["connection.update"]) {
      const { connection, lastDisconnect, isNewLogin } = events["connection.update"];
      if (isNewLogin) log("WhatsApp accepted pairing. Preparing reconnection...");

      if (connection === "open" && sock.authState.creds.registered) {
        log("Pairing completed successfully.");
        onLinked(job, sock);
      }

      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.restartRequired) {
          log("Restart required (515). Reconnecting immediately...");
          connect(job).catch((error) => {
            finish(job, "failed", "Reconnect failed. Please request a new code.");
          });
        } else {
          finish(job, "failed", `Connection closed (code ${code || "unknown"}). Please try again.`);
        }
      }
    }
  });

  return sock;
}

function requestCode(job, sock) {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        const raw = await sock.requestPairingCode(job.number);
        resolve((raw.match(/.{1,4}/g) || [raw]).join("-"));
      } catch (e) {
        reject(e);
      }
    }, C.PAIR_DELAY);
  });
}

async function createJob(number) {
  const id = crypto.randomBytes(12).toString("hex");
  const job = { id, number, dir: path.join(os.tmpdir(), "pair-" + id), state: "waiting", done: false, sock: null, timer: null };
  jobs.set(id, job);
  job.timer = setTimeout(() => finish(job, "failed", "Code expired. Please request a new one."), C.PAIR_TTL_MS);
  try {
    const sock = await connect(job);
    job.code = await requestCode(job, sock);
    return job;
  } catch (e) {
    finish(job, "failed", "Could not get a pairing code.");
    throw e;
  }
}

function send(res, status, body, type) {
  res.writeHead(status, {
    "Content-Type": type || "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self' 'unsafe-inline'; img-src 'self' data: https:",
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 2048) req.destroy();
    });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}

function clientIp(req) {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",");
  return (xff[xff.length - 1] || req.socket.remoteAddress || "unknown").trim();
}

function ipLimited(ip) {
  const now = Date.now();
  let h = ipHits.get(ip);
  if (!h || now - h.start > 10 * 60 * 1000) {
    h = { start: now, count: 0 };
    ipHits.set(ip, h);
  }
  h.count++;
  return h.count > C.PAIR_PER_IP;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of ipHits) if (now - v.start > 10 * 60 * 1000) ipHits.delete(k);
}, 60000).unref();

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function handle(req, res) {
  const url = (req.url || "").split("?")[0];

  if (req.method === "GET" && (url === "/" || url === "/pair")) {
    send(res, 200, page(), "text/html; charset=utf-8");
    return true;
  }

  if (req.method === "POST" && url === "/api/pair") {
    (async () => {
      let number = "";
      try { number = digits(JSON.parse((await readBody(req)) || "{}").number); } catch (_) {}
      
      // --- AUTO-FIX START ---
      // Remove leading zero if they typed 07... instead of 2547...
      if (number.startsWith("0")) number = number.substring(1);
      
      // If they typed 9 digits (missing country code), prepend Kenya 254
      if (number.length === 9) number = "254" + number;

      // --- AUTO-FIX END ---

      if (number.length < 8 || number.length > 15)
        return send(res, 400, { error: "Enter a valid number with country code, digits only." });
      
      if (ipLimited(clientIp(req)))
        return send(res, 429, { error: "Too many attempts. Please wait a few minutes." });

      const active = [...jobs.values()].filter((j) => !j.done);
      if (active.some((j) => j.number === number))
        return send(res, 409, { error: "A code was already requested for this number. Wait for it to expire." });
      if (active.length >= C.PAIR_MAX_ACTIVE)
        return send(res, 503, { error: "Server is busy. Try again in a minute." });

      try {
        const job = await createJob(number);
        send(res, 200, { id: job.id, code: job.code });
      } catch (e) {
        log("create failed:", e.message);
        send(res, 500, { error: "Could not get a pairing code. Check the number and try again." });
      }
    })();
    return true;
  }

  if (req.method === "GET" && url === "/api/status") {
    const id = new URL(req.url, "http://x").searchParams.get("id") || "";
    const job = jobs.get(id);
    if (!job) return send(res, 404, { state: "failed", message: "Unknown or expired request." }), true;
    send(res, 200, { state: job.state, message: job.message, session: job.session || undefined });
    return true;
  }

  return false;
}

function page() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(C.BOT_NAME)} · Pair</title>
<style>
  :root{--bg:#0d0d12;--card:#17171f;--text:#f2f2f5;--mute:#9a9aa8;--acc:#ff6a2b;--ok:#3ddc84;--bad:#ff5c5c}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;
    background:radial-gradient(circle at top,#2a1408,var(--bg) 60%);color:var(--text);
    font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .card{width:100%;max-width:420px;background:var(--card);border:1px solid #2a2a36;border-radius:18px;padding:26px 22px;
    box-shadow:0 10px 40px rgba(0,0,0,.5)}
  h1{font-size:20px;margin:0 0 4px;text-align:center}
  p.sub{margin:0 0 20px;text-align:center;color:var(--mute);font-size:14px}
  label{font-size:13px;color:var(--mute)}
  input{width:100%;margin:6px 0 14px;padding:13px;border-radius:10px;border:1px solid #2f2f3d;background:#0f0f15;
    color:var(--text);font-size:16px;outline:none}
  input:focus{border-color:var(--acc)}
  button{width:100%;padding:13px;border:0;border-radius:10px;background:var(--acc);color:#fff;font-size:16px;
    font-weight:600;cursor:pointer}
  button:disabled{opacity:.5;cursor:not-allowed}
  #msg{min-height:20px;margin-top:12px;text-align:center;font-size:14px}
  .ok{color:var(--ok)} .bad{color:var(--bad)}
  #box{display:none;margin-top:18px;text-align:center}
  #code{font-size:34px;font-weight:700;letter-spacing:4px;padding:14px;border-radius:12px;background:#0f0f15;
    border:1px dashed var(--acc);user-select:all}
  ol{text-align:left;color:var(--mute);font-size:14px;line-height:1.7;padding-left:20px}
  textarea{display:none;width:100%;height:110px;margin-top:10px;background:#0f0f15;color:var(--text);
    border:1px solid #2f2f3d;border-radius:10px;padding:10px;font-size:12px}
  small{display:block;margin-top:16px;text-align:center;color:var(--mute);font-size:12px}
</style>
</head>
<body>
<div class="card">
  <h1>${esc(C.BOT_NAME)}</h1>
  <p class="sub">Link your WhatsApp and get your Session ID</p>
  <label for="num">WhatsApp number (country code, digits only)</label>
  <input id="num" type="tel" inputmode="numeric" placeholder="254700000000" autocomplete="off">
  <button id="go">Get pairing code</button>
  <div id="msg"></div>
  <div id="box">
    <div id="code"></div>
    <ol>
      <li>Open WhatsApp on that phone</li>
      <li>Settings &gt; Linked Devices &gt; Link a Device</li>
      <li>Tap “Link with phone number instead”</li>
      <li>Enter the code above</li>
    </ol>
    <textarea id="sess" readonly></textarea>
  </div>
  <small>Your Session ID gives full access to your WhatsApp. Never share it.</small>
</div>
<script>
var timer = null;
function $(i){ return document.getElementById(i); }
function setMsg(t, bad){ var m = $('msg'); m.textContent = t || ''; m.className = bad ? 'bad' : 'ok'; }

$('go').onclick = function(){
  var n = $('num').value.replace(/\\D/g, '');
  // Allow lenient input. Only check that it's not completely empty.
  if (n.length < 7) { setMsg('Please enter a valid phone number.', true); return; }
  $('go').disabled = true;
  $('box').style.display = 'none';
  $('sess').style.display = 'none';
  setMsg('Requesting code...', false);
  fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ number: n }) })
    .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); })
    .then(function(x){
      if (!x.ok) throw new Error(x.d.error || 'Request failed');
      $('code').textContent = x.d.code;
      $('box').style.display = 'block';
      setMsg('Waiting for you to link...', false);
      poll(x.d.id);
    })
    .catch(function(e){ setMsg(e.message, true); $('go').disabled = false; });
};

function poll(id){
  clearInterval(timer);
  timer = setInterval(function(){
    fetch('/api/status?id=' + id)
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d.state === 'linked') {
          clearInterval(timer);
          setMsg(d.message, false);
          $('go').disabled = false;
          if (d.session) { $('sess').value = d.session; $('sess').style.display = 'block'; }
        } else if (d.state === 'failed') {
          clearInterval(timer);
          setMsg(d.message || 'Failed. Try again.', true);
          $('box').style.display = 'none';
          $('go').disabled = false;
        }
      })
      .catch(function(){});
  }, 3000);
}
</script>
</body>
</html>`;
}

module.exports = { handle, decodeSession };
