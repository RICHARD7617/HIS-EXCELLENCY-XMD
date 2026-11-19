//  index.js — Lightweight WhatsApp bot (Baileys, CommonJS)
//  All settings come from ./config.js (which reads env variables)
// ============================================================
const fs = require("fs");
const http = require("http");
const path = require("path");
const readline = require("readline");
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
} = require("@whiskeysockets/baileys");

const C = require("./config");
const createStore = require("./store");

const pair = require("./pair");
const logger = pino({ level: "silent" });
const startTime = Date.now();
const SESSION_PATH = path.resolve(__dirname, C.SESSION_DIR); // works for relative AND absolute paths
const OWNER_JID = `${C.OWNER_NUMBER}@s.whatsapp.net`;

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);
const store = createStore(SESSION_PATH, C.DATABASE_URL, log);

let current = null; // the active socket
let reconnecting = false; // guards against duplicate reconnect timers
let startupSent = false; // "connected" message is sent only once
let attempts = 0; // consecutive failed connections (for backoff)
let stopping = false; // true while shutting down
let ignoreSessionId = false; // set after a logout so an old SESSION_ID is not reused
// ------------------------------------------------------------
//  Never die from errors: log only
// ------------------------------------------------------------
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
setInterval(() => {}, C.KEEPALIVE_MS); // keep-alive so the process never exits

// Hosts send SIGTERM on restart/redeploy (Heroku: at least every 24h).
// Save the session first so the bot stays linked after the restart.
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log(`${signal} received, saving session...`);
  try {
    await Promise.race([store.flush(), new Promise((r) => setTimeout(r, 8000))]);
  } catch (_) {}
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ------------------------------------------------------------
//  Tiny health-check server (only when the host provides a PORT).
//  Render/Railway web services need it; Heroku worker dynos skip it.
// ------------------------------------------------------------
if (C.PORT) {
  http
    .createServer((req, res) => {
      if (C.PAIR_SITE && pair.handle(req, res)) return; // pairing site routes
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`${C.BOT_NAME} is running\nUptime: ${uptime()}`);
    })
    .listen(Number(C.PORT), "0.0.0.0", () => log("Web server on port", C.PORT));
}

// Keep free web hosts (e.g. Render) awake by pinging our own URL
if (C.KEEP_ALIVE_URL) {
  setInterval(() => {
    fetch(C.KEEP_ALIVE_URL).catch(() => {});
  }, C.KEEP_ALIVE_EVERY);
}

// ------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------
function uptime() {
  let s = Math.floor((Date.now() - startTime) / 1000);
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const digits = (s) => String(s || "").replace(/\D/g, "");

// Schedule a (single) reconnect
function reconnect(delay) {
  if (reconnecting || stopping) return;
  reconnecting = true;
  setTimeout(() => {
    reconnecting = false;
    start().catch((e) => {
      console.error("[start error]", e);
      reconnect(C.RECONNECT_DELAY);
    });
  }, delay);
}

// Ask for a number in the terminal; resolves "" on timeout / closed stdin
function askNumber() {
  return new Promise((resolve) => {
    let done = false;
    let timer = null;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { rl.close(); } catch (_) {}
      resolve(v);
    };
    timer = setTimeout(() => finish(""), C.PROMPT_TIMEOUT);
    rl.on("close", () => finish(""));
    rl.question("Enter WhatsApp number with country code (e.g. 2547xxxxxxxx): ", (a) =>
      finish(digits(a))
    );
  });
}

// Simple per-user rate limit (owner is exempt). Protects the number and the host.
const hits = new Map(); // number -> { start, count, last }
function limited(num) {
  const now = Date.now();
  let h = hits.get(num);
  if (!h || now - h.start > 60000) {
    h = { start: now, count: 0, last: 0 };
    hits.set(num, h);
  }
  if (now - h.last < C.COOLDOWN_MS) return true;
  if (h.count >= C.MAX_PER_MIN) return true;
  h.last = now;
  h.count++;
  return false;
}
// Drop old entries so the map never grows
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now - v.start > 120000) hits.delete(k);
}, 60000);

// Bot info section (used by menu and alive)
const botInfo = () =>
  C.section("BOT INFO", [
    ["owner", C.OWNER_NAME],
    ["prefix", C.PREFIX],
    ["mode", C.MODE],
    ["version", C.VERSION],
    ["status", "Online 🟢"],
    ["uptime", uptime()],
  ]);

