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
// MENU DESIGN
// ============================================================

function buildMenuText(userName) {
  const p = C.PREFIX || ".";
  const now = new Date();

  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: C.TIMEZONE,
  });

  const day = now.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: C.TIMEZONE,
  });

  const date = now.toLocaleDateString("en-GB", {
    timeZone: C.TIMEZONE,
  });

  const totalMem = os.totalmem() / 1024 / 1024;
  const freeMem = os.freemem() / 1024 / 1024;
  const usedMem = totalMem - freeMem;
  const ramText = `${Math.round(usedMem)}/${Math.round(totalMem)}MB`;

  const header =
    `╭═══ 🔥𝐇𝐈𝐒 𝐄𝐗𝐂𝐄𝐋𝐋𝐄𝐍𝐂𝐘 𝐗𝐌𝐃 𝟎𝟎𝟏🔥 ═══⊷\n` +
    `┃❃╭──────────────\n` +
    `┃❃│ 𝐏𝐫𝐞𝐟𝐢𝐱 : ${p}\n` +
    `┃❃│ 𝐔𝐬𝐞𝐫 : ${userName}\n` +
    `┃❃│ 𝐓𝐢𝐦𝐞 : ${time}\n` +
    `┃❃│ 𝐃𝐚𝐲 : ${day}\n` +
    `┃❃│ 𝐃𝐚𝐭𝐞 : ${date}\n` +
    `┃❃│ 𝐕𝐞𝐫𝐬𝐢𝐨𝐧 : ${C.VERSION}\n` +
    `┃❃│ 𝐏𝐥𝐮𝐠𝐢𝐧𝐬 : ${PLUGINS.size}\n` +
    `┃❃│ 𝐑𝐚𝐦 : ${ramText}\n` +
    `┃❃│ 𝐔𝐩𝐭𝐢𝐦𝐞 : ${runtime()}\n` +
    `┃❃│ 𝐏𝐥𝐚𝐭𝐟𝐨𝐫𝐦 : ${os.platform()}\n` +
    `┃❃╰───────────────\n` +
    `╰═════════════════⊷`;

  const cats = [
    ["ᴀɪ", ["BING", "DALL", "GEMINI", "GPT", "GROQ", "OR", "UPSCALE"]],
    ["ᴀᴜᴅɪᴏ", ["AVEC", "BASS", "BLACK", "BLOWN", "CUT", "DEEP", "EARRAPE", "FAST", "FAT", "HISTO", "LOW", "NIGHTCORE", "PITCH", "ROBOT", "SLOW", "SMOOTH", "TREBLE", "TUPAI", "VECTOR"]],
    ["ᴀᴜᴛᴏʀᴇᴘʟʏ", ["FILTER", "GFILTER", "GSTOP", "PFILTER", "PSTOP", "STOP"]],
    ["ʙᴏᴛ", ["BACKUP", "GAUTH", "GUPLOAD", "REMINDER", "TASK", "TOG", "UPDATE", "UPDATE NOW", "YTLOGIN"]],
    ["ʙᴜᴅɢᴇᴛ", ["BUDGET", "DELBUDGET", "EXPENSE", "INCOME", "SUMMARY"]],
    ["ᴅᴏᴄᴜᴍᴇɴᴛ", ["PAGE", "PDF"]],
    ["ᴅᴏᴡɴʟᴏᴀᴅ", ["APK", "FB", "FULLSS", "INSTA", "MEDIAFIRE", "PINTEREST", "PLAY", "REDDIT", "SONG", "SPOTIFY", "SS", "STORY", "TIKTOK", "TWITTER", "UPLOAD", "VIDEO", "YTA", "YTV"]],
    ["ᴇᴅɪᴛᴏʀ", ["BLOODY", "BOKEH", "CARTOON", "COLOR", "DARK", "DEMON", "ENHANCE", "GANDM", "HORNED", "KISS", "LOOK", "MAKEUP", "PENCIL", "SKETCH", "SKULL", "WANTED", "ZOMBIE"]],
    ["ɢᴀᴍᴇ", ["TICTACTOE", "WCG", "WRG"]],
    ["ɢʀᴏᴜᴘ", ["ADD", "AMUTE", "ANTIFAKE", "ANTIGM", "ANTIGSTATUS", "ANTILINK", "ANTISPAM", "ANTIWORD", "AUNMUTE", "COMMON", "DEMOTE", "GINFO", "GOODBYE", "GPP", "GSTATUS", "INACTIVE", "INVITE", "JOIN", "KICK", "MSGS", "MUTE", "PDM", "PROMOTE", "RESET", "REVOKE", "TAG", "UNMUTE", "VOTE", "WARN", "WELCOME"]],
    ["ʟᴏɢɪᴀ", ["OPE", "YAMI", "ZUSHI"]],
    ["ᴍɪsᴄ", ["AFK", "ALIVE", "AVM", "CALC", "DELCMD", "FANCY", "FORWARD", "GETCMD", "LYDIA", "MENTION", "MFORWARD", "NEWS", "PING", "QR", "REBOOT", "RMBG", "SAVE", "SETCMD", "TTS", "URL", "WHOIS"]],
    ["ᴘᴇʀsᴏɴᴀʟ", ["DELGREET", "GETGREET", "SETGREET"]],
    ["ᴘʟᴜɢɪɴ", ["PLUGIN", "REMOVE"]],
    ["sᴄʜᴇᴅᴜʟᴇ", ["DELSCHEDULE", "GETSCHEDULE", "SETSCHEDULE"]],
    ["sᴇᴀʀᴄʜ", ["EMIX", "EMOJI", "FIND", "IG", "IMG", "ISON", "JEAN", "MOVIE", "TIME", "TRT", "WEATHER", "YTS"]],
    ["sᴛɪᴄᴋᴇʀ", ["CIRCLE", "EXIF", "MP4", "PHOTO", "STICKER", "TAKE", "TG"]],
    ["ᴛᴇxᴛᴍᴀᴋᴇʀ", ["3D", "ANGEL", "AVENGER", "BLUB", "BPINK", "CAT", "GLITCH", "GLITTER", "GRAFFITI", "HACKER", "LIGHT", "MARVEL", "NEON", "SCI", "SIGN", "TATTOO", "WATERCOLOR"]],
    ["ᴜsᴇʀ", ["BLOCK", "FULLPP", "GJID", "JID", "LEFT", "PP", "UNBLOCK"]],
    ["ᴠᴀʀs", ["ALLVAR", "DELSUDO", "DELVAR", "GETSUDO", "GETVAR", "SETSUDO", "SETVAR"]],
    ["ᴠɪᴅᴇᴏ", ["COMPRESS", "CROP", "MERGE", "MP3", "REVERSE", "ROTATE", "TRIM"]],
    ["ᴡʜᴀᴛsᴀᴘᴘ", ["ANTIEDIT", "CALL", "CAPTION", "CINFO", "CLEAR", "CREATE", "DELETE", "DLT", "DOC", "ONLINE", "POLL", "REACT", "READ", "SCSTATUS", "SETSTATUS", "STATUS", "VV"]],
  ];

  const body = cats.map(([title, cmds]) => {
    const list = cmds.map(c => ` │ ${boldText(c)}`).join("\n");
    return ` ╭─❏ ${smallCaps(title)} ❏\n${list}\n ╰─────────────────`;
  }).join("\n");

  return header + "\n" + body;
}

