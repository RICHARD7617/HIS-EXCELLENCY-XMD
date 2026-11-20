// plugins/stubs.js
// Every command here replies with a clear "not configured" message.
// When you add a real implementation, remove it from this list.

function makeStub(category, needs) {
  return async (sock, message, args, ctx) => {
    await sock.sendMessage(ctx.from, {
      text:
        `⚠️ *${ctx.command}* is not configured yet.\n\n` +
        `▸ Category: ${category}\n` +
        `▸ Needs: ${needs}\n\n` +
        `Add the key in *config.js* under *API_KEYS* and restart the bot.`,
    }, { quoted: message });
  };
}

const ai = makeStub("AI", "an AI API key (OpenAI / Gemini / Groq)");
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
  commands: {

    // ---- Audio ----
    avec: audio, bass: audio, black: audio, blown: audio, cut: audio,
    deep: audio, earrape: audio, fast: audio, fat: audio, histo: audio,
    low: audio, nightcore: audio, pitch: audio, robot: audio, slow: audio,
    smooth: audio, treble: audio, tupai: audio, vector: audio,

    // ---- AutoReply ----
    filter: autoreply, gfilter: autoreply, gstop: autoreply,
    pfilter: autoreply, pstop: autoreply, stop: autoreply,

    // ---- Bot ----
    backup: bot, gauth: bot, gupload: bot, reminder: bot, task: bot,
    tog: bot, update: bot, "update-now": bot, ytlogin: bot,

    // ---- Budget ----
    budget: budget, delbudget: budget, expense: budget,
    income: budget, summary: budget,

    // ---- Document ----
    page: doc, pdf: doc,

    // ---- Download ----
    apk: dl, fb: dl, fullss: dl, insta: dl, mediafire: dl, pinterest: dl,
    play: dl, reddit: dl, song: dl, spotify: dl, ss: dl, story: dl,
    tiktok: dl, twitter: dl, upload: dl, video: dl, yta: dl, ytv: dl,

    // ---- Editor ----
    bloody: editor, bokeh: editor, cartoon: editor, color: editor,
    dark: editor, demon: editor, enhance: editor, gandm: editor,
    horned: editor, kiss: editor, look: editor, makeup: editor,
    pencil: editor, sketch: editor, skull: editor, wanted: editor, zombie: editor,

    // ---- Game ----
    tictactoe: game, wcg: game, wrg: game,

    // ---- Logia ----
    ope: logia, yami: logia, zushi: logia,

    // ---- Misc (some handled in misc.js already; these are the rest) ----
    avm: misc, delcmd: misc, fancy: misc, forward: misc, getcmd: misc,
    lydia: misc, mention: misc, mforward: misc, news: misc, reboot: misc,
    rmbg: editor, save: misc, setcmd: misc, url: misc, whois: search,

    // ---- Personal ----
    delgreet: personal, getgreet: personal, setgreet: personal,

    // ---- Plugin ----
    plugin: plugin, remove: plugin,

    // ---- Schedule ----
    delschedule: schedule, getschedule: schedule, setschedule: schedule,

    // ---- Search ----
    emoji: search, find: search, ig: search, img: search, ison: search,
    jean: search, movie: search, time: search, trt: search,
    weather: search, yts: search,

    // ---- Sticker (sticker & take are real in sticker.js) ----
    circle: textmaker, exif: textmaker, mp4: textmaker, photo: textmaker, tg: textmaker,

    // ---- TextMaker ----
    "3d": textmaker, angel: textmaker, avenger: textmaker, blub: textmaker,
    bpink: textmaker, cat: textmaker, glitch: textmaker, glitter: textmaker,
    graffiti: textmaker, hacker: textmaker, light: textmaker, marvel: textmaker,
    neon: textmaker, sci: textmaker, sign: textmaker, tattoo: textmaker,
    watercolor: textmaker,

    // ---- User ----
    block: user, fullpp: user, gjid: user, jid: user, pp: user, unblock: user,

    // ---- Vars ----
    allvar: vars, delsudo: vars, delvar: vars, getsudo: vars,
    getvar: vars, setsudo: vars, setvar: vars,

    // ---- Video ----
    compress: audio, crop: audio, merge: audio, mp3: audio,
    reverse: audio, rotate: audio, trim: audio,

    // ---- WhatsApp ----
    antiedit: whatsapp, call: whatsapp, caption: whatsapp, cinfo: whatsapp,
    clear: whatsapp, create: whatsapp, delete: whatsapp, dlt: whatsapp,
    doc: whatsapp, online: whatsapp, poll: whatsapp, react: whatsapp,
    read: whatsapp, scstatus: whatsapp, setstatus: whatsapp,
    status: whatsapp, vv: whatsapp,
  },
};
