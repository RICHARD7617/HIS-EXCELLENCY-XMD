"use strict";

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

const logger = pino({ level: "silent" });

const SESSION_DIR = path.join(__dirname, "session");
const DB_PATH = path.join(__dirname, "database.json");
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

// ============================================================
// DATABASE
// ============================================================

const { getDB, saveDB, getMode, setMode } = require("./lib/db");

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
log(`Loaded ${PLUGINS.size} plugins.`);

// ============================================================
// WEB SERVER / RENDER HEALTH CHECK / PAIRING ROUTE
// ============================================================

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("HIS EXCELLENCY XMD is running.");
  }

  if (pair && typeof pair.handle === "function") {
    try {
      // The pairing module may respond synchronously or asynchronously.
      Promise.resolve(pair.handle(req, res)).catch(error => {
        log("Pairing route error:", error.message);

        if (!res.writableEnded) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("Pairing service error.");
        }
      });
      return;
    } catch (error) {
      log("Pairing route error:", error.message);
    }
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

  // Unwrap common WhatsApp message containers.
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

function buildMenuText(userName) {
  const p = C.PREFIX || ".";
  const timezone = C.TIMEZONE || "Africa/Nairobi";
  const now = new Date();

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

  const header = `
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

  const cats = [
    ["GROUP MANAGEMENT", ["add", "promote", "promoteall", "demote", "demoteall", "kick", "kickall", "ban", "unban", "clearbanlist", "warn", "resetwarn", "setwarn", "warnings", "mute", "unmute", "gctime", "antileave", "antilink", "addbadword", "removebadword", "listbadword", "welcome", "goodbye", "joinapproval", "onlyadmins", "leave", "creategroup"]],
    ["AUTO MODERATION", ["antisticker", "antiimage", "antivideo", "antiaudio", "antimention", "antistatusmention", "antigrouplink", "antidemote", "antipromote", "antibadword", "antigroupcall", "antispam"]],
    ["GROUP INFO & TOOLS", ["groupinfo", "grouplink", "tagadmin", "tagall", "hidetag", "link", "invite", "revoke", "setdesc", "fangtrace", "getgpp", "getdesc", "listadmins", "togstatus", "getparticipants", "listonline", "listinactive", "approveall", "rejectall", "disp"]],
    ["MENU SETTINGS", ["menu", "menu2", "menustyle", "togglemenuinfo", "setmenuimage", "restoremenuimage"]],
    ["OWNER CONTROLS", ["setbotname", "resetbotname", "setowner", "resetowner", "setprefix", "prefix", "iamowner", "about", "owner", "block", "unblock", "blockdetect", "blockall", "unblockall", "silent", "anticall", "mode", "public", "private", "setpp", "setfooter", "repo", "pair", "antidelete", "antideletestatus", "antiedit", "chatbot", "shutdown", "broadcast"]],
    ["CHANNEL MODE", ["setchannel", "resetchannel"]],
    ["SYSTEM & MAINTENANCE", ["restart", "workingreload", "reloadenv", "getsettings", "setsetting", "test", "disk", "hostip", "findcommands", "latestupdates", "panel", "debugchat", "ls", "pwd", "cat", "head", "tail", "find", "grep", "stat", "du", "df", "ps", "envkeys", "exec", "package"]],
    ["CPANEL", ["setlink", "setkey", "nestconfig", "createuser", "createpanel", "createunlimited", "setpayment", "prompt", "cpanelmenu"]],
    ["SUDO", ["addsudo", "delsudo", "listsudo", "getsudo", "checksudo", "clearsudo", "sudomode", "sudoinfo", "mysudo", "sudodebug", "linksudo"]],
    ["AUTOMATION", ["autoread", "autotyping", "autorecording", "autorecordtyping", "autoreact", "autoreactstatus", "autoviewstatus", "autobio", "autorec", "reactowner"]],
    ["PRIVACY CONTROLS", ["online", "privacy", "receipt", "profilepic", "viewer", "lastseen"]],
    ["GENERAL UTILITIES", ["alive", "ping", "ping2", "time", "uptime", "runtime", "videocall", "voicecall", "define", "remind", "sessioninfo", "genmusic", "genlyrics", "musicprompt", "news", "covid", "weather", "wiki", "translate", "iplookup", "getip", "getpp", "getgpp", "getdesc", "listadmins", "prefixinfo", "platform", "onwhatsapp", "country"]],
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
  const ownerNumber = normalizeNumber(
    process.env.OWNER_NUMBER || C.OWNER_NUMBER || ""
  );

  if (message.key?.fromMe === true) return true;
  if (botNumber && senderNumber === botNumber) return true;
  if (ownerNumber && senderNumber === ownerNumber) return true;

  return false;
}

// ============================================================
// MESSAGE HANDLER
// ============================================================

async function handleMessage(socket, message) {
  try {
    if (!message?.message || !message.key?.remoteJid) return;

    const from = message.key.remoteJid;
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

    if (getMode() === "PRIVATE" && !isOwner) return;

    // --------------------------------------------------------
    // BUILT-IN COMMANDS
    // --------------------------------------------------------

    switch (command) {
      case "menu":
      case "help": {
        const menuText = buildMenuText(userName);

        try {
          await socket.sendMessage(from, {
            image: {
              url: C.BOT_IMAGE || "https://i.ibb.co/3sX4Q4y/placeholder.jpg"
            },
            caption: menuText
          }, { quoted: message });
        } catch (error) {
          log("Menu image failed; sending text menu:", error.message);

          await socket.sendMessage(from, {
            text: menuText
          }, { quoted: message });
        }

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

    if (PLUGINS.has(command)) {
      const entry = PLUGINS.get(command);

      // Support either { handler } plugin exports or direct functions.
      const handler =
        typeof entry === "function"
          ? entry
          : entry?.handler;

      if (typeof handler !== "function") {
        log(`Invalid plugin handler: ${command}`);
        return;
      }

      const ctx = {
        from,
        sender,
        isGroup,
        isOwner,
        prefix,
        command,
        text,
        config: C,
        runtime,
        db: getDB, 
        saveDB,           
        reply: replyText =>
          socket.sendMessage(from, {
            text: String(replyText)
          }, { quoted: message })
      };

      try {
        await handler(socket, message, args, ctx);
      } catch (error) {
        log(`Plugin "${command}" error:`, error.stack || error.message);

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

    // Restore encoded session if configured and no local credentials exist.
    const credentialsPath = path.join(SESSION_DIR, "creds.json");

    if (
      C.SESSION_ID &&
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

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

    // Fetch the latest supported WhatsApp Web version when possible.
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
    
    // Run plugin init hooks against THIS socket (re-runs on every reconnect).
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

    // Register all plugin-owned event listeners (welcome, goodbye, anti-mod, anti-call)
registerEventHandlers(currentSocket, log);

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
        // Ignore events from an old socket.
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
            fs.rmSync(SESSION_DIR, {
              recursive: true,
              force: true
            });
            fs.mkdirSync(SESSION_DIR, { recursive: true });
          } catch (error) {
            log("Session cleanup failed:", error.message);
          }

          log("A new pairing is required. Check PAIR_NUMBER and restart the service.");
          return;
        }

        scheduleReconnect("WhatsApp connection closed");
      }
    });

    // --------------------------------------------------------
    // INCOMING MESSAGES
    // --------------------------------------------------------

    currentSocket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

      for (const message of messages || []) {
        handleMessage(currentSocket, message).catch(error => {
          log("Message processing error:", error.message);
        });
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

      if (!number) {
        throw new Error(
          "PAIR_NUMBER is missing. Set it in Render environment variables or config.js."
        );
      }

      await sleep(2000);

      const code = await currentSocket.requestPairingCode(number);

      log("========================================");
      log("YOUR WHATSAPP PAIRING CODE:");
      log(code);
      log("========================================");
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

  try {
    if (sock) {
      sock.end(undefined);
    }
  } catch (error) {
    log("Socket shutdown error:", error.message);
  }

  server.close(() => {
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

connectToWhatsApp().catch(error => {
  log("Startup failed:", error.stack || error.message);
  scheduleReconnect("Startup failed");
});
