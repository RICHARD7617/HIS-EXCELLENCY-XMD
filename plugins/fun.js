"use strict";

const axios = require("axios");

const commands = {
  joke: async (s, m, a, c) => {
    try {
      const r = await axios.get("https://official-joke-api.appspot.com/random_joke", { timeout: 8000 });
      await c.reply(`😂 ${r.data.setup}\n\n${r.data.punchline}`);
    } catch { await c.reply("Could not fetch a joke right now."); }
  },
  quote: async (s, m, a, c) => {
    try {
      const r = await axios.get("https://api.quotable.io/random", { timeout: 8000 });
      await c.reply(`💬 "${r.data.content}"\n\n— ${r.data.author}`);
    } catch { await c.reply("Could not fetch a quote right now."); }
  },
  truth: async (s, m, a, c) => {
    const list = [
      "What's your most embarrassing moment?",
      "Have you ever lied to your best friend?",
      "What's the last thing you searched on Google?",
      "Who in this group would you trade lives with?",
      "What's a secret you've never told anyone?"
    ];
    await c.reply(`🎯 *Truth:* ${list[Math.floor(Math.random() * list.length)]}`);
  },
  dare: async (s, m, a, c) => {
    const list = [
      "Send a voice note singing your favorite song.",
      "Change your profile picture to a cartoon for 1 hour.",
      "Message the last person you texted 'I love you'.",
      "Post the oldest photo in your gallery.",
      "Say the alphabet backwards in a voice note."
    ];
    await c.reply(`🔥 *Dare:* ${list[Math.floor(Math.random() * list.length)]}`);
  },
  goodmorning: async (s, m, a, c) => c.reply(`🌅 Good morning, ${m.pushName || "friend"}! Have a great day.`),
  goodnight: async (s, m, a, c) => c.reply(`🌙 Good night, ${m.pushName || "friend"}. Sleep well.`),
  device: async (s, m, a, c) => {
    const q = m.message?.extendedTextMessage?.contextInfo?.participant || c.sender;
    await c.reply(`Device info requires a WhatsApp presence lookup, which is unreliable on linked devices. Requested for ${q.split("@")[0]}.`);
  },
  getjid: async (s, m, a, c) => c.reply(`Your JID: ${c.sender}\nChat JID: ${c.from}`),
  bf: async (s, m, a, c) => {
    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const target = a.join(" ").trim() || (mentioned ? "@" + mentioned.split("@")[0].split(":")[0] : "a lucky match");
    const pct = Math.floor(Math.random() * 101);
    return c.reply("💙 *Bestie / BF Meter*\nTarget: *" + target + "*\nCompatibility: *" + pct + "%*");
  },
  gf: async (s, m, a, c) => {
    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const target = a.join(" ").trim() || (mentioned ? "@" + mentioned.split("@")[0].split(":")[0] : "a lucky match");
    const pct = Math.floor(Math.random() * 101);
    return c.reply("💖 *GF Meter*\nTarget: *" + target + "*\nCompatibility: *" + pct + "%*");
  },
  couple: async (s, m, a, c) => {
    const u1 = m.pushName || c.sender.split("@")[0];
    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const u2 = a.join(" ").trim() || (mentioned ? "@" + mentioned.split("@")[0].split(":")[0] : "Mystery Partner");
    const pct = Math.floor(Math.random() * 101);
    return c.reply("💞 *Couple Match*\n*" + u1 + "* ❤️ *" + u2 + "*\nMatch Score: *" + pct + "%*");
  },
  gay: async (s, m, a, c) => {
    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const target = a.join(" ").trim() || (mentioned ? "@" + mentioned.split("@")[0].split(":")[0] : (m.pushName || "User"));
    const pct = Math.floor(Math.random() * 101);
    return c.reply("🏳️‍🌈 *Meter for " + target + "*: *" + pct + "%*");
  },
  movie: async (s, m, a, c) => {
    const query = a.join(" ").trim();
    if (!query) return c.reply("Usage: " + c.prefix + "movie <title>");
    try {
      const res = await fetch("https://api.tvmaze.com/singlesearch/shows?q=" + encodeURIComponent(query));
      if (!res.ok) return c.reply("❌ No movie/show details found for *" + query + "*.");
      const d = await res.json();
      const summary = String(d.summary || "").replace(/<[^>]+>/g, "").slice(0, 350);
      return c.reply(
        "🎬 *" + d.name + "* (" + (d.premiered || "N/A") + ")\n" +
        "⭐ Rating: *" + (d.rating?.average || "N/A") + "* | 🎭 Genres: *" + ((d.genres || []).join(", ") || "N/A") + "*\n" +
        (summary ? "📝 " + summary + "\n" : "") +
        (d.url ? "🔗 " + d.url : "")
      );
    } catch (e) {
      return c.reply("❌ movie lookup failed: " + e.message);
    }
  },
  trailer: async (s, m, a, c) => {
    const query = a.join(" ").trim();
    if (!query) return c.reply("Usage: " + c.prefix + "trailer <movie or show title>");
    try {
      const res = await fetch("https://itunes.apple.com/search?term=" + encodeURIComponent(query + " trailer") + "&media=movie&limit=3");
      const data = await res.json().catch(() => ({}));
      const item = data?.results?.[0];
      if (!item) return c.reply("❌ No trailer found for *" + query + "*.");
      return c.reply(
        "🎞️ *Trailer: " + (item.trackName || query) + "*\n" +
        (item.releaseDate ? "📅 Release: *" + item.releaseDate.slice(0, 10) + "*\n" : "") +
        "▶️ Preview/Link: " + (item.previewUrl || item.trackViewUrl || "N/A")
      );
    } catch (e) {
      return c.reply("❌ trailer search failed: " + e.message);
    }
  },
  readsite: async (s, m, a, c) => {
    let url = (a[0] || "").trim();
    if (!url) return c.reply("Usage: " + c.prefix + "readsite <https://example.com>");
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "HIS-EXCELLENCY-XMD/1.0" } });
      if (!res.ok) return c.reply("❌ Failed to fetch site (HTTP " + res.status + ").");
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : url;
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1200);
      return c.reply("🌐 *" + title + "*\n🔗 " + url + "\n\n" + (text || "(No readable text extracted)"));
    } catch (e) {
      return c.reply("❌ readsite failed: " + e.message);
    }
  },
  channelstatus: async (s, m, a, c) => {
    const db = c.db();
    const ch = db?.bot?.channelJid || db?.bot?.channel || process.env.CHANNEL_JID || "Not configured";
    const upSec = Math.floor(process.uptime());
    const hrs = Math.floor(upSec / 3600);
    const mins = Math.floor((upSec % 3600) / 60);
    return c.reply(
      "📡 *Channel & Bot Status*\n" +
      "Bot: *" + (C.BOT_NAME || "HIS EXCELLENCY XMD") + "*\n" +
      "Mode: *" + (C.MODE || "PUBLIC") + "*\n" +
      "Channel: `" + ch + "`\n" +
      "Uptime: *" + hrs + "h " + mins + "m*"
    );
  },
  hack: async (s, m, a, c) => {
    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const target = a.join(" ").trim() || (mentioned ? "@" + mentioned.split("@")[0].split(":")[0] : (m.pushName || "target"));
    const steps = [
      "💻 *Initializing Fun Hack Sequence on " + target + "...*",
      "🔌 Bypassing firewall... [28%]",
      "📡 Injecting comedic payload... [67%]",
      "💾 Downloading 420 memes & 0 classified files... [100%]",
      "✅ *Prank Complete:* " + target + " has been diagnosed with excessive coolness 😎"
    ];
    for (const step of steps) {
      await c.reply(step);
    }
  }
};

module.exports = { commands };
