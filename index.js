"use strict";

const viewonce = require("./lib/viewonce");
const { registerEventHandlers } = require("./lib/event-handlers");
const fs = require("fs");
const http = require("http");
const path = require("path");
const readline = require("readline");
const pino = require("pino");
const os = require("os");

const baileys = require("@whiskeysockets/baileys");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  Browsers
} = baileys;

const fetchLatestVersion =
  baileys.fetchLatestBaileysVersion ||
  baileys.fetchLatestWaWebVersion;

const C = require("./config");
const pair = require("./pair");
const { loadPlugins } = require("./plugins/loader");
const { getDB, saveDB, getMode, setMode, initDatabase, flushDB } = require("./lib/db");
const { usePostgresAuthState, closeStorage } = require("./lib/storage");

const logger = pino({ level: "silent" });

const SESSION_DIR = path.join(__dirname, "session");
const PORT = Number(process.env.PORT || C.PORT || 3000);

let sock = null;
let reconnecting = false;
let reconnectTimer = null;
let attempts = 0;
let stopping = false;
let ignoreSessionId = false;
let autoFollowDone = false;
let autoJoinDone = false;
let hasAnnouncedStartup = false;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function log(...args) {
  console.log("[HIS EXCELLENCY XMD]", ...args);
}

fs.mkdirSync(SESSION_DIR, { recursive: true });

// ============================================================
// UTILITIES
// ============================================================

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
      output: process.stdout
    });

    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function extractInviteCode(value) {
  const input = String(value || "").trim();
  const match = input.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : input;
}

function getPlugins() {
  try {
    const loaded = loadPlugins(log);

    if (loaded instanceof Map) return loaded;

    if (loaded && typeof loaded === "object") {
      return new Map(Object.entries(loaded));
    }

    return new Map();
  } catch (error) {
    log("Plugin loading error:", error.message);
    return new Map();
  }
}

const PLUGINS = getPlugins();
global.__BOT_PLUGINS = PLUGINS;
log(`Loaded ${PLUGINS.size} plugins.`);

// ============================================================
// WEB SERVER / RENDER HEALTH CHECK / PAIRING ROUTE
// ============================================================

const server = http.createServer(async (req, res) => {
  const reqPath = (req.url || "/").split("?")[0];

  if (reqPath === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("OK");
  }

  if (pair && typeof pair.handle === "function") {
    try {
      const handled = await pair.handle(req, res, {
        getSock: () => sock,
        normalizeNumber,
        sessionDir: SESSION_DIR,
        config: C,
        log
      });

      if (handled !== false || res.writableEnded) {
        return;
      }
    } catch (error) {
      log("Pairing route error:", error.message);

      if (!res.headersSent && !res.writableEnded) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error.message || "Pairing service error." }));
      }
      return;
    }
  }

  if (reqPath === "/" && !res.writableEnded) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("HIS EXCELLENCY XMD is running.");
  }

  if (!res.writableEnded) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Page not found.");
  }
});

server.on("error", error => {
  log("HTTP server error:", error.message);
});

server.listen(PORT, "0.0.0.0", () => {
  log(`Web server running on port ${PORT}`);
});

// ============================================================
// MESSAGE TEXT EXTRACTION
// ============================================================

function getMessageText(message) {
  if (!message || !message.message) return "";

  let msg = message.message;

  for (let i = 0; i < 8; i++) {
    const inner =
      msg.ephemeralMessage?.message ||
      msg.viewOnceMessage?.message ||
      msg.viewOnceMessageV2?.message ||
      msg.viewOnceMessageV2Extension?.message ||
      msg.documentWithCaptionMessage?.message;

    if (!inner) break;
    msg = inner;
  }

  const interactive = msg.interactiveResponseMessage;
  let interactiveText = "";

  if (interactive?.nativeFlowResponseMessage?.paramsJson) {
    try {
      const params = JSON.parse(
        interactive.nativeFlowResponseMessage.paramsJson
      );

      interactiveText =
        params.id ||
        params.selected_id ||
        params.row_id ||
        params.button_id ||
        params.display_text ||
        "";
    } catch {
      // Invalid interactive JSON should not stop message handling.
    }
  }

  const text =
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.templateButtonReplyMessage?.selectedId ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    interactiveText ||
    "";

  return String(text).trim();
}

// ============================================================
// MENU DESIGN
// ============================================================

function getMenuConfig() {
  const db = getDB();
  db.bot ||= {};
  if (!db.bot.menuStyle) db.bot.menuStyle = 1;
  if (typeof db.bot.menuInfo !== "boolean") db.bot.menuInfo = true;
  return {
    style: Number(db.bot.menuStyle) || 1,
    showInfo: db.bot.menuInfo,
    customUrl: db.bot.menuImage || "",
    image: db.bot.menuImage || C.BOT_IMAGE || "https://i.ibb.co/3sX4Q4y/placeholder.jpg"
  };
}

