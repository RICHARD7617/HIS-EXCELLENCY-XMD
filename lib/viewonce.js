"use strict";

const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

const MEDIA_TYPES = ["imageMessage", "videoMessage", "audioMessage"];
const CACHE_LIMIT = 500;
const cache = new Map(); // messageId -> found

function norm(value) {
  return String(value || "").split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
}

// Finds a view-once media node (wrapped OR flagged) inside any message.
function findViewOnce(message) {
  let m = message;
  let wrapped = false;

  for (let i = 0; i < 8 && m; i++) {
    const vo =
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message;

    if (vo) { wrapped = true; m = vo; continue; }

    const inner =
      m.ephemeralMessage?.message ||
      m.documentWithCaptionMessage?.message ||
      m.editedMessage?.message;

    if (!inner) break;
    m = inner;
  }

  for (const type of MEDIA_TYPES) {
    const media = m?.[type];
    if (media && (wrapped || media.viewOnce === true)) return { type, media };
  }
  return null;
}

function getContextInfo(message) {
  let m = message;
  for (let i = 0; i < 6 && m; i++) {
    const inner =
      m.ephemeralMessage?.message ||
      m.editedMessage?.message ||
      m.documentWithCaptionMessage?.message;
    if (!inner) break;
    m = inner;
  }
  if (!m) return null;

  for (const key of Object.keys(m)) {
    const ci = m[key]?.contextInfo;
    if (ci && typeof ci === "object") return ci;
  }
  return null;
}

function getText(message) {
  let m = message;
  for (let i = 0; i < 6 && m; i++) {
    const inner = m.ephemeralMessage?.message || m.editedMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return String(m?.conversation || m?.extendedTextMessage?.text || "").trim();
}

async function download(found, sock) {
  const kind = found.type.replace("Message", "");
  let media = found.media;

  if (!media?.url && !media?.directPath && found.rawMsg && typeof sock?.updateMediaMessage === "function") {
    try {
      const refreshed = await sock.updateMediaMessage(found.rawMsg);
      const updated = findViewOnce(refreshed?.message);
      if (updated?.media) {
        media = updated.media;
        found.media = updated.media;
      }
    } catch (_) {
      // Fall through so downloadContentFromMessage reports the exact error
    }
  }

  const stream = await downloadContentFromMessage(media, kind);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Remember view-once messages as they arrive (used as a fallback).
function remember(msg) {
  const found = findViewOnce(msg?.message);
  if (!found || !msg.key?.id) return;

  cache.set(msg.key.id, { ...found, rawMsg: msg });
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

// Opens the view-once message that `message` is replying to.
async function openFromReply(message, sock) {
  const ci = getContextInfo(message?.message);
  if (!ci) return { error: "no-reply" };

  const candidates = [];

  const cached = ci.stanzaId ? cache.get(ci.stanzaId) : null;
  if (cached) candidates.push(cached);

  if (ci.quotedMessage) {
    const f = findViewOnce(ci.quotedMessage);
    if (f) {
      const reconstructedRaw = ci.stanzaId
        ? {
            key: {
              remoteJid: ci.remoteJid || message?.key?.remoteJid,
              fromMe: false,
              id: ci.stanzaId,
              ...(ci.participant ? { participant: ci.participant } : {})
            },
            message: ci.quotedMessage
          }
        : null;
      candidates.push({ ...f, rawMsg: reconstructedRaw });
    }
  }

  if (!candidates.length) return { error: "not-viewonce" };

  const withMedia = candidates.filter((c) => c?.media?.url || c?.media?.directPath || c?.rawMsg);
  const pool = withMedia.length ? withMedia : candidates;

  let lastError;
  for (const found of pool) {
    try {
      return { found, buffer: await download(found, sock) };
    } catch (err) {
      lastError = err;
    }
  }
  return { error: "download", detail: lastError?.message };
}
async function sendOpened(sock, jid, found, buffer, caption, options = {}) {
  const kind = found.type.replace("Message", "");

  if (kind === "audio") {
    return sock.sendMessage(jid, {
      audio: buffer,
      mimetype: found.media.mimetype || "audio/mpeg",
      ptt: Boolean(found.media.ptt)
    }, options);
  }

  return sock.sendMessage(jid, { [kind]: buffer, caption }, options);
}

function errorText(result) {
  if (result.error === "no-reply") return "❌ Reply to a View Once message with this command.";
  if (result.error === "not-viewonce") return "❌ The message you replied to is not a View Once image, video or voice note.";
  return `❌ Could not download the media (${result.detail || "it may have expired"}).`;
}

// Auto mode: when the OWNER replies to a view-once message, send it to the bot's DM.
function attach(sock, log, C) {
  const done = new Set();

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify" && type !== "append") return;

    for (const msg of messages) {
      try {
        if (!msg?.message || !msg.key?.id) continue;
        if (msg.key.remoteJid === "status@broadcast") continue;

        remember(msg);

        const ownerNumber = norm(process.env.OWNER_NUMBER || C.OWNER_NUMBER);
        const botNumber = norm(sock.user?.id);
        const sender = msg.key.participant || msg.key.remoteJid;
        const isOwner =
          msg.key.fromMe ||
          (ownerNumber && norm(sender) === ownerNumber) ||
          (botNumber && norm(sender) === botNumber);

        if (!isOwner) continue;

        // ignore old/history messages
        const t = msg.messageTimestamp;
        const ts = t && typeof t === "object" ? (t.toNumber ? t.toNumber() : t.low) : Number(t);
        if (ts && Date.now() / 1000 - ts > 120) continue;

        // .vv / .vv2 commands handle themselves
        const prefix = String(C.PREFIX || ".");
        const text = getText(msg.message).toLowerCase();
        if (text === `${prefix}vv` || text === `${prefix}vv2`) continue;

        const ci = getContextInfo(msg.message);
        if (!ci?.stanzaId) continue;

        if (done.has(msg.key.id)) continue;

        const result = await openFromReply(msg);
        if (!result.found) continue; // not a view-once reply, ignore quietly

        done.add(msg.key.id);
        if (done.size > 500) done.delete(done.values().next().value);

        const targetNumber = ownerNumber || botNumber;
        if (!targetNumber) continue;
        const ownerJid = `${targetNumber}@s.whatsapp.net`;
        const original = result.found.media.caption ? `\n\n${result.found.media.caption}` : "";

        await sendOpened(
          sock,
          ownerJid,
          result.found,
          result.buffer,
          `📸 *Auto View Once Opened*\n\nChat: ${msg.key.remoteJid}${original}`
        );
      } catch (err) {
        log("Auto ViewOnce failed:", err.message);
      }
    }
  });
}

module.exports = { attach, openFromReply, sendOpened, errorText, norm };
