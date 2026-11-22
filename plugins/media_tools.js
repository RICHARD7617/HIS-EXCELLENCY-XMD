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
module.exports={commands};
