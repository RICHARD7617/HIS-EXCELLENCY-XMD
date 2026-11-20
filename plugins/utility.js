"use strict";

const os = require("os");
const C = require("../config");

function bytes(n) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)}${units[i]}`;
}

const commands = {
  ping2: async (s, m, a, c) => {
    const start = Date.now();
    await c.reply(`🏓 Pong!\n⚡ Round-trip: ${Date.now() - start}ms`);
  },
  time: async (s, m, a, c) => {
    const tz = C.TIMEZONE || "Africa/Nairobi";
    await c.reply(`🕒 ${new Date().toLocaleString("en-GB", { timeZone: tz })} (${tz})`);
  },
  uptime: async (s, m, a, c) => c.reply(`⏱ ${c.runtime()}`),
  platform: async (s, m, a, c) => c.reply(`💻 ${process.platform} / Node ${process.version}`),
  hostip: async (s, m, a, c) => {
    const nets = os.networkInterfaces();
    const lines = Object.entries(nets).flatMap(([n, addrs]) =>
      (addrs || []).filter(x => x.family === "IPv4" && !x.internal).map(x => `• ${n}: ${x.address}`)
    );
    await c.reply(lines.length ? lines.join("\n") : "No external IPv4 interfaces found.");
  },
  disk: async (s, m, a, c) => {
    try {
      const stat = require("fs").statSync("/");
      await c.reply(`💾 Root filesystem total: ${bytes(stat.size || 0)}`);
    } catch {
      await c.reply("Disk info not available on this platform.");
    }
  },
  envkeys: async (s, m, a, c) => {
    if (!c.isOwner) return c.reply("Owner only.");
    const keys = Object.keys(C.API_KEYS || {});
    const set = keys.filter(k => C.API_KEYS[k]);
    const missing = keys.filter(k => !C.API_KEYS[k]);
    await c.reply(
      `🔑 *API keys*\n\n✅ Set (${set.length}): ${set.join(", ") || "none"}\n❌ Missing (${missing.length}): ${missing.join(", ") || "none"}`
    );
  },
  getip: async (s, m, a, c) => {
    try {
      const axios = require("axios");
      const r = await axios.get("https://api.ipify.org?format=json", { timeout: 8000 });
      await c.reply(`🌐 Public IP: ${r.data.ip}`);
    } catch (e) { await c.reply(`❌ ${e.message}`); }
  },
  sessioninfo: async (s, m, a, c) => {
    const sess = s.user || {};
    await c.reply(
      `📱 *Session*\n\nID: ${sess.id || "unknown"}\nName: ${sess.name || "unknown"}\nUptime: ${c.runtime()}`
    );
  },
  about: async (s, m, a, c) => c.reply(`${C.BOT_NAME || "Bot"} v${C.VERSION || "1.1.7"} — ${C.OWNER_NAME || "Owner"}`),
  repo: async (s, m, a, c) => c.reply("📦 https://github.com/RICHARD7617/HIS-EXCELLENCY-XMD"),
  prefixinfo: async (s, m, a, c) => c.reply(`Current prefix: ${C.PREFIX || "."}`),
  onwhatsapp: async (s, m, a, c) => {
    if (!a[0]) return c.reply(`Usage: ${c.prefix}onwhatsapp <number>`);
    const n = a[0].replace(/\D/g, "");
    try {
      const [result] = await s.onWhatsApp(`${n}@s.whatsapp.net`);
      await c.reply(result?.exists ? `✅ ${n} is on WhatsApp (JID: ${result.jid})` : `❌ ${n} is not on WhatsApp.`);
    } catch (e) { await c.reply(`❌ ${e.message}`); }
  },
  country: async (s, m, a, c) => {
    if (!a[0]) return c.reply(`Usage: ${c.prefix}country <country name>`);
    try {
      const axios = require("axios");
      const r = await axios.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(a.join(" "))}?fullText=false`, { timeout: 10000 });
      const country = r.data?.[0];
      if (!country) return c.reply("Not found.");
      await c.reply(
        `🌍 *${country.name?.common}*\n\nCapital: ${country.capital?.[0] || "n/a"}\nRegion: ${country.region}\nPopulation: ${country.population?.toLocaleString()}\nCurrency: ${Object.values(country.currencies || {})[0]?.name || "n/a"}`
      );
    } catch (e) { await c.reply(`❌ ${e.message}`); }
  },
  define: async (s, m, a, c) => {
    if (!a[0]) return c.reply(`Usage: ${c.prefix}define <word>`);
    try {
      const axios = require("axios");
      const r = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(a[0])}`, { timeout: 10000 });
      const e = r.data?.[0];
      const meaning = e?.meanings?.[0];
      if (!meaning) return c.reply("No definition found.");
      const def = meaning.definitions?.[0]?.definition || "n/a";
      await c.reply(`📖 *${a[0]}* (${meaning.partOfSpeech})\n\n${def}`);
    } catch { await c.reply("No definition found."); }
  },
  translate: async (s, m, a, c) => {
    if (a.length < 2) return c.reply(`Usage: ${c.prefix}translate <lang> <text>\nExample: ${c.prefix}translate fr Hello`);
    const lang = a.shift();
    const text = a.join(" ");
    try {
      const axios = require("axios");
      const r = await axios.get(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${encodeURIComponent(lang)}`,
        { timeout: 15000 }
      );
      const out = r.data?.responseData?.translatedText;
      await c.reply(out ? `🌐 *${lang}*\n\n${out}` : "Translation failed.");
    } catch (e) { await c.reply(`❌ ${e.message}`); }
  },
  shorturl: async (s, m, a, c) => {
    if (!a[0]) return c.reply(`Usage: ${c.prefix}shorturl <url>`);
    try {
      const axios = require("axios");
      const r = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(a[0])}`, { timeout: 10000 });
      await c.reply(`🔗 ${r.data}`);
    } catch (e) { await c.reply(`❌ ${e.message}`); }
  },
  qrencode: async (s, m, a, c) => {
    if (!a.length) return c.reply(`Usage: ${c.prefix}qrencode <text>`);
    const text = a.join(" ");
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(text)}`;
    await s.sendMessage(c.from, { image: { url }, caption: `QR for: ${text}` }, { quoted: m });
  },
  iplookup: async (s, m, a, c) => {
    if (!a[0]) return c.reply(`Usage: ${c.prefix}iplookup <ip or domain>`);
    try {
      const axios = require("axios");
      const r = await axios.get(`http://ip-api.com/json/${encodeURIComponent(a[0])}`, { timeout: 10000 });
      if (r.data?.status !== "success") return c.reply("Lookup failed.");
      await c.reply(
        `🌐 *${a[0]}*\n\nCountry: ${r.data.country} (${r.data.countryCode})\nRegion: ${r.data.regionName}\nCity: ${r.data.city}\nISP: ${r.data.isp}\nLat/Lon: ${r.data.lat}, ${r.data.lon}`
      );
    } catch (e) { await c.reply(`❌ ${e.message}`); }
  },
  whois: async (s, m, a, c) => {
    if (!a[0]) return c.reply(`Usage: ${c.prefix}whois <domain>`);
    try {
      const axios = require("axios");
      const r = await axios.get(`https://api.hackertarget.com/whois/?q=${encodeURIComponent(a[0])}`, { timeout: 15000 });
      const out = String(r.data).slice(0, 2500);
      await c.reply(`🔎 *Whois ${a[0]}*\n\n${out}`);
    } catch (e) { await c.reply(`❌ ${e.message}`); }
  },
  weather: async (s, m, a, c) => {
    if (!a.length) return c.reply(`Usage: ${c.prefix}weather <city>`);
    const city = a.join(" ");
    try {
      const axios = require("axios");
      const r = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, { timeout: 15000 });
      const cur = r.data?.current_condition?.[0];
      if (!cur) return c.reply("Weather unavailable.");
      await c.reply(
        `🌤 *${city}*\n\nTemp: ${cur.temp_C}°C / ${cur.temp_F}°F\nFeels like: ${cur.FeelsLikeC}°C\nHumidity: ${cur.humidity}%\nWind: ${cur.windspeedKmph} km/h ${cur.winddir16Point}\nConditions: ${cur.weatherDesc?.[0]?.value || "n/a"}`
      );
    } catch (e) { await c.reply(`❌ ${e.message}`); }
  }
};

module.exports = { commands };
