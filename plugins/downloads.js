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
module.exports = { commands };