function smallCaps(text) {
  const map = {
    a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ",
    f: "ғ", g: "ɢ", h: "ʜ", i: "ɪ", j: "ᴊ",
    k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ", o: "ᴏ",
    p: "ᴘ", q: "ǫ", r: "ʀ", s: "𝐬", t: "ᴛ",
    u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "𝐱", y: "ʏ", z: "ᴢ"
  };

  return text.toLowerCase().split("").map(c => map[c] || c).join("");
}

function boldText(text) {
  const map = {
    A: "𝙰", B: "𝙱", C: "𝙲", D: "𝙳", E: "𝙴",
    F: "𝙵", G: "𝙶", H: "𝙷", I: "𝙸", J: "𝙹",
    K: "𝙺", L: "𝙻", M: "𝙼", N: "𝙽", O: "𝙾",
    P: "𝙿", Q: "𝚀", R: "𝚁", S: "𝚂", T: "𝚃",
    U: "𝚄", V: "𝚅", W: "𝚆", X: "𝚇", Y: "𝚈", Z: "𝚉"
  };

  return text.split("").map(c => map[c] || c).join("");
}

// ============================================================
// AUTO-FOLLOW & AUTO-JOIN
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

  // The paired WhatsApp account is always recognized as owner.
  if (message.key.fromMe === true) return true;

  if (botNumber && senderNumber === botNumber) return true;

  if (ownerNumber && senderNumber === ownerNumber) return true;

  return false;
}

// ============================================================
// MESSAGE HANDLER
// ============================================================

