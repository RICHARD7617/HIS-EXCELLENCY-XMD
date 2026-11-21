"use strict";

const sharp = require("sharp");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");

async function createSticker(s, m, c, isVideo = false) {
  const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted) return c.reply(`❌ Reply to an ${isVideo ? "video/gif" : "image"} to convert it.`);

  // Unwrap View Once if needed
  let msg = quoted.viewOnceMessageV2?.message || 
            quoted.viewOnceMessageV2Extension?.message || 
            quoted.viewOnceMessage?.message || 
            quoted;

  const type = Object.keys(msg)[0];
  
  if (!isVideo && !["imageMessage", "stickerMessage"].includes(type)) {
    return c.reply("❌ Please reply to an image.");
  }
  if (isVideo && !["videoMessage", "gifMessage"].includes(type)) {
    return c.reply("❌ Please reply to a video or GIF.");
  }

  try {
    // 1. Download the media buffer
    const stream = await downloadContentFromMessage(msg[type], type.replace("Message", ""));
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

    // 2. Convert using wa-sticker-formatter (handles both image and video/animation)
    const sticker = new Sticker(buffer, {
      pack: "🔥𝐇𝐈𝐒 𝐄𝐗𝐂𝐄𝐋𝐋𝐄𝐍𝐂𝐘-𝐗𝐌𝐃|𝟎𝟎𝟏🔥",
      author: "HIS EXCELLENCY",
      type: StickerTypes.FULL, // FULL keeps aspect ratio, CROPPED cuts it to square
      quality: 70,
      categories: ["🤖", "🔥"],
    });

    const stickerBuffer = await sticker.toBuffer();

    // 3. Send the sticker
    await s.sendMessage(c.from, { sticker: stickerBuffer }, { quoted: m });

  } catch (err) {
    c.reply(`❌ Failed to create sticker: ${err.message}`);
  }
}

const commands = {
  sticker: async (s, m, a, c) => createSticker(s, m, c, false),
  s: async (s, m, a, c) => createSticker(s, m, c, false),
  
  // Video Sticker Commands
  vsticker: async (s, m, a, c) => createSticker(s, m, c, true),
  vs: async (s, m, a, c) => createSticker(s, m, c, true)
};

module.exports = { commands };
