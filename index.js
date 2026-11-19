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

const logger = pino({ level: "silent" });

let sock = null;
let reconnecting = false;
let startupSent = false;
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

    // Render health check
    if (req.url === "/health") {
      res.writeHead(200, {
        "Content-Type": "text/plain"
      });
      return res.end("HIS EXCELLENCY XMD is running.");
    }

    // Serve the pairing website and its API
    if (pair && typeof pair.handle === "function") {
      const handled = pair.handle(req, res);
      if (handled) return;
    }

    // Unknown routes
    res.writeHead(404, {
      "Content-Type": "text/plain"
    });
    res.end("Page not found");
  });

  server.listen(PORT, "0.0.0.0", () => {
    log(`Web server running on port ${PORT}`);
  });

  return server;
}


const server = startServer();

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

async function handleMessage(socket, message) {
  try {
    if (!message.message || message.key.fromMe) return;

    const text = getMessageText(message);
    if (!text) return;

    const from = message.key.remoteJid;
    const isGroup = from.endsWith("@g.us");
    const sender = isGroup
      ? message.key.participant || from
      : from;

    const prefix = C.PREFIX || ".";
    if (!text.startsWith(prefix)) return;

    const args = text.slice(prefix.length).trim().split(/\s+/);
    const command = (args.shift() || "").toLowerCase();

    switch (command) {
      case "menu":
      case "help":
        await socket.sendMessage(from, {
          text:
            `╭━━〔 HIS EXCELLENCY XMD 〕━━╮\n` +
            `┃\n` +
            `┃ 👑 Owner: ${process.env.OWNER_NAME || C.OWNER_NAME || "Owner"}\n` +
            `┃ ⚙️ Prefix: ${prefix}\n` +
            `┃ ⏱ Runtime: ${runtime()}\n` +
            `┃\n` +
            `┃ ${prefix}ping\n` +
            `┃ ${prefix}alive\n` +
            `┃ ${prefix}owner\n` +
            `┃ ${prefix}runtime\n` +
            `┃\n` +
            `╰━━━━━━━━━━━━━━━━━━━━╯`,
        }, { quoted: message });
        break;

      case "ping": {
        const start = Date.now();

        await socket.sendMessage(from, {
          text: `🏓 Pong!\n⚡ ${Date.now() - start} ms`,
        }, { quoted: message });
        break;
      }

      case "alive":
        await socket.sendMessage(from, {
          text: `👑 HIS EXCELLENCY XMD is alive and running!\n\n⏱ ${runtime()}`,
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
          log("Session restored from SESSION_ID.");
        }
      } catch (error) {
        log("Session restore failed:", error.message);
      }
    }

    const { state, saveCreds } =
      await useMultiFileAuthState(SESSION_DIR);

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

    sock.ev.on("creds.update", saveCreds);

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

      number = number.replace(/[^0-9]/g, "");

      if (!number) {
        throw new Error("PAIR_NUMBER is missing. Set it in Render environment variables.");
      }

      await sleep(2000);

      const code = await sock.requestPairingCode(number);
      log(`Your WhatsApp pairing code: ${code}`);
    }

    sock.ev.on("connection.update", async update => {
      const { connection, lastDisconnect } = update;

      if (connection === "open") {
        attempts = 0;
        reconnecting = false;
        startupSent = false;

        log("WhatsApp connected successfully.");
        await sendStartupMessage(sock);
      }

      if (connection === "close") {
        reconnecting = false;

        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        const loggedOut =
          statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          log("Session logged out. Removing saved session.");
          ignoreSessionId = true;

          try {
            fs.rmSync(SESSION_DIR, {
              recursive: true,
              force: true,
            });
          } catch (error) {
            log("Session removal error:", error.message);
          }
        }

        if (!stopping) {
          attempts++;

          const delay = Math.min(
            5000 * Math.pow(2, attempts - 1),
            60000
          );

          log(`Connection closed. Reconnecting in ${delay / 1000}s...`);

          setTimeout(() => {
            connectToWhatsApp().catch(error => {
              log("Reconnect error:", error.message);
            });
          }, delay);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const message of messages) {
        await handleMessage(sock, message);
      }
    });

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

async function shutdown(signal) {
  if (stopping) return;

  stopping = true;
  log(`${signal} received. Shutting down...`);

  try {
    if (sock) {
      sock.end(undefined);
    }
  } catch (error) {
    log("Socket shutdown error:", error.message);
  }

  server.close(() => {
    process.exit(0);
  });

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

connectToWhatsApp().catch(error => {
  log("Startup failed:", error.message);
});
