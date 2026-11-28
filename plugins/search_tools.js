"use strict";

const axios = require("axios");
const yts = require("yt-search");
const gis = require("g-i-s");
const C = require("../config");

function getEndpoint(key, fallback) {
  return C?.API_URLS?.[key] || process.env[`${key}_API_URL`] || fallback;
}

function extractImageUrl(payload) {
  if (!payload) return "";
  if (typeof payload === "string" && /^https?:\/\//i.test(payload.trim())) {
    return payload.trim();
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractImageUrl(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof payload === "object") {
    for (const [k, v] of Object.entries(payload)) {
      if (
        typeof v === "string" &&
        /^https?:\/\//i.test(v) &&
        /url|image|img|photo|link|src/i.test(k)
      ) {
        return v;
      }
      const nested = extractImageUrl(v);
      if (nested) return nested;
    }
  }
  return "";
}

async function searchYouTubeApi(query) {
  const baseUrl = getEndpoint("YT_SEARCH", "https://prexzyapis.com/search/youtube");
  const { data } = await axios.get(baseUrl, {
    params: { q: query },
    timeout: 15000,
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.result)
    ? data.result
    : Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.videos)
    ? data.videos
    : [];

  return list
    .map((v, i) => {
      const url = v?.url || v?.link || (v?.videoId ? `https://youtu.be/${v.videoId}` : "");
      if (!url) return null;
      return {
        title: v?.title || v?.name || `YouTube Result ${i + 1}`,
        url,
        timestamp: v?.timestamp || v?.duration || "Unknown",
        views: v?.views || "Unknown"
      };
    })
    .filter(Boolean)
    .slice(0, 5);
}

async function fetchBlueArchiveImage() {
  const endpoint = getEndpoint("BLUEARCHIVE", "https://prexzyapis.com/random/bluearchive");
  const res = await axios.get(endpoint, {
    timeout: 20000,
    responseType: "arraybuffer",
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const contentType = String(res.headers["content-type"] || "").toLowerCase();
  if (contentType.startsWith("image/")) {
    return { buffer: Buffer.from(res.data), url: endpoint };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(Buffer.from(res.data).toString("utf8"));
  } catch (_) {}

  const imgUrl = extractImageUrl(parsed);
  if (!imgUrl) return null;

  const imgRes = await axios.get(imgUrl, {
    timeout: 20000,
    responseType: "arraybuffer",
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  return { buffer: Buffer.from(imgRes.data), url: imgUrl };
}

const commands = {
  yts: async (s, m, a, c) => {
    const q = a.join(" ").trim();
    if (!q) return c.reply(`Usage: ${c.prefix}yts <search terms>`);

    try {
      let list = [];
      try {
        list = await searchYouTubeApi(q);
      } catch (_) {}

      if (!list.length) {
        const r = await yts(q);
        list = (r.videos || []).slice(0, 5).map((v) => ({
          title: v.title,
          url: v.url,
          timestamp: v.timestamp || "Unknown",
          views: v.views || "Unknown"
        }));
      }

      if (!list.length) return c.reply("No videos found.");

      const formatted = list
        .map(
          (v, i) =>
            `${i + 1}. *${v.title}*\n${v.url}\nDuration: ${v.timestamp} | Views: ${v.views}`
        )
        .join("\n\n");

      return c.reply(`🎬 *YOUTUBE RESULTS*\n\n${formatted}`);
    } catch (e) {
      return c.reply(`❌ YouTube search failed: ${e.message}`);
    }
  },

  find: async (s, m, a, c) => {
    const q = a.join(" ").trim();
    if (!q) return c.reply(`Usage: ${c.prefix}find <search terms>`);

    try {
      const r = await axios.get("https://api.duckduckgo.com/", {
        params: { q, format: "json", no_html: 1, skip_disambig: 1 },
        timeout: 10000
      });
      const d = r.data || {};
      const out = [];
      if (d.AbstractText) out.push(d.AbstractText);
      for (const x of d.RelatedTopics || []) {
        if (x.Text) {
          out.push(`${x.Text}${x.FirstURL ? `\n${x.FirstURL}` : ""}`);
        }
        if (out.length >= 5) break;
      }
      return c.reply(
        out.length
          ? `🔎 *SEARCH RESULTS*\n\n${out.join("\n\n")}`
          : "No instant-answer results. Try a more specific search phrase."
      );
    } catch (e) {
      return c.reply(`❌ Search failed: ${e.message}`);
    }
  },

  img: async (s, m, a, c) => {
    const q = a.join(" ").trim();
    if (!q) return c.reply(`Usage: ${c.prefix}img <image search terms>`);

    try {
      if (/blue\s*archive/i.test(q)) {
        const ba = await fetchBlueArchiveImage().catch(() => null);
        if (ba?.buffer?.length) {
          return s.sendMessage(
            c.from,
            { image: ba.buffer, caption: `🖼️ ${q}\n${ba.url}` },
            { quoted: m }
          );
        }
      }

      const results = await new Promise((resolve, reject) =>
        gis(q, (err, res) => (err ? reject(err) : resolve(res || [])))
      );
      const item = results.find((x) => /^https?:\/\//.test(x.url || ""));
      if (item) {
        return s.sendMessage(
          c.from,
          { image: { url: item.url }, caption: `🖼️ ${q}\n${item.url}` },
          { quoted: m }
        );
      }

      const fallback = await fetchBlueArchiveImage().catch(() => null);
      if (fallback?.buffer?.length) {
        return s.sendMessage(
          c.from,
          { image: fallback.buffer, caption: `🖼️ ${q}\n${fallback.url}` },
          { quoted: m }
        );
      }

      return c.reply("No image result found.");
    } catch (e) {
      return c.reply(`❌ Image search failed: ${e.message}`);
    }
  }
};

module.exports = { commands };
