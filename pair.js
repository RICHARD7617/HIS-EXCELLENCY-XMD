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
  setTimeout(() => jobs.delete(job.id), 5 * 60 * 1000).unref();
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

async function connect(job, useQR = false) {
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
        finish(job, "failed", "Could not save pairing credentials.");
        return;
      }
    }

    if (events["connection.update"]) {
      const { connection, lastDisconnect, isNewLogin, qr } = events["connection.update"];
      
      if (qr && useQR) {
        job.qr = qr; // Store QR code for the frontend to fetch
      }

      if (isNewLogin) log("WhatsApp accepted pairing. Preparing reconnection...");

      if (connection === "open" && sock.authState.creds.registered) {
        log("Pairing completed successfully.");
        onLinked(job, sock);
      }

      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.restartRequired) {
          connect(job, useQR).catch((error) => {
            finish(job, "failed", "Reconnect failed. Please request a new code.");
          });
        } else if (!job.done) {
          finish(job, "failed", `Connection closed. Please try again.`);
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
    }, 3000);
  });
}

async function createJob(number, type) {
  const id = crypto.randomBytes(12).toString("hex");
  const job = { id, number, type, dir: path.join(os.tmpdir(), "pair-" + id), state: "waiting", done: false, sock: null, timer: null };
  jobs.set(id, job);
  
  // Expire exactly after 60 seconds (1 minute)
  job.timer = setTimeout(() => finish(job, "failed", "Code expired after 1 minute. Please try again."), 60000);
  
  try {
    const sock = await connect(job, type === "qr");
    if (type === "code") {
      job.code = await requestCode(job, sock);
    }
    return job;
  } catch (e) {
    finish(job, "failed", "Could not generate. Please try again.");
    throw e;
  }
}

