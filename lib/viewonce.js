"use strict";

const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

const MEDIA_TYPES = ["imageMessage", "videoMessage", "audioMessage"];
const CACHE_LIMIT = 1000;
const cache = new Map(); // id -> { type, media, rawMsg, remoteJid, senderNum, ts }

function norm(value) {
  return String(value || "").split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
}

function toTimestamp(t) {
  if (!t) return 0;
  if (typeof t === "object") {
    if (typeof t.toNumber === "function") return t.toNumber();
    if (typeof t.low === "number") return t.low;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function normalizeMediaKey(mediaKey) {
  if (!mediaKey) return null;
  if (Buffer.isBuffer(mediaKey)) {
    return mediaKey.length > 0 ? mediaKey : null;
  }
  if (mediaKey instanceof Uint8Array) {
    return mediaKey.length > 0 ? Buffer.from(mediaKey) : null;
  }
  if (typeof mediaKey === "string") {
    const trimmed = mediaKey.trim();
    if (!trimmed) return null;
    const buf = Buffer.from(trimmed, "base64");
    return buf.length > 0 ? buf : null;
  }
  if (typeof mediaKey === "object") {
    const keys = Object.keys(mediaKey)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b));
    if (keys.length > 0) {
      const buf = Buffer.from(keys.map((k) => Number(mediaKey[k]) & 0xff));
      return buf.length > 0 ? buf : null;
    }
    if (mediaKey.type === "Buffer" && Array.isArray(mediaKey.data) && mediaKey.data.length > 0) {
      return Buffer.from(mediaKey.data);
    }
  }
  return null;
}

function sanitizeMedia(media) {
  if (!media || typeof media !== "object") return null;
  const keyBuf = normalizeMediaKey(media.mediaKey);
  return {
    ...media,
    ...(keyBuf ? { mediaKey: keyBuf } : {})
  };
}

function hasValidMediaKey(media) {
  return Boolean(normalizeMediaKey(media?.mediaKey));
}

// Finds a view-once media node (wrapped OR flagged) inside any message.
function findViewOnce(message) {
  let m = message;
  let wrapped = false;

  for (let i = 0; i < 10 && m && typeof m === "object"; i++) {
    const vo =
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.associatedChildMessage?.message ||
      m.botInvokeMessage?.message?.viewOnceMessage?.message ||
      m.botInvokeMessage?.message?.viewOnceMessageV2?.message;

    if (vo) {
      wrapped = true;
      m = vo;
      continue;
    }

    const inner =
      m.ephemeralMessage?.message ||
      m.documentWithCaptionMessage?.message ||
      m.editedMessage?.message;

    if (!inner) break;
    m = inner;
  }

  if (!m || typeof m !== "object") return null;

  for (const type of MEDIA_TYPES) {
    const rawMedia = m[type];
    if (rawMedia && (wrapped || rawMedia.viewOnce === true)) {
      return { type, media: sanitizeMedia(rawMedia) };
    }
  }
  return null;
}

function getContextInfo(message) {
  let m = message;
  for (let i = 0; i < 8 && m && typeof m === "object"; i++) {
    const inner =
      m.ephemeralMessage?.message ||
      m.editedMessage?.message ||
      m.documentWithCaptionMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message;
    if (!inner) break;
    m = inner;
  }
  if (!m || typeof m !== "object") return null;

  for (const key of Object.keys(m)) {
    const ci = m[key]?.contextInfo;
    if (ci && typeof ci === "object") return ci;
  }
  return null;
}

function getText(message) {
  let m = message;
  for (let i = 0; i < 8 && m && typeof m === "object"; i++) {
    const inner =
      m.ephemeralMessage?.message ||
      m.editedMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message;
    if (!inner) break;
    m = inner;
  }
  return String(
    m?.conversation ||
      m?.extendedTextMessage?.text ||
      m?.imageMessage?.caption ||
      m?.videoMessage?.caption ||
      ""
  ).trim();
}

