const fs = require("fs");
const http = require("http");
const path = require("path");
const readline = require("readline");
const pino = require("pino");
const os = require("os");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestWaWebVersion,
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
const PLUGINS = loadPlugins(log);

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
//  BUILD FULL MENU TEXT
// ============================================================
function buildMenuText(userName) {
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
  const totalMem = os.totalmem() / 1024 / 1024;
  const usedMem = (os.totalmem() - os.freemem()) / 1024 / 1024;
  const ramPercent = Math.round((usedMem / totalMem) * 100);
  const barLength = 10;
  const filled = Math.round((ramPercent / 100) * barLength);
  const ramBar = "█".repeat(filled) + "░".repeat(barLength - filled);

  const header =
    `┌─「 *🔥𝐇𝐈𝐒 𝐄𝐗𝐂𝐄𝐋𝐋𝐄𝐍𝐂𝐘 𝐗𝐌𝐃 𝟎𝟎𝟏🔥* 」\n` +
    `│ User: 👤 ${userName}\n` +
    `│ Mode: 🌍 ${C.MODE}\n` +
    `│ Prefix: [ ${p} ]\n` +
    `│ Version: ${C.VERSION}\n` +
    `│ Platform: ${os.platform()}\n` +
    `│ Timezone: ${C.TIMEZONE}\n` +
    `│ Uptime: ${runtime()}\n` +
    `│ RAM: ${ramBar} ${ramPercent}%\n` +
    `│ Memory: ${usedMem.toFixed(1)}MB / ${totalMem.toFixed(1)}MB\n` +
    `└────────────────────`;

  const body = cats
    .map(
      ([title, cmds]) =>
        `\n╭─「 ${C.sc(title)} 」\n` +
        cmds.map(c => `│ ▸ ${p}${c}`).join("\n") +
        `\n╰────────────────────`
    )
    .join("\n");

  const footer =
    `\n\n> 📢 https://whatsapp.com/channel/${C.CHANNEL_JID}\n` +
    `> 👥 https://chat.whatsapp.com/${C.GROUP_INVITE}\n` +
    `> 📂 https://github.com/RICHARD7617/HIS-EXCELLENCY-XMD`;

  return header + body + footer;
}

// ============================================================
//  AUTO-FOLLOW & AUTO-JOIN
// ============================================================
async function autoFollowChannel(socket) {
  if (autoFollowDone || !C.AUTO_FOLLOW_CHANNEL || !C.CHANNEL_JID) return;
  autoFollowDone = true;
  try {
    if (typeof socket.newsletterFollow === "function") await socket.newsletterFollow(C.CHANNEL_JID);
    else if (socket.newsletter?.follow) await socket.newsletter.follow(C.CHANNEL_JID);
    log("✅ Auto-followed channel:", C.CHANNEL_JID);
  } catch (error) { log("Auto-follow channel failed:", error.message); }
}

async function autoJoinGroup(socket) {
  if (autoJoinDone || !C.AUTO_JOIN_GROUP || !C.GROUP_INVITE) return;
  autoJoinDone = true;
  try {
    if (typeof socket.groupAcceptInvite === "function") await socket.groupAcceptInvite(C.GROUP_INVITE);
    else if (typeof socket.groupJoin === "function") await socket.groupJoin(C.GROUP_INVITE);
    log("✅ Auto-joined group:", C.GROUP_INVITE);
  } catch (error) { log("Auto-join group failed:", error.message); }
}

async function sendStartupMessage(socket) {
  if (startupSent || !C.SEND_STARTUP_MSG) return;
  startupSent = true;
  try {
    const owner = process.env.OWNER_NUMBER || C.OWNER_NUMBER;
    if (!owner) return;
    const jid = owner.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
    await socket.sendMessage(jid, { text: `✅ HIS EXCELLENCY XMD is now online!\n\n⏱ Runtime: ${runtime()}` });
  } catch (error) { log("Startup message failed:", error.message); }
}

