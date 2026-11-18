const env = (key, fallback) =>
  process.env[key] !== undefined && process.env[key] !== ""
    ? process.env[key]
    : fallback;
const num = (key, fallback) => {
  const n = Number(env(key, fallback));
  return Number.isFinite(n) ? n : fallback;
};

// ---- Style helpers ----

// Convert text to 𝐁𝐎𝐋𝐃 math letters (A-Z, a-z, 0-9)
const bold = (s) =>
  Array.from(String(s))
    .map((ch) => {
      const c = ch.codePointAt(0);
      if (c >= 65 && c <= 90) return String.fromCodePoint(0x1d400 + c - 65);
      if (c >= 97 && c <= 122) return String.fromCodePoint(0x1d41a + c - 97);
      if (c >= 48 && c <= 57) return String.fromCodePoint(0x1d7ce + c - 48);
      return ch;
    })
    .join("");

// Convert text to ꜱᴍᴀʟʟ-ᴄᴀᴘꜱ labels
const SMALL = {
  a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ғ", g: "ɢ", h: "ʜ", i: "ɪ",
  j: "ᴊ", k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ", o: "ᴏ", p: "ᴘ", q: "ǫ", r: "ʀ",
  s: "s", t: "ᴛ", u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "x", y: "ʏ", z: "ᴢ",
};
const sc = (s) =>
  Array.from(String(s).toLowerCase())
    .map((ch) => SMALL[ch] || ch)
    .join("");

const config = {
  // ---- EDIT THIS (or set the same names as env variables) ----
  BOT_NAME: env("BOT_NAME", "🔥𝐇𝐈𝐒 𝐄𝐗𝐂𝐄𝐋𝐋𝐄𝐍𝐂𝐘 𝐗𝐌𝐃 𝟎𝟎𝟏🔥"),
  OWNER_NAME: env("OWNER_NAME", "𝐉𝐀𝐍𝐀𝐌😁"),
  OWNER_NUMBER: env("OWNER_NUMBER", "254738993575"),
  PAIR_NUMBER: env("PAIR_NUMBER", "254738993575"), // number to link the bot to
  PREFIX: env("PREFIX", "."),
  MODE: env("MODE", "PUBLIC"), // PUBLIC or PRIVATE (owner only)
  VERSION: "2.0.0",
  TIMEZONE: env("TIMEZONE", "Africa/Lagos"),
  BOT_IMAGE: env(
    "BOT_IMAGE",
    "https://res.cloudinary.com/dqxlb29uz/image/upload/v1794998818/avatars/url-ff1f3e4e-396b-4bb3-866c-8417344022a8.jpg"
  ),

  // ---- Hosting settings ----
  // Folder for the login session. On Railway/Render with a volume/disk,
  // set SESSION_DIR to the mounted path, e.g. /data/session
  SESSION_DIR: env("SESSION_DIR", "session"),
  // Postgres URL (Heroku sets DATABASE_URL automatically). Used to keep the
  // session alive across restarts on hosts with a temporary filesystem.
  DATABASE_URL: env("DATABASE_URL", ""),
  // Port for the tiny health-check page (set automatically by the host)
  PORT: env("PORT", ""),
  // URL to ping so free web hosts don't sleep (Render sets RENDER_EXTERNAL_URL)
  KEEP_ALIVE_URL: env("KEEP_ALIVE_URL", env("RENDER_EXTERNAL_URL", "")),
  KEEP_ALIVE_EVERY: 10 * 60 * 1000, // ping every 10 minutes
  SEND_STARTUP_MSG: env("SEND_STARTUP_MSG", "true") === "true",

  // ---- Anti-spam / safety limits (protect your number and your host) ----
  COOLDOWN_MS: num("COOLDOWN_MS", 2000), // min gap between commands per user
  MAX_PER_MIN: num("MAX_PER_MIN", 15), // max commands per user per minute

  // ---- Technical settings ----
  RECONNECT_DELAY: 3000, // base delay before reconnecting (grows on repeats)
  MAX_BACKOFF: 60000, // reconnect delay never exceeds this
  RESTART_DELAY: 500, // ms for code 515 (restart required)
  PAIR_DELAY: 3000, // ms after socket creation before requesting the code
  PROMPT_TIMEOUT: 20000, // ms to wait for typed input
  PROMPT_RETRY: 15000, // ms before retrying when no number is available
  KEEPALIVE_MS: 30000, // keep-alive interval
  DB_SYNC_MS: 60000, // session backup interval (Postgres)

  // ---- Style: header (top of menu) ----
  header() {
    return (
      "╭─━─━─━─━─━─━─━─━─━─━╮\n" +
      `│    ${this.BOT_NAME}\n` +
      "╰─━─━─━─━─━─━─━─━─━─━╯"
    );
  },

  // ---- Style: section box ----
  // rows: array of [label, value] pairs or plain strings
  section(title, rows) {
    const lines = rows.map((r) =>
      Array.isArray(r) ? `│ ✦ ${sc(r[0])} : ${r[1]}` : `│ ✦ ${r}`
    );
    return (
      `┌───〔 🔥${bold(title)}🔥〕───┐\n` +
      lines.join("\n") +
      "\n└───────────────────┘"
    );
  },

  bold,
  sc,
};

module.exports = config;