function buildMenuText(userName, opts = {}) {
  const p = C.PREFIX || ".";
  const timezone = C.TIMEZONE || "Africa/Nairobi";
  const now = new Date();
  const cfg = getMenuConfig();
  const style = opts.style || cfg.style;

  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone
  });

  const day = now.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: timezone
  });

  const date = now.toLocaleDateString("en-GB", {
    timeZone: timezone
  });

  const totalMem = os.totalmem() / 1024 / 1024;
  const freeMem = os.freemem() / 1024 / 1024;
  const usedMem = totalMem - freeMem;
  const ramText = `${Math.round(usedMem)}/${Math.round(totalMem)}MB`;

  let header = "";
  if (cfg.showInfo) {
    if (style === 2 || opts.compact) {
      header = `⚡ *${C.BOT_NAME || "HIS EXCELLENCY XMD"}* (${getMode()}) | Prefix: ${p} | ${time} ${date} | RAM: ${ramText} | Up: ${runtime()}\n`;
    } else if (style === 3) {
      header = `
╔══════════════════════════════╗
║ ⚡ ${C.BOT_NAME || "HIS EXCELLENCY XMD"} // SYS-MENU ║
╠══════════════════════════════╣
║ Prefix   : ${p}
║ User     : ${userName || "User"}
║ Mode     : ${getMode()}
║ Time     : ${time} (${day})
║ Date     : ${date}
║ Version  : ${C.VERSION || "1.1.7"}
║ Plugins  : ${PLUGINS.size}
║ RAM      : ${ramText}
║ Uptime   : ${runtime()}
╚══════════════════════════════╝
`;
    } else {
      header = `
╭═══ 🔥𝐇𝐈𝐒 𝐄𝐗𝐂𝐄𝐋𝐋𝐄𝐍𝐂𝐘 𝐗𝐌𝐃 𝟎𝟎𝟏🔥 ═══⊷
┃❃╭──────────────
┃❃│ 𝐏𝐫𝐞𝐟𝐢𝐱 : ${p}
┃❃│ 𝐔𝐬𝐞𝐫 : ${userName || "User"}
┃❃│ 𝐌𝐨𝐝𝐞 : ${getMode()}
┃❃│ 𝐓𝐢𝐦𝐞 : ${time}
┃❃│ 𝐃𝐚𝐲 : ${day}
┃❃│ 𝐃𝐚𝐭𝐞 : ${date}
┃❃│ 𝐕𝐞𝐫𝐬𝐢𝐨𝐧 : ${C.VERSION || "1.1.7"}
┃❃│ 𝐏𝐥𝐮𝐠𝐢𝐧𝐬 : ${PLUGINS.size}
┃❃│ 𝐑𝐚𝐦 : ${ramText}
┃❃│ 𝐔𝐩𝐭𝐢𝐦𝐞 : ${runtime()}
┃❃│ 𝐏𝐥𝐚𝐭𝐟𝐨𝐫𝐦 : ${process.platform}
┃❃╰───────────────
╰═════════════════⊷
`;
    }
  } else {
    header = `\n🔥 *${C.BOT_NAME || "HIS EXCELLENCY XMD"}* — Prefix: ${p}\n`;
  }

  const cats = [
    ["GROUP MANAGEMENT", ["add", "promote", "promoteall", "demote", "demoteall", "kick", "kickall", "ban", "unban", "clearbanlist", "warn", "resetwarn", "setwarn", "warnings", "mute", "unmute", "gctime", "antileave", "antilink", "addbadword", "removebadword", "listbadword", "welcome", "goodbye", "joinapproval", "onlyadmins", "leave", "creategroup"]],
    ["AUTO MODERATION", ["antisticker", "antiimage", "antivideo", "antiaudio", "antimention", "antistatusmention", "antigrouplink", "antidemote", "antipromote", "antibadword", "antigroupcall", "antispam"]],
    ["GROUP INFO & TOOLS", ["groupinfo", "grouplink", "tagadmin", "tagall", "hidetag", "link", "invite", "revoke", "setdesc", "fangtrace", "getgpp", "getdesc", "listadmins", "togstatus", "getparticipants", "listonline", "listinactive", "approveall", "rejectall", "disp"]],
    ["MENU SETTINGS", ["menu", "menu2", "menustyle", "togglemenuinfo", "setmenuimage", "restoremenuimage"]],
    ["OWNER CONTROLS", ["setbotname", "resetbotname", "setowner", "resetowner", "setprefix", "prefix", "iamowner", "about", "owner", "block", "unblock", "blockdetect", "blockall", "unblockall", "silent", "anticall", "mode", "public", "private", "setpp", "setfooter", "repo", "pair", "antidelete", "antideletestatus", "antiedit", "chatbot", "shutdown", "broadcast"]],
    ["CHANNEL MODE", ["setchannel", "resetchannel"]],
    ["SYSTEM & MAINTENANCE", ["restart", "workingreload", "reloadenv", "getsettings", "setsetting", "test", "disk", "hostip", "findcommands", "latestupdates", "panel", "debugchat", "ls", "pwd", "cat", "head", "tail", "find", "grep", "stat", "du", "df", "ps", "envkeys", "exec", "package"]],
    ["GITHUB TOOLS", ["gitclone", "repanalyze", "zip", "update", "repo"]],
    ["CPANEL", ["setlink", "setkey", "nestconfig", "createuser", "createpanel", "createunlimited", "setpayment", "prompt", "cpanelmenu"]],
    ["SUDO", ["addsudo", "delsudo", "listsudo", "getsudo", "checksudo", "clearsudo", "sudomode", "sudoinfo", "mysudo", "sudodebug", "linksudo"]],
    ["AUTOMATION", ["autoread", "autotyping", "autorecording", "autorecordtyping", "autoreact", "autoreactstatus", "autoreactchannels", "autoviewstatus", "autobio", "autorec", "reactowner"]],
    ["PRIVACY CONTROLS", ["online", "privacy", "receipt", "profilepic", "viewer", "lastseen"]],
    ["GENERAL UTILITIES", ["alive", "ping", "ping2", "time", "uptime", "runtime", "videocall", "voicecall", "define", "remind", "sessioninfo", "genmusic", "genlyrics", "musicprompt", "news", "covid", "weather", "wiki", "translate", "iplookup", "getip", "getpp", "getgpp", "getdesc", "listadmins", "prefixinfo", "platform", "onwhatsapp", "country"]],
    ["CONVERSION & MEDIA", ["shorturl", "url", "fetch", "qrencode", "take", "imgbb", "save", "rename", "screenshot", "inspect", "toimage", "tosticker", "toaudio", "tovoice", "tts", "trebleboost", "jarvis", "topdf", "extractpdf", "toword", "extractword", "toexcel", "extractexcel", "toppt", "extractppt"]],
    ["CONTACT TOOLS", ["vcf", "viewvcf", "vv", "save", "vv2"]],
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

  const body = cats.map(([title, commands]) => {
    const list = commands.map(command => `┃  ${p}${command}`).join("\n");
    return `╭─❏ ${title} ❏\n${list}\n╰─────────────────`;
  }).join("\n\n");

  return `${header}\n${body}\n\n*Powered by HIS EXCELLENCY XMD* ✅`;
}

