"use strict";

const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

function unwrapMessage(message) {
  let current = message || {};
  for (let i = 0; i < 10; i++) {
    const next =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message ||
      current.documentWithCaptionMessage?.message;
    if (!next) break;
    current = next;
  }
  return current;
}

function getQuotedMessage(message) {
  return message?.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
    message?.message?.imageMessage?.contextInfo?.quotedMessage ||
    message?.message?.videoMessage?.contextInfo?.quotedMessage ||
    null;
}

function getMedia(quoted, allowed = ["imageMessage", "videoMessage"]) {
  const content = unwrapMessage(quoted);
  for (const type of allowed) {
    if (content[type]) {
      return { content, type, media: content[type], mediaType: type.replace("Message", "") };
    }
  }
  return null;
}

async function downloadMedia(media, mediaType, options = {}) {
  let directError = null;
  if (media && (media.url || media.directPath)) {
    try {
      const stream = await downloadContentFromMessage(media, mediaType);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      if (buffer.length) return buffer;
      directError = new Error("WhatsApp returned an empty media file.");
    } catch (error) {
      directError = error;
    }
  }

  // View-once quotes can arrive without url/directPath. Ask Baileys to
  // re-upload the original quoted message when its stanza ID is available.
  const { sock, from, stanzaId, participant, quoted } = options;
  if (sock && from && stanzaId && quoted) {
    try {
      const { downloadMediaMessage } = require("@whiskeysockets/baileys");
      const logger = require("pino")({ level: "silent" });
      return await downloadMediaMessage({
        key: { remoteJid: from, id: stanzaId, participant, fromMe: false },
        message: quoted
      }, "buffer", {}, {
        logger,
        reuploadRequest: sock.updateMediaMessage
      });
    } catch (error) {
      directError = error;
    }
  }

  throw new Error(
    directError?.message ||
    "WhatsApp did not include a downloadable media URL. The quoted message may have expired; try forwarding it again."
  );
}

module.exports = { unwrapMessage, getQuotedMessage, getMedia, downloadMedia };
