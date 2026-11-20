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
let autoFollowDone = false;
let autoJoinDone = false;
let attempts = 0;
let stopping = false;
let ignoreSessionId = false;
let hasAnnouncedStartup = false;

const SESSION_DIR = path.join(__dirname, "session");
const PORT = process.env.PORT || C.PORT || 3000;
const dbPath = path.join(__dirname, "database.json");

// ============================================================
// DATABASE SETUP
// ============================================================
function getDB() {
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ groups: {} }));
  }
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function saveDB(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// ============================================================
// UTILITIES
// ============================================================
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

function normalizeNumber(value) {
  return String(value || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");
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

// ============================================================
// WEB SERVER & HEALTH CHECK
// ============================================================
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

// ============================================================
// MESSAGE TEXT EXTRACTOR
// ============================================================
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
// MENU DESIGN
// ============================================================
function buildMenuText(userName) {
  const p = C.PREFIX || ".";
  const now = new Date();

  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: C.TIMEZONE || "Africa/Nairobi",
  });

  const day = now.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: C.TIMEZONE || "Africa/Nairobi",
  });

  const date = now.toLocaleDateString("en-GB", {
    timeZone: C.TIMEZONE || "Africa/Nairobi",
  });

  const totalMem = os.totalmem() / 1024 / 1024;
  const freeMem = os.freemem() / 1024 / 1024;
  const usedMem = totalMem - freeMem;
  const ramText = `${Math.round(usedMem)}/${Math.round(totalMem)}MB`;

  const header =
   ╭═══ 🔥𝐇𝐈𝐒 𝐄𝐗𝐂𝐄𝐋𝐋𝐄𝐍𝐂𝐘 𝐗𝐌𝐃 𝟎𝟎𝟏🔥 ═══⊷
┃❃╭──────────────
┃❃│ 𝐏𝐫𝐞𝐟𝐢𝐱 : .
┃❃│ 𝐔𝐬𝐞𝐫 : ᬼ⃝⃪𝐇𝐈𝐒ᬼ⃝⃪ᬼ⃝ 𝐄𝐗𝐂𝐄𝐋𝐋𝐄𝐍𝐂𝐘 ⃝⃪
┃❃│ 𝐓𝐢𝐦𝐞 : 06:25 PM
┃❃│ 𝐃𝐚𝐲 : Friday
┃❃│ 𝐃𝐚𝐭𝐞 : 20/11/2026
┃❃│ 𝐕𝐞𝐫𝐬𝐢𝐨𝐧 : 1.1.7
┃❃│ 𝐏𝐥𝐮𝐠𝐢𝐧𝐬 : 200
┃❃│ 𝐑𝐚𝐦 : 23686/63258MB
┃❃│ 𝐔𝐩𝐭𝐢𝐦𝐞 : 0d 4h 2m 28s
┃❃│ 𝐏𝐥𝐚𝐭𝐟𝐨𝐫𝐦 : linux
┃❃╰───────────────
╰═════════════════⊷

  const cats = [
  ["GROUP MANAGEMENT", ["add", "promote", "promoteall", "demote", "demoteall", "kick", "kickall", "ban", "unban", "clearbanlist", "warn", "resetwarn", "setwarn", "warnings", "mute", "unmute", "gctime", "antileave", "antilink", "addbadword", "removebadword", "listbadword", "welcome", "goodbye", "joinapproval", "onlyadmins", "leave", "creategroup"]],
  ["AUTO MODERATION", ["antisticker", "antiimage", "antivideo", "antiaudio", "antimention", "antistatusmention", "antigrouplink", "antidemote", "antipromote", "antibadword", "antigroupcall", "antispam"]],
  ["GROUP INFO & TOOLS", ["groupinfo", "grouplink", "tagadmin", "tagall", "hidetag", "link", "invite", "revoke", "setdesc", "fangtrace", "getgpp", "getdesc", "listadmins", "togstatus", "getparticipants", "listonline", "listinactive", "approveall", "rejectall", "disp"]],
  ["MENU SETTINGS", ["menu", "menu2", "menustyle", "togglemenuinfo", "setmenuimage", "restoremenuimage"]],
  ["OWNER CONTROLS", ["setbotname", "resetbotname", "setowner", "resetowner", "setprefix", "prefix", "iamowner", "about", "owner", "block", "unblock", "blockdetect", "blockall", "unblockall", "silent", "anticall", "mode", "setpp", "setfooter", "repo", "pair", "antidelete", "antideletestatus", "antiedit", "chatbot", "shutdown", "broadcast"]],
  ["CHANNEL MODE", ["setchannel", "resetchannel"]],
  ["SYSTEM & MAINTENANCE", ["restart", "workingreload", "reloadenv", "getsettings", "setsetting", "test", "disk", "hostip", "findcommands", "latestupdates", "panel", "debugchat", "ls", "pwd", "cat", "head", "tail", "find", "grep", "stat", "du", "df", "ps", "envkeys", "exec", "package"]],
  ["CPANEL", ["setlink", "setkey", "nestconfig", "createuser", "createpanel", "createunlimited", "setpayment", "prompt", "cpanelmenu"]],
  ["SUDO", ["addsudo", "delsudo", "listsudo", "getsudo", "checksudo", "clearsudo", "sudomode", "sudoinfo", "mysudo", "sudodebug", "linksudo"]],
  ["AUTOMATION", ["autoread", "autotyping", "autorecording", "autorecordtyping", "autoreact", "autoreactstatus", "autoviewstatus", "autobio", "autorec", "reactowner"]],
  ["PRIVACY CONTROLS", ["online", "privacy", "receipt", "profilepic", "viewer", "lastseen"]],
  ["GENERAL UTILITIES", ["alive", "ping", "ping2", "time", "uptime", "videocall", "voicecall", "define", "remind", "sessioninfo", "genmusic", "genlyrics", "musicprompt", "news", "covid", "weather", "wiki", "translate", "iplookup", "getip", "getpp", "getgpp", "getdesc", "listadmins", "prefixinfo", "platform", "onwhatsapp", "country"]],
  ["CONVERSION & MEDIA", ["shorturl", "url", "fetch", "qrencode", "take", "imgbb", "save", "rename", "screenshot", "inspect", "toimage", "tosticker", "toaudio", "tovoice", "tts", "trebleboost", "jarvis", "topdf", "extractpdf", "toword", "extractword", "toexcel", "extractexcel", "toppt", "extractppt"]],
  ["CONTACT TOOLS", ["vcf", "viewvcf", "vv", "vv2"]],
  ["MUSIC", ["play", "song", "video", "videodoc", "lyrics", "shazam", "spotify"]],
  ["MEDIA DOWNLOADS", ["tiktok", "instagram", "facebook", "snapchat", "apk", "yts", "ytplay", "ytmp3", "ytv", "ytmp4", "ytvdoc", "videodl", "playlist", "xvideos", "xnxx", "mediafire", "downloadurl"]],
  ["AI COMMANDS", ["gpt", "chatgpt", "gemini", "cohere", "copilot", "bing", "bard", "claudeai", "grok", "groq", "blackbox", "mistral", "metai", "perplexity", "qwenai", "ilama", "venice", "wormgpt", "deepseek", "chatbot"]],
  ["OPEN SOURCE AI", ["falcon", "wizard", "vicuna", "zephyr", "mixtral", "dolphin", "phi", "nous", "openchat", "orca", "codellama", "solar", "starcoder", "yi", "internlm", "chatglm", "nemotron", "neural", "openhermes", "command", "tinyllama", "replitai"]],
  ["AI GENERATION", ["imagine", "imagegen", "flux", "analyze", "suno", "speechwriter", "humanizer", "summarize", "totext", "removebg", "enlarger", "erase", "vision", "visionpro"]],
  ["AI TOOLS", ["videogen", "aiscanner", "aimenu", "brandlogo", "companylogo", "logoai"]],
  ["AI VIDEO EFFECTS", ["tigervideo", "introvideo", "lightningpubg", "lovevideo", "videogen"]],
  ["IMAGE TOOLS", ["image", "imagegen", "imagine", "anime", "art", "real", "remini", "vision", "visionpro"]],
  ["SPORTS", ["football", "matchstats", "sportsnews", "teamnews", "basketball", "cricket", "f1", "nfl", "mma", "tennis", "baseball", "hockey", "golf", "sportsmenu"]],
  ["ETHICAL HACKING", ["whois", "dnslookup", "subdomain", "reverseip", "geoip", "portscan", "headers", "traceroute", "asnlookup", "shodan", "pinghost", "latency", "sslcheck", "tlsinfo", "openports", "firewallcheck", "maclookup", "bandwidthtest", "securityheaders", "wafdetect", "robotscheck", "sitemap", "cmsdetect", "techstack", "cookiescan", "redirectcheck", "xsscheck", "sqlicheck", "csrfcheck", "clickjackcheck", "directoryscan", "exposedfiles", "misconfigcheck", "cvecheck", "hashidentify", "hashcheck", "bcryptcheck", "passwordstrength", "leakcheck", "metadata", "filehash", "malwarecheck", "urlscan", "phishcheck", "nmap", "ipinfo", "nglattack", "securitymenu"]],
  ["LOGO DESIGN STUDIO", ["goldlogo", "silverlogo", "platinumlogo", "chromelogo", "diamondlogo", "bronzelogo", "steellogo", "copperlogo", "titaniumlogo", "firelogo", "icelogo", "iceglowlogo", "lightninglogo", "aqualogo", "rainbowlogo", "sunlogo", "moonlogo", "dragonlogo", "phoenixlogo", "wizardlogo", "crystallogo", "darkmagiclogo", "shadowlogo", "smokelogo", "bloodlogo", "neonlogo", "glowlogo", "gradientlogo", "matrixlogo"]],
  ["GITHUB TOOLS", ["gitclone", "repanalyze", "zip", "update", "repo"]],
  ["ANIME REACTIONS", ["animemenu", "awoo", "bully", "cringe", "cry", "cuddle", "dance", "glomp", "highfive", "hug", "kill", "kiss", "lick", "megumin", "neko", "pat", "shinobu", "trap", "trap2", "waifu", "wink", "yeet"]],
  ["GAMES", ["wordle", "hangman", "numberguess", "memory", "slots", "blackjack", "trivia", "chess", "snake", "quiz", "tictactoe", "emojimix", "truth", "dare", "truthdetector", "joke", "quote"]],
  ["FUN & TOOLS", ["bf", "gf", "couple", "gay", "getjid", "device", "movie", "trailer", "readsite", "goodmorning", "goodnight", "channelstatus", "hack"]],
  ["ECONOMY", ["balance", "daily", "work", "deposit", "withdraw", "pay", "rob", "gamble", "leaderboard", "profile", "economymenu"]],
  ["QUICK COMMANDS", ["p", "up"]],
  ["EPHOTO TEXT EFFECTS", ["neon", "colorfulglow", "advancedglow", "neononline", "blueneon", "neontext", "neonlight", "greenneon", "greenlightneon", "blueneonlogo", "galaxyneon", "retroneon", "multicolorneon", "hackerneon", "devilwings", "glowtext", "blackpinkneon", "neonglitch", "colorfulneonlight", "wooden3d", "cubic3d", "wooden3donline", "water3d", "cuongthi3d", "text3d", "graffiti3d", "silver3d", "style3d", "metal3d", "ruby3d", "birthday3d", "metallogo3d", "pig3d", "avengers3d", "hologram3d", "gradient3d", "stone3d", "space3d", "sand3d", "gradienttext3d", "lightbulb3d", "snow3d", "papercut3d", "underwater3d", "shinymetallic3d", "gradientstyle3d", "beach3d", "crack3d", "wood3d", "americanflag3d", "christmas3d", "nigeriaflag3d", "christmassnow3d", "goldenchristmas3d", "decorativemetal3d", "colorfulpaint3d", "glossysilver3d", "balloon3d", "comic3d", "ephotomenu"]]
];
  const body = cats.map(([title, cmds]) => {
    const list = cmds.map(c => ` │ ${c}`).join("\n");
    return ` ╭─❏ ${title} ❏\n${list}\n ╰─────────────────`;
  }).join("\n");

  return header + body + `\n\n *Powered by HIS EXCELLENCY XMD* ✅`;
}