// ------------------------------------------------------------
//  Local content (no external APIs)
// ------------------------------------------------------------
const JOKES = [
  "Why do programmers prefer dark mode? Because light attracts bugs. 🐛",
  "I told my computer I needed a break. Now it won't stop sending me Kit-Kat ads. 🍫",
  "Why did the phone wear glasses? It lost its contacts. 👓",
  "There are 10 kinds of people: those who understand binary and those who don't.",
  "My Wi-Fi and I have a lot in common: we both drop out when it matters. 📶",
  "Why was the JavaScript developer sad? He didn't know how to null his feelings.",
];

const QUOTES = [
  "“The best way to predict the future is to create it.” — Peter Drucker",
  "“Discipline is choosing between what you want now and what you want most.”",
  "“Small steps every day lead to big results.”",
  "“Success is the sum of small efforts repeated daily.” — R. Collier",
  "“Dream big, start small, act now.”",
  "“Don't watch the clock; do what it does. Keep going.” — Sam Levenson",
];

// ------------------------------------------------------------
//  Commands — add a new command by adding one entry:
//  name: { cat, desc, run: async (ctx) => {} }
//  ctx = { sock, msg, jid, args, isOwner, reply }
// ------------------------------------------------------------
const commands = {
  menu: {
    cat: "General",
    desc: "Show this menu",
    run: async ({ sock, msg, jid, reply }) => {
      // Group commands by category automatically
      const cats = {};
      for (const [name, cmd] of Object.entries(commands)) {
        (cats[cmd.cat] = cats[cmd.cat] || []).push([C.PREFIX + name, cmd.desc]);
      }
      let text = C.header() + "\n\n" + botInfo();
      for (const [cat, rows] of Object.entries(cats)) {
        text += "\n\n" + C.section(cat.toUpperCase(), rows);
      }
      try {
        await sock.sendMessage(jid, { image: { url: C.BOT_IMAGE }, caption: text }, { quoted: msg });
      } catch (e) {
        log("menu image failed, sending plain text:", e.message);
        await reply(text);
      }
    },
  },

  ping: {
    cat: "General",
    desc: "Check bot speed",
    run: async ({ sock, jid, msg, reply }) => {
      const t0 = Date.now();
      const sent = await sock.sendMessage(jid, { text: "🏓 Pinging..." }, { quoted: msg });
      const text = C.section("PING", [["speed", `${Date.now() - t0} ms`]]);
      try {
        await sock.sendMessage(jid, { text, edit: sent.key });
      } catch (_) {
        await reply(text);
      }
    },
  },

  alive: {
    cat: "General",
    desc: "Check if the bot is online",
    run: async ({ reply }) => reply(botInfo()),
  },

  owner: {
    cat: "General",
    desc: "Show owner contact",
    run: async ({ reply }) =>
      reply(
        C.section("OWNER", [
          ["name", C.OWNER_NAME],
          ["number", "+" + C.OWNER_NUMBER],
          ["chat", `wa.me/${C.OWNER_NUMBER}`],
        ])
      ),
  },

  runtime: {
    cat: "General",
    desc: "Show bot uptime & memory",
    run: async ({ reply }) =>
      reply(
        C.section("RUNTIME", [
          ["uptime", uptime()],
          ["memory", `${(process.memoryUsage().rss / 1048576).toFixed(1)} MB`],
        ])
      ),
  },

  joke: {
    cat: "Fun",
    desc: "Get a random joke",
    run: async ({ reply }) => reply(C.section("JOKE", [pick(JOKES)])),
  },

  quote: {
    cat: "Fun",
    desc: "Get a random quote",
    run: async ({ reply }) => reply(C.section("QUOTE", [pick(QUOTES)])),
  },

  time: {
    cat: "Tools",
    desc: "Current date & time",
    run: async ({ reply }) => {
      const now = new Date().toLocaleString("en-GB", {
        timeZone: C.TIMEZONE,
        dateStyle: "full",
        timeStyle: "medium",
      });
      await reply(C.section("TIME", [["zone", C.TIMEZONE], ["now", now]]));
    },
  },
};