// ============================================================
// AUTO FOLLOW CHANNEL
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
      throw new Error("Newsletter follow method is unavailable.");
    }

    log("Auto-followed channel:", C.CHANNEL_JID);
  } catch (error) {
    autoFollowDone = false;
    log("Auto-follow failed:", error.message);
  }
}

// ============================================================
// AUTO JOIN GROUP
// ============================================================

async function autoJoinGroup(socket) {
  if (autoJoinDone || !C.AUTO_JOIN_GROUP || !C.GROUP_INVITE) return;

  autoJoinDone = true;

  try {
    const inviteCode = extractInviteCode(C.GROUP_INVITE);

    if (!inviteCode) throw new Error("Invalid group invite code.");

    if (typeof socket.groupAcceptInvite !== "function") {
      throw new Error("Group invite acceptance is unavailable.");
    }

    await socket.groupAcceptInvite(inviteCode);
    log("Auto-joined group successfully.");
  } catch (error) {
    autoJoinDone = false;
    log("Auto-join failed:", error.message);
  }
}

// ============================================================
// STARTUP MESSAGE
// ============================================================

async function sendStartupMessage(socket) {
  if (hasAnnouncedStartup || !C.SEND_STARTUP_MSG) return;

  hasAnnouncedStartup = true;

  try {
    const botNumber = normalizeNumber(socket.user?.id);
    if (!botNumber) return;

    await socket.sendMessage(`${botNumber}@s.whatsapp.net`, {
      text:
        `✅ ${C.BOT_NAME || "HIS EXCELLENCY XMD"} is now online!\n\n` +
        `⏱ Runtime: ${runtime()}`
    });
  } catch (error) {
    log("Startup message failed:", error.message);
  }
}

// ============================================================
// OWNER PERMISSIONS
// ============================================================

function checkOwner(socket, message, sender) {
  const botNumber = normalizeNumber(socket.user?.id);
  const senderNumber = normalizeNumber(sender);
  const db = typeof getDB === "function" ? getDB() : {};
  const ownerNumber = normalizeNumber(
    db?.bot?.ownerNumber || process.env.OWNER_NUMBER || C.OWNER_NUMBER || ""
  );

  if (message.key?.fromMe === true) return true;
  if (botNumber && senderNumber === botNumber) return true;
  if (ownerNumber && senderNumber === ownerNumber) return true;

  if (db?.bot?.sudomode !== false && Array.isArray(db?.bot?.sudoUsers) && senderNumber) {
    const sudoSet = new Set(db.bot.sudoUsers.map(x => normalizeNumber(x)));
    if (sudoSet.has(senderNumber)) return true;
    const mapped = db?.bot?.sudoLinks?.[senderNumber];
    if (mapped && sudoSet.has(normalizeNumber(mapped))) return true;
  }

  return false;
}

