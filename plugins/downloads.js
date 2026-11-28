"use strict";

const axios = require("axios");
const yts = require("yt-search");
const ytdl = require("ytdl-core");
const { URL } = require("url");

const MAX_BYTES = 48 * 1024 * 1024;

function getCfg(ctx) {
  return ctx?.config || ctx?.C || global.config || global.C || {};
}

function getApiUrl(ctx, key, fallback) {
  const C = getCfg(ctx);
  return C?.API_URLS?.[key] || process.env[`${key}_API_URL`] || fallback;
}

function safeUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || "").trim());
  } catch {
    throw new Error("Provide a valid URL.");
  }
  if (!["http:", "https:"].includes(u.protocol)) {
    throw new Error("Only HTTP/HTTPS URLs are accepted.");
  }
  const host = u.hostname.toLowerCase();
  if (
    ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host) ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
  ) {
    throw new Error("Private network URLs are not allowed.");
  }
  return u.toString();
}

function buildEndpoint(baseUrl, params = {}) {
  const cleanBase = String(baseUrl || "").split("?")[0];
  const url = new URL(cleanBase);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v) !== "") {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function extractMediaUrls(payload, found = new Set()) {
  if (!payload) return [];
  if (typeof payload === "string") {
    if (
      /^https?:\/\//i.test(payload) &&
      /\.(mp4|mp3|m4a|webm|mov|jpg|jpeg|png|webp)(\?.*)?$/i.test(payload)
    ) {
      found.add(payload);
    }
    return Array.from(found);
  }
  if (Array.isArray(payload)) {
    for (const item of payload) extractMediaUrls(item, found);
    return Array.from(found);
  }
  if (typeof payload === "object") {
    for (const [k, v] of Object.entries(payload)) {
      if (
        typeof v === "string" &&
        /^https?:\/\//i.test(v) &&
        /url|link|video|audio|image|media|download|hd|sd|stream|mp4|mp3/i.test(k)
      ) {
        found.add(v);
      } else {
        extractMediaUrls(v, found);
      }
    }
  }
  return Array.from(found);
}

async function sendBuffer(sock, ctx, m, buffer, filename, mimetype, caption) {
  if (!buffer?.length || buffer.length > MAX_BYTES) {
    throw new Error("File is empty or exceeds the 48 MB WhatsApp upload limit.");
  }
  const video = /^video\//.test(mimetype);
  const audio = /^audio\//.test(mimetype);
  const image = /^image\//.test(mimetype);

  const content = video
    ? { video: buffer, mimetype, caption }
    : audio
    ? { audio: buffer, mimetype, fileName: filename }
    : image
    ? { image: buffer, mimetype, caption }
    : { document: buffer, mimetype, fileName: filename, caption };

  await sock.sendMessage(ctx.from, content, m ? { quoted: m } : {});
}

async function directDownload(sock, ctx, raw, m = null) {
  const url = safeUrl(raw);
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
    maxContentLength: MAX_BYTES,
    maxBodyLength: MAX_BYTES,
    headers: { "User-Agent": "Mozilla/5.0 HIS-EXCELLENCY-XMD/1.0" }
  });
  const type = String(response.headers["content-type"] || "application/octet-stream").split(";")[0];
  const ext =
    {
      "video/mp4": "mp4",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "application/pdf": "pdf"
    }[type] || "bin";

  await sendBuffer(sock, ctx, m, Buffer.from(response.data), `download.${ext}`, type, "Downloaded by HIS EXCELLENCY XMD");
}