// ------------------------------------------------------------
//  Incoming message handler
// ------------------------------------------------------------
async function handleMessage(sock, msg) {
  if (!msg.message) return;
  const jid = msg.key.remoteJid;
  if (!jid || jid === "status@broadcast" || jid.endsWith("@newsletter")) return;

  // Unwrap common wrappers, then read the text
  let m = msg.message;
  m = m.ephemeralMessage?.message || m;
  m = m.viewOnceMessage?.message || m;
  const text =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    "";

  if (!text.startsWith(C.PREFIX)) return;

  // Who sent it?
  const isGroup = jid.endsWith("@g.us");
  const sender = msg.key.fromMe ? sock.user.id : isGroup ? msg.key.participant : jid;
  const number = digits(String(sender || "").split("@")[0].split(":")[0]);
  const isOwner = msg.key.fromMe || number === digits(C.OWNER_NUMBER);

  // PRIVATE mode = owner only
  if (C.MODE.toUpperCase() === "PRIVATE" && !isOwner) return;

  const args = text.slice(C.PREFIX.length).trim().split(/\s+/);
  const name = (args.shift() || "").toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(commands, name)) return;

  // Rate limit everyone except the owner
  if (!isOwner && limited(number)) return;

  const reply = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });
  try {
    await commands[name].run({ sock, msg, jid, args, isOwner, reply });
  } catch (e) {
    console.error(`[command ${name}]`, e);
  }
}

// ------------------------------------------------------------
//  Start / connect
// ------------------------------------------------------------
async function start() {
  // Restore the saved session from Postgres (no-op without DATABASE_URL)
  if (!store.ready) {
    try {
      const n = await store.restore();
      if (n) log(`Session restored from database (${n} files)`);
    } catch (e) {
      log("[db] restore failed:", e.message);
    }
  }

  // Load a Session ID from the pairing site (only when no session exists yet)
  if (C.SESSION_ID && !ignoreSessionId && !fs.existsSync(path.join(SESSION_PATH, "creds.json"))) {
    try {
      fs.mkdirSync(SESSION_PATH, { recursive: true });
      fs.writeFileSync(path.join(SESSION_PATH, "creds.json"), pair.decodeSession(C.SESSION_ID));
      log("Session loaded from SESSION_ID");
    } catch (e) {
      log("Invalid SESSION_ID:", e.message);
    }
  }
  
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
  const needsPairing = !state.creds.registered;
  let pairNumber = "";

  // Ask for the number BEFORE opening the socket (only when not yet linked)
  if (needsPairing) {
    pairNumber = digits(C.PAIR_NUMBER) || digits(process.env.PAIR_NUMBER);
    if (!pairNumber) pairNumber = await askNumber();
    if (!pairNumber) {
      log("No pairing number found. Set PAIR_NUMBER in config.js (or as an env variable). Retrying in 15s...");
      return reconnect(C.PROMPT_RETRY);
    }
  }

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch (_) {
    version = undefined; // fall back to Baileys' bundled version
  }

  const sock = makeWASocket({
    version,
    logger,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    browser: Browsers.ubuntu("Chrome"),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    shouldIgnoreJid: (j) => j === "status@broadcast" || (j || "").endsWith("@newsletter"),
    getMessage: async () => undefined,
  });
  current = sock;

  // Save credentials locally, then back them up to the database
  sock.ev.on("creds.update", async () => {
    try { await saveCreds(); } catch (e) { log("saveCreds failed:", e.message); }
    store.schedule();
  });

  // Request the pairing code ~3 seconds after the socket is created
  if (needsPairing) {
    setTimeout(async () => {
      if (sock !== current || sock.authState.creds.registered) return;
      try {
        const raw = await sock.requestPairingCode(pairNumber);
        const code = (raw.match(/.{1,4}/g) || [raw]).join("-");
        console.log("\n==============================");
        console.log(`   PAIRING CODE:  ${code}`);
        console.log("==============================");
        console.log("1. Open WhatsApp on the phone with number +" + pairNumber);
        console.log("2. Go to Settings > Linked Devices > Link a Device");
        console.log('3. Tap "Link with phone number instead"');
        console.log("4. Enter the code above\n");
      } catch (e) {
        log("Pairing code request failed:", e.message, "— retrying");
        try { sock.end(new Error("pairing failed")); } catch (_) {}
      }
    }, C.PAIR_DELAY);
  }

  // Connection lifecycle
  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (sock !== current) return; // ignore events from old sockets

    if (connection === "open") {
      attempts = 0; // healthy again
      log("Connected as", sock.user?.id);
      store.schedule(); // make sure the fresh session is backed up
      if (C.SEND_STARTUP_MSG && !startupSent) {
        startupSent = true;
        try {
          await sock.sendMessage(OWNER_JID, {
            text: C.section("CONNECTED", [
              ["bot", C.BOT_NAME],
              ["mode", C.MODE],
              ["status", "Online 🟢"],
            ]),
          });
        } catch (e) {
          log("Startup message failed:", e.message);
        }
      }
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      log("Connection closed, code:", code);

      if (code === DisconnectReason.loggedOut) {
        // Logged out: wipe local + saved session and pair again
        log("Logged out. Deleting session and pairing again...");
        try { fs.rmSync(SESSION_PATH, { recursive: true, force: true }); } catch (_) {}
        await store.clear();
        startupSent = false;
        attempts = 0;
        return reconnect(C.RECONNECT_DELAY);
      }

      // 515 = restart required (normal right after pairing): reconnect fast.
      // Anything else: exponential backoff so we never hammer WhatsApp or the host.
      if (code === DisconnectReason.restartRequired) {
        reconnect(C.RESTART_DELAY);
      } else {
        attempts++;
        const delay = Math.min(C.RECONNECT_DELAY * 2 ** Math.min(attempts - 1, 5), C.MAX_BACKOFF);
        reconnect(delay);
      }
    }
  });

  // Messages
  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      handleMessage(sock, msg).catch((e) => console.error("[handler]", e));
    }
  });
}