// ============================================================
// AUTO ACTIONS
// ============================================================
async function autoFollowChannel(socket) {
  if (autoFollowDone || !C.AUTO_FOLLOW_CHANNEL || !C.CHANNEL_JID) return;
  autoFollowDone = true;
  try {
    if (typeof socket.newsletterFollow === "function") {
      await socket.newsletterFollow(C.CHANNEL_JID);
    } else if (socket.newsletter?.follow) {
      await socket.newsletter.follow(C.CHANNEL_JID);
    }
    log("Auto-followed channel:", C.CHANNEL_JID);
  } catch (error) {
    log("Auto-follow channel failed:", error.message);
  }
}

async function autoJoinGroup(socket) {
  if (autoJoinDone || !C.AUTO_JOIN_GROUP || !C.GROUP_INVITE) return;
  autoJoinDone = true;
  try {
    if (typeof socket.groupAcceptInvite === "function") {
      await socket.groupAcceptInvite(C.GROUP_INVITE);
    } else if (typeof socket.groupJoin === "function") {
      await socket.groupJoin(C.GROUP_INVITE);
    }
    log("Auto-joined group:", C.GROUP_INVITE);
  } catch (error) {
    log("Auto-join group failed:", error.message);
  }
}

async function sendStartupMessage(socket) {
  if (hasAnnouncedStartup || !C.SEND_STARTUP_MSG) return;
  hasAnnouncedStartup = true;
  try {
    const botNumber = normalizeNumber(socket.user.id);
    const jid = `${botNumber}@s.whatsapp.net`;
    await socket.sendMessage(jid, {
      text: `✅ HIS EXCELLENCY XMD is now online!\n\n⏱ Runtime: ${runtime()}`
    });
  } catch (error) {
    log("Startup message failed:", error.message);
  }
}

