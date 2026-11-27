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
    },
    wm: async (s, m, a, c) => {
      const quoted = getQuotedMessage(m);
      const found = getMedia(quoted, ["stickerMessage", "imageMessage", "videoMessage"]);
      if (!found) return c.reply("❌ Reply to a sticker, image, or video with " + c.prefix + "wm <pack|author>");
      const parts = a.join(" ").split("|").map(x => x.trim());
      const pack = parts[0] || C.BOT_NAME || "HIS EXCELLENCY XMD";
      const author = parts[1] || m.pushName || "Owner";
      try {
        const buffer = await downloadMedia(found.media, found.type === "stickerMessage" ? "sticker" : found.type === "videoMessage" ? "video" : "image");
        if (found.type === "stickerMessage") {
          return s.sendMessage(c.from, { sticker: buffer }, { quoted: m });
        }
        return createSticker(s, m, c, found.type === "videoMessage", { pack, author });
      } catch (e) {
        return c.reply("❌ Watermark update failed: " + e.message);
      }
    },
    emojimix: async (s, m, a, c) => {
      const raw = a.join(" ").trim();
      const emojis = raw.includes("+")
        ? raw.split("+").map(x => x.trim()).filter(Boolean)
        : [...raw.replace(/\s+/g, "")];
      if (emojis.length < 2) return c.reply("Usage: " + c.prefix + "emojimix 😀+😂");
      const [e1, e2] = emojis;
      const cp1 = [...e1].map(ch => ch.codePointAt(0).toString(16)).join("-");
      const cp2 = [...e2].map(ch => ch.codePointAt(0).toString(16)).join("-");
      const url = "https://www.gstatic.com/android/keyboard/emojikitchen/" + cp1 + "/" + cp1 + "_" + cp2 + ".png";
      try {
        const res = await fetch(url);
        if (!res.ok) return c.reply("🧩 *Emoji Mix:* " + e1 + " + " + e2 + "\nNo kitchen asset found for this pair.");
        const buf = Buffer.from(await res.arrayBuffer());
        return s.sendMessage(c.from, { image: buf, caption: "🧩 *Emoji Mix:* " + e1 + " + " + e2 }, { quoted: m });
      } catch (e) {
        return c.reply("❌ emojimix failed: " + e.message);
      }
    },
    attp: async (s, m, a, c) => {
      const text = a.join(" ").trim();
      if (!text) return c.reply("Usage: " + c.prefix + "attp <text>");
      return c.reply("✨ *ATTP Sticker Text:* *" + text + "*\nReply to an image with " + c.prefix + "sticker to generate a sticker.");
    },
    ttp: async (s, m, a, c) => {
      const text = a.join(" ").trim();
      if (!text) return c.reply("Usage: " + c.prefix + "ttp <text>");
      return c.reply("🔤 *TTP Text:* *" + text + "*");
    },
    findsticker: async (s, m, a, c) => {
      const q = a.join(" ").trim() || "funny";
      return c.reply("🔎 *Sticker Search:* `" + q + "`\nSend or reply to any image/video with " + c.prefix + "sticker to create a custom sticker.");
    },
    getsticker: async (s, m, a, c) => {
      const quoted = getQuotedMessage(m);
      const found = getMedia(quoted, ["stickerMessage"]);
      if (!found) return c.reply("Reply to a sticker with " + c.prefix + "getsticker");
      try {
        const buffer = await downloadMedia(found.media, "sticker");
        return s.sendMessage(c.from, { sticker: buffer }, { quoted: m });
      } catch (e) {
        return c.reply("❌ getsticker failed: " + e.message);
      }
    },
    stickersearch: async (s, m, a, c) => {
      const q = a.join(" ").trim() || "memes";
      return c.reply("🗂️ *Sticker Pack Query:* *" + q + "*\nUse " + c.prefix + "sticker on any image or " + c.prefix + "emojimix <e1>+<e2>.");
    },
    stickermeme: async (s, m, a, c) => {
      const quoted = getQuotedMessage(m);
      const found = getMedia(quoted, ["imageMessage", "stickerMessage"]);
      const caption = a.join(" ").trim();
      if (!found) return c.reply("Reply to an image or sticker with " + c.prefix + "stickermeme <caption_text>");
      try {
        const buffer = await downloadMedia(found.media, found.type === "stickerMessage" ? "sticker" : "image");
        if (found.type === "stickerMessage") {
          return s.sendMessage(c.from, { sticker: buffer }, { quoted: m });
        }
        return s.sendMessage(c.from, { image: buffer, caption: caption ? "😂 *" + caption + "*" : "😂 Sticker Meme" }, { quoted: m });
      } catch (e) {
        return c.reply("❌ stickermeme failed: " + e.message);
      }
    },
    smeme: async (s, m, a, c) => commands.stickermeme(s, m, a, c),
    stickercrop: async (s, m, a, c) => {
      const quoted = getQuotedMessage(m);
      const found = getMedia(quoted, ["imageMessage", "videoMessage", "stickerMessage"]);
      if (!found) return c.reply("Reply to an image, video, or sticker with " + c.prefix + "stickercrop");
      if (found.type === "stickerMessage") {
        const buf = await downloadMedia(found.media, "sticker");
        return s.sendMessage(c.from, { sticker: buf }, { quoted: m });
      }
      return createSticker(s, m, c, found.type === "videoMessage");
    },
    scrop: async (s, m, a, c) => commands.stickercrop(s, m, a, c),
    stickerblur: async (s, m, a, c) => {
      const quoted = getQuotedMessage(m);
      const found = getMedia(quoted, ["imageMessage", "stickerMessage"]);
      if (!found) return c.reply("Reply to an image or sticker with " + c.prefix + "stickerblur");
      const buf = await downloadMedia(found.media, found.type === "stickerMessage" ? "sticker" : "image");
      return s.sendMessage(c.from, { [found.type === "stickerMessage" ? "sticker" : "image"]: buf }, { quoted: m });
    },
    sblur: async (s, m, a, c) => commands.stickerblur(s, m, a, c),
    circle: async (s, m, a, c) => {
      const quoted = getQuotedMessage(m);
      const found = getMedia(quoted, ["imageMessage", "stickerMessage"]);
      if (!found) return c.reply("Reply to an image or sticker with " + c.prefix + "circle");
      const buf = await downloadMedia(found.media, found.type === "stickerMessage" ? "sticker" : "image");
      return s.sendMessage(c.from, { [found.type === "stickerMessage" ? "sticker" : "image"]: buf }, { quoted: m });
    },
    stickercircle: async (s, m, a, c) => commands.circle(s, m, a, c),
    emojipack: async (s, m, a, c) => {
      const theme = a.join(" ").trim() || "vibes";
      const packs = {
        vibes: "✨🔥💫⚡🎉😎🚀❤️",
        sad: "💔😢🌧️🥀😔😞🖤",
        funny: "😂🤣😹😜🤪🤡💀"
      };
      const set = packs[theme.toLowerCase()] || "🌟🎯🔥💎⚡🎉🎈";
      return c.reply("📦 *Emoji Pack (" + theme + "):*\n" + set);
    },
    stickerpack: async (s, m, a, c) => {
      return c.reply("📦 *" + (C.BOT_NAME || "HIS EXCELLENCY XMD") + " Sticker Pack*\nReply to any photo or short video with " + c.prefix + "sticker to add custom stickers.");
    },
    emoji: async (s, m, a, c) => {
      const word = (a[0] || "").toLowerCase();
      const map = {
        fire: "🔥", heart: "❤️", rocket: "🚀", star: "⭐", check: "✅",
        cross: "❌", skull: "💀", laugh: "😂", cool: "😎", wave: "👋",
        music: "🎵", game: "🎮", crown: "👑", shield: "🛡️"
      };
      const picked = map[word] || "✨🔥💫🎯⚡";
      return c.reply("😀 *Emoji:* " + picked);
    },
    findemoji: async (s, m, a, c) => commands.emoji(s, m, a, c),
    stickerinfo: async (s, m, a, c) => {
      const quoted = getQuotedMessage(m);
      const found = getMedia(quoted, ["stickerMessage"]);
      if (!found) return c.reply("Reply to a sticker with " + c.prefix + "stickerinfo");
      const st = found.media || {};
      return c.reply(
        "ℹ️ *Sticker Info*\n" +
        "Animated: *" + (st.isAnimated ? "Yes" : "No") + "*\n" +
        "Dimensions: *" + (st.width || "?") + "x" + (st.height || "?") + "*\n" +
        "MIME: `" + (st.mimetype || "image/webp") + "`"
      );
    },
    sinfo: async (s, m, a, c) => commands.stickerinfo(s, m, a, c)
  }
};
