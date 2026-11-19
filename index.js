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
const pair = require("./pair");
const { loadPlugins } = require("./plugins/loader");

const logger = pino({ level: "silent" });

let sock = null;
let reconnecting = false;
let startupSent = false;
let autoFollowDone = false;
let autoJoinDone = false;
let attempts = 0;
let stopping = false;
let ignoreSessionId = false;

const SESSION_DIR = path.join(__dirname, "session");
const PORT = process.env.PORT || C.PORT || 3000;

if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

function log(...args) {
  console.log("[HIS EXCELLENCY XMD]", ...args);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function runtime() {
  const seconds = Math.floor(process.uptime());
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

function askNumber(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function startServer() {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return res.end("HIS EXCELLENCY XMD is running.");
    }
    if (pair && typeof pair.handle === "function") {
      const handled = pair.handle(req, res);
      if (handled) return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Page not found");
  });
  server.listen(PORT, "0.0.0.0", () => {
    log(`Web server running on port ${PORT}`);
  });
  return server;
}

const server = startServer();

// Load all plugins once
const PLUGINS = loadPlugins(log);
log(`Plugin commands available: ${PLUGINS.size}`);

function getMessageText(message) {
  const msg = message.message || {};
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ""
  ).trim();
}

// ============================================================
//  AUTO-FOLLOW CHANNEL  (runs once per connection)
// ============================================================
async function autoFollowChannel(socket) {
  if (autoFollowDone || !C.AUTO_FOLLOW_CHANNEL || !C.CHANNEL_JID) return;
  autoFollowDone = true;
  try {
    if (typeof socket.newsletterFollow === "function") {
      await socket.newsletterFollow(C.CHANNEL_JID);
    } else if (socket.newsletter?.follow) {
      await socket.newsletter.follow(C.CHANNEL_JID);
    } else {
      log("Auto-follow: newsletterFollow not available in this Baileys build.");
      return;
    }
    log("✅ Auto-followed channel:", C.CHANNEL_JID);
  } catch (error) {
    log("Auto-follow channel failed:", error.message);
  }
}

// ============================================================
//  AUTO-JOIN GROUP  (runs once per connection)
// ============================================================
async function autoJoinGroup(socket) {
  if (autoJoinDone || !C.AUTO_JOIN_GROUP || !C.GROUP_INVITE) return;
  autoJoinDone = true;
  try {
    if (typeof socket.groupAcceptInvite === "function") {
      await socket.groupAcceptInvite(C.GROUP_INVITE);
    } else if (typeof socket.groupJoin === "function") {
      await socket.groupJoin(C.GROUP_INVITE);
    } else {
      log("Auto-join: groupAcceptInvite not available in this Baileys build.");
      return;
    }
    log("✅ Auto-joined group:", C.GROUP_INVITE);
  } catch (error) {
    log("Auto-join group failed:", error.message);
  }
}

async function sendStartupMessage(socket) {
  if (startupSent || !C.SEND_STARTUP_MSG) return;
  startupSent = true;
  try {
    const owner = process.env.OWNER_NUMBER || C.OWNER_NUMBER;
    if (!owner) return;
    const jid = owner.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    await socket.sendMessage(jid, {
      text: `✅ HIS EXCELLENCY XMD is now online!\n\n⏱ Runtime: ${runtime()}`,
    });
  } catch (error) {
    log("Startup message failed:", error.message);
  }
}

// ============================================================
//  BUILD FULL MENU TEXT (all categories from your .txt)
// ============================================================
function buildMenuText() {
  const p = C.PREFIX;
  const cats = [
    ["ᴀɪ", ["bing", "dall", "gemini", "gpt", "groq", "or", "upscale"]],
    ["ᴀᴜᴅɪᴏ", ["avec", "bass", "black", "blown", "cut", "deep", "earrape", "fast", "fat", "histo", "low", "nightcore", "pitch", "robot", "slow", "smooth", "treble", "tupai", "vector"]],
    ["ᴀᴜᴛᴏʀᴇᴘʟʏ", ["filter", "gfilter", "gstop", "pfilter", "pstop", "stop"]],
    ["ʙᴏᴛ", ["backup", "gauth", "gupload", "reminder", "task", "tog", "update", "update-now", "ytlogin"]],
    ["ʙᴜᴅɢᴇᴛ", ["budget", "delbudget", "expense", "income", "summary"]],
    ["ᴅᴏᴄᴜᴍᴇɴᴛ", ["page", "pdf"]],
    ["ᴅᴏᴡɴʟᴏᴀᴅ", ["apk", "fb", "fullss", "insta", "mediafire", "pinterest", "play", "reddit", "song", "spotify", "ss", "story", "tiktok", "twitter", "upload", "video", "yta", "ytv"]],
    ["ᴇᴅɪᴛᴏʀ", ["bloody", "bokeh", "cartoon", "color", "dark", "demon", "enhance", "gandm", "horned", "kiss", "look", "makeup", "pencil", "sketch", "skull", "wanted", "zombie"]],
    ["ɢᴀᴍᴇ", ["tictactoe", "wcg", "wrg"]],
    ["ɢʀᴏᴜᴘ", ["add", "amute", "antifake", "antigm", "antistatus", "antilink", "antispam", "antiword", "aunmute", "common", "demote", "ginfo", "goodbye", "gpp", "gstatus", "inactive", "invite", "join", "kick", "msgs", "mute", "pdm", "promote", "reset", "revoke", "tag", "unmute", "vote", "warn", "welcome"]],
    ["ʟᴏɢɪᴀ", ["ope", "yami", "zushi"]],
    ["ᴍɪsᴄ", ["afk", "alive", "avm", "calc", "delcmd", "fancy", "forward", "getcmd", "lydia", "mention", "mforward", "news", "ping", "qr", "reboot", "rmbg", "save", "setcmd", "tts", "url", "whois"]],
    ["ᴘᴇʀsᴏɴᴀʟ", ["delgreet", "getgreet", "setgreet"]],
    ["ᴘʟᴜɢɪɴ", ["plugin", "remove"]],
    ["sᴄʜᴇᴅᴜʟᴇ", ["delschedule", "getschedule", "setschedule"]],
    ["sᴇᴀʀᴄʜ", ["emix", "emoji", "find", "ig", "img", "ison", "jean", "movie", "time", "trt", "weather", "yts"]],
    ["sᴛɪᴄᴋᴇʀ", ["circle", "exif", "mp4", "photo", "sticker", "take", "tg"]],
    ["ᴛᴇxᴛᴍᴀᴋᴇʀ", ["3d", "angel", "avenger", "blub", "bpink", "cat", "glitch", "glitter", "graffiti", "hacker", "light", "marvel", "neon", "sci", "sign", "tattoo", "watercolor"]],
    ["ᴜsᴇʀ", ["block", "fullpp", "gjid", "jid", "left", "pp", "unblock"]],
    ["ᴠᴀʀs", ["allvar", "delsudo", "delvar", "getsudo", "getvar", "setsudo", "setvar"]],
    ["ᴠɪᴅᴇᴏ", ["compress", "crop", "merge", "mp3", "reverse", "rotate", "trim"]],
    ["ᴡʜᴀᴛsᴀᴘᴘ", ["antiedit", "call", "caption", "cinfo", "clear", "create", "delete", "dlt", "doc", "online", "poll", "react", "read", "scstatus", "setstatus", "status", "vv"]],
  ];

  const now = new Date();
  const header =
    "▛▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞\n" +
    `▌  ${C.BOT_NAME}\n` +
    `▌  ᴘʀᴇғɪx : ${p}\n` +
    `▌  ᴏᴡɴᴇʀ  : ${C.OWNER_NAME}\n` +
    `▌  ᴛɪᴍᴇ   : ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: C.TIMEZONE })}\n` +
    `▌  ᴅᴀʏ    : ${now.toLocaleDateString("en-GB", { weekday: "long", timeZone: C.TIMEZONE })}\n` +
    `▌  ᴅᴀᴛᴇ   : ${now.toLocaleDateString("en-GB", { timeZone: C.TIMEZONE })}\n` +
    `▌  ᴠᴇʀsɪᴏɴ: ${C.VERSION}\n` +
    `▌  ᴘʟᴜɢɪɴs: ${cats.reduce((n, c) => n + c[1].length, 0)}\n` +
    `▌  ʀᴀᴍ    : ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB\n` +
    `▌  ᴜᴘᴛɪᴍᴇ : ${runtime()}\n` +
    `▌  ᴘʟᴀᴛғᴏʀᴍ: ${process.platform} (${process.arch})\n` +
    "▙▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚";

  const body = cats
    .map(
      ([title, cmds]) =>
        `\n╔═〔 ${C.sc(title)} 〕══════════════════╗\n` +
        cmds.map(c => `  ▸ ${p}${c}`).join("\n") +
        `\n╚═══════════════════════════════════╝`
    )
    .join("\n");

  const footer =
    "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    `📢 Channel: https://whatsapp.com/channel/${C.CHANNEL_JID}\n` +
    
    `👥 Group  : https://chat.whatsapp.com/${C.GROUP_INVITE}\n` +
    
    `⚡ ${C.bold("Powered by His Excellency")}`;

  return header + body + footer;
}

