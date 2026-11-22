"use strict";

const C = require("../config");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");
const { getQuotedMessage, getMedia, downloadMedia } = require("../lib/media");

async function createSticker(sock, message, ctx, videoOnly = false) {
  const quoted = getQuotedMessage(message);
  if (!quoted) {
    return ctx.reply(`❌ Reply to an ${videoOnly ? "video/GIF" : "image or video"} with ${ctx.prefix}${ctx.command}.`);
  }

  const found = getMedia(
    quoted,
    videoOnly ? ["videoMessage"] : ["imageMessage", "videoMessage"]
  );
  if (!found) {
    return ctx.reply(videoOnly
      ? "❌ Please reply to a video or GIF."
      : "❌ Please reply to an image or video.");
  }

  try {
    const buffer = await downloadMedia(found.media, found.mediaType, { sock, from: ctx.from, quoted, stanzaId: message.message?.extendedTextMessage?.contextInfo?.stanzaId, participant: message.message?.extendedTextMessage?.contextInfo?.participant });
    const isVideo = found.mediaType === "video";
    const sticker = new Sticker(buffer, {
      pack: C.BOT_NAME || "HIS EXCELLENCY XMD",
      author: C.OWNER_NAME || "HIS EXCELLENCY",
      type: StickerTypes.DEFAULT,
      quality: 65,
      animated: isVideo,
      fps: 10,
      loop: 0,
      startTime: 0,
      endTime: 8
    });
    const webp = await sticker.toBuffer();
    await sock.sendMessage(ctx.from, { sticker: webp }, { quoted: message });
  } catch (err) {
    await ctx.reply(`❌ Sticker conversion failed: ${err.message}`);
  }
}

module.exports = {
  commands: {
    sticker: (s, m, a, c) => createSticker(s, m, c, false),
    s: (s, m, a, c) => createSticker(s, m, c, false),
    vsticker: (s, m, a, c) => createSticker(s, m, c, true),
    vs: (s, m, a, c) => createSticker(s, m, c, true),
    toimage: async (s, m, a, c) => {
      const quoted = getQuotedMessage(m);
      const found = getMedia(quoted, ["stickerMessage"]);
      if (!found) return c.reply("❌ Reply to a sticker.");
      try {
        const buffer = await downloadMedia(found.media, "sticker");
        await s.sendMessage(c.from, { image: buffer }, { quoted: m });
      } catch (e) { await c.reply(`❌ Could not convert sticker: ${e.message}`); }
    }
  }
};
