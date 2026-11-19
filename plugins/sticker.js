// plugins/sticker.js
const { Sticker, StickerTypes } = require("wa-sticker-formatter");

const commands = {
  // .sticker — reply to any image/video with .sticker
  async sticker(sock, message, args, ctx) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) {
      return sock.sendMessage(ctx.from, { text: "❌ Reply to an image/video with .sticker" }, { quoted: message });
    }
    try {
      // Download the quoted media
      const { downloadMediaMessage } = require("@whiskeysockets/baileys");
      const stream = await downloadMediaMessage(
        { key: message.message.extendedTextMessage.contextInfo.stanzaId ? { remoteJid: ctx.from, id: message.message.extendedTextMessage.contextInfo.stanzaId, participant: message.message.extendedTextMessage.contextInfo.participant } : message.key, message: quoted },
        "buffer",
        {},
        { logger: console, reuploadRequest: sock.updateMediaMessage }
      );
      const sticker = new Sticker(stream, {
        pack: ctx.config.BOT_NAME,
        author: ctx.config.OWNER_NAME,
        type: StickerTypes.FULL,
        quality: 70,
      });
      const buffer = await sticker.toBuffer();
      await sock.sendMessage(ctx.from, { sticker: buffer }, { quoted: message });
    } catch (e) {
      await sock.sendMessage(ctx.from, { text: `❌ ${e.message}` }, { quoted: message });
    }
  },

  // .take — reply to sticker with .take packname
  async take(sock, message, args, ctx) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted?.stickerMessage) {
      return sock.sendMessage(ctx.from, { text: "❌ Reply to a sticker with .take packname" }, { quoted: message });
    }
    try {
      const { downloadMediaMessage } = require("@whiskeysockets/baileys");
      const buffer = await downloadMediaMessage(
        { key: { remoteJid: ctx.from, id: message.message.extendedTextMessage.contextInfo.stanzaId, participant: message.message.extendedTextMessage.contextInfo.participant }, message: quoted },
        "buffer", {}, { logger: console, reuploadRequest: sock.updateMediaMessage }
      );
      const sticker = new Sticker(buffer, {
        pack: args.join(" ") || ctx.config.BOT_NAME,
        author: ctx.config.OWNER_NAME,
        type: StickerTypes.FULL,
      });
      const out = await sticker.toBuffer();
      await sock.sendMessage(ctx.from, { sticker: out }, { quoted: message });
    } catch (e) {
      await sock.sendMessage(ctx.from, { text: `❌ ${e.message}` }, { quoted: message });
    }
  },
};

module.exports = { commands };
