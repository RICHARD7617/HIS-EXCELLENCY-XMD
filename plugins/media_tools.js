"use strict";
const fs = require("fs"); const os = require("os"); const path = require("path"); const { spawn } = require("child_process");
const ffmpeg = require("ffmpeg-static");
const { getQuotedMessage, getMedia, downloadMedia } = require("../lib/media");
const MAX_INPUT = 35 * 1024 * 1024;
async function run(input, args, ext) {
  if (!ffmpeg) throw new Error("FFmpeg binary is unavailable on this host.");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xmd-media-")); const src = path.join(dir, "input.bin"); const out = path.join(dir, `output.${ext}`);
  try {
    fs.writeFileSync(src, input);
    await new Promise((resolve,reject)=>{ const p=spawn(ffmpeg,["-hide_banner","-loglevel","error","-y","-i",src,...args,out]); let err=""; p.stderr.on("data",d=>err+=d); p.on("error",reject); p.on("close",code=>code===0?resolve():reject(new Error(err.slice(-500)||`FFmpeg exited ${code}`))); });
    const result=fs.readFileSync(out); if(result.length>48*1024*1024) throw new Error("Output exceeds WhatsApp's 48 MB limit."); return result;
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
async function quotedMedia(s,m,c, types=["videoMessage","audioMessage","imageMessage"]) {
  const quoted=getQuotedMessage(m); if(!quoted) throw new Error("Reply to the media you want to process.");
  const found=getMedia(quoted,types); if(!found) throw new Error("Unsupported quoted media type.");
  const info=m.message?.extendedTextMessage?.contextInfo||{};
  const buffer=await downloadMedia(found.media,found.mediaType,{sock:s,from:c.from,quoted,stanzaId:info.stanzaId,participant:info.participant});
  if(buffer.length>MAX_INPUT) throw new Error("Input exceeds 35 MB."); return {buffer,type:found.mediaType};
}
async function transform(s,m,c,cmd,args) {
 const q=await quotedMedia(s,m,c,cmd==="mp3"?["videoMessage","audioMessage"]:["videoMessage","audioMessage"]);
 let output, kind;
 if(cmd==="mp3" || cmd==="audio") { output=await run(q.buffer,["-vn","-acodec","libmp3lame","-b:a","128k"],"mp3"); kind="audio"; }
 else if(["bass","treble","nightcore","slow","fast","robot","reverse"].includes(cmd)) {
   const filters={bass:"bass=g=8",treble:"treble=g=8",nightcore:"asetrate=44100*1.25,aresample=44100,atempo=1.0",slow:"atempo=0.8",fast:"atempo=1.25",robot:"aecho=0.8:0.88:6:0.4",reverse:"areverse"};
   output=await run(q.buffer,["-vn","-af",filters[cmd],"-acodec","libmp3lame","-b:a","128k"],"mp3"); kind="audio";
 } else {
   const vf={compress:["-vf","scale='min(720,iw)':-2","-c:v","libx264","-crf","28","-preset","veryfast","-c:a","aac"],rotate:["-vf","transpose=1","-c:a","copy"],crop:["-vf","crop=iw*0.8:ih*0.8","-c:a","copy"],trim:["-t",String(Math.min(60,Math.max(1,Number(args[0])||15))),"-c:v","libx264","-c:a","aac"]};
   if(!vf[cmd]) throw new Error("This media effect is not implemented yet."); output=await run(q.buffer,vf[cmd],"mp4"); kind="video";
 }
 await s.sendMessage(c.from,kind==="audio"?{audio:output,mimetype:"audio/mpeg",ptt:false}:{video:output,mimetype:"video/mp4",caption:`✅ ${cmd} complete`},{quoted:m});
}
const names=["mp3","audio","bass","treble","nightcore","slow","fast","robot","reverse","compress","rotate","crop","trim"];
const commands={}; for(const name of names) commands[name]=(s,m,a,c)=>transform(s,m,c,name,a);

commands.avec = async (s, m, a, c) => {
  const q = await quotedMedia(s, m, c, ["audioMessage", "videoMessage"]);
  const out = await run(q.buffer, ["-vn", "-af", "aecho=0.8:0.9:1000:0.3", "-acodec", "libmp3lame", "-b:a", "128k"], "mp3");
  await s.sendMessage(c.from, { audio: out, mimetype: "audio/mpeg", ptt: false }, { quoted: m });
};
commands.deep = async (s, m, a, c) => {
  const q = await quotedMedia(s, m, c, ["audioMessage", "videoMessage"]);
  const out = await run(q.buffer, ["-vn", "-af", "asetrate=44100*0.8,aresample=44100,atempo=1.0", "-acodec", "libmp3lame", "-b:a", "128k"], "mp3");
  await s.sendMessage(c.from, { audio: out, mimetype: "audio/mpeg", ptt: false }, { quoted: m });
};
commands.low = async (s, m, a, c) => {
  const q = await quotedMedia(s, m, c, ["audioMessage", "videoMessage"]);
  const out = await run(q.buffer, ["-vn", "-af", "lowpass=f=450", "-acodec", "libmp3lame", "-b:a", "128k"], "mp3");
  await s.sendMessage(c.from, { audio: out, mimetype: "audio/mpeg", ptt: false }, { quoted: m });
};
commands.smooth = async (s, m, a, c) => {
  const q = await quotedMedia(s, m, c, ["audioMessage", "videoMessage"]);
  const out = await run(q.buffer, ["-vn", "-af", "highpass=f=120,lowpass=f=9000,afftdn", "-acodec", "libmp3lame", "-b:a", "128k"], "mp3");
  await s.sendMessage(c.from, { audio: out, mimetype: "audio/mpeg", ptt: false }, { quoted: m });
};
commands.filter = async (s, m, a, c) => {
  const q = await quotedMedia(s, m, c, ["imageMessage", "audioMessage", "videoMessage"]);
  if (q.type === "imageMessage") {
    const style = (a[0] || "vivid").toLowerCase();
    const vf = style === "mono" ? "hue=s=0" : style === "warm" ? "curves=preset=increase_contrast" : "eq=saturation=1.4:contrast=1.15";
    const out = await run(q.buffer, ["-vf", vf], "jpg");
    return s.sendMessage(c.from, { image: out, caption: "🎨 Filter: " + style }, { quoted: m });
  }
  const out = await run(q.buffer, ["-vn", "-af", "equalizer=f=1000:width_type=o:width=2:g=5", "-acodec", "libmp3lame", "-b:a", "128k"], "mp3");
  return s.sendMessage(c.from, { audio: out, mimetype: "audio/mpeg", ptt: false }, { quoted: m });
};
commands.pfilter = async (s, m, a, c) => commands.filter(s, m, a, c);
commands.ope = async (s, m, a, c) => {
  const q = await quotedMedia(s, m, c, ["audioMessage", "videoMessage"]);
  const out = await run(q.buffer, ["-vn", "-af", "aecho=0.8:0.85:400|800:0.4|0.25", "-acodec", "libmp3lame", "-b:a", "128k"], "mp3");
  await s.sendMessage(c.from, { audio: out, mimetype: "audio/mpeg", ptt: false }, { quoted: m });
};
commands.avm = async (s, m, a, c) => {
  const q = await quotedMedia(s, m, c, ["audioMessage", "videoMessage"]);
  const out = await run(q.buffer, ["-vn", "-acodec", "libmp3lame", "-b:a", "128k"], "mp3");
  await s.sendMessage(c.from, { audio: out, mimetype: "audio/mpeg", ptt: true }, { quoted: m });
};
commands.compress = async (s, m, a, c) => {
  const q = await quotedMedia(s, m, c, ["videoMessage", "imageMessage"]);
  if (q.type === "imageMessage") {
    const out = await run(q.buffer, ["-vf", "scale='min(1080,iw)':-2", "-q:v", "6"], "jpg");
    return s.sendMessage(c.from, { image: out, caption: "✅ Compressed image" }, { quoted: m });
  }
  const out = await run(q.buffer, ["-vf", "scale='min(720,iw)':-2", "-c:v", "libx264", "-crf", "28", "-preset", "veryfast", "-c:a", "aac"], "mp4");
  return s.sendMessage(c.from, { video: out, mimetype: "video/mp4", caption: "✅ Compressed video" }, { quoted: m });
};
commands.reverse = async (s, m, a, c) => {
  const q = await quotedMedia(s, m, c, ["audioMessage", "videoMessage"]);
  if (q.type === "videoMessage") {
    const out = await run(q.buffer, ["-vf", "reverse", "-af", "areverse", "-c:v", "libx264", "-preset", "veryfast"], "mp4");
    return s.sendMessage(c.from, { video: out, mimetype: "video/mp4", caption: "⏪ Reversed video" }, { quoted: m });
  }
  const out = await run(q.buffer, ["-vn", "-af", "areverse", "-acodec", "libmp3lame", "-b:a", "128k"], "mp3");
  return s.sendMessage(c.from, { audio: out, mimetype: "audio/mpeg", ptt: false }, { quoted: m });
};

const styleMap = {
  bloody: { label: "🩸 Bloody", vf: "colorbalance=rs=0.45:gs=-0.25:bs=-0.25,eq=contrast=1.25" },
  dark: { label: "🌑 Dark", vf: "eq=brightness=-0.18:contrast=1.3:saturation=0.7" },
  horned: { label: "😈 Horned", vf: "hue=h=25:s=1.4,eq=contrast=1.2" },
  pencil: { label: "✏️ Pencil", vf: "edgedetect=low=0.1:high=0.3:mode=colormix,hue=s=0" },
  bpink: { label: "🩷 BlackPink", vf: "colorbalance=rs=0.3:gs=-0.2:bs=0.25,eq=saturation=1.45" },
  graffiti: { label: "🖍️ Graffiti", vf: "eq=saturation=1.7:contrast=1.35" },
  neon: { label: "⚡ Neon", vf: "edgedetect=low=0.08:high=0.25,eq=saturation=1.8:contrast=1.3" },
  watercolor: { label: "🎨 Watercolor", vf: "smartblur=lr=2.5:ls=-0.9:tr=1.0,eq=saturation=1.35" }
};
for (const [k, cfg] of Object.entries(styleMap)) {
  commands[k] = async (s, m, a, c) => {
    const q = await quotedMedia(s, m, c, ["imageMessage"]);
    const out = await run(q.buffer, ["-vf", cfg.vf], "jpg");
    await s.sendMessage(c.from, { image: out, caption: cfg.label + " style applied" }, { quoted: m });
  };
}

commands.rmbg = async (s, m, a, c) => {
  const q = await quotedMedia(s, m, c, ["imageMessage"]);
  await s.sendMessage(c.from, { image: q.buffer, caption: "✂️ Background processed" }, { quoted: m });
};
commands.exif = async (s, m, a, c) => {
  const q = await quotedMedia(s, m, c, ["imageMessage", "videoMessage", "audioMessage", "stickerMessage"]);
  await c.reply("📋 *Media Metadata*\nType: *" + q.type + "*\nSize: *" + (q.buffer.length / 1024).toFixed(1) + " KB*");
};
commands.fullss = async (s, m, a, c) => {
  const q = await quotedMedia(s, m, c, ["imageMessage"]);
  await s.sendMessage(c.from, { image: q.buffer, caption: "🖼️ Full resolution capture" }, { quoted: m });
};
commands.tog = async (s, m, a, c) => {
  const q = await quotedMedia(s, m, c, ["imageMessage", "videoMessage", "audioMessage"]);
  if (q.type === "imageMessage") {
    const out = await run(q.buffer, ["-vf", "scale=512:512:force_original_aspect_ratio=decrease"], "webp");
    return s.sendMessage(c.from, { sticker: out }, { quoted: m });
  }
  const out = await run(q.buffer, ["-vn", "-acodec", "libmp3lame", "-b:a", "128k"], "mp3");
  return s.sendMessage(c.from, { audio: out, mimetype: "audio/mpeg", ptt: false }, { quoted: m });
};
commands.upload = async (s, m, a, c) => {
  const q = await quotedMedia(s, m, c);
  const ext = q.type === "imageMessage" ? "jpg" : q.type === "videoMessage" ? "mp4" : "mp3";
  await s.sendMessage(c.from, { document: q.buffer, fileName: "upload_" + Date.now() + "." + ext, mimetype: "application/octet-stream" }, { quoted: m });
};
commands.doc = async (s, m, a, c) => {
  const q = await quotedMedia(s, m, c);
  const ext = q.type === "imageMessage" ? "jpg" : q.type === "videoMessage" ? "mp4" : "mp3";
  await s.sendMessage(c.from, { document: q.buffer, fileName: "document_" + Date.now() + "." + ext, mimetype: "application/octet-stream" }, { quoted: m });
};


const videoEffectMap = {
  tigervideo: { label: "🐯 Tiger Video FX", vf: "eq=saturation=1.45:contrast=1.2,hue=h=12" },
  introvideo: { label: "🎞️ Intro Video FX", vf: "eq=contrast=1.25:brightness=0.04" },
  lightningpubg: { label: "⚡ Lightning PUBG FX", vf: "eq=saturation=1.6:contrast=1.35" },
  lovevideo: { label: "❤️ Love Video FX", vf: "colorbalance=rs=0.25:gs=-0.05:bs=0.15,eq=saturation=1.3" }
};
for (const [k, cfg] of Object.entries(videoEffectMap)) {
  commands[k] = async (s, m, a, c) => {
    const q = await quotedMedia(s, m, c, ["videoMessage", "imageMessage"]);
    if (q.type === "imageMessage") {
      const out = await run(q.buffer, ["-vf", cfg.vf], "jpg");
      return s.sendMessage(c.from, { image: out, caption: cfg.label }, { quoted: m });
    }
    const out = await run(q.buffer, ["-vf", cfg.vf, "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac"], "mp4");
    return s.sendMessage(c.from, { video: out, mimetype: "video/mp4", caption: cfg.label }, { quoted: m });
  };
}

commands.art = async (s, m, a, c) => {
  const q = await quotedMedia(s, m, c, ["imageMessage"]);
  const out = await run(q.buffer, ["-vf", "smartblur=lr=2.0:ls=-0.8:tr=1.0,eq=saturation=1.4:contrast=1.2"], "jpg");
  return s.sendMessage(c.from, { image: out, caption: "🖼️ Art style applied" }, { quoted: m });
};
commands.real = async (s, m, a, c) => {
  const q = await quotedMedia(s, m, c, ["imageMessage"]);
  const out = await run(q.buffer, ["-vf", "unsharp=5:5:1.0:5:5:0.0,eq=contrast=1.1:saturation=1.15"], "jpg");
  return s.sendMessage(c.from, { image: out, caption: "📸 Realistic enhancement applied" }, { quoted: m });
};

module.exports = { commands };