// ============================================================
// MESSAGE HANDLER
// ============================================================

async function handleMessage(socket, message) {
  try {
    if (!message?.message || !message.key?.remoteJid) return;

    const from = message.key.remoteJid;
    global.__LAST_MSG ||= new Map();
    global.__LAST_MSG.set(from, { id: message.key.id, fromMe: !!message.key.fromMe, participant: message.key.participant || null, pushName: message.pushName || null, keys: Object.keys(message.message || {}), ts: Date.now() });
    if (from === "status@broadcast") return;

    const text = getMessageText(message);
    if (!text) return;

    const prefix = String(C.PREFIX || ".");
    if (!text.startsWith(prefix)) return;

    const parts = text.slice(prefix.length).trim().split(/\s+/);
    const command = (parts.shift() || "").toLowerCase();
    const args = parts;

    if (!command) return;

    const isGroup = from.endsWith("@g.us");
    const botNumber = normalizeNumber(socket.user?.id);

    const sender = message.key.fromMe
      ? `${botNumber}@s.whatsapp.net`
      : (message.key.participant || from);

    const userName = message.pushName || sender.split("@")[0];
    const isOwner = checkOwner(socket, message, sender);
    log(`CMD "${command}" | owner: ${isOwner} | mode: ${getMode()} | fromMe: ${message.key.fromMe} | sender: ${sender}`);

    if (typeof socket.readMessages === "function") {
      socket.readMessages([message.key]).catch(() => {});
    }

    // --------------------------------------------------------
    // GROUP ANTILINK
    // --------------------------------------------------------

    if (isGroup && !message.key.fromMe) {
      const db = getDB();
      const settings = db.groups[from] || {};

      const isLink =
        /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com\/[A-Za-z0-9_-]+|wa\.me\/[0-9]+|t\.me\/[A-Za-z0-9_]+)/i.test(text);

      if (settings.antilink && isLink) {
        try {
          const metadata = await socket.groupMetadata(from);

          const participant = metadata.participants.find(item => {
            const participantId = item.id || item.jid || item.lid;
            return normalizeNumber(participantId) === normalizeNumber(sender);
          });

          const isAdmin = Boolean(
            participant?.admin ||
            participant?.isAdmin ||
            participant?.admin === "admin" ||
            participant?.admin === "superadmin"
          );

          if (!isAdmin && !isOwner) {
            await socket.sendMessage(from, { delete: message.key });

            await socket.sendMessage(from, {
              text:
                `🚫 *Antilink Triggered!*\n\n` +
                `@${normalizeNumber(sender)} sent a link and it was deleted.`,
              mentions: [sender]
            });

            return;
          }
        } catch (error) {
          log("Antilink error:", error.message);
        }
      }
    }

    // --------------------------------------------------------
    // MODE PERMISSIONS
    // --------------------------------------------------------

    const currentMode = getMode();
    
    // If in PRIVATE mode, block everyone except the Owner and Group Admins
    if (currentMode === "PRIVATE" && !isOwner) {
      // Allow if the user is a group admin
      if (isGroup) {
        try {
          const meta = await socket.groupMetadata(from);
          const participant = meta.participants.find(
            p => normalizeNumber(p.id) === normalizeNumber(sender)
          );
          const isAdmin = participant && (participant.admin === "admin" || participant.admin === "superadmin");
          
          if (!isAdmin) return; // Block normal members
        } catch (e) {
          return; // Block if we can't verify admin
        }
      } else {
        return; // Block if it's a DM and not the owner
      }
    }

    // --------------------------------------------------------
    // BUILT-IN COMMANDS
    // --------------------------------------------------------

async function sendBotMenu(socket, from, message, userName, opts = {}) {
  const menuText = buildMenuText(userName, opts);
  const cfg = getMenuConfig();
  await socket.sendMessage(from, {
    text: `🔥 ${C.BOT_NAME || "HIS EXCELLENCY XMD"}\n\nLoading menu...`
  }, { quoted: message });

  const localBanner = path.join(__dirname, "data", "menu-banner.jpg");
  let imagePayload = null;
  if (!cfg.customUrl && fs.existsSync(localBanner)) {
    imagePayload = { image: fs.readFileSync(localBanner), caption: menuText };
  } else {
    imagePayload = { image: { url: cfg.image }, caption: menuText };
  }

  try {
    await socket.sendMessage(from, imagePayload, { quoted: message });
  } catch (error) {
    log("Menu image failed; sending text menu:", error.message);
    await socket.sendMessage(from, { text: menuText }, { quoted: message });
  }
}

    switch (command) {
      case "menu":
      case "help": {
        await sendBotMenu(socket, from, message, userName);
        return;
      }

      case "menu2": {
        await sendBotMenu(socket, from, message, userName, { style: 2, compact: true });
        return;
      }

      case "menustyle": {
        const db = getDB();
        db.bot ||= {};
        const arg = String(args[0] || "").trim().toLowerCase();
        let nextStyle;
        if (["1", "2", "3"].includes(arg)) {
          nextStyle = Number(arg);
        } else if (arg === "compact") {
          nextStyle = 2;
        } else if (arg === "cyber") {
          nextStyle = 3;
        } else if (arg === "classic" || arg === "box") {
          nextStyle = 1;
        } else {
          nextStyle = ((Number(db.bot.menuStyle) || 1) % 3) + 1;
        }
        db.bot.menuStyle = nextStyle;
        saveDB(db);
        await socket.sendMessage(from, {
          text: `✅ Menu style set to *${nextStyle}* (1: Classic, 2: Compact, 3: Cyber).`
        }, { quoted: message });
        return;
      }

      case "togglemenuinfo": {
        const db = getDB();
        db.bot ||= {};
        const arg = String(args[0] || "").trim().toLowerCase();
        const current = typeof db.bot.menuInfo === "boolean" ? db.bot.menuInfo : true;
        const nextVal = arg === "on" ? true : arg === "off" ? false : !current;
        db.bot.menuInfo = nextVal;
        saveDB(db);
        await socket.sendMessage(from, {
          text: `${nextVal ? "✅ Enabled" : "❌ Disabled"} *Menu Info Header*.`
        }, { quoted: message });
        return;
      }

      case "setmenuimage": {
        const db = getDB();
        db.bot ||= {};
        const urlArg = String(args[0] || "").trim();
        const quotedImg = message.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
        const directImg = message.message?.imageMessage;

        if (urlArg && /^https?:\/\//i.test(urlArg)) {
          db.bot.menuImage = urlArg;
          saveDB(db);
          const localBanner = path.join(__dirname, "data", "menu-banner.jpg");
          if (fs.existsSync(localBanner)) {
            try { fs.unlinkSync(localBanner); } catch {}
          }
          await socket.sendMessage(from, {
            text: `✅ Menu image updated to URL:
${urlArg}`
          }, { quoted: message });
          return;
        }

        if ((directImg || quotedImg) && typeof downloadMediaMessage === "function") {
          const targetMsg = directImg
            ? message
            : {
                key: {
                  remoteJid: from,
                  id: message.message.extendedTextMessage.contextInfo.stanzaId,
                  participant: message.message.extendedTextMessage.contextInfo.participant
                },
                message: { imageMessage: quotedImg }
              };
          const buf = await downloadMediaMessage(targetMsg, "buffer", {}, { logger: log, reuploadRequest: socket.updateMediaMessage });
          const dataDir = path.join(__dirname, "data");
          if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(path.join(dataDir, "menu-banner.jpg"), buf);
          delete db.bot.menuImage;
          saveDB(db);
          await socket.sendMessage(from, {
            text: "✅ Menu image saved from image message!"
          }, { quoted: message });
          return;
        }

        await socket.sendMessage(from, {
          text: `Usage: ${C.PREFIX || "."}setmenuimage <https://image-url> (or reply to / send an image with the command)`
        }, { quoted: message });
        return;
      }

      case "restoremenuimage": {
        const db = getDB();
        db.bot ||= {};
        delete db.bot.menuImage;
        saveDB(db);
        const localBanner = path.join(__dirname, "data", "menu-banner.jpg");
        if (fs.existsSync(localBanner)) {
          try { fs.unlinkSync(localBanner); } catch {}
        }
        await socket.sendMessage(from, {
          text: "✅ Menu image restored to default."
        }, { quoted: message });
        return;
      }

      case "ping": {
        const started = Date.now();

        await socket.sendMessage(from, {
          text: `🏓 Pong!\n⚡ ${Date.now() - started} ms`
        }, { quoted: message });

        return;
      }

      case "alive": {
        await socket.sendMessage(from, {
          text:
            `👑 ${C.BOT_NAME || "HIS EXCELLENCY XMD"} is alive!\n\n` +
            `⏱ ${runtime()}`
        }, { quoted: message });

        return;
      }

      case "owner": {
        await socket.sendMessage(from, {
          text:
            `👑 Owner: ${C.OWNER_NAME || "Owner"}\n` +
            `📞 ${C.OWNER_NUMBER || "Not set"}`
        }, { quoted: message });

        return;
      }

      case "runtime":
      case "uptime": {
        await socket.sendMessage(from, {
          text: `⏱ Bot uptime: ${runtime()}`
        }, { quoted: message });

        return;
      }

      case "public": {
        if (!isOwner) return;

        if (!setMode("PUBLIC")) {
          await socket.sendMessage(from, {
            text: "❌ Could not save the bot mode. Check database.json permissions."
          }, { quoted: message });
          return;
        }

        await socket.sendMessage(from, {
          text: "✅ Bot is now in *PUBLIC* mode."
        }, { quoted: message });

        return;
      }

      case "private": {
        if (!isOwner) return;

        if (!setMode("PRIVATE")) {
          await socket.sendMessage(from, {
            text: "❌ Could not save the bot mode. Check database.json permissions."
          }, { quoted: message });
          return;
        }

        await socket.sendMessage(from, {
          text: "🔒 Bot is now in *PRIVATE* mode."
        }, { quoted: message });

        return;
      }

      default:
        break;
    }

    // --------------------------------------------------------
    // PLUGIN DISPATCH
    // --------------------------------------------------------

    let targetCommand = command;
    let isToggleAction = false;
    let toggleState = null;

    // INTERCEPT "command on" or "command off"
    if (command.endsWith("off")) {
      targetCommand = command.slice(0, -3); // removes "off"
      isToggleAction = true;
      toggleState = "off";
    } else if (command.endsWith("on")) {
      targetCommand = command.slice(0, -2); // removes "on"
      isToggleAction = true;
      toggleState = "on";
    }

    // If it's a toggle action, we force the arguments to be ["on"] or ["off"]
    if (isToggleAction) {
      args.unshift(toggleState); 
    }

    // Now we look for the base command (e.g., "autostatusreact")
    if (PLUGINS.has(targetCommand)) {
      const entry = PLUGINS.get(targetCommand);

      const handler =
        typeof entry === "function"
          ? entry
          : entry?.handler;

      if (typeof handler !== "function") {
        log(`Invalid plugin handler: ${targetCommand}`);
        return;
      }

      const ctx = {
        from,
        sender,
        isGroup,
        isOwner,
        prefix,
        command: targetCommand, // Pass the base command to the plugin
        text,
        config: C,
        runtime,
        db: getDB,
        saveDB,
        args: args,
        reply: replyText =>
          socket.sendMessage(from, {
            text: String(replyText)
          }, { quoted: message })
      };

      try {
        await handler(socket, message, args, ctx);
      } catch (error) {
        log(`Plugin "${targetCommand}" error:`, error.stack || error.message);
        await socket.sendMessage(from, {
          text: `❌ Command failed: ${error.message}`
        }, { quoted: message }).catch(() => {});
      }
      return;
    }

  } catch (error) {
    log("Message handler error:", error.stack || error.message);
  }
}

