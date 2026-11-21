"use strict";

const sharp = require("sharp");

const commands = {
  sticker: async (s, m, a, c) => {
    // Check if it's a reply
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) return c.reply("❌ Reply to an image to convert it to a sticker.");

    // Unwrap view once if replied
    let msg = quoted.viewOnceMessageV2?.message || 
              quoted.viewOnceMessageV2Extension?.message || 
              quoted.viewOnceMessage?.message || 
              quoted;

    const type = Object.keys(msg)[0];
    if (!["imageMessage", "stickerMessage"].includes(type)) {
      return c.reply("❌ Only images can be converted to stickers.");
    }

    try {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      
      // Download the media
      const stream = await downloadContentFromMessage(msg[type], type.replace("Message", ""));
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

      // If it's already a sticker, just resend it
      if (type === "stickerMessage") {
        return s.sendMessage(c.from, { sticker: buffer }, { quoted: m });
      }

      // Convert image to WebP sticker using sharp
      const stickerBuffer = await sharp(buffer)
        .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 80 })
        .toBuffer();

      // Send it
      await s.sendMessage(c.from, { sticker: stickerBuffer }, { quoted: m });

    } catch (err) {
      c.reply(`❌ Failed to create sticker: ${err.message}`);
    }
  }
};

// Alias for .s
commands.s = commands.sticker;

module.exports = { commands };