function setCacheEntry(id, entry) {
  if (!id || !entry) return;
  const existing = cache.get(id);
  if (existing && hasValidMediaKey(existing.media) && !hasValidMediaKey(entry.media)) {
    // Never overwrite a valid cached decryption key with a stripped stub.
    return;
  }
  if (existing && hasValidMediaKey(existing.media) && hasValidMediaKey(entry.media)) {
    entry = {
      ...existing,
      ...entry,
      media: {
        ...existing.media,
        ...entry.media,
        mediaKey: normalizeMediaKey(entry.media.mediaKey) || normalizeMediaKey(existing.media.mediaKey)
      }
    };
  }
  cache.delete(id);
  cache.set(id, entry);
  while (cache.size > CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

// Remember view-once messages as they arrive (used as primary source & fallback).
function remember(msg) {
  const found = findViewOnce(msg?.message);
  if (!found || !msg?.key?.id) return;

  const entry = {
    type: found.type,
    media: found.media,
    rawMsg: msg,
    remoteJid: msg.key.remoteJid || "",
    senderNum: norm(msg.key.participant || msg.key.remoteJid),
    ts: toTimestamp(msg.messageTimestamp)
  };

  setCacheEntry(msg.key.id, entry);
}

async function download(found, sock) {
  const kind = found.type.replace("Message", "");
  let media = sanitizeMedia(found.media);

  if (!media) {
    throw new Error("Missing media payload");
  }

  if (!media.url && !media.directPath && found.rawMsg && typeof sock?.updateMediaMessage === "function") {
    try {
      const refreshed = await sock.updateMediaMessage(found.rawMsg);
      const updated = findViewOnce(refreshed?.message);
      if (updated?.media) {
        const mergedKey = normalizeMediaKey(updated.media.mediaKey) || normalizeMediaKey(media.mediaKey);
        media = {
          ...media,
          ...updated.media,
          ...(mergedKey ? { mediaKey: mergedKey } : {})
        };
        found.media = media;
      }
    } catch (_) {
      // Fall through to download attempt
    }
  }

  if (!hasValidMediaKey(media)) {
    throw new Error("Cannot derive from empty media key");
  }

  const stream = await downloadContentFromMessage(media, kind);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function findFallbackCandidate(ci, replyMessage) {
  const remoteJid = ci?.remoteJid || replyMessage?.key?.remoteJid || "";
  const participantNum = norm(ci?.participant);
  const replyTs = toTimestamp(replyMessage?.messageTimestamp);

  for (const entry of Array.from(cache.values()).reverse()) {
    if (!hasValidMediaKey(entry.media)) continue;
    if (remoteJid && entry.remoteJid && entry.remoteJid !== remoteJid) continue;
    if (participantNum && entry.senderNum && entry.senderNum !== participantNum) continue;
    if (replyTs && entry.ts && Math.abs(replyTs - entry.ts) > 3600) continue;
    return entry;
  }
  return null;
}

// Opens the view-once message that `message` is replying to.
async function openFromReply(message, sock) {
  const ci = getContextInfo(message?.message);
  if (!ci) return { error: "no-reply" };

  const candidates = [];

  if (ci.stanzaId && cache.has(ci.stanzaId)) {
    candidates.push(cache.get(ci.stanzaId));
  }

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
      candidates.push({
        type: f.type,
        media: f.media,
        rawMsg: reconstructedRaw,
        remoteJid: ci.remoteJid || message?.key?.remoteJid || "",
        senderNum: norm(ci.participant),
        ts: 0
      });
    }
  }

  const fallback = findFallbackCandidate(ci, message);
  if (fallback && !candidates.includes(fallback)) {
    candidates.push(fallback);
  }

  if (!candidates.length) return { error: "not-viewonce" };

  const ordered = [
    ...candidates.filter((c) => hasValidMediaKey(c?.media)),
    ...candidates.filter((c) => !hasValidMediaKey(c?.media))
  ];

  let lastError;
  for (const found of ordered) {
    try {
      const buffer = await download(found, sock);
      return { found, buffer };
    } catch (err) {
      lastError = err;
    }
  }

  return { error: "download", detail: lastError?.message };
}

async function sendOpened(sock, jid, found, buffer, caption, options = {}) {
  const kind = found.type.replace("Message", "");

  if (kind === "audio") {
    return sock.sendMessage(
      jid,
      {
        audio: buffer,
        mimetype: found.media.mimetype || "audio/mpeg",
        ptt: Boolean(found.media.ptt)
      },
      options
    );
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

    for (const msg of messages || []) {
      try {
        if (!msg?.message || !msg.key?.id) continue;
        if (msg.key.remoteJid === "status@broadcast") continue;

        remember(msg);

        const ownerNumber = norm(process.env.OWNER_NUMBER || C?.OWNER_NUMBER);
        const botNumber = norm(sock.user?.id);
        const sender = msg.key.participant || msg.key.remoteJid;
        const isOwner =
          Boolean(msg.key.fromMe) ||
          (ownerNumber && norm(sender) === ownerNumber) ||
          (botNumber && norm(sender) === botNumber);

        if (!isOwner) continue;

        // ignore old/history messages
        const ts = toTimestamp(msg.messageTimestamp);
        if (ts && Date.now() / 1000 - ts > 120) continue;

        // .vv / .vv2 commands handle themselves
        const prefix = String(C?.PREFIX || ".");
        const text = getText(msg.message).toLowerCase();
        if (text === `${prefix}vv` || text === `${prefix}vv2`) continue;

        const ci = getContextInfo(msg.message);
        if (!ci?.stanzaId) continue;

        if (done.has(msg.key.id)) continue;

        const result = await openFromReply(msg, sock);
        if (!result.found) continue; // not a view-once reply, ignore quietly

        done.add(msg.key.id);
        while (done.size > 500) {
          done.delete(done.values().next().value);
        }

        const targetNum = ownerNumber || botNumber;
        if (!targetNum) continue;
        const ownerJid = `${targetNum}@s.whatsapp.net`;

        await sendOpened(
          sock,
          ownerJid,
          result.found,
          result.buffer,
          `📸 *View Once Opened (auto)*\n\nFrom chat: ${msg.key.remoteJid}`
        );
      } catch (err) {
        if (typeof log === "function") {
          log("[viewonce] auto-open error:", err?.message || err);
        }
      }
    }
  });

  sock.ev.on("messages.update", (updates) => {
    for (const u of updates || []) {
      try {
        if (u?.key?.id && u?.update?.message) {
          remember({
            key: u.key,
            message: u.update.message,
            messageTimestamp: u.update.messageTimestamp
          });
        }
      } catch (_) {}
    }
  });

  sock.ev.on("messaging-history.set", ({ messages }) => {
    for (const msg of messages || []) {
      try {
        remember(msg);
      } catch (_) {}
    }
  });
}

module.exports = {
  norm,
  findViewOnce,
  remember,
  openFromReply,
  sendOpened,
  errorText,
  attach
};