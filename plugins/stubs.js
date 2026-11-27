// plugins/stubs.js
// Every command here replies with a clear "not configured" message.
// When you add a real implementation, remove it from this list.

function makeStub(category, needs) {
  return async (sock, message, args, ctx) => {
    await sock.sendMessage(ctx.from, {
      }, { quoted: message });
  };
}

const dl = makeStub("Download", "a downloader API key or the official site API");
const editor = makeStub("Editor", "an image-editing API key");
const textmaker = makeStub("TextMaker", "a textmaker API (e.g. mumaker, ephoto)");
const search = makeStub("Search", "a search API key");
const audio = makeStub("Audio", "an ffmpeg audio processing API");
const budget = makeStub("Budget", "a database (MongoDB / Postgres)");
const doc = makeStub("Document", "a PDF/document API");
const schedule = makeStub("Schedule", "a scheduler backend");
const personal = makeStub("Personal", "a database for greetings");
const user = makeStub("User", "WhatsApp Business API or admin rights");
const vars = makeStub("Vars", "a database for persistent vars");
const game = makeStub("Game", "a game engine backend");
const plugin = makeStub("Plugin", "a plugin management API");
const bot = makeStub("Bot", "a bot backend service");
const autoreply = makeStub("AutoReply", "a database + WhatsApp filter API");
const misc = makeStub("Misc", "an external API");
const logia = makeStub("Logia", "a database");
const whatsapp = makeStub("WhatsApp", "a WhatsApp Business API");

module.exports = {
  black: audio, blown: audio, cut: audio,
    earrape: audio, fast: audio, fat: audio, histo: audio,
    nightcore: audio, pitch: audio, robot: audio, slow: audio,
    treble: audio, tupai: audio, vector: audio,

    // ---- AutoReply ----
    gfilter: autoreply, gstop: autoreply,
    pstop: autoreply, stop: autoreply,

    // ---- Bot ----
    gauth: bot, gupload: bot, reminder: bot, task: bot,
    "update-now": bot, ytlogin: bot,

    // ---- Budget ----

    // ---- Document ----

    // ---- Download ----
    insta: dl, reddit: dl, ss: dl, story: dl,
    yta: dl, 

    // ---- Editor ----
    bokeh: editor, cartoon: editor, color: editor,
    demon: editor, gandm: editor,
     look: editor, makeup: editor,
    sketch: editor, skull: editor, wanted: editor, zombie: editor,

    // ---- Game ----
    

    // ---- Logia ----
    yami: logia, zushi: logia,

    // ---- Misc (some handled in misc.js already; these are the rest) ----
    delcmd: misc, fancy: misc, forward: misc, getcmd: misc,
    mention: misc, mforward: misc, reboot: misc,
    setcmd: misc,  

    // ---- Personal ----
    getgreet: personal, setgreet: personal,

    // ---- Plugin ----
    remove: plugin,

    // ---- Schedule ----

    // ---- Search ----

    // ---- Sticker (sticker & take are real in sticker.js) ----
    mp4: textmaker, photo: textmaker, tg: textmaker,

    // ---- TextMaker ----
    "3d": textmaker, angel: textmaker, avenger: textmaker, blub: textmaker,
    glitch: textmaker, glitter: textmaker,
    hacker: textmaker, light: textmaker, marvel: textmaker,
    sci: textmaker, sign: textmaker, tattoo: textmaker,
    // ---- User ----
    // ---- Vars ----
    delvar: vars, getvar: vars, setsudo: vars, setvar: vars,

    // ---- Video ----
    crop: audio, merge: audio, mp3: audio,
    rotate: audio, trim: audio,

    // ---- WhatsApp (Remaining ones) ----
    caption: whatsapp, cinfo: whatsapp,
    delete: whatsapp, dlt: whatsapp,
     poll: whatsapp, scstatus: whatsapp, status: whatsapp
  };