log(`Starting ${C.BOT_NAME} v${C.VERSION}...`);
store.startAuto(C.DB_SYNC_MS);
start().catch((e) => {
  console.error("[start error]", e);
  reconnect(C.RECONNECT_DELAY);
});
const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
} = require("@whiskeysockets/baileys");

const C = require("./config");

const logger = pino({ level: "silent" });
const startTime = Date.now();
const SESSION_PATH = path.join(__dirname, C.SESSION_DIR);
const OWNER_JID = `${C.OWNER_NUMBER}@s.whatsapp.net`;

let current = null; // the active socket
let reconnecting = false; // guards against duplicate reconnect timers
let startupSent = false; // "connected" message is sent only once

// ------------------------------------------------------------
//  Never die: log errors only
// ------------------------------------------------------------
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
setInterval(() => {}, C.KEEPALIVE_MS); // keep-alive so the process never exits

// ------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------
const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

function uptime() {
  let s = Math.floor((Date.now() - startTime) / 1000);
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const digits = (s) => String(s || "").replace(/\D/g, "");

// Schedule a (single) reconnect
function reconnect(delay) {
  if (reconnecting) return;
  reconnecting = true;
  setTimeout(() => {
    reconnecting = false;
    start().catch((e) => {
      console.error("[start error]", e);
      reconnect(C.RECONNECT_DELAY);
    });
  }, delay);
}

// Ask for a number in the terminal; resolves "" on timeout / closed stdin
function askNumber() {
  return new Promise((resolve) => {
    let done = false;
    let timer = null;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { rl.close(); } catch (_) {}
      resolve(v);
    };
    timer = setTimeout(() => finish(""), C.PROMPT_TIMEOUT);
    rl.on("close", () => finish(""));
    rl.question("Enter WhatsApp number with country code (e.g. 2547xxxxxxxx): ", (a) =>
      finish(digits(a))
    );
  });
}

// Bot info section (used by menu and alive)
const botInfo = () =>
  C.section("BOT INFO", [
    ["owner", C.OWNER_NAME],
    ["prefix", C.PREFIX],
    ["mode", C.MODE],
    ["version", C.VERSION],
    ["status", "Online 🟢"],
    ["uptime", uptime()],
  ]);

// ------------------------------------------------------------
//  Local content (no external APIs)
// ------------------------------------------------------------
const JOKES = [
  "Why do programmers prefer dark mode? Because light attracts bugs. 🐛",
  "I told my computer I needed a break. Now it won't stop sending me Kit-Kat ads. 🍫",
  "Why did the phone wear glasses? It lost its contacts. 👓",
  "There are 10 kinds of people: those who understand binary and those who don't.",
  "My Wi-Fi and I have a lot in common: we both drop out when it matters. 📶",
  "Why was the JavaScript developer sad? He didn't know how to null his feelings.",
];