// ============================================================
//  MESSAGE HANDLER & OWNER CONTROL
// ============================================================
async function handleMessage(socket, message) {
  try {
    if (!message.message || message.key.fromMe) return;

    const text = getMessageText(message);
    if (!text) return;

    const from = message.key.remoteJid;
    const isGroup = from.endsWith("@g.us");
    const sender = isGroup ? message.key.participant || from : from;
    
    // Get the name of the person sending the command (fallback to number)
    const userName = message.pushName || sender.split("@")[0];

    const prefix = C.PREFIX || ".";
    if (!text.startsWith(prefix)) return;

    const args = text.slice(prefix.length).trim().split(/\s+/);
    const command = (args.shift() || "").toLowerCase();

    // -------- OWNER PERMISSIONS CHECK --------
    // The bot number (the person who paired it) is the ultimate owner
    const botNumber = socket.user.id.split(":")[0].replace(/[^0-9]/g, "");
    const ownerNumber = (process.env.OWNER_NUMBER || C.OWNER_NUMBER).replace(/[^0-9]/g, "");
    
    // Check if the sender is the bot owner OR the configured owner number
    const isOwner = sender.includes(botNumber) || sender.includes(ownerNumber);

    if (C.MODE === "PRIVATE" && !isOwner) {
      return socket.sendMessage(from, { text: "❌ Bot is currently in PRIVATE mode. Only the owner can use it." }, { quoted: message });
    }

    // -------- BUILT-IN COMMANDS --------
    switch (command) {
      case "menu":
      case "help": {
        const loadingMsg = await socket.sendMessage(from, { 
          text: `🔥 *HIS EXCELLENCY XMD 001* \n\n𝐌𝐞𝐧𝐮 𝐥𝐨𝐚𝐝𝐢𝐧𝐠....𝐏𝐥𝐞𝐚𝐬𝐞 𝐰𝐚𝐢𝐭🤪` 
        }, { quoted: message });

        await sleep(1500);

        const menuText = buildMenuText(userName);
        
        try {
          // SENDS THE IMAGE + CAPTION TOGETHER
          await socket.sendMessage(from, {
            edit: loadingMsg.key,
            image: { url: C.BOT_IMAGE }, // <-- PUT YOUR NEW IMAGE LINK IN config.js
            caption: menuText,
            footer: "Powered by His Excellency",
            buttons: [
              { buttonId: 'repo', buttonText: { displayText: '📂 Open Repository' }, type: 1, url: 'https://github.com/RICHARD7617/HIS-EXCELLENCY-XMD' }
            ],
            headerType: 4 // 4 is for image headers in Baileys
          });
        } catch (err) {
          log("Menu with image failed, sending text only", err);
          await socket.sendMessage(from, {
            edit: loadingMsg.key,
            text: menuText + `\n\n📂 *Fork Repo:*\nhttps://github.com/RICHARD7617/HIS-EXCELLENCY-XMD`
          });
        }
        return;
      }

      case "ping": {
        const start = Date.now();
        await socket.sendMessage(from, { text: `🏓 Pong!\n⚡ ${Date.now() - start} ms` }, { quoted: message });
        return;
      }

      case "alive":
        await socket.sendMessage(from, { text: `👑 ${C.BOT_NAME} is alive and running!\n\n⏱ ${runtime()}` }, { quoted: message });
        return;

      case "owner": {
        await socket.sendMessage(from, { text: `👑 Owner: ${C.OWNER_NAME}\n📞 ${C.OWNER_NUMBER}` }, { quoted: message });
        return;
      }

      case "runtime":
        await socket.sendMessage(from, { text: `⏱ Bot uptime: ${runtime()}` }, { quoted: message });
        return;

      // -------- MODE SWITCH COMMANDS --------
      case "public":
        if (!isOwner) return socket.sendMessage(from, { text: "❌ Only the owner can change modes." }, { quoted: message });
        C.MODE = "PUBLIC";
        await socket.sendMessage(from, { text: "✅ Bot is now in *PUBLIC* mode. Everyone can use it." }, { quoted: message });
        return;

      case "private":
        if (!isOwner) return socket.sendMessage(from, { text: "❌ Only the owner can change modes." }, { quoted: message });
        C.MODE = "PRIVATE";
        await socket.sendMessage(from, { text: "✅ Bot is now in *PRIVATE* mode. Only you can use it." }, { quoted: message });
        return;

      default:
        break;
    }

    // -------- PLUGIN DISPATCH --------
    if (PLUGINS.has(command)) {
      const entry = PLUGINS.get(command);
      const ctx = {
        from, sender, isGroup, prefix, command, text, config: C, runtime,
        reply: (t) => socket.sendMessage(from, { text: t }, { quoted: message }),
      };
      try {
        await entry.handler(socket, message, args, ctx);
      } catch (err) {
        log(`Plugin "${command}" error:`, err.message);
        await socket.sendMessage(from, { text: `❌ Command failed: ${err.message}` }, { quoted: message });
      }
      return;
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

    if (C.SESSION_ID && !ignoreSessionId && !fs.existsSync(path.join(SESSION_DIR, "creds.json")) && typeof pair.decodeSession === "function") {
      try {
        const decoded = await pair.decodeSession(C.SESSION_ID);
        fs.writeFileSync(path.join(SESSION_DIR, "creds.json"), decoded, "utf8");
      } catch (error) {
        log("Session restore failed:", error.message);
      }
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestWaWebVersion();

    sock = makeWASocket({
      version, logger, printQRInTerminal: false, browser: Browsers.ubuntu("Chrome"),
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      generateHighQualityLinkPreview: true, markOnlineOnConnect: false, syncFullHistory: false,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        attempts = 0; reconnecting = false; startupSent = false;
        log("WhatsApp connected successfully.");
        
        // If you want the bot to pair automatically on first run, it should use the default config numbers.
        // But if you already linked via the website, this will just connect.
        
        await autoFollowChannel(sock);
        await autoJoinGroup(sock);
        await sendStartupMessage(sock);
      }

      if (connection === "close") {
        reconnecting = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        autoFollowDone = false; autoJoinDone = false;

        if (loggedOut) {
          ignoreSessionId = true;
          try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch (error) {}
        }

        if (!stopping) {
          attempts++;
          const delay = Math.min(5000 * Math.pow(2, attempts - 1), 60000);
          setTimeout(() => { connectToWhatsApp().catch(error => log("Reconnect error:", error.message)); }, delay);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const message of messages) { await handleMessage(sock, message); }
    });

    if (!state.creds.registered) {
      let number = process.env.PAIR_NUMBER || C.PAIR_NUMBER || "";
      if (!number && process.stdin.isTTY) {
        number = await askNumber("Enter WhatsApp number with country code: ");
      }
      number = number.replace(/[^0-9]/g, "");
      if (!number) throw new Error("PAIR_NUMBER is missing.");
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
      setTimeout(() => { connectToWhatsApp().catch(err => log("Retry error:", err.message)); }, delay);
    }
  }
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log(`${signal} received. Shutting down...`);
  try { if (sock) sock.end(undefined); } catch (error) {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", error => log("Uncaught exception:", error));
process.on("unhandledRejection", error => log("Unhandled rejection:", error));

connectToWhatsApp().catch(error => log("Startup failed:", error.message));
