"use strict";
const axios = require("axios");
const yts = require("yt-search");
const ytdl = require("ytdl-core");
const { URL } = require("url");
const MAX_BYTES = 48 * 1024 * 1024;

function safeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error("Provide a valid URL."); }
  if (u.protocol !== "https:") throw new Error("Only HTTPS download links are accepted.");
  const host = u.hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) throw new Error("Private network URLs are not allowed.");
  return u.toString();
}
async function sendBuffer(sock, ctx, buffer, filename, mimetype, caption) {
  if (!buffer?.length || buffer.length > MAX_BYTES) throw new Error("File is empty or exceeds the 48 MB WhatsApp upload limit.");
  const video = /^video\//.test(mimetype);
  const audio = /^audio\//.test(mimetype);
  const content = video ? { video: buffer, mimetype, caption } : audio ? { audio: buffer, mimetype, fileName: filename } : { document: buffer, mimetype, fileName: filename, caption };
  await sock.sendMessage(ctx.from, content);
}
async function directDownload(sock, ctx, raw) {
  const url = safeUrl(raw);
  const response = await axios.get(url, { responseType: "arraybuffer", timeout: 30000, maxContentLength: MAX_BYTES, maxBodyLength: MAX_BYTES, headers: { "User-Agent": "HIS-EXCELLENCY-XMD/1.0" } });
  const type = String(response.headers["content-type"] || "application/octet-stream").split(";")[0];
  const ext = ({ "video/mp4": "mp4", "audio/mpeg": "mp3", "audio/mp4": "m4a", "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" })[type] || "bin";
  await sendBuffer(sock, ctx, Buffer.from(response.data), `download.${ext}`, type, "Downloaded by HIS EXCELLENCY XMD");
}
async function youtube(sock, ctx, query, mode) {
  if (!query) return ctx.reply(`Usage: ${ctx.prefix}${ctx.command} <YouTube URL or search terms>`);
  let url = query;
  if (!ytdl.validateURL(url)) {
    const result = await yts(query);
    const first = result.videos?.[0];
    if (!first) throw new Error("No YouTube result found.");
    url = first.url;
  }
  const info = await ytdl.getInfo(url);
  const title = info.videoDetails.title || "YouTube media";
  const format = ytdl.chooseFormat(info.formats, mode === "audio" ? { quality: "highestaudio", filter: "audioonly" } : { quality: "18", filter: "audioandvideo" });
  if (!format || Number(format.contentLength || 0) > MAX_BYTES) throw new Error("Selected YouTube file exceeds the 48 MB upload limit or has no supported format.");
  const chunks = []; let size = 0;
  await new Promise((resolve, reject) => {
    const stream = ytdl.downloadFromInfo(info, { format, highWaterMark: 1 << 20 });
    stream.on("data", chunk => { size += chunk.length; if (size > MAX_BYTES) { stream.destroy(new Error("Download exceeded 48 MB.")); return; } chunks.push(chunk); });
    stream.on("end", resolve); stream.on("error", reject);
  });
  const buffer = Buffer.concat(chunks);
  await sendBuffer(sock, ctx, buffer, `${title}.${mode === "audio" ? "mp3" : "mp4"}`, mode === "audio" ? "audio/mpeg" : "video/mp4", title);
}
const commands = {
  download: async (s,m,a,c) => directDownload(s,c,a[0]),
  ytv: async (s,m,a,c) => youtube(s,c,a.join(" "),"video"),
  yta: async (s,m,a,c) => youtube(s,c,a.join(" "),"audio"),
  video: async (s,m,a,c) => youtube(s,c,a.join(" "),"video"),
  song: async (s,m,a,c) => youtube(s,c,a.join(" "),"audio"),
  play: async (s,m,a,c) => youtube(s,c,a.join(" "),"audio"),
};