async function handleMessage(socket, message) {
  try {
    if (!message.message) return;

    // Extract command before applying the fromMe check.
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

    // Correctly identify the paired account in private and group chats.
    const sender = message.key.fromMe
      ? `${botNumber}@s.whatsapp.net`
      : (isGroup
          ? message.key.participant || from
          : from);

    const userName = message.pushName || sender.split("@")[0];

    const isOwner = checkOwner(socket, message, sender);

    // Read messages without preventing command execution.
    try {
      await socket.readMessages([message.key]);
    } catch (error) {}

    // ========================================================
    // GROUP PROTECTION
    // ========================================================

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
            await socket.sendMessage(from, {
              delete: message.key
            });

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

    // ========================================================
    // MODE PERMISSIONS
    // ========================================================

    const mode = String(C.MODE || "PUBLIC").toUpperCase();

    if (mode === "PRIVATE" && !isOwner) {
      await socket.sendMessage(from, {
        text: "❌ Bot is currently in PRIVATE mode. Only the owner can use it."
      }, {
        quoted: message
      });

      return;
    }

    // ========================================================
    // BUILT-IN COMMANDS
    // ========================================================

    switch (command) {
      case "menu":
      case "help": {
        await socket.sendMessage(from, {
          text: `🔥 *HIS EXCELLENCY XMD 001*\n\n𝐌𝐞𝐧𝐮 𝐥𝐨𝐚𝐝𝐢𝐧𝐠....𝐏𝐥𝐞𝐚𝐬𝐞 𝐰𝐚𝐢𝐭🤪`
        }, {
          quoted: message
        });

        await sleep(1500);

        const menuText = buildMenuText(userName);

        try {
          await socket.sendMessage(from, {
            image: { url: C.BOT_IMAGE },
            caption: menuText
          }, {
            quoted: message
          });
        } catch (error) {
          log("Menu image failed, sending text only:", error.message);

          await socket.sendMessage(from, {
            text: menuText
          }, {
            quoted: message
          });
        }

        return;
      }

      case "ping": {
        const start = Date.now();

        await socket.sendMessage(from, {
          text: `🏓 Pong!\n⚡ ${Date.now() - start} ms`
        }, {
          quoted: message
        });

        return;
      }

      case "alive":
        await socket.sendMessage(from, {
          text: `👑 ${C.BOT_NAME} is alive and running!\n\n⏱ ${runtime()}`
        }, {
          quoted: message
        });
        return;

      case "owner":
        await socket.sendMessage(from, {
          text: `👑 Owner: ${C.OWNER_NAME}\n📞 ${C.OWNER_NUMBER}`
        }, {
          quoted: message
        });
        return;

      case "runtime":
        await socket.sendMessage(from, {
          text: `⏱ Bot uptime: ${runtime()}`
        }, {
          quoted: message
        });
        return;

      case "public":
        if (!isOwner) {
          await socket.sendMessage(from, {
            text: "❌ Only the owner can change bot modes."
          }, {
            quoted: message
          });
          return;
        }

        C.MODE = "PUBLIC";

        await socket.sendMessage(from, {
          text: "✅ Bot is now in *PUBLIC* mode. Everyone can use it."
        }, {
          quoted: message
        });

        return;

      case "private":
        if (!isOwner) {
          await socket.sendMessage(from, {
            text: "❌ Only the owner can change bot modes."
          }, {
            quoted: message
          });
          return;
        }

        C.MODE = "PRIVATE";

        await socket.sendMessage(from, {
          text: "✅ Bot is now in *PRIVATE* mode. Only the owner can use it."
        }, {
          quoted: message
        });

        return;

      default:
        break;
    }

    // ========================================================
    // PLUGIN DISPATCH
    // ========================================================

    if (PLUGINS.has(command)) {
      const entry = PLUGINS.get(command);

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

        reply: (replyText) => {
          return socket.sendMessage(from, {
            text: String(replyText)
          }, {
            quoted: message
          });
        }
      };

      try {
        await entry.handler(socket, message, args, ctx);
      } catch (error) {
        log(`Plugin "${command}" error:`, error.message);

        await socket.sendMessage(from, {
          text: `❌ Command failed: ${error.message}`
        }, {
          quoted: message
        });
      }

      return;
    }

    // ========================================================
    // UNKNOWN COMMAND
    // ========================================================

    log(`Unknown command: ${command} from ${sender}`);

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

        fs.writeFileSync(
          path.join(SESSION_DIR, "creds.json"),
          decoded,
          "utf8"
        );
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
        log("Bot mode:", C.MODE || "PUBLIC");

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

          try {
            fs.rmSync(SESSION_DIR, {
              recursive: true,
              force: true
            });
          } catch (error) {}
        }

        if (!stopping) {
          attempts++;

          const delay = Math.min(
            5000 * Math.pow(2, attempts - 1),
            60000
          );

          log(`Connection closed. Reconnecting in ${delay}ms...`);

          setTimeout(() => {
            connectToWhatsApp().catch(error => {
              log("Reconnect error:", error.message);
            });
          }, delay);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify" && type !== "append") return;

      for (const message of messages) {
        await handleMessage(sock, message);
      }
    });

    if (!state.creds.registered) {
      let number = process.env.PAIR_NUMBER || C.PAIR_NUMBER || "";

      if (!number && process.stdin.isTTY) {
        number = await askNumber(
          "Enter WhatsApp number with country code: "
        );
      }

      number = number.replace(/[^0-9]/g, "");

      if (!number) {
        throw new Error("PAIR_NUMBER is missing.");
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

      const delay = Math.min(
        5000 * Math.pow(2, attempts - 1),
        60000
      );

      setTimeout(() => {
        connectToWhatsApp().catch(err => {
          log("Retry error:", err.message);
        });
      }, delay);
    }
  }
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

async function shutdown(signal) {
  if (stopping) return;

  stopping = true;

  log(`${signal} received. Shutting down...`);

  try {
    if (sock) {
      sock.end(undefined);
    }
  } catch (error) {}

  server.close(() => process.exit(0));

  setTimeout(() => process.exit(0), 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", error => {
  log("Uncaught exception:", error);
});

process.on("unhandledRejection", error => {
  log("Unhandled rejection:", error);
});

// ============================================================
// START BOT
// ============================================================

connectToWhatsApp().catch(error => {
  log("Startup failed:", error.message);
});
