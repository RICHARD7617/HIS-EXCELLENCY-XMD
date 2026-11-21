"use strict";

const os = require("os");
const axios = require("axios");
const C = require("../config");

const commands = {
  // ================= BASIC UTILITIES =================
  ping: async (s, m, a, c) => {
    const start = Date.now();
    await c.reply(`🏓 Pong!\n⚡ ${Date.now() - start} ms`);
  },
  alive: async (s, m, a, c) => {
    await c.reply(`👑 ${C.BOT_NAME || "Bot"} is alive!\n⏱ Uptime: ${c.runtime()}`);
  },
  runtime: async (s, m, a, c) => c.reply(`⏱ Uptime: ${c.runtime()}`),
  time: async (s, m, a, c) => {
    const tz = C.TIMEZONE || "Africa/Nairobi";
    await c.reply(`🕒 ${new Date().toLocaleString("en-GB", { timeZone: tz })} (${tz})`);
  },
  platform: async (s, m, a, c) => c.reply(`💻 ${process.platform} / Node ${process.version}`),
  hostip: async (s, m, a, c) => {
    const nets = os.networkInterfaces();
    const lines = Object.entries(nets).flatMap(([n, addrs]) =>
      (addrs || []).filter(x => x.family === "IPv4" && !x.internal).map(x => `• ${n}: ${x.address}`)
    );
    await c.reply(lines.length ? lines.join("\n") : "No external IPv4 interfaces.");
  },
  repo: async (s, m, a, c) => {
    const repoUrl = "https://github.com/RICHARD7617/HIS-EXCELLENCY-XMD";
    const imageUrl = "https://i.ibb.co/m5XvzLZn/789312781119.jpg";

    const caption = `╭─⌈ 🔥𝐇𝐈𝐒 𝐄𝐗𝐂𝐄𝐋𝐋𝐄𝐍𝐂𝐘-𝐗𝐌𝐃|𝟎𝟎𝟏🔥 ⌋
│
│ ✧ *𝐍𝐚𝐦𝐞* : 𝐇𝐢𝐬 𝐗𝐜𝐞𝐥𝐥𝐞𝐧𝐜𝐲 𝐗𝐦𝐝𝟎𝟎𝟏
│ ✧ *𝐎𝐰𝐧𝐞𝐫* : 𝐇𝐢𝐬 𝐗𝐜𝐞𝐥𝐥𝐞𝐧𝐜𝐲
│ ✧ *𝐒𝐭𝐚𝐫𝐬* : 1 ⭐
│ ✧ *𝐅𝐨𝐫𝐤𝐬* : 3 🍴
│ ✧ *𝐒𝐢𝐳𝐞* : 𝟏𝟔𝟏 𝐊𝐁
│ ✧   𝐃𝐨𝐧'𝐭 𝐟𝐨𝐫𝐠𝐞𝐭🔥
│  𝐭𝐨 𝐟𝐨𝐫𝐤 𝐚𝐧𝐝 𝐬𝐭𝐚𝐫 𝐭𝐡𝐞 𝐫𝐞𝐩𝐨.🙏
╰──=
𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐛𝐲 @ᬼ⃝⃪𝐇𝐢𝐬ᬼ⃝⃪ᬼ⃝𝐗𝐜𝐞𝐥𝐥𝐞𝐧𝐜𝐲 ⃝⃪ᬼ⃝✅

*🌐 Repo:* ${repoUrl}`;

    try {
      // Download the image first to prevent "Invalid media" crashes
      const axios = require("axios");
      const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
      const imageBuffer = Buffer.from(response.data, "binary");

      // Send the image with the caption
      await s.sendMessage(c.from, {
        image: imageBuffer,
        caption: caption,
        mimetype: "image/jpeg"
      }, { quoted: m });

    } catch (err) {
      // If the image fails to download, just send the text
      await c.reply(caption);
    }
  },
  // ================= WHATSAPP NATIVE ACTIONS =================
  block: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const targets = m.message?.extendedTextMessage?.contextInfo?.participant || (a[0] ? `${a[0].replace(/\D/g, "")}@s.whatsapp.net` : null);
    if (!targets) return c.reply("Reply to a user or provide a number.");
    await s.updateBlockStatus(targets, "block");
    c.reply(`✅ Blocked ${targets.split("@")[0]}`);
  },
  unblock: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const targets = m.message?.extendedTextMessage?.contextInfo?.participant || (a[0] ? `${a[0].replace(/\D/g, "")}@s.whatsapp.net` : null);
    if (!targets) return c.reply("Reply to a user or provide a number.");
    await s.updateBlockStatus(targets, "unblock");
    c.reply(`✅ Unblocked ${targets.split("@")[0]}`);
  },
  online: async (s, m, a, c) => {
    if (!c.isOwner) return;
    try {
      await s.updateLastSeenPrivacy("all");
      await s.sendPresenceUpdate("available");
      c.reply("✅ Online visibility enabled.");
    } catch (e) { c.reply(`❌ Error: ${e.message}`); }
  },
  lastseen: async (s, m, a, c) => {
    if (!c.isOwner) return;
    try {
      await s.updateLastSeenPrivacy("all");
      c.reply("✅ Last seen privacy set to Everyone.");
    } catch (e) { c.reply(`❌ Error: ${e.message}`); }
  },
  status: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const text = a.join(" ") || "Bot is online!";
    try {
      await s.sendMessage("status@broadcast", { text });
      c.reply("✅ Status posted successfully.");
    } catch (e) { c.reply(`❌ Error: ${e.message}`); }
  },
  about: async (s, m, a, c) => {
    const text = a.join(" ") || "HIS EXCELLENCY XMD";
    try {
      await s.updateProfileStatus(text);
      c.reply(`✅ About updated: ${text}`);
    } catch (e) { c.reply(`❌ Error: ${e.message}`); }
  },
  getpp: async (s, m, a, c) => {
    const jid = m.message?.extendedTextMessage?.contextInfo?.participant || c.sender;
    try {
      const url = await s.profilePictureUrl(jid, 'image');
      await s.sendMessage(c.from, { image: { url }, caption: `🖼️ Profile Picture` });
    } catch {
      c.reply("❌ User has no profile picture or it's private.");
    }
  },
  device: async (s, m, a, c) => {
    const jid = m.message?.extendedTextMessage?.contextInfo?.participant || c.sender;
    const device = jid.includes("@lid") ? "Unknown (LID)" : "WhatsApp Web / Desktop";
    c.reply(`📱 Device Info for ${jid.split("@")[0]}: ${device}`);
  },
  getjid: async (s, m, a, c) => {
    const jid = m.message?.extendedTextMessage?.contextInfo?.participant || c.sender;
    c.reply(`🆔 Your JID: ${jid}\nChat JID: ${c.from}`);
  },

  // ================= TEXT PROCESSORS =================
  define: async (s, m, a, c) => {
    if (!a[0]) return c.reply(`Usage: ${c.prefix}define <word>`);
    try {
      const r = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(a[0])}`, { timeout: 10000 });
      const meaning = r.data?.[0]?.meanings?.[0];
      if (!meaning) return c.reply("No definition found.");
      c.reply(`📖 *${a[0]}* (${meaning.partOfSpeech})\n\n${meaning.definitions?.[0]?.definition}`);
    } catch { c.reply("No definition found."); }
  },
  translate: async (s, m, a, c) => {
    if (a.length < 2) return c.reply(`Usage: ${c.prefix}translate <lang> <text>`);
    const lang = a.shift();
    try {
      const r = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(a.join(" "))}&langpair=en|${lang}`, { timeout: 10000 });
      c.reply(`🌐 *Translated*: ${r.data?.responseData?.translatedText || "Failed"}`);
    } catch (e) { c.reply(`❌ Error: ${e.message}`); }
  },
  iplookup: async (s, m, a, c) => {
    if (!a[0]) return c.reply(`Usage: ${c.prefix}iplookup <ip>`);
    try {
      const r = await axios.get(`http://ip-api.com/json/${a[0]}`, { timeout: 8000 });
      if (r.data?.status !== "success") return c.reply("Lookup failed.");
      c.reply(`🌐 *${a[0]}*\nCountry: ${r.data.country}\nISP: ${r.data.isp}\nCity: ${r.data.city}`);
    } catch (e) { c.reply(`❌ Error: ${e.message}`); }
  },
  weather: async (s, m, a, c) => {
    if (!a.length) return c.reply(`Usage: ${c.prefix}weather <city>`);
    const city = a.join(" ");
    try {
      const r = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { timeout: 10000 });
      const cur = r.data?.current_condition?.[0];
      if (!cur) return c.reply("Weather unavailable.");
      c.reply(`🌤 *${city}*\nTemp: ${cur.temp_C}°C\nHumidity: ${cur.humidity}%\nCondition: ${cur.weatherDesc?.[0]?.value}`);
    } catch (e) { c.reply(`❌ Error: ${e.message}`); }
  },
  shorturl: async (s, m, a, c) => {
    if (!a[0]) return c.reply(`Usage: ${c.prefix}shorturl <url>`);
    try {
      const r = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(a[0])}`, { timeout: 8000 });
      c.reply(`🔗 ${r.data}`);
    } catch (e) { c.reply(`❌ Error: ${e.message}`); }
  },
  qrencode: async (s, m, a, c) => {
    if (!a.length) return c.reply(`Usage: ${c.prefix}qrencode <text>`);
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(a.join(" "))}`;
    await s.sendMessage(c.from, { image: { url }, caption: `QR Code` });
  },

  // ================= MEDIA CONVERTERS (No ffmpeg needed for these) =================
  toimage: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const media = quoted?.stickerMessage || quoted?.documentMessage || quoted?.imageMessage;
    if (!media) return c.reply("❌ Reply to a sticker or document.");
    try {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      const type = quoted.stickerMessage ? "sticker" : "document";
      const stream = await downloadContentFromMessage(media, type);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      await s.sendMessage(c.from, { image: buffer, caption: "✅ Converted to image" }, { quoted: m });
    } catch (e) { c.reply(`❌ Failed: ${e.message}`); }
  },
  save: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) return c.reply("❌ Reply to media to save.");
    let msg = quoted.viewOnceMessageV2?.message || quoted.viewOnceMessageV2Extension?.message || quoted.viewOnceMessage?.message || quoted;
    const type = Object.keys(msg)[0];
    if (!["imageMessage", "videoMessage", "audioMessage"].includes(type)) return c.reply("❌ Not a valid media file.");
    try {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      const stream = await downloadContentFromMessage(msg[type], type.replace("Message", ""));
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      await s.sendMessage(c.from, { [type.replace("Message", "")]: buffer, caption: "✅ Saved" }, { quoted: m });
    } catch (e) { c.reply(`❌ Error: ${e.message}`); }
  }
};

module.exports = { commands };