async function downloadFromApiEndpoint(sock, m, c, platform, targetUrl, endpointUrl) {
  const apiUrl = buildEndpoint(endpointUrl, { url: targetUrl });
  const { data } = await axios.get(apiUrl, {
    timeout: 25000,
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const urls = extractMediaUrls(data);
  if (!urls.length) {
    const summary =
      typeof data === "string"
        ? data.slice(0, 500)
        : JSON.stringify(data?.result || data?.data || data, null, 2).slice(0, 500);
    return c.reply(`📥 *${platform.toUpperCase()} Response:*\n${summary || "No direct media link returned."}`);
  }

  const chosen = urls[0];
  try {
    await directDownload(sock, c, chosen, m);
  } catch (_) {
    return c.reply(`📥 *${platform.toUpperCase()} Media Link:*\n${chosen}`);
  }
}

async function searchYouTube(query, ctx) {
  const apiBase = getApiUrl(ctx, "YT_SEARCH", "https://prexzyapis.com/search/youtube");
  try {
    const endpoint = buildEndpoint(apiBase, { q: query });
    const { data } = await axios.get(endpoint, { timeout: 15000 });
    const rawList = Array.isArray(data)
      ? data
      : Array.isArray(data?.result)
      ? data.result
      : Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.videos)
      ? data.videos
      : [];

    const mapped = rawList
      .map((item, idx) => {
        const url = item?.url || item?.link || (item?.videoId ? `https://youtu.be/${item.videoId}` : "");
        const title = item?.title || item?.name || `YouTube Result ${idx + 1}`;
        return url ? { title, url } : null;
      })
      .filter(Boolean);

    if (mapped.length) return mapped.slice(0, 6);
  } catch (_) {
    // Fallback to yt-search below
  }

  const res = await yts(query);
  return (res.videos || []).slice(0, 6).map((v) => ({
    title: v.title,
    url: v.url
  }));
}

async function youtube(sock, ctx, query, mode, m = null) {
  if (!query) return ctx.reply(`Usage: ${ctx.prefix}${ctx.command} <YouTube URL or search terms>`);
  let url = query;
  if (!ytdl.validateURL(url)) {
    const list = await searchYouTube(query, ctx);
    const first = list[0];
    if (!first) throw new Error("No YouTube result found.");
    url = first.url;
  }

  const info = await ytdl.getInfo(url);
  const title = info.videoDetails.title || "YouTube media";
  const format = ytdl.chooseFormat(
    info.formats,
    mode === "audio"
      ? { quality: "highestaudio", filter: "audioonly" }
      : { quality: "18", filter: "audioandvideo" }
  );
  if (!format || Number(format.contentLength || 0) > MAX_BYTES) {
    throw new Error("Selected YouTube file exceeds the 48 MB upload limit or has no supported format.");
  }

  const chunks = [];
  let size = 0;
  await new Promise((resolve, reject) => {
    const stream = ytdl.downloadFromInfo(info, { format, highWaterMark: 1 << 20 });
    stream.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        stream.destroy(new Error("Download exceeded 48 MB."));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  const buffer = Buffer.concat(chunks);
  await sendBuffer(
    sock,
    ctx,
    m,
    buffer,
    `${title}.${mode === "audio" ? "mp3" : "mp4"}`,
    mode === "audio" ? "audio/mpeg" : "video/mp4",
    title
  );
}

const commands = {
  download: async (s, m, a, c) => directDownload(s, c, a[0], m),
  ytv: async (s, m, a, c) => youtube(s, c, a.join(" ").trim(), "video", m),
  yta: async (s, m, a, c) => youtube(s, c, a.join(" ").trim(), "audio", m),
  video: async (s, m, a, c) => youtube(s, c, a.join(" ").trim(), "video", m),
  song: async (s, m, a, c) => youtube(s, c, a.join(" ").trim(), "audio", m),
  play: async (s, m, a, c) => youtube(s, c, a.join(" ").trim(), "audio", m),

  ytplay: async (s, m, a, c) => {
    const q = a.join(" ").trim();
    if (!q) return c.reply(`Usage: ${c.prefix}ytplay <song or video query>`);
    try {
      const list = await searchYouTube(q, c);
      if (!list.length) return c.reply(`❌ No YouTube results found for *${q}*.`);
      const top = list[0];
      return c.reply(`🎵 *YouTube Match:*\nTitle: *${top.title}*\nLink: ${top.url}`);
    } catch (e) {
      return c.reply(`❌ ytplay failed: ${e.message}`);
    }
  },

  ytmp3: async (s, m, a, c) => {
    const q = a.join(" ").trim();
    if (!q) return c.reply(`Usage: ${c.prefix}ytmp3 <youtube url or query>`);
    try {
      const list = /^https?:\/\//i.test(q) ? [{ title: q, url: q }] : await searchYouTube(q, c);
      if (!list.length) return c.reply("❌ No audio source found.");
      return c.reply(`🎧 *YTMP3 Ready:*\nTitle: *${list[0].title}*\nSource: ${list[0].url}`);
    } catch (e) {
      return c.reply(`❌ ytmp3 failed: ${e.message}`);
    }
  },

  ytmp4: async (s, m, a, c) => {
    const q = a.join(" ").trim();
    if (!q) return c.reply(`Usage: ${c.prefix}ytmp4 <youtube url or query>`);
    try {
      const list = /^https?:\/\//i.test(q) ? [{ title: q, url: q }] : await searchYouTube(q, c);
      if (!list.length) return c.reply("❌ No video source found.");
      return c.reply(`🎬 *YTMP4 Ready:*\nTitle: *${list[0].title}*\nSource: ${list[0].url}`);
    } catch (e) {
      return c.reply(`❌ ytmp4 failed: ${e.message}`);
    }
  },

  ytvdoc: async (s, m, a, c) => {
    const q = a.join(" ").trim();
    if (!q) return c.reply(`Usage: ${c.prefix}ytvdoc <youtube url or query>`);
    const info = `YouTube Document Request\nQuery/URL: ${q}\nGenerated: ${new Date().toISOString()}`;
    return s.sendMessage(
      c.from,
      { document: Buffer.from(info, "utf8"), fileName: "yt_video_info.txt", mimetype: "text/plain" },
      { quoted: m }
    );
  },

  videodoc: async (s, m, a, c) => commands.ytvdoc(s, m, a, c),
  videodl: async (s, m, a, c) => commands.ytmp4(s, m, a, c),

  playlist: async (s, m, a, c) => {
    const q = a.join(" ").trim();
    if (!q) return c.reply(`Usage: ${c.prefix}playlist <search query>`);
    try {
      const items = await searchYouTube(q, c);
      if (!items.length) return c.reply(`❌ No playlist items found for *${q}*.`);
      const lines = items.map((it, i) => `${i + 1}. *${it.title}*\n   ${it.url}`);
      return c.reply(`📃 *Playlist Results: ${q}*\n\n${lines.join("\n\n")}`);
    } catch (e) {
      return c.reply(`❌ playlist failed: ${e.message}`);
    }
  },

  lyrics: async (s, m, a, c) => {
    const song = a.join(" ").trim();
    if (!song) return c.reply(`Usage: ${c.prefix}lyrics <artist - song>`);
    try {
      const lyricsEndpoint = getApiUrl(ctxOrNull(c), "LYRICS", "https://apiss.vinniedigitalhub.co.ke/search/lyrics");
      const res = await fetch(`${lyricsEndpoint}?q=${encodeURIComponent(song)}`);
      const data = await res.json().catch(() => ({}));
      const item = Array.isArray(data) ? data.find((x) => x.plainLyrics || x.lyrics) || data[0] : data?.result || data;
      const text = item?.plainLyrics || item?.lyrics || "";
      if (!text) return c.reply(`❌ Lyrics not found for *${song}*.`);
      return c.reply(`🎤 *Lyrics: ${item.trackName || item.title || song}* — _${item.artistName || item.artist || ""}_\n\n${String(text).slice(0, 1800)}`);
    } catch (e) {
      return c.reply(`❌ lyrics lookup failed: ${e.message}`);
    }
  },

  shazam: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const hasMedia = !!(quoted?.audioMessage || quoted?.videoMessage || a.length);
    if (!hasMedia) return c.reply(`Reply to an audio/video clip or pass a song hint with ${c.prefix}shazam`);
    if (a.length) return commands.lyrics(s, m, a, c);
    return c.reply("🎶 *Audio Recognition:* Reply with a song title or artist name to match lyrics & track info.");
  },

  spotify: async (s, m, a, c) => {
    const q = a.join(" ").trim();
    if (!q) return c.reply(`Usage: ${c.prefix}spotify <track, artist, or url>`);
    try {
      if (/^https?:\/\//i.test(q) && q.includes("spotify.com")) {
        const dlUrl = getApiUrl(c, "SPOTIFY_DL", "https://prexzyapis.com/download/spotify");
        return await downloadFromApiEndpoint(s, m, c, "spotify", q, dlUrl);
      }
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&limit=3`);
      const data = await res.json().catch(() => ({}));
      const track = data?.results?.[0];
      if (!track) return c.reply(`❌ No track found for *${q}*.`);
      return c.reply(
        `🟢 *Music Match:* *${track.trackName}*\n` +
          `👤 Artist: *${track.artistName}*\n` +
          `💿 Album: *${track.collectionName || "Single"}*\n` +
          (track.trackViewUrl ? `🔗 ${track.trackViewUrl}` : "")
      );
    } catch (e) {
      return c.reply(`❌ spotify search failed: ${e.message}`);
    }
  },

  tiktok: async (s, m, a, c) => {
    const target = a.join(" ").trim();
    if (!target) return c.reply(`Usage: ${c.prefix}tiktok <url>`);
    try {
      const endpoint = getApiUrl(c, "TIKTOK", "https://prexzyapis.com/download/tiktokv2");
      return await downloadFromApiEndpoint(s, m, c, "tiktok", target, endpoint);
    } catch (e) {
      return c.reply(`❌ tiktok download failed: ${e.message}`);
    }
  },

  instagram: async (s, m, a, c) => {
    const target = a.join(" ").trim();
    if (!target) return c.reply(`Usage: ${c.prefix}instagram <url>`);
    try {
      const endpoint = getApiUrl(c, "INSTAGRAM", "https://prexzyapis.com/download/instagram");
      return await downloadFromApiEndpoint(s, m, c, "instagram", target, endpoint);
    } catch (e) {
      return c.reply(`❌ instagram download failed: ${e.message}`);
    }
  },

  facebook: async (s, m, a, c) => {
    const target = a.join(" ").trim();
    if (!target) return c.reply(`Usage: ${c.prefix}facebook <url>`);
    try {
      const endpoint = getApiUrl(c, "FACEBOOK", "https://prexzyapis.com/download/facebook");
      return await downloadFromApiEndpoint(s, m, c, "facebook", target, endpoint);
    } catch (e) {
      return c.reply(`❌ facebook download failed: ${e.message}`);
    }
  }
};

function ctxOrNull(c) {
  return c || null;
}

for (const platform of ["snapchat", "apk", "xvideos", "xnxx", "mediafire", "downloadurl"]) {
  commands[platform] = async (s, m, a, c) => {
    const target = a.join(" ").trim();
    if (!target) return c.reply(`Usage: ${c.prefix}${platform} <url or query>`);
    if (/^https?:\/\//i.test(target)) {
      try {
        return await directDownload(s, c, target, m);
      } catch (e) {
        return c.reply(`❌ ${platform} download failed: ${e.message}`);
      }
    }
    return c.reply(`📥 *${platform.toUpperCase()} Downloader*\nTarget: ${target}\nStatus: Provide a direct URL to download.`);
  };
}

module.exports = { commands };