// ============================================================
// RECONNECTION CONTROL
// ============================================================

function scheduleReconnect(reason = "Connection closed") {
  if (stopping || reconnectTimer) return;

  attempts++;

  const delay = Math.min(
    5000 * Math.pow(2, attempts - 1),
    60000
  );

  log(`${reason}. Reconnecting in ${Math.round(delay / 1000)} seconds...`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToWhatsApp().catch(error => {
      log("Reconnect attempt failed:", error.message);
    });
  }, delay);
}

// ============================================================
// WHATSAPP CONNECTION
// ============================================================

async function connectToWhatsApp() {
  if (stopping || reconnecting) return;

  reconnecting = true;

  try {
    fs.mkdirSync(SESSION_DIR, { recursive: true });

    const credentialsPath = path.join(SESSION_DIR, "creds.json");

    if (
      C.SESSION_ID &&
      !C.DATABASE_URL &&
      !ignoreSessionId &&
      !fs.existsSync(credentialsPath) &&
      typeof pair.decodeSession === "function"
    ) {
      try {
        const decoded = await pair.decodeSession(C.SESSION_ID);

        if (decoded) {
          fs.writeFileSync(
            credentialsPath,
            Buffer.isBuffer(decoded) ? decoded : String(decoded),
            "utf8"
          );

          log("Session restored from SESSION_ID.");
        }
      } catch (error) {
        log("Session restoration failed:", error.message);
      }
    }

    let authState;
    if (C.DATABASE_URL) {
      // Existing DB credentials always win; SESSION_ID seeds a new database only.
      const initialCreds = C.SESSION_ID && !ignoreSessionId
        ? JSON.parse(pair.decodeSession(C.SESSION_ID))
        : null;
      authState = await usePostgresAuthState(initialCreds);
      log("Using PostgreSQL-backed WhatsApp authentication.");
    } else {
      authState = await useMultiFileAuthState(SESSION_DIR);
      log("WARNING: DATABASE_URL is missing; WhatsApp session is stored on ephemeral dyno disk and may be lost on restart.");
    }
    const { state, saveCreds } = authState;

    let version;

    if (typeof fetchLatestVersion === "function") {
      try {
        const result = await fetchLatestVersion();
        version = result?.version;

        if (version) {
          log("WhatsApp Web version:", version.join("."));
        }
      } catch (error) {
        log("Version lookup failed; using Baileys defaults:", error.message);
      }
    }

    const socketOptions = {
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
    };

    if (version) socketOptions.version = version;

    const currentSocket = makeWASocket(socketOptions);
    sock = currentSocket;
    global.__BOT_SOCK = () => sock;

    (async () => {
      for (const { file, fn } of PLUGINS.__initHooks || []) {
        try {
          await fn(currentSocket);
          log(`[init] ${file} ready`);
        } catch (err) {
          log(`[init] ${file} failed:`, err.message);
        }
      }
    })();

    currentSocket.ev.on("creds.update", saveCreds);

    registerEventHandlers(currentSocket, log);
    viewonce.attach(currentSocket, log, C);
    // --------------------------------------------------------
    // CONNECTION EVENTS
    // --------------------------------------------------------

    currentSocket.ev.on("connection.update", async update => {
      const { connection, lastDisconnect } = update;

      if (connection === "connecting") {
        log("Connecting to WhatsApp...");
      }

      if (connection === "open") {
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }

        attempts = 0;
        reconnecting = false;

        log("WhatsApp connected successfully.");
        log("Paired account:", normalizeNumber(currentSocket.user?.id));

        await autoFollowChannel(currentSocket);
        await autoJoinGroup(currentSocket);
        await sendStartupMessage(currentSocket);
      }

      if (connection === "close") {
        if (sock !== currentSocket) return;

        reconnecting = false;

        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        const loggedOut =
          statusCode === DisconnectReason.loggedOut;

        autoFollowDone = false;
        autoJoinDone = false;

        log("WhatsApp connection closed. Status:", statusCode || "unknown");

        if (loggedOut) {
          log("WhatsApp session logged out. Removing local session.");

          ignoreSessionId = true;

          try {
            if (authState?.clearAuthState) await authState.clearAuthState();
            fs.rmSync(SESSION_DIR, { recursive: true, force: true });
            fs.mkdirSync(SESSION_DIR, { recursive: true });
          } catch (error) {
            log("Session cleanup failed:", error.message);
          }

          log("A new pairing is required. Pair via the web site or set PAIR_NUMBER and restart.");
          return;
        }

        scheduleReconnect("WhatsApp connection closed");
      }
    });

    // --------------------------------------------------------
    // INCOMING MESSAGES & AUTOMATION
    // --------------------------------------------------------
    const msgCache = new Map(); // For Anti-delete

    currentSocket.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      const db = getDB();
      const bot = db.bot || {};

      for (const msg of messages) {
        if (!msg.key?.remoteJid) continue;

        if (msg.message?.extendedTextMessage?.contextInfo) {
  const context = msg.message.extendedTextMessage.contextInfo;

  log("REPLY DEBUG:", JSON.stringify({
    remoteJid: msg.key.remoteJid,
    participant: msg.key.participant,
    quotedMessageId: context.stanzaId,
    quotedParticipant: context.participant,
    quotedKeys: Object.keys(context.quotedMessage || {}),
    messageKeys: Object.keys(msg.message || {})
  }, null, 2));
}

        // --- ANTI-DELETE CACHE ---
        if (msg.key.id) msgCache.set(msg.key.id, msg);

        // --- STATUS VIEW + RANDOM STATUS REACTIONS ---
        if (msg.key.remoteJid === "status@broadcast") {
          const viewStatus = bot.autoviewstatus ?? true;
          // These two reactions are intentionally always enabled as requested.
          if (viewStatus) await currentSocket.readMessages([msg.key]).catch(() => {});

          if (msg.key.participant && !msg.key.fromMe) {
            const emojis = ["❤️", "🔥", "👍", "😂", "😮", "🙏", "💯", "✨", "🎉", "👏", "🤩", "🥰", "😎", "⚡", "🌹", "💖", "🫶", "🙌", "😍", "💐"];
            const pool = global.__LAST_STATUS_EMOJI
              ? emojis.filter((e) => e !== global.__LAST_STATUS_EMOJI)
              : emojis;
            const emoji = pool[Math.floor(Math.random() * pool.length)];
            global.__LAST_STATUS_EMOJI = emoji;

            await currentSocket.sendMessage(
              "status@broadcast",
              { react: { text: emoji, key: msg.key } },
              { statusJidList: [msg.key.participant] }
            ).catch(err => log("[status-react] failed:", err.message));
          }
          continue;
        }

        // --- AUTOMATIC CHANNEL REACTIONS ---
        if (String(msg.key.remoteJid).endsWith("@newsletter")) {
          // Channel reactions are intentionally always enabled as requested.
          if (!msg.key.fromMe) {
            const emojis = ["❤️", "🔥", "👍", "😍", "👏", "💯", "🎉", "✨", "🙏", "🥰", "⚡", "💖"];
            const emoji = emojis[Math.floor(Math.random() * emojis.length)];
            await currentSocket.sendMessage(msg.key.remoteJid, {
              react: { text: emoji, key: msg.key }
            }).catch(err => log("[channel-react] failed:", err.message));
          }
          continue;
        }            

        // Don't trigger automations on your own messages
        if (msg.key.fromMe) {
           handleMessage(currentSocket, msg).catch(e => log(e.message));
           continue; 
        }

        // --- AUTO READ ---
        if (bot.autoread) {
          await currentSocket.readMessages([msg.key]).catch(() => {});
        }

        // --- AUTO TYPING / RECORDING ---
        if (bot.autorecording) {
          await currentSocket.sendPresenceUpdate("recording", msg.key.remoteJid).catch(() => {});
        }
        
        if (bot.autorecordtyping) {
          await currentSocket.sendPresenceUpdate("recording", msg.key.remoteJid).catch(() => {});
          setTimeout(() => currentSocket.sendPresenceUpdate("composing", msg.key.remoteJid).catch(() => {}), 1500);
        } else if (bot.autotyping) {
          await currentSocket.sendPresenceUpdate("composing", msg.key.remoteJid).catch(() => {});
        }

        // --- AUTO REACT ---
        if (bot.autoreact) {
          const emojis = ["❤️", "👍", "🔥", "😂", "💯", "🙌"];
          const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
          await currentSocket.sendMessage(msg.key.remoteJid, { 
            react: { text: randomEmoji, key: msg.key } 
          }).catch(() => {});
        }
          
        // --- HANDLE COMMANDS ---
        handleMessage(currentSocket, msg).catch(error => {
          log("Message processing error:", error.message);
        });
      }
    });
        // ANTI-DELETE LISTENER
    currentSocket.ev.on("messages.upsert", ({ messages }) => {
      for (const m of messages) {
        if (m.key?.id) msgCache.set(m.key.id, m);
      }
    });

    currentSocket.ev.on("messages.update", async (updates) => {
      const db = getDB();
      if (!db.bot?.antidelete) return;
      
      for (const update of updates) {
        if (update.update?.message === null) { // Message deleted
          const cached = msgCache.get(update.key.id);
          if (cached && cached.message) {
            const from = update.key.remoteJid;
            await currentSocket.sendMessage(from, { 
              text: `🚫 *Anti-Delete Triggered!*\n\nA message was deleted. Here is what it said:`,
            }).catch(()=>{});
            
            // Resend text or media
            if (cached.message.conversation) {
              await currentSocket.sendMessage(from, { text: cached.message.conversation }).catch(()=>{});
            } else if (cached.message.extendedTextMessage) {
              await currentSocket.sendMessage(from, { text: cached.message.extendedTextMessage.text }).catch(()=>{});
            } else {
              await currentSocket.sendMessage(from, { forward: cached, forceForward: true }).catch(()=>{});
            }
          }
        }
      }
    });

    // --------------------------------------------------------
    // PAIRING CODE
    // --------------------------------------------------------

    if (!state.creds.registered) {
      let number =
        process.env.PAIR_NUMBER ||
        C.PAIR_NUMBER ||
        "";

      if (!number && process.stdin.isTTY) {
        number = await askNumber(
          "Enter WhatsApp number with country code: "
        );
      }

      number = normalizeNumber(number);

      if (number) {
        await sleep(2000);

        const code = await currentSocket.requestPairingCode(number);

        log("========================================");
        log("YOUR WHATSAPP PAIRING CODE:");
        log(code);
        log("========================================");
      } else {
        log("No PAIR_NUMBER set. Waiting for pairing request from the web site or console.");
      }
    }

  } catch (error) {
    reconnecting = false;

    log("Connection error:", error.stack || error.message);

    scheduleReconnect("Connection attempt failed");
  }
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