function send(res, status, body, type) {
  res.writeHead(status, {
    "Content-Type": type || "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self' 'unsafe-inline'; img-src 'self' data: https:;",
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 2048) req.destroy(); });
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
  if (!h || now - h.start > 10 * 60 * 1000) { h = { start: now, count: 0 }; ipHits.set(ip, h); }
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
      let data = {};
      try { data = JSON.parse((await readBody(req)) || "{}"); } catch (_) {}
      
      let number = digits(data.number);
      const type = data.type || "code";

      if (number.startsWith("0")) number = number.substring(1);
      if (number.length === 9) number = "254" + number;

      if (type === "code" && (number.length < 8 || number.length > 15))
        return send(res, 400, { error: "Enter a valid number with country code." });
      
      if (ipLimited(clientIp(req)))
        return send(res, 429, { error: "Too many attempts. Wait a few minutes." });

      const active = [...jobs.values()].filter((j) => !j.done);
      if (active.length >= C.PAIR_MAX_ACTIVE)
        return send(res, 503, { error: "Server is busy. Try again in a minute." });

      try {
        const job = await createJob(number, type);
        send(res, 200, { id: job.id, code: job.code || null });
      } catch (e) {
        log("create failed:", e.message);
        send(res, 500, { error: "Could not generate code. Try again." });
      }
    })();
    return true;
  }

  if (req.method === "GET" && url === "/api/status") {
    const id = new URL(req.url, "http://x").searchParams.get("id") || "";
    const job = jobs.get(id);
    if (!job) return send(res, 404, { state: "failed", message: "Unknown or expired request." }), true;
    send(res, 200, { state: job.state, message: job.message, session: job.session || undefined, qr: job.qr || undefined });
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
  :root{--bg:#0a0a0f;--card:#12121a;--text:#f2f2f5;--mute:#8b8b9e;--acc:#ff6a2b;--ok:#3ddc84;--bad:#ff5c5c;--border:#252533}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;
    background:radial-gradient(circle at 50% 0%,#1a0d05,var(--bg) 70%);color:var(--text);
    font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .card{width:100%;max-width:440px;background:var(--card);border:1px solid var(--border);border-radius:20px;padding:30px 24px;
    box-shadow:0 20px 50px rgba(0,0,0,.6); position:relative; overflow:hidden;}
  .card::before { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 4px; background: linear-gradient(90deg, var(--acc), #ff9b66); }
  h1{font-size:22px;margin:0 0 6px;text-align:center;letter-spacing:-0.5px}
  p.sub{margin:0 0 24px;text-align:center;color:var(--mute);font-size:14px}
  .tabs { display:flex; gap:8px; margin-bottom:20px; background:#0a0a0f; padding:6px; border-radius:12px; border:1px solid var(--border); }
  .tab { flex:1; text-align:center; padding:10px; font-size:13px; font-weight:600; border-radius:8px; cursor:pointer; color:var(--mute); transition:0.2s; user-select:none; }
  .tab.active { background:var(--border); color:#fff; box-shadow:0 2px 10px rgba(0,0,0,0.2); }
  label{font-size:13px;color:var(--mute); display:block; margin-bottom:6px;}
  input{width:100%;margin:0 0 16px;padding:14px;border-radius:12px;border:1px solid var(--border);background:#0a0a0f;
    color:var(--text);font-size:16px;outline:none; transition:0.2s;}
  input:focus{border-color:var(--acc); box-shadow: 0 0 0 2px rgba(255,106,43,0.2);}
  button{width:100%;padding:15px;border:0;border-radius:12px;background:var(--acc);color:#fff;font-size:16px;
    font-weight:600;cursor:pointer; transition:0.2s;}
  button:hover { background: #ff7b42; }
  button:disabled{opacity:.5;cursor:not-allowed; background:var(--acc)}
  #msg{min-height:20px;margin-top:16px;text-align:center;font-size:14px; font-weight:500;}
  .ok{color:var(--ok)} .bad{color:var(--bad)}
  #box{display:none;margin-top:20px;text-align:center; animation: fadeIn 0.4s;}
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .code-box { font-size:34px;font-weight:800;letter-spacing:6px;padding:16px;border-radius:14px;background:#0a0a0f;
    border:2px dashed var(--acc);user-select:all; color:var(--acc); cursor:pointer; position:relative; }
  .code-box:hover::after { content:'Click to copy'; position:absolute; bottom:4px; right:8px; font-size:10px; font-weight:400; color:var(--mute); letter-spacing:0; }
  ol{text-align:left;color:var(--mute);font-size:13px;line-height:1.8;padding-left:24px; margin-top:20px; background:#0a0a0f; padding:16px 16px 16px 36px; border-radius:12px;}
  textarea{display:none;width:100%;height:110px;margin-top:12px;background:#0a0a0f;color:var(--text);
    border:1px solid var(--border);border-radius:12px;padding:12px;font-size:12px; outline:none;}
  small{display:block;margin-top:20px;text-align:center;color:var(--mute);font-size:11px; opacity:0.7;}
</style>
</head>
<body>
<div class="card">
  <h1>${esc(C.BOT_NAME)}</h1>
  <p class="sub">Secure Device Pairing & Session Generator</p>
  
  <div class="tabs">
    <div class="tab active" onclick="switchTab('code')">Pair Code</div>
    <div class="tab" onclick="switchTab('alt')">Alt. Code</div>
    <div class="tab" onclick="switchTab('qr')">QR Code</div>
  </div>

  <div id="form-code" class="form-section">
    <label for="num">WhatsApp Number (Country Code)</label>
    <input id="num" type="tel" inputmode="numeric" placeholder="254700000000" autocomplete="off">
    <button id="go-code">Generate Pairing Code</button>
  </div>

  <div id="form-alt" class="form-section" style="display:none;">
    <label for="num-alt">WhatsApp Number (No +)</label>
    <input id="num-alt" type="tel" inputmode="numeric" placeholder="254700000000" autocomplete="off">
    <button id="go-alt">Generate Alternative Code</button>
  </div>

  <div id="form-qr" class="form-section" style="display:none;">
    <p style="text-align:center; color:var(--mute); font-size:13px; margin-bottom:16px;">Click Generate and scan the QR code with WhatsApp.</p>
    <button id="go-qr">Generate QR Code</button>
  </div>

  <div id="msg"></div>
  
  <div id="box">
    <div id="code-display" class="code-box" onclick="copyCode()"></div>
    <div id="qr-display" style="display:none; text-align:center; margin-top:16px;">
      <img id="qr-img" src="" style="width:250px; height:250px; border-radius:12px; border:4px solid #fff; display:inline-block;" alt="QR Code">
    </div>
    <ol id="instructions">
      <li>Open WhatsApp on your phone</li>
      <li>Go to <b>Linked Devices</b> &gt; <b>Link a Device</b></li>
      <li id="inst-text">Tap “Link with phone number instead”</li>
      <li id="inst-text-2">Enter the code above</li>
    </ol>
    <textarea id="sess" readonly></textarea>
  </div>
  <small>Code expires in 60 seconds. Do not share your Session ID.</small>
</div>
<script>
var timer = null;
var currentTab = 'code';
function $(i){ return document.getElementById(i); }
function setMsg(t, bad){ var m = $('msg'); m.textContent = t || ''; m.className = bad ? 'bad' : 'ok'; }

function switchTab(type) {
  currentTab = type;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  
  $('form-code').style.display = type === 'code' ? 'block' : 'none';
  $('form-alt').style.display = type === 'alt' ? 'block' : 'none';
  $('form-qr').style.display = type === 'qr' ? 'block' : 'none';
  
  $('box').style.display = 'none';
  setMsg('', false);
  
  if (type === 'qr') {
    $('code-display').style.display = 'none';
    $('qr-display').style.display = 'block';
    $('inst-text').innerHTML = 'Scan the QR Code above';
    $('inst-text-2').style.display = 'none';
  } else {
    $('code-display').style.display = 'block';
    $('qr-display').style.display = 'none';
    $('inst-text').innerHTML = 'Tap “Link with phone number instead”';
    $('inst-text-2').style.display = 'block';
  }
}

function startPair(type, num) {
  $('go-'+type).disabled = true;
  $('box').style.display = 'none';
  $('sess').style.display = 'none';
  setMsg('Initializing connection...', false);
  
  fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ number: num, type: type }) })
    .then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); })
    .then(function(x){
      if (!x.ok) throw new Error(x.d.error || 'Request failed');
      setMsg('Waiting for you to link...', false);
      poll(x.d.id, type, x.d.code);
    })
    .catch(function(e){ setMsg(e.message, true); $('go-'+type).disabled = false; });
}

$('go-code').onclick = function(){ 
  var n = $('num').value.replace(/\\D/g, '');
  if (n.length < 7) { setMsg('Enter a valid number.', true); return; }
  startPair('code', n); 
};

$('go-alt').onclick = function(){ 
  var n = $('num-alt').value.replace(/\\D/g, '');
  if (n.length < 7) { setMsg('Enter a valid number.', true); return; }
  startPair('alt', n); 
};

$('go-qr').onclick = function(){ startPair('qr', ''); };

function copyCode() {
  var code = $('code-display').textContent;
  if (!code) return;
  navigator.clipboard.writeText(code).then(function() {
    setMsg('✅ Code copied to clipboard!', false);
  }).catch(function() {
    setMsg('⚠️ Please copy manually.', true);
  });
}

function poll(id, type, initialCode){
  clearInterval(timer);
  timer = setInterval(function(){
    fetch('/api/status?id=' + id)
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d.state === 'linked') {
          clearInterval(timer);
          setMsg(d.message, false);
          $('go-'+type).disabled = false;
          if (d.session) { $('sess').value = d.session; $('sess').style.display = 'block'; }
        } else if (d.state === 'failed') {
          clearInterval(timer);
          setMsg(d.message || 'Failed. Try again.', true);
          $('box').style.display = 'none';
          $('go-'+type).disabled = false;
        } else {
          $('box').style.display = 'block';
          if (type === 'qr' && d.qr) {
             // Load QR via external renderer
             $('qr-img').src = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent(d.qr);
          } else if (initialCode) {
             $('code-display').textContent = initialCode;
             // AUTO COPY TO CLIPBOARD IMMEDIATELY
             navigator.clipboard.writeText(initialCode).then(function(){
                setMsg('✅ Code generated & copied to clipboard!', false);
             }).catch(function(){});
             initialCode = null; // clear so it doesn't copy multiple times
          }
        }
      })
      .catch(function(){});
  }, 2000);
}
</script>
</body>
</html>`;
}

module.exports = { handle, decodeSession };