const QUOTES = [
  "“The best way to predict the future is to create it.” — Peter Drucker",
  "“Discipline is choosing between what you want now and what you want most.”",
  "“Small steps every day lead to big results.”",
  "“Success is the sum of small efforts repeated daily.” — R. Collier",
  "“Dream big, start small, act now.”",
  "“Don't watch the clock; do what it does. Keep going.” — Sam Levenson",
];

// ------------------------------------------------------------
//  Commands — add a new command by adding one entry:
//  name: { cat, desc, run: async (ctx) => {} }
//  ctx = { sock, msg, jid, args, isOwner, reply }
// ------------------------------------------------------------
const commands = {
  menu: {
    cat: "General",
    desc: "Show this menu",
    run: async ({ sock, msg, jid, reply }) => {
      // Group commands by category automatically
      const cats = {};
      for (const [name, cmd] of Object.entries(commands)) {
        (cats[cmd.cat] = cats[cmd.cat] || []).push([C.PREFIX + name, cmd.desc]);
      }
      let text = C.header() + "\n\n" + botInfo();
      for (const [cat, rows] of Object.entries(cats)) {
        text += "\n\n" + C.section(cat.toUpperCase(), rows);
      }
      try {
        await sock.sendMessage(jid, { image: { url: C.BOT_IMAGE }, caption: text }, { quoted: msg });
      } catch (e) {
        log("menu image failed, sending plain text:", e.message);
        await reply(text);
      }
    },
  },

  ping: {
    cat: "General",
    desc: "Check bot speed",
    run: async ({ sock, jid, msg, reply }) => {
      const t0 = Date.now();
      const sent = await sock.sendMessage(jid, { text: "🏓 Pinging..." }, { quoted: msg });
      const text = C.section("PING", [["speed", `${Date.now() - t0} ms`]]);
      try {
        await sock.sendMessage(jid, { text, edit: sent.key });
      } catch (_) {
        await reply(text);
      }
    },
  },

  alive: {
    cat: "General",
    desc: "Check if the bot is online",
    run: async ({ reply }) => reply(botInfo()),
  },

  owner: {
    cat: "General",
    desc: "Show owner contact",
    run: async ({ reply }) =>
      reply(
        C.section("OWNER", [
          ["name", C.OWNER_NAME],
          ["number", "+" + C.OWNER_NUMBER],
          ["chat", `wa.me/${C.OWNER_NUMBER}`],
        ])
      ),
  },

  runtime: {
    cat: "General",
    desc: "Show bot uptime & memory",
    run: async ({ reply }) =>
      reply(
        C.section("RUNTIME", [
          ["uptime", uptime()],
          ["memory", `${(process.memoryUsage().rss / 1048576).toFixed(1)} MB`],
        ])
      ),
  },

  joke: {
    cat: "Fun",
    desc: "Get a random joke",
    run: async ({ reply }) => reply(C.section("JOKE", [pick(JOKES)])),
  },

  quote: {
    cat: "Fun",
    desc: "Get a random quote",
    run: async ({ reply }) => reply(C.section("QUOTE", [pick(QUOTES)])),
  },

  time: {
    cat: "Tools",
    desc: "Current date & time",
    run: async ({ reply }) => {
      const now = new Date().toLocaleString("en-GB", {
        timeZone: C.TIMEZONE,
        dateStyle: "full",
        timeStyle: "medium",
      });
      await reply(C.section("TIME", [["zone", C.TIMEZONE], ["now", now]]));
    },
  },
};