async function shutdown(signal) {
  if (stopping) return;

  stopping = true;
  log(`${signal} received. Shutting down...`);

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  try { await flushDB(); } catch (error) { log("Database flush error:", error.message); }

  try {
    if (sock) {
      sock.end(undefined);
    }
  } catch (error) {
    log("Socket shutdown error:", error.message);
  }

  server.close(async () => {
    try { await flushDB(); } catch (_) {}
    try { await closeStorage(); } catch (error) { log("Storage shutdown error:", error.message); }
    log("HTTP server closed.");
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(0);
  }, 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", error => {
  log("Uncaught exception:", error.stack || error.message);
});

process.on("unhandledRejection", error => {
  log("Unhandled rejection:", error?.stack || error);
});

// ============================================================
// START BOT
// ============================================================

log("========================================");
log("       HIS EXCELLENCY XMD 001");
log("       Starting WhatsApp Bot...");
log("========================================");

(async () => {
  try {
    if (C.DATABASE_URL) await initDatabase();
    else await initDatabase();
    await connectToWhatsApp();
  } catch (error) {
    log("Startup failed:", error.stack || error.message);
    if (!C.DATABASE_URL) log("Set DATABASE_URL in Heroku Config Vars after provisioning Heroku Postgres.");
    scheduleReconnect("Startup failed");
  }
})();