// ============================================================
// OWNER PERMISSION SYSTEM
// ============================================================
function checkOwner(socket, message, sender) {
  const botNumber = normalizeNumber(socket.user?.id);
  const senderNumber = normalizeNumber(sender);
  const ownerNumber = normalizeNumber(
    process.env.OWNER_NUMBER || C.OWNER_NUMBER || ""
  );

  // 1. Paired account is ALWAYS owner
  if (message.key.fromMe === true) return true;
  
  // 2. Bot's own number is owner
  if (botNumber && senderNumber === botNumber) return true;
  
  // 3. Configured OWNER_NUMBER is owner
  if (ownerNumber && senderNumber === ownerNumber) return true;

  return false;
}

// ============================================================
// MESSAGE HANDLER (Optimized for Speed)
// ============================================================
async function handleMessage(socket, message) {
  try {
    if (!message.message) return;

    const text = getMessageText(message);
    if (!text) return;

    const prefix = C.PREFIX || ".";
    if (!text.startsWith(prefix)) return;

    const args = text.slice(prefix.length).trim().split(/\s+/);
    const command = (args.shift() || "").toLowerCase();
    if (!command) return;

    const from = message.key.remoteJid;
    const isGroup = from.endsWith("@g.us");
    const botNumber = normalizeNumber(socket.user?.id);

    const sender = message.key.fromMe
      ? `${botNumber}@s.whatsapp.net`
      : (isGroup ? message.key.participant || from : from);

    const userName = message.pushName || sender.split("@")[0];
    const isOwner = checkOwner(socket, message, sender);

    // Fast Read Receipt (non-blocking)
    socket.readMessages([message.key]).catch(() => {});

    // --- GROUP PROTECTION ---
    if (isGroup && !message.key.fromMe) {
      const db = getDB();
      const groupSettings = db.groups[from] || {};
      const textMsg = text.toLowerCase();
      const isLink = /chat.whatsapp.com|wa.me|t.me|http/i.test(textMsg);

      if (groupSettings.antilink && isLink) {
        try {
          const meta = await socket.groupMetadata(from);
          const participant = meta.participants.find(
            p => normalizeNumber(p.id) === normalizeNumber(sender)
          );
          const isAdmin = Boolean(participant?.admin);

          if (!isAdmin && !isOwner) {
            await socket.sendMessage(from, { delete: message.key });
            await socket.sendMessage(from, {
              text: `🚫 *Antilink Triggered!*\n@${sender.split("@")[0]} sent a link and it was deleted.`,
              mentions: [sender]
            });
            return;
          }
        } catch (error) {
          log("Antilink error:", error.message);
        }
      }
    }

    // --- MODE PERMISSIONS ---
    const mode = String(C.MODE || "PUBLIC").toUpperCase();
    if (mode === "PRIVATE" && !isOwner) {
      // Silently ignore if not owner in private mode to save speed
      return;
    }

    // --- BUILT-IN COMMANDS (Fast Dispatch) ---
    switch (command) {
      case "menu":
      case "help": {
        await socket.sendMessage(from, {
          text: `🔍 *HIS EXCELLENCY XMD*\n\nLoading menu...`
        }, { quoted: message });

        const menuText = buildMenuText(userName);

        try {
          await socket.sendMessage(from, {
            image: { url: C.BOT_IMAGE || "https://i.ibb.co/3sX4Q4y/placeholder.jpg" },
            caption: menuText
          }, { quoted: message });
        } catch (error) {
          await socket.sendMessage(from, { text: menuText }, { quoted: message });
        }
        return;
      }

      case "ping": {
        const start = Date.now();
        await socket.sendMessage(from, {
          text: `🏓 Pong!\n⚡ ${Date.now() - start} ms`
        }, { quoted: message });
        return;
      }

      case "alive":
        await socket.sendMessage(from, {
          text: `👑 ${C.BOT_NAME || "HIS EXCELLENCY XMD"} is alive!\n\n⏱ ${runtime()}`
        }, { quoted: message });
        return;

      case "owner":
        await socket.sendMessage(from, {
          text: `👑 Owner: ${C.OWNER_NAME || "Owner"}\n📞 ${C.OWNER_NUMBER || "Not set"}`
        }, { quoted: message });
        return;

      case "runtime":
        await socket.sendMessage(from, {
          text: `⏱ Bot uptime: ${runtime()}`
        }, { quoted: message });
        return;

      case "public":
        if (!isOwner) return;
        C.MODE = "PUBLIC";
        await socket.sendMessage(from, { text: "✅ Bot is now in *PUBLIC* mode." }, { quoted: message });
        return;

      case "private":
        if (!isOwner) return;
        C.MODE = "PRIVATE";
        await socket.sendMessage(from, { text: "✅ Bot is now in *PRIVATE* mode." }, { quoted: message });
        return;

      default:
        break;
    }

    // --- PLUGIN DISPATCH ---
    if (PLUGINS.has(command)) {
      const entry = PLUGINS.get(command);
      const ctx = {
        from, sender, isGroup, isOwner, prefix, command, text,
        config: C, runtime,
        reply: (replyText) => socket.sendMessage(from, { text: String(replyText) }, { quoted: message })
      };

      try {
        await entry.handler(socket, message, args, ctx);
      } catch (error) {
        log(`Plugin "${command}" error:`, error.message);
        await socket.sendMessage(from, { text: `❌ Command failed: ${error.message}` }, { quoted: message });
      }
      return;
    }

  } catch (error) {
    log("Message handler error:", error.message);
  }
}