// ------------------------------------------------------------
//  Incoming message handler
// ------------------------------------------------------------
async function handleMessage(sock, msg) {
  if (!msg.message) return;
  const jid = msg.key.remoteJid;
  if (!jid || jid === "status@broadcast" || jid.endsWith("@newsletter")) return;

  // Unwrap common wrappers, then read the text
  let m = msg.message;
  m = m.ephemeralMessage?.message || m;
  m = m.viewOnceMessage?.message || m;
  const text =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    "";

  if (!text.startsWith(C.PREFIX)) return;

  // Who sent it?
  const isGroup = jid.endsWith("@g.us");
  const sender = msg.key.fromMe ? sock.user.id : isGroup ? msg.key.participant : jid;
  const number = digits(String(sender || "").split("@")[0].split(":")[0]);
  const isOwner = msg.key.fromMe || number === digits(C.OWNER_NUMBER);

  // PRIVATE mode = owner only
  if (C.MODE.toUpperCase() === "PRIVATE" && !isOwner) return;

  const args = text.slice(C.PREFIX.length).trim().split(/\s+/);
  const name = (args.shift() || "").toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(commands, name)) return;

  const reply = (t) => sock.sendMessage(jid, { text: t }, { quoted: msg });
  try {
    await commands[name].run({ sock, msg, jid, args, isOwner, reply });
  } catch (e) {
    console.error(`[command ${name}]`, e);
  }
}

// ------------------------------------------------------------
//  Start / connect
// ------------------------------------------------------------
async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
  const needsPairing = !state.creds.registered;
  let pairNumber = "";

  // Ask for the number BEFORE opening the socket (only when not yet linked)
  if (needsPairing) {
    pairNumber = digits(C.PAIR_NUMBER) || digits(process.env.PAIR_NUMBER);
    if (!pairNumber) pairNumber = await askNumber();
    if (!pairNumber) {
      log("No pairing number found. Set PAIR_NUMBER in config.js (or as an env variable). Retrying in 15s...");
      return reconnect(C.PROMPT_RETRY);
    }
  }

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch (_) {
    version = undefined; // fall back to Baileys' bundled version
  }

  const sock = makeWASocket({
    version,
    logger,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    browser: Browsers.ubuntu("Chrome"),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    shouldIgnoreJid: (j) => j === "status@broadcast" || (j || "").endsWith("@newsletter"),
    getMessage: async () => undefined,
  });
  current = sock;

  sock.ev.on("creds.update", saveCreds);

  // Request the pairing code ~3 seconds after the socket is created
  if (needsPairing) {
    setTimeout(async () => {
      if (sock !== current || sock.authState.creds.registered) return;
      try {
        const raw = await sock.requestPairingCode(pairNumber);
        const code = (raw.match(/.{1,4}/g) || [raw]).join("-");
        console.log("\n==============================");
        console.log(`   PAIRING CODE:  ${code}`);
        console.log("==============================");
        console.log("1. Open WhatsApp on the phone with number +" + pairNumber);
        console.log("2. Go to Settings > Linked Devices > Link a Device");
        console.log('3. Tap "Link with phone number instead"');
        console.log("4. Enter the code above\n");
      } catch (e) {
        log("Pairing code request failed:", e.message, "— retrying");
        try { sock.end(new Error("pairing failed")); } catch (_) {}
      }
    }, C.PAIR_DELAY);
  }

  // Connection lifecycle
  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (sock !== current) return; // ignore events from old sockets

    if (connection === "open") {
      log("Connected as", sock.user?.id);
      if (!startupSent) {
        startupSent = true;
        try {
          await sock.sendMessage(OWNER_JID, {
            text: C.section("CONNECTED", [
              ["bot", C.BOT_NAME],
              ["mode", C.MODE],
              ["status", "Online 🟢"],
            ]),
          });
        } catch (e) {
          log("Startup message failed:", e.message);
        }
      }
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      log("Connection closed, code:", code);

      if (code === DisconnectReason.loggedOut) {
        // Logged out: wipe the session and pair again
        log("Logged out. Deleting session and pairing again...");
        try { fs.rmSync(SESSION_PATH, { recursive: true, force: true }); } catch (_) {}
        startupSent = false;
        return reconnect(C.RECONNECT_DELAY);
      }
      // 515 = restart required (normal right after pairing)
      reconnect(code === DisconnectReason.restartRequired ? C.RESTART_DELAY : C.RECONNECT_DELAY);
    }
  });

  // Messages
  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      handleMessage(sock, msg).catch((e) => console.error("[handler]", e));
    }
  });
}

log(`Starting ${C.BOT_NAME} v${C.VERSION}...`);
start().catch((e) => {
  console.error("[start error]", e);
  reconnect(C.RECONNECT_DELAY);
});