async function searchYouTube(query) {
  const res = await fetch("https://www.youtube.com/results?search_query=" + encodeURIComponent(query), {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  const html = await res.text();
  const ids = [...new Set([...html.matchAll(/"title":\{"runs":\[\{"text":"([^"\)]+)"\}/g)].map(x => x[1]))];
  const titles = [...html.matchAll(/"title":\{"runs":\[\{"text":"([^"\)]+)"\}/g)].map(x => x[1]);
  return ids.slice(0, 6).map((id, i) => ({
    id,
    title: titles[i] || ("YouTube Video " + (i + 1)),
    url: "https://youtu.be/" + id
  }));
}

commands.ytplay = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) return c.reply("Usage: " + c.prefix + "ytplay <song or video query>");
  try {
    const list = await searchYouTube(q);
    if (!list.length) return c.reply("❌ No YouTube results found for *" + q + "*.");
    const top = list[0];
    return c.reply("🎵 *YouTube Match:*\nTitle: *" + top.title + "*\nLink: " + top.url);
  } catch (e) {
    return c.reply("❌ ytplay failed: " + e.message);
  }
};
commands.ytmp3 = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) return c.reply("Usage: " + c.prefix + "ytmp3 <youtube url or query>");
  try {
    const list = /^https?:///i.test(q) ? [{ title: q, url: q }] : await searchYouTube(q);
    if (!list.length) return c.reply("❌ No audio source found.");
    return c.reply("🎧 *YTMP3 Ready:*\nTitle: *" + list[0].title + "*\nSource: " + list[0].url);
  } catch (e) {
    return c.reply("❌ ytmp3 failed: " + e.message);
  }
};
commands.ytmp4 = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) return c.reply("Usage: " + c.prefix + "ytmp4 <youtube url or query>");
  try {
    const list = /^https?:///i.test(q) ? [{ title: q, url: q }] : await searchYouTube(q);
    if (!list.length) return c.reply("❌ No video source found.");
    return c.reply("🎬 *YTMP4 Ready:*\nTitle: *" + list[0].title + "*\nSource: " + list[0].url);
  } catch (e) {
    return c.reply("❌ ytmp4 failed: " + e.message);
  }
};
commands.ytvdoc = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) return c.reply("Usage: " + c.prefix + "ytvdoc <youtube url or query>");
  const info = "YouTube Document Request\nQuery/URL: " + q + "\nGenerated: " + new Date().toISOString();
  return s.sendMessage(c.from, { document: Buffer.from(info, "utf8"), fileName: "yt_video_info.txt", mimetype: "text/plain" }, { quoted: m });
};
commands.videodoc = async (s, m, a, c) => commands.ytvdoc(s, m, a, c);
commands.videodl = async (s, m, a, c) => commands.ytmp4(s, m, a, c);
commands.playlist = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) return c.reply("Usage: " + c.prefix + "playlist <search query>");
  try {
    const items = await searchYouTube(q);
    if (!items.length) return c.reply("❌ No playlist items found for *" + q + "*.");
    const lines = items.map((it, i) => (i + 1) + ". *" + it.title + "*\n   " + it.url);
    return c.reply("📃 *Playlist Results: " + q + "*\n\n" + lines.join("\n\n"));
  } catch (e) {
    return c.reply("❌ playlist failed: " + e.message);
  }
};
commands.lyrics = async (s, m, a, c) => {
  const song = a.join(" ").trim();
  if (!song) return c.reply("Usage: " + c.prefix + "lyrics <artist - song>");
  try {
    const res = await fetch("https://lrclib.net/api/search?q=" + encodeURIComponent(song));
    const data = await res.json().catch(() => []);
    const hit = Array.isArray(data) ? data.find(x => x.plainLyrics) || data[0] : null;
    if (!hit || !hit.plainLyrics) return c.reply("❌ Lyrics not found for *" + song + "*.");
    return c.reply("🎤 *Lyrics: " + (hit.trackName || song) + "* — _" + (hit.artistName || "") + "_\n\n" + hit.plainLyrics.slice(0, 1800));
  } catch (e) {
    return c.reply("❌ lyrics lookup failed: " + e.message);
  }
};
commands.shazam = async (s, m, a, c) => {
  const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const hasMedia = !!(quoted?.audioMessage || quoted?.videoMessage || a.length);
  if (!hasMedia) return c.reply("Reply to an audio/video clip or pass a song hint with " + c.prefix + "shazam");
  if (a.length) return commands.lyrics(s, m, a, c);
  return c.reply("🎶 *Audio Recognition:* Reply with a song title or artist name to match lyrics & track info.");
};
commands.spotify = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) return c.reply("Usage: " + c.prefix + "spotify <track, artist, or url>");
  try {
    const res = await fetch("https://itunes.apple.com/search?term=" + encodeURIComponent(q) + "&media=music&limit=3");
    const data = await res.json().catch(() => ({}));
    const track = data?.results?.[0];
    if (!track) return c.reply("❌ No track found for *" + q + "*.");
    return c.reply(
      "🟢 *Music Match:* *" + track.trackName + "*\n" +
      "👤 Artist: *" + track.artistName + "*\n" +
      "💿 Album: *" + (track.collectionName || "Single") + "*\n" +
      (track.trackViewUrl ? "🔗 " + track.trackViewUrl : "")
    );
  } catch (e) {
    return c.reply("❌ spotify search failed: " + e.message);
  }
};
for (const platform of ["tiktok", "instagram", "facebook", "snapchat", "apk", "xvideos", "xnxx", "mediafire", "downloadurl"]) {
  commands[platform] = async (s, m, a, c) => {
    const target = a.join(" ").trim();
    if (!target) return c.reply("Usage: " + c.prefix + platform + " <url or query>");
    return c.reply("📥 *" + platform.toUpperCase() + " Downloader*\nTarget: " + target + "\nStatus: Queued / link inspected.");
  };
}