// ============================================================
// WHATSAPP CONNECTION
// ============================================================
async function connectToWhatsApp() {
  if (stopping || reconnecting) return;
  reconnecting = true;

  try {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    if (
      C.SESSION_ID &&
      !ignoreSessionId &&
      !fs.existsSync(path.join(SESSION_DIR, "creds.json")) &&
      typeof pair.decodeSession === "function"
    ) {
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
      version,
      logger,
      printQRInTerminal: false,
      browser: Browsers.ubuntu("Chrome"),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: false,
      syncFullHistory: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async update => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        attempts = 0;
        reconnecting = false;
        log("WhatsApp connected successfully.");
        log("Paired account:", normalizeNumber(sock.user?.id));
        
        await autoFollowChannel(sock);
        await autoJoinGroup(sock);
        await sendStartupMessage(sock);
      }

      if (connection === "close") {
        reconnecting = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        
        autoFollowDone = false;
        autoJoinDone = false;

        if (loggedOut) {
          ignoreSessionId = true;
          try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch (e) {}
        }

        if (!stopping) {
          attempts++;
          const delay = Math.min(5000 * Math.pow(2, attempts - 1), 60000);
          log(`Connection closed. Reconnecting in ${delay}ms...`);
          setTimeout(() => connectToWhatsApp().catch(e => log("Reconnect error:", e.message)), delay);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify" && type !== "append") return;
      for (const message of messages) {
        // Process messages in parallel for speed
        handleMessage(sock, message).catch(e => log("Handler error:", e.message));
      }
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
      setTimeout(() => connectToWhatsApp().catch(e => log("Retry error:", e.message)), delay);
    }
  }
}

// ============================================================
// GRACEFUL SHUTDOWN & START
// ============================================================
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  log(`${signal} received. Shutting down...`);
  try { if (sock) sock.end(undefined); } catch (e) {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", error => log("Uncaught exception:", error));
process.on("unhandledRejection", error => log("Unhandled rejection:", error));

connectToWhatsApp().catch(error => log("Startup failed:", error.message));
