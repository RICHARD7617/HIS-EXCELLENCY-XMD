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
  },
  ping2: async (s, m, a, c) => {
    const start = Date.now();
    await c.reply("🏓 Measuring response latency...");
    const ms = Date.now() - start;
    return c.reply("⚡ *Pong 2!*\nRound-trip latency: *" + ms + " ms*");
  },
  videocall: async (s, m, a, c) => {
    const target = a.join(" ").trim() || (c.isGroup ? "this group" : c.sender.split("@")[0]);
    return c.reply("📹 *Video Call Notice*\nRequested for *" + target + "*. Start a video call directly in WhatsApp.");
  },
  voicecall: async (s, m, a, c) => {
    const target = a.join(" ").trim() || (c.isGroup ? "this group" : c.sender.split("@")[0]);
    return c.reply("📞 *Voice Call Notice*\nRequested for *" + target + "*. Start a voice call directly in WhatsApp.");
  },
  remind: async (s, m, a, c) => {
    const mins = Number(a[0]);
    const note = a.slice(1).join(" ").trim();
    if (!mins || mins <= 0 || !note) {
      return c.reply("Usage: " + c.prefix + "remind <minutes> <reminder message>");
    }
    const ms = Math.min(mins * 60 * 1000, 24 * 60 * 60 * 1000);
    await c.reply("⏰ Reminder set for *" + mins + " minute(s)*: " + note);
    setTimeout(() => {
      s.sendMessage(c.from, { text: "⏰ *Reminder:* " + note }).catch(() => {});
    }, ms);
  },
  sessioninfo: async (s, m, a, c) => {
    const userId = s.user?.id || "Not connected";
    const userName = s.user?.name || C.BOT_NAME || "HIS EXCELLENCY XMD";
    const up = Math.floor(process.uptime());
    return c.reply(
      "🔐 *Session Info*\n" +
      "Account: *" + userName + "*\n" +
      "JID: `" + userId + "`\n" +
      "Mode: *" + (C.MODE || "PUBLIC") + "*\n" +
      "Uptime: *" + Math.floor(up / 3600) + "h " + Math.floor((up % 3600) / 60) + "m*"
    );
  },
  genmusic: async (s, m, a, c) => {
    const topic = a.join(" ").trim() || "upbeat afrobeats synth";
    return c.reply(
      "🎵 *Music Track Blueprint*\n" +
      "Theme: *" + topic + "*\n" +
      "Tempo: *112 BPM* | Key: *F Minor*\n" +
      "Structure: Intro (8 bars) → Hook/Chorus → Verse 1 → Drop → Bridge → Outro"
    );
  },
  genlyrics: async (s, m, a, c) => {
    const topic = a.join(" ").trim() || "chasing dreams at midnight";
    return c.reply(
      "🎤 *Lyrics Draft — " + topic + "*\n\n" +
      "[Verse]\nLights low on the city street,\nEvery step keeps a steady beat,\nNo looking back at what slipped away,\nWe write the story of a brand new day.\n\n" +
      "[Chorus]\nRise up higher, feel the spark,\nTurning shadows into light in the dark!"
    );
  },
  musicprompt: async (s, m, a, c) => {
    const style = a.join(" ").trim() || "cinematic ambient";
    return c.reply(
      "🎼 *AI Music Prompt*\n" +
      "`" + style + ", warm analog pads, crisp percussion, dynamic build, studio mastering, high clarity, 4k audio`"
    );
  },
  news: async (s, m, a, c) => {
    const q = a.join(" ").trim() || "technology";
    try {
      const res = await fetch("https://hn.algolia.com/api/v1/search?query=" + encodeURIComponent(q) + "&tags=story&hitsPerPage=5");
      const data = await res.json().catch(() => ({}));
      const hits = data?.hits || [];
      if (!hits.length) return c.reply("❌ No news headlines found for *" + q + "*.");
      const lines = hits.map((h, i) => (i + 1) + ". *" + (h.title || "Untitled") + "*\n   " + (h.url || ("https://news.ycombinator.com/item?id=" + h.objectID)));
      return c.reply("📰 *Top Headlines (" + q + ")*\n\n" + lines.join("\n\n"));
    } catch (e) {
      return c.reply("❌ news lookup failed: " + e.message);
    }
  },
  covid: async (s, m, a, c) => {
    const place = a.join(" ").trim() || "world";
    try {
      const endpoint = place.toLowerCase() === "world" || place.toLowerCase() === "global"
        ? "https://disease.sh/v3/covid-19/all"
        : "https://disease.sh/v3/covid-19/countries/" + encodeURIComponent(place);
      const res = await fetch(endpoint);
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.message) return c.reply("❌ Could not fetch COVID stats for *" + place + "*.");
      return c.reply(
        "🩺 *COVID-19 Summary (" + (d.country || "Global") + ")*\n" +
        "Cases: *" + Number(d.cases || 0).toLocaleString() + "*\n" +
        "Active: *" + Number(d.active || 0).toLocaleString() + "*\n" +
        "Recovered: *" + Number(d.recovered || 0).toLocaleString() + "*\n" +
        "Deaths: *" + Number(d.deaths || 0).toLocaleString() + "*"
      );
    } catch (e) {
      return c.reply("❌ covid lookup failed: " + e.message);
    }
  },
  wiki: async (s, m, a, c) => {
    const query = a.join(" ").trim();
    if (!query) return c.reply("Usage: " + c.prefix + "wiki <search term>");
    try {
      const res = await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(query));
      if (!res.ok) return c.reply("❌ No Wikipedia article found for *" + query + "*.");
      const d = await res.json();
      return c.reply(
        "📚 *" + (d.title || query) + "*\n\n" +
        String(d.extract || "No summary available.").slice(0, 1000) +
        (d.content_urls?.desktop?.page ? "\n\n🔗 " + d.content_urls.desktop.page : "")
      );
    } catch (e) {
      return c.reply("❌ wiki lookup failed: " + e.message);
    }
  },
  getip: async (s, m, a, c) => {
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      const d = await res.json();
      return c.reply("🌐 *Host Public IP:* `" + (d.ip || "Unknown") + "`");
    } catch (e) {
      return c.reply("❌ getip failed: " + e.message);
    }
  },
  prefixinfo: async (s, m, a, c) => {
    return c.reply(
      "⌨️ *Prefix & Command Info*\n" +
      "Active Prefix: `" + c.prefix + "`\n" +
      "Bot Name: *" + (C.BOT_NAME || "HIS EXCELLENCY XMD") + "*\n" +
      "Mode: *" + (C.MODE || "PUBLIC") + "*"
    );
  },
  onwhatsapp: async (s, m, a, c) => {
    const raw = a[0] || c.sender || "";
    const num = String(raw).split("@")[0].split(":")[0].replace(/\D/g, "");
    if (!num) return c.reply("Usage: " + c.prefix + "onwhatsapp <phone_number>");
    try {
      const jid = num + "@s.whatsapp.net";
      const list = await s.onWhatsApp(jid);
      const exists = Array.isArray(list) && list[0]?.exists;
      return c.reply("📱 Number *+" + num + "*: " + (exists ? "✅ Registered on WhatsApp" : "❌ Not registered on WhatsApp"));
    } catch (e) {
      return c.reply("❌ onwhatsapp check failed: " + e.message);
    }
  },
  country: async (s, m, a, c) => {
    const query = a.join(" ").trim();
    if (!query) return c.reply("Usage: " + c.prefix + "country <country name or code>");
    try {
      const res = await fetch("https://restcountries.com/v3.1/name/" + encodeURIComponent(query) + "?fields=name,capital,region,subregion,population,cca2,currencies");
      const list = await res.json().catch(() => []);
      const item = Array.isArray(list) ? list[0] : null;
      if (!item) return c.reply("❌ Country *" + query + "* not found.");
      const curr = item.currencies ? Object.keys(item.currencies).join(", ") : "N/A";
      return c.reply(
        "🏳️ *" + (item.name?.common || query) + "* (" + (item.cca2 || "") + ")\n" +
        "🏛️ Capital: *" + ((item.capital && item.capital[0]) || "N/A") + "*\n" +
        "🌍 Region: *" + (item.region || "N/A") + "* (" + (item.subregion || "N/A") + ")\n" +
        "👥 Population: *" + Number(item.population || 0).toLocaleString() + "*\n" +
        "💱 Currency: *" + curr + "*"
      );
    } catch (e) {
      return c.reply("❌ country lookup failed: " + e.message);
    }
  },
  fetch: async (s, m, a, c) => {
    let url = (a[0] || "").trim();
    if (!url) return c.reply("Usage: " + c.prefix + "fetch <https://example.com>");
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "HIS-EXCELLENCY-XMD/1.0" } });
      const ct = res.headers.get("content-type") || "text/plain";
      const body = await res.text();
      return c.reply(
        "📡 *HTTP Fetch Result*\n" +
        "URL: " + url + "\n" +
        "Status: *" + res.status + " " + res.statusText + "*\n" +
        "Type: `" + ct + "`\n\n" +
        body.slice(0, 1200)
      );
    } catch (e) {
      return c.reply("❌ fetch failed: " + e.message);
    }
  },
  take: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const pack = a.join(" ").trim() || (C.BOT_NAME || "HIS EXCELLENCY XMD");
    if (quoted?.stickerMessage) {
      try {
        const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
        const stream = await downloadContentFromMessage(quoted.stickerMessage, "sticker");
        let buf = Buffer.from([]);
        for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
        return s.sendMessage(c.from, { sticker: buf }, { quoted: m });
      } catch (e) {
        return c.reply("❌ take failed: " + e.message);
      }
    }
    const text = quoted?.conversation || quoted?.extendedTextMessage?.text || a.join(" ").trim();
    if (text) return c.reply("📦 *Taken (" + pack + "):*\n" + text);
    return c.reply("Reply to a sticker or message with " + c.prefix + "take [pack_name]");
  },
  imgbb: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg = m.message?.imageMessage || quoted?.imageMessage;
    if (!imgMsg) return c.reply("Reply to or send an image with " + c.prefix + "imgbb");
    try {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      const stream = await downloadContentFromMessage(imgMsg, "image");
      let buf = Buffer.from([]);
      for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
      const form = new FormData();
      form.append("reqtype", "fileupload");
      form.append("fileToUpload", new Blob([buf], { type: "image/jpeg" }), "upload.jpg");
      const res = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: form });
      const link = (await res.text()).trim();
      if (!link.startsWith("http")) return c.reply("❌ Upload failed: " + link);
      return c.reply("🖼️ *Image Hosted*\n🔗 Direct Link: " + link);
    } catch (e) {
      return c.reply("❌ imgbb upload failed: " + e.message);
    }
  },
  rename: async (s, m, a, c) => {
    const newName = a.join(" ").trim();
    if (!newName) return c.reply("Usage: " + c.prefix + "rename <new_filename.ext> (reply to a document)");
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const doc = quoted?.documentMessage;
    if (!doc) return c.reply("❌ Reply to a document message with " + c.prefix + "rename <name>");
    try {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      const stream = await downloadContentFromMessage(doc, "document");
      let buf = Buffer.from([]);
      for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
      const safeName = /\.[a-z0-9]{1,8}$/i.test(newName) ? newName : (newName + "_" + (doc.fileName || "file.bin"));
      return s.sendMessage(c.from, {
        document: buf,
        fileName: safeName,
        mimetype: doc.mimetype || "application/octet-stream"
      }, { quoted: m });
    } catch (e) {
      return c.reply("❌ rename failed: " + e.message);
    }
  },
  screenshot: async (s, m, a, c) => {
    let url = (a[0] || "").trim();
    if (!url) return c.reply("Usage: " + c.prefix + "screenshot <https://example.com>");
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    const shotUrl = "https://image.thum.io/get/width/1280/crop/800/" + url;
    try {
      await s.sendMessage(c.from, { image: { url: shotUrl }, caption: "📸 Screenshot: " + url }, { quoted: m });
    } catch {
      return c.reply("📸 *Screenshot Preview Link:* " + shotUrl);
    }
  },
  inspect: async (s, m, a, c) => {
    const input = (a[0] || "").trim();
    if (!input) return c.reply("Usage: " + c.prefix + "inspect <url or whatsapp_invite_link>");
    const codeMatch = input.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
    if (codeMatch && typeof s.groupGetInviteInfo === "function") {
      try {
        const info = await s.groupGetInviteInfo(codeMatch[1]);
        return c.reply(
          "🔍 *Group Invite Inspection*\n" +
          "Subject: *" + (info.subject || "N/A") + "*\n" +
          "ID: `" + (info.id || "N/A") + "`\n" +
          "Participants: *" + (info.size || "N/A") + "*\n" +
          "Creation: *" + (info.creation ? new Date(info.creation * 1000).toISOString().slice(0, 10) : "N/A") + "*"
        );
      } catch (e) {
        return c.reply("❌ Group inspect failed: " + e.message);
      }
    }
    const target = /^https?:\/\//i.test(input) ? input : "https://" + input;
    try {
      const res = await fetch(target, { headers: { "User-Agent": "HIS-EXCELLENCY-XMD/1.0" } });
      const html = await res.text();
      const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "No title").replace(/\s+/g, " ").trim();
      return c.reply(
        "🔍 *URL Inspection*\n" +
        "URL: " + target + "\n" +
        "Status: *" + res.status + "*\n" +
        "Title: *" + title + "*\n" +
        "Server: `" + (res.headers.get("server") || "N/A") + "`"
      );
    } catch (e) {
      return c.reply("❌ inspect failed: " + e.message);
    }
  },
  tosticker: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg = m.message?.imageMessage || quoted?.imageMessage;
    const vidMsg = m.message?.videoMessage || quoted?.videoMessage;
    if (!imgMsg && !vidMsg) return c.reply("Reply to or send an image/video with " + c.prefix + "tosticker");
    try {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      const kind = imgMsg ? "image" : "video";
      const media = imgMsg || vidMsg;
      const stream = await downloadContentFromMessage(media, kind);
      let buf = Buffer.from([]);
      for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
      return s.sendMessage(c.from, { sticker: buf }, { quoted: m });
    } catch (e) {
      return c.reply("❌ tosticker failed: " + e.message);
    }
  },
  toaudio: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const audioMsg = quoted?.audioMessage || quoted?.videoMessage;
    if (!audioMsg) return c.reply("Reply to an audio or video message with " + c.prefix + "toaudio");
    try {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      const kind = quoted.audioMessage ? "audio" : "video";
      const stream = await downloadContentFromMessage(audioMsg, kind);
      let buf = Buffer.from([]);
      for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
      return s.sendMessage(c.from, { audio: buf, mimetype: "audio/mpeg", ptt: false }, { quoted: m });
    } catch (e) {
      return c.reply("❌ toaudio failed: " + e.message);
    }
  },
  tovoice: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const audioMsg = quoted?.audioMessage || quoted?.videoMessage;
    if (!audioMsg) return c.reply("Reply to an audio or video message with " + c.prefix + "tovoice");
    try {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      const kind = quoted.audioMessage ? "audio" : "video";
      const stream = await downloadContentFromMessage(audioMsg, kind);
      let buf = Buffer.from([]);
      for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
      return s.sendMessage(c.from, { audio: buf, mimetype: "audio/mp4", ptt: true }, { quoted: m });
    } catch (e) {
      return c.reply("❌ tovoice failed: " + e.message);
    }
  },
  tts: async (s, m, a, c) => {
    const text = a.join(" ").trim() || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || "";
    if (!text) return c.reply("Usage: " + c.prefix + "tts <text to speak>");
    const speechUrl = "https://translate.google.com/translate_tts?ie=UTF-8&q=" + encodeURIComponent(text.slice(0, 200)) + "&tl=en&client=tw-ob";
    try {
      const res = await fetch(speechUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) return c.reply("🗣️ *TTS Text:* " + text);
      const arr = await res.arrayBuffer();
      const buf = Buffer.from(arr);
      return s.sendMessage(c.from, { audio: buf, mimetype: "audio/mpeg", ptt: true }, { quoted: m });
    } catch {
      return c.reply("🗣️ *TTS Text:* " + text);
    }
  },
  trebleboost: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const audioMsg = quoted?.audioMessage;
    if (!audioMsg) return c.reply("Reply to an audio message with " + c.prefix + "trebleboost");
    try {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      const stream = await downloadContentFromMessage(audioMsg, "audio");
      let buf = Buffer.from([]);
      for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
      return s.sendMessage(c.from, { audio: buf, mimetype: "audio/mpeg", ptt: false }, { quoted: m });
    } catch (e) {
      return c.reply("❌ trebleboost failed: " + e.message);
    }
  },
  jarvis: async (s, m, a, c) => {
    const prompt = a.join(" ").trim();
    if (!prompt) return c.reply("🤖 *JARVIS:* Online and ready. Ask anything with " + c.prefix + "jarvis <prompt>");
    return c.reply("🤖 *JARVIS:* Processing *" + prompt + "* — system diagnostics nominal. Use AI commands for deep reasoning or let me know what specific task you want to run.");
  },
  topdf: async (s, m, a, c) => {
    const text = a.join(" ").trim() || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || "Generated by HIS EXCELLENCY XMD";
    const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const pdf = Buffer.from(
      "%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n" +
      "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n" +
      "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n" +
      "4 0 obj << /Length " + (escaped.length + 32) + " >> stream\nBT /F1 12 Tf 50 720 Td (" + escaped.slice(0, 500) + ") Tj ET\nendstream endobj\n" +
      "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n" +
      "xref\n0 6\n0000000000 65535 f \ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n9\n%%EOF"
    );
    return s.sendMessage(c.from, { document: pdf, fileName: "document.pdf", mimetype: "application/pdf" }, { quoted: m });
  },
  extractpdf: async (s, m, a, c) => {
    const doc = m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage;
    if (!doc) return c.reply("Reply to a PDF document with " + c.prefix + "extractpdf");
    try {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      const stream = await downloadContentFromMessage(doc, "document");
      let buf = Buffer.from([]);
      for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
      const raw = buf.toString("latin1").match(/[A-Za-z0-9 .,;:!?()\-]{4,}/g) || [];
      const snippet = raw.join(" ").replace(/\s+/g, " ").trim().slice(0, 1200);
      return c.reply("📄 *Extracted PDF Text (" + (doc.fileName || "file.pdf") + "):*\n\n" + (snippet || "No plain text stream found."));
    } catch (e) {
      return c.reply("❌ extractpdf failed: " + e.message);
    }
  },
  toword: async (s, m, a, c) => {
    const text = a.join(" ").trim() || m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || "Generated by HIS EXCELLENCY XMD";
    const buf = Buffer.from(text, "utf8");
    return s.sendMessage(c.from, { document: buf, fileName: "document.doc", mimetype: "application/msword" }, { quoted: m });
  },
  extractword: async (s, m, a, c) => {
    const doc = m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage;
    if (!doc) return c.reply("Reply to a Word document with " + c.prefix + "extractword");
    try {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      const stream = await downloadContentFromMessage(doc, "document");
      let buf = Buffer.from([]);
      for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
      const clean = buf.toString("utf8").replace(/<[^>]+>/g, " ").replace(/[^\x20-\x7E\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200);
      return c.reply("📝 *Extracted Word Text:*\n\n" + (clean || "No readable text found."));
    } catch (e) {
      return c.reply("❌ extractword failed: " + e.message);
    }
  },
  toexcel: async (s, m, a, c) => {
    const input = a.join(" ").trim() || "Item,Value\nSample,100";
    const csv = input.includes(",") ? input.replace(/\s*\|\s*/g, "\n") : "Entry,Value\n" + input.replace(/,/g, " ");
    return s.sendMessage(c.from, { document: Buffer.from(csv, "utf8"), fileName: "spreadsheet.csv", mimetype: "text/csv" }, { quoted: m });
  },
  extractexcel: async (s, m, a, c) => {
    const doc = m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage;
    if (!doc) return c.reply("Reply to a spreadsheet/CSV file with " + c.prefix + "extractexcel");
    try {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      const stream = await downloadContentFromMessage(doc, "document");
      let buf = Buffer.from([]);
      for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
      const text = buf.toString("utf8").replace(/[^\x20-\x7E\n]/g, " ").trim().slice(0, 1200);
      return c.reply("📊 *Extracted Sheet Data:*\n\n" + (text || "No readable rows found."));
    } catch (e) {
      return c.reply("❌ extractexcel failed: " + e.message);
    }
  },
  toppt: async (s, m, a, c) => {
    const slides = (a.join(" ").trim() || "Slide 1: Overview | Slide 2: Key Points | Slide 3: Summary")
      .split("|")
      .map((sText, idx) => "=== SLIDE " + (idx + 1) + " ===\n" + sText.trim())
      .join("\n\n");
    return s.sendMessage(c.from, { document: Buffer.from(slides, "utf8"), fileName: "presentation.txt", mimetype: "text/plain" }, { quoted: m });
  },
  extractppt: async (s, m, a, c) => {
    const doc = m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage;
    if (!doc) return c.reply("Reply to a presentation file with " + c.prefix + "extractppt");
    try {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      const stream = await downloadContentFromMessage(doc, "document");
      let buf = Buffer.from([]);
      for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
      const text = buf.toString("utf8").replace(/<[^>]+>/g, " ").replace(/[^\x20-\x7E\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200);
      return c.reply("📽️ *Extracted Presentation Text:*\n\n" + (text || "No readable text found."));
    } catch (e) {
      return c.reply("❌ extractppt failed: " + e.message);
    }
  },
  search: async (s, m, a, c) => {
    const q = a.join(" ").trim();
    if (!q) return c.reply("Usage: " + c.prefix + "search <query>");
    try {
      const res = await fetch("https://en.wikipedia.org/w/api.php?action=opensearch&search=" + encodeURIComponent(q) + "&limit=5&namespace=0&format=json");
      const data = await res.json().catch(() => []);
      const titles = data?.[1] || [];
      const urls = data?.[3] || [];
      if (!titles.length) return c.reply("❌ No search results found for *" + q + "*.");
      const lines = titles.map((t, i) => (i + 1) + ". *" + t + "*\n   " + (urls[i] || ""));
      return c.reply("🔍 *Search Results: " + q + "*\n\n" + lines.join("\n\n"));
    } catch (e) {
      return c.reply("❌ search failed: " + e.message);
    }
  },
  anime: async (s, m, a, c) => {
    const q = a.join(" ").trim();
    if (!q) return c.reply("Usage: " + c.prefix + "anime <title>");
    try {
      const res = await fetch("https://api.jikan.moe/v4/anime?q=" + encodeURIComponent(q) + "&limit=1");
      const data = await res.json().catch(() => ({}));
      const item = data?.data?.[0];
      if (!item) return c.reply("❌ Anime *" + q + "* not found.");
      const syn = (item.synopsis || "").replace(/\s+/g, " ").trim().slice(0, 400);
      return c.reply(
        "🌸 *Anime: " + (item.title_english || item.title) + "*\n" +
        "⭐ Score: *" + (item.score || "N/A") + "* | Episodes: *" + (item.episodes || "N/A") + "*\n" +
        "📺 Status: *" + (item.status || "N/A") + "*\n" +
        "📝 " + (syn || "No synopsis.") + "\n" +
        (item.url ? "🔗 " + item.url : "")
      );
    } catch (e) {
      return c.reply("❌ anime lookup failed: " + e.message);
    }
  },
  manga: async (s, m, a, c) => {
    const q = a.join(" ").trim();
    if (!q) return c.reply("Usage: " + c.prefix + "manga <title>");
    try {
      const res = await fetch("https://api.jikan.moe/v4/manga?q=" + encodeURIComponent(q) + "&limit=1");
      const data = await res.json().catch(() => ({}));
      const item = data?.data?.[0];
      if (!item) return c.reply("❌ Manga *" + q + "* not found.");
      const syn = (item.synopsis || "").replace(/\s+/g, " ").trim().slice(0, 400);
      return c.reply(
        "📚 *Manga: " + (item.title_english || item.title) + "*\n" +
        "⭐ Score: *" + (item.score || "N/A") + "* | Chapters: *" + (item.chapters || "N/A") + "*\n" +
        "📖 Status: *" + (item.status || "N/A") + "*\n" +
        "📝 " + (syn || "No synopsis.") + "\n" +
        (item.url ? "🔗 " + item.url : "")
      );
    } catch (e) {
      return c.reply("❌ manga lookup failed: " + e.message);
    }
  },
  urban: async (s, m, a, c) => {
    const term = a.join(" ").trim();
    if (!term) return c.reply("Usage: " + c.prefix + "urban <term>");
    try {
      const res = await fetch("https://api.urbandictionary.com/v0/define?term=" + encodeURIComponent(term));
      const data = await res.json().catch(() => ({}));
      const entry = data?.list?.[0];
      if (!entry) return c.reply("❌ No Urban Dictionary entry for *" + term + "*.");
      const def = String(entry.definition || "").replace(/\[|\]/g, "").trim().slice(0, 500);
      const ex = String(entry.example || "").replace(/\[|\]/g, "").trim().slice(0, 250);
      return c.reply(
        "🏙️ *Urban Dictionary: " + entry.word + "*\n\n" +
        def + (ex ? "\n\n_Example:_ " + ex : "")
      );
    } catch (e) {
      return c.reply("❌ urban lookup failed: " + e.message);
    }
  },
  tr: async (s, m, a, c) => {
    if (!commands.translate) return c.reply("Usage: " + c.prefix + "tr <lang> <text>");
    return commands.translate(s, m, a, c);
  },
  calc: async (s, m, a, c) => {
    const expr = a.join(" ").trim();
    if (!expr) return c.reply("Usage: " + c.prefix + "calc <expression>");
    if (!/^[0-9+\-*/().%\s^]+$/.test(expr)) {
      return c.reply("❌ Invalid characters in expression.");
    }
    try {
      const normalized = expr.replace(/\^/g, "**");
      const result = Function("\"use strict\"; return (" + normalized + ");")();
      if (typeof result !== "number" || !Number.isFinite(result)) {
        return c.reply("❌ Calculation produced a non-finite result.");
      }
      return c.reply("🧮 *" + expr + "* = *" + result + "*");
    } catch {
      return c.reply("❌ Could not evaluate expression.");
    }
  },
  currency: async (s, m, a, c) => {
    const amount = Number(a[0]);
    const from = (a[1] || "").toUpperCase();
    const to = (a[2] || "").toUpperCase();
    if (!Number.isFinite(amount) || !from || !to) {
      return c.reply("Usage: " + c.prefix + "currency <amount> <FROM> <TO> (e.g. " + c.prefix + "currency 100 USD KES)");
    }
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/" + encodeURIComponent(from));
      const data = await res.json().catch(() => ({}));
      const rate = data?.rates?.[to];
      if (!rate) return c.reply("❌ Currency pair *" + from + " -> " + to + "* not supported.");
      const converted = (amount * rate).toFixed(2);
      return c.reply(
        "💱 *Currency Conversion*\n" +
        amount.toLocaleString() + " *" + from + "* = *" + Number(converted).toLocaleString() + " " + to + "*\n" +
        "Rate: 1 " + from + " = " + rate + " " + to
      );
    } catch (e) {
      return c.reply("❌ currency lookup failed: " + e.message);
    }
  }
};


commands.text = async (s, m, a, c) => {
  const body = a.join(" ").trim();
  if (!body) return c.reply("Usage: " + c.prefix + "text <message>");
  return c.reply(body);
};
commands.create = async (s, m, a, c) => {
  const title = a.join(" ").trim() || "New Item";
  return c.reply("✅ Created *" + title + "*.");
};

module.exports = { commands };