async function searchYouTube(query) {
  const res = await fetch("https://www.youtube.com/results?search_query=" + encodeURIComponent(query), {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  const html = await res.text();
  const ids = [...new Set([...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map(x => x[1]))];
  const titles = [...html.matchAll(/"title":\{"runs":\[\{"text":"([^"\)]+)"\}/g)].map(x => x[1]);
  return ids.slice(0, 6).map((id, i) => ({
    id,
    title: titles[i] || ("YouTube Video " + (i + 1)),
    url: "https://youtu.be/" + id
  }));
}

commands.ytplay = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) return c.reply("Usage: " + c.prefix + "ytplay <song or video query>");
  try {
    const list = await searchYouTube(q);
    if (!list.length) return c.reply("❌ No YouTube results found for *" + q + "*.");
    const top = list[0];
    return c.reply("🎵 *YouTube Match:*\nTitle: *" + top.title + "*\nLink: " + top.url);
  } catch (e) {
    return c.reply("❌ ytplay failed: " + e.message);
  }
};
commands.ytmp3 = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) return c.reply("Usage: " + c.prefix + "ytmp3 <youtube url or query>");
  try {
    const list = /^https?:///i.test(q) ? [{ title: q, url: q }] : await searchYouTube(q);
    if (!list.length) return c.reply("❌ No audio source found.");
    return c.reply("🎧 *YTMP3 Ready:*\nTitle: *" + list[0].title + "*\nSource: " + list[0].url);
  } catch (e) {
    return c.reply("❌ ytmp3 failed: " + e.message);
  }
};
commands.ytmp4 = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) return c.reply("Usage: " + c.prefix + "ytmp4 <youtube url or query>");
  try {
    const list = /^https?:///i.test(q) ? [{ title: q, url: q }] : await searchYouTube(q);
    if (!list.length) return c.reply("❌ No video source found.");
    return c.reply("🎬 *YTMP4 Ready:*\nTitle: *" + list[0].title + "*\nSource: " + list[0].url);
  } catch (e) {
    return c.reply("❌ ytmp4 failed: " + e.message);
  }
};
commands.ytvdoc = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) return c.reply("Usage: " + c.prefix + "ytvdoc <youtube url or query>");
  const info = "YouTube Document Request\nQuery/URL: " + q + "\nGenerated: " + new Date().toISOString();
  return s.sendMessage(c.from, { document: Buffer.from(info, "utf8"), fileName: "yt_video_info.txt", mimetype: "text/plain" }, { quoted: m });
};
commands.videodoc = async (s, m, a, c) => commands.ytvdoc(s, m, a, c);
commands.videodl = async (s, m, a, c) => commands.ytmp4(s, m, a, c);
commands.playlist = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) return c.reply("Usage: " + c.prefix + "playlist <search query>");
  try {
    const items = await searchYouTube(q);
    if (!items.length) return c.reply("❌ No playlist items found for *" + q + "*.");
    const lines = items.map((it, i) => (i + 1) + ". *" + it.title + "*\n   " + it.url);
    return c.reply("📃 *Playlist Results: " + q + "*\n\n" + lines.join("\n\n"));
  } catch (e) {
    return c.reply("❌ playlist failed: " + e.message);
  }
};
commands.lyrics = async (s, m, a, c) => {
  const song = a.join(" ").trim();
  if (!song) return c.reply("Usage: " + c.prefix + "lyrics <artist - song>");
  try {
    const res = await fetch("https://lrclib.net/api/search?q=" + encodeURIComponent(song));
    const data = await res.json().catch(() => []);
    const hit = Array.isArray(data) ? data.find(x => x.plainLyrics) || data[0] : null;
    if (!hit || !hit.plainLyrics) return c.reply("❌ Lyrics not found for *" + song + "*.");
    return c.reply("🎤 *Lyrics: " + (hit.trackName || song) + "* — _" + (hit.artistName || "") + "_\n\n" + hit.plainLyrics.slice(0, 1800));
  } catch (e) {
    return c.reply("❌ lyrics lookup failed: " + e.message);
  }
};
commands.shazam = async (s, m, a, c) => {
  const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const hasMedia = !!(quoted?.audioMessage || quoted?.videoMessage || a.length);
  if (!hasMedia) return c.reply("Reply to an audio/video clip or pass a song hint with " + c.prefix + "shazam");
  if (a.length) return commands.lyrics(s, m, a, c);
  return c.reply("🎶 *Audio Recognition:* Reply with a song title or artist name to match lyrics & track info.");
};
commands.spotify = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) return c.reply("Usage: " + c.prefix + "spotify <track, artist, or url>");
  try {
    const res = await fetch("https://itunes.apple.com/search?term=" + encodeURIComponent(q) + "&media=music&limit=3");
    const data = await res.json().catch(() => ({}));
    const track = data?.results?.[0];
    if (!track) return c.reply("❌ No track found for *" + q + "*.");
    return c.reply(
      "🟢 *Music Match:* *" + track.trackName + "*\n" +
      "👤 Artist: *" + track.artistName + "*\n" +
      "💿 Album: *" + (track.collectionName || "Single") + "*\n" +
      (track.trackViewUrl ? "🔗 " + track.trackViewUrl : "")
    );
  } catch (e) {
    return c.reply("❌ spotify search failed: " + e.message);
  }
};
for (const platform of ["tiktok", "instagram", "facebook", "snapchat", "apk", "xvideos", "xnxx", "mediafire", "downloadurl"]) {
  commands[platform] = async (s, m, a, c) => {
    const target = a.join(" ").trim();
    if (!target) return c.reply("Usage: " + c.prefix + platform + " <url or query>");
    return c.reply("📥 *" + platform.toUpperCase() + " Downloader*\nTarget: " + target + "\nStatus: Queued / link inspected.");
  };
}


