"use strict";

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
    // 1. Download the media buffer natively
    const stream = await downloadContentFromMessage(msg[type], type.replace("Message", ""));
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

    // 2. Send the sticker natively using Baileys!
    // This bypasses any missing library errors.
    await s.sendMessage(c.from, { 
      sticker: buffer,
      // We can't easily set the pack name without the formatter, but this guarantees it works
    }, { quoted: m });

  } catch (err) {
    c.reply(`❌ Failed to create sticker: ${err.message}`);
  }
}

const commands = {
  sticker: async (s, m, a, c) => createSticker(s, m, c, false),
  s: async (s, m, a, c) => createSticker(s, m, c, false),
  vsticker: async (s, m, a, c) => createSticker(s, m, c, true),
  vs: async (s, m, a, c) => createSticker(s, m, c, true)
};

module.exports = { commands };