async function handleMessage(socket, message) {
  try {
    if (!message.message || message.key.fromMe) return;

    const text = getMessageText(message);
    if (!text) return;

    const from = message.key.remoteJid;
    const isGroup = from.endsWith("@g.us");
    const sender = isGroup ? message.key.participant || from : from;

    const prefix = C.PREFIX || ".";
    if (!text.startsWith(prefix)) return;

    const args = text.slice(prefix.length).trim().split(/\s+/);
    const command = (args.shift() || "").toLowerCase();

    switch (command) {
      case "menu":
      case "help": {
        // FIXED: single sendMessage with image + caption so the image appears
        const menuText = buildMenuText();
        try {
          await socket.sendMessage(
            from,
            {
              image: { url: C.BOT_IMAGE },
              caption: menuText,
              mimetype: "image/jpeg",
            },
            { quoted: message }
          );
        } catch (imgErr) {
          log("Menu image send failed, sending text only:", imgErr.message);
          await socket.sendMessage(from, { text: menuText }, { quoted: message });
        }
        break;
      }

      case "ping": {
        const start = Date.now();
        await socket.sendMessage(from, {
          text: `🏓 Pong!\n⚡ ${Date.now() - start} ms`,
        }, { quoted: message });
        break;
      }

      case "alive":
        await socket.sendMessage(from, {
          text: `👑 ${C.BOT_NAME} is alive and running!\n\n⏱ ${runtime()}`,
        }, { quoted: message });
        break;

      case "owner": {
        const owner = process.env.OWNER_NUMBER || C.OWNER_NUMBER;
        await socket.sendMessage(from, {
          text: `👑 Owner: ${process.env.OWNER_NAME || C.OWNER_NAME || "Owner"}\n📞 ${owner || "Not configured"}`,
        }, { quoted: message });
        break;
      }

      case "runtime":
        await socket.sendMessage(from, {
          text: `⏱ Bot uptime: ${runtime()}`,
        }, { quoted: message });
        break;

      default:
        break;
    }
  } catch (error) {
    log("Message handler error:", error.message);
  }
}

async function connectToWhatsApp() {
  if (stopping || reconnecting) return;
  reconnecting = true;

  try {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    // Restore session from SESSION_ID
    if (
      C.SESSION_ID &&
      !ignoreSessionId &&
      !fs.existsSync(path.join(SESSION_DIR, "creds.json")) &&
      typeof pair.decodeSession === "function"
    ) {
      try {
        const decoded = await pair.decodeSession(C.SESSION_ID);
        fs.writeFileSync(path.join(SESSION_DIR, "creds.json"), decoded, "utf8");
        log("Session restored from SESSION_ID.");
      } catch (error) {
        log("Session restore failed:", error.message);
      }
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      browser: Browsers.ubuntu("Chrome"),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });

    // 1. Credentials listener
    sock.ev.on("creds.update", saveCreds);

    // 2. Connection listener
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        attempts = 0;
        reconnecting = false;
        startupSent = false;

        log("WhatsApp connected successfully.");

        // ---- AUTO-FOLLOW + AUTO-JOIN (on every fresh connection) ----
        await autoFollowChannel(sock);
        await autoJoinGroup(sock);

        await sendStartupMessage(sock);
      }

      if (connection === "close") {
        reconnecting = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        // Reset one-shot flags so they run again on next connection
        autoFollowDone = false;
        autoJoinDone = false;

        if (loggedOut) {
          log("Session logged out. Removing saved session.");
          ignoreSessionId = true;
          try {
            fs.rmSync(SESSION_DIR, { recursive: true, force: true });
          } catch (error) {
            log("Session removal error:", error.message);
          }
        }

        if (!stopping) {
          attempts++;
          const delay = Math.min(5000 * Math.pow(2, attempts - 1), 60000);
          log(`Connection closed. Reconnecting in ${delay / 1000}s...`);
          setTimeout(() => {
            connectToWhatsApp().catch(error => {
              log("Reconnect error:", error.message);
            });
          }, delay);
        }
      }
    });

    // 3. Message listener
    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const message of messages) {
        await handleMessage(sock, message);
      }
    });

    // 4. Pairing code
    if (!state.creds.registered) {
      let number = process.env.PAIR_NUMBER || C.PAIR_NUMBER || "";
      if (!number && process.stdin.isTTY) {
        number = await askNumber("Enter WhatsApp number with country code: ");
      }
      number = number.replace(/[^0-9]/g, "");
      if (!number) {
        throw new Error("PAIR_NUMBER is missing. Set it in Render environment variables.");
      }
      await sleep(2000);
      const code = await sock.requestPairingCode(number);
      log(`Your WhatsApp pairing code: ${code}`);
    }
  } catch (error) {
    reconnecting = false;
    log("Connection error:", error.message);
    if (!stopping) {
      attempts++;
      const delay = Math.min(5000 * Math.pow(2, attempts - 1), 60000);
      setTimeout(() => {
        connectToWhatsApp().catch(err => {
          log("Retry error:", err.message);
        });
      }, delay);
    }
  }
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log(`${signal} received. Shutting down...`);
  try {
    if (sock) sock.end(undefined);
  } catch (error) {
    log("Socket shutdown error:", error.message);
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", error => log("Uncaught exception:", error));
process.on("unhandledRejection", error => log("Unhandled rejection:", error));

connectToWhatsApp().catch(error => {
  log("Startup failed:", error.message);
});