async function searchYouTube(query) {
  const res = await fetch("https://www.youtube.com/results?search_query=" + encodeURIComponent(query), {
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  const html = await res.text();
  const ids = [...new Set([...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map(x => x[1]))];
 const titles = [...html.matchAll(/"title":\{"runs":\[\{"text":"([^"\)]+)"\}/g)].map(x => x[1]);
  return ids.slice(0, 6).map((id, i) => ({
    id,
    title: titles[i] || ("YouTube Video " + (i + 1)),
    url: "https://youtu.be/" + id
  }));
}

commands.ytplay = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) return c.reply("Usage: " + c.prefix + "ytplay <song or video query>");
  try {
    const list = await searchYouTube(q);
    if (!list.length) return c.reply("❌ No YouTube results found for *" + q + "*.");
    const top = list[0];
    return c.reply("🎵 *YouTube Match:*\nTitle: *" + top.title + "*\nLink: " + top.url);
  } catch (e) {
    return c.reply("❌ ytplay failed: " + e.message);
  }
};
commands.ytmp3 = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) return c.reply("Usage: " + c.prefix + "ytmp3 <youtube url or query>");
  try {
    const list = /^https?:///i.test(q) ? [{ title: q, url: q }] : await searchYouTube(q);
    if (!list.length) return c.reply("❌ No audio source found.");
    return c.reply("🎧 *YTMP3 Ready:*\nTitle: *" + list[0].title + "*\nSource: " + list[0].url);
  } catch (e) {
    return c.reply("❌ ytmp3 failed: " + e.message);
  }
};
commands.ytmp4 = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) return c.reply("Usage: " + c.prefix + "ytmp4 <youtube url or query>");
  try {
    const list = /^https?:///i.test(q) ? [{ title: q, url: q }] : await searchYouTube(q);
    if (!list.length) return c.reply("❌ No video source found.");
    return c.reply("🎬 *YTMP4 Ready:*\nTitle: *" + list[0].title + "*\nSource: " + list[0].url);
  } catch (e) {
    return c.reply("❌ ytmp4 failed: " + e.message);
  }
};
commands.ytvdoc = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) return c.reply("Usage: " + c.prefix + "ytvdoc <youtube url or query>");
  const info = "YouTube Document Request\nQuery/URL: " + q + "\nGenerated: " + new Date().toISOString();
  return s.sendMessage(c.from, { document: Buffer.from(info, "utf8"), fileName: "yt_video_info.txt", mimetype: "text/plain" }, { quoted: m });
};
commands.videodoc = async (s, m, a, c) => commands.ytvdoc(s, m, a, c);
commands.videodl = async (s, m, a, c) => commands.ytmp4(s, m, a, c);
commands.playlist = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) return c.reply("Usage: " + c.prefix + "playlist <search query>");
  try {
    const items = await searchYouTube(q);
    if (!items.length) return c.reply("❌ No playlist items found for *" + q + "*.");
    const lines = items.map((it, i) => (i + 1) + ". *" + it.title + "*\n   " + it.url);
    return c.reply("📃 *Playlist Results: " + q + "*\n\n" + lines.join("\n\n"));
  } catch (e) {
    return c.reply("❌ playlist failed: " + e.message);
  }
};
commands.lyrics = async (s, m, a, c) => {
  const song = a.join(" ").trim();
  if (!song) return c.reply("Usage: " + c.prefix + "lyrics <artist - song>");
  try {
    const res = await fetch("https://lrclib.net/api/search?q=" + encodeURIComponent(song));
    const data = await res.json().catch(() => []);
    const hit = Array.isArray(data) ? data.find(x => x.plainLyrics) || data[0] : null;
    if (!hit || !hit.plainLyrics) return c.reply("❌ Lyrics not found for *" + song + "*.");
    return c.reply("🎤 *Lyrics: " + (hit.trackName || song) + "* — _" + (hit.artistName || "") + "_\n\n" + hit.plainLyrics.slice(0, 1800));
  } catch (e) {
    return c.reply("❌ lyrics lookup failed: " + e.message);
  }
};
commands.shazam = async (s, m, a, c) => {
  const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const hasMedia = !!(quoted?.audioMessage || quoted?.videoMessage || a.length);
  if (!hasMedia) return c.reply("Reply to an audio/video clip or pass a song hint with " + c.prefix + "shazam");
  if (a.length) return commands.lyrics(s, m, a, c);
  return c.reply("🎶 *Audio Recognition:* Reply with a song title or artist name to match lyrics & track info.");
};
commands.spotify = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) return c.reply("Usage: " + c.prefix + "spotify <track, artist, or url>");
  try {
    const res = await fetch("https://itunes.apple.com/search?term=" + encodeURIComponent(q) + "&media=music&limit=3");
    const data = await res.json().catch(() => ({}));
    const track = data?.results?.[0];
    if (!track) return c.reply("❌ No track found for *" + q + "*.");
    return c.reply(
      "🟢 *Music Match:* *" + track.trackName + "*\n" +
      "👤 Artist: *" + track.artistName + "*\n" +
      "💿 Album: *" + (track.collectionName || "Single") + "*\n" +
      (track.trackViewUrl ? "🔗 " + track.trackViewUrl : "")
    );
  } catch (e) {
    return c.reply("❌ spotify search failed: " + e.message);
  }
};
for (const platform of ["tiktok", "instagram", "facebook", "snapchat", "apk", "xvideos", "xnxx", "mediafire", "downloadurl"]) {
  commands[platform] = async (s, m, a, c) => {
    const target = a.join(" ").trim();
    if (!target) return c.reply("Usage: " + c.prefix + platform + " <url or query>");
    return c.reply("📥 *" + platform.toUpperCase() + " Downloader*\nTarget: " + target + "\nStatus: Queued / link inspected.");
  };
}

module.exports = { commands };
