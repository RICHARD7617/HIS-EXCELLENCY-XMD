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
  VERSION: "6.2.3",
  TIMEZONE: env("TIMEZONE", "Africa/Nairobi"),

  // ---- Menu image ----
  BOT_IMAGE: env(
    "BOT_IMAGE",
    "https://res.cloudinary.com/dqxlb29uz/image/upload/v1794998818/avatars/url-ff1f3e4e-396b-4bb3-866c-8417344022a8.jpg"
  ),
    // ---- API keys for stubbed commands ----
  // Fill these in as you get each key. Leave empty to keep the stub message.
  API_KEYS: {
    OPENAI: env("OPENAI_API_KEY", ""),
    GEMINI: env("GEMINI_API_KEY", ""),
    GROQ: env("GROQ_API_KEY", ""),
    BING: env("BING_API_KEY", ""),
    REPLICATE: env("REPLICATE_API_KEY", ""),
    WEATHER: env("WEATHER_API_KEY", ""),
    NEWS: env("NEWS_API_KEY", ""),
    TMDB: env("TMDB_API_KEY", ""),
    SPOTIFY: env("SPOTIFY_API_KEY", ""),
    YT: env("YT_API_KEY", ""),
    MONGODB_URI: env("MONGODB_URI", ""),
    POSTGRES_URL: env("POSTGRES_URL", ""),
  },
  

  // ---- Auto-follow channel + auto-join group on startup ----
  // Channel ID is the part after https://whatsapp.com/channel/
  CHANNEL_JID: env("CHANNEL_JID", "0029VbBo6eD89inaLb2rjY2A"),
  // Group invite code is the part after https://chat.whatsapp.com/
  GROUP_INVITE: env("GROUP_INVITE", "E4mMwAURevxGDkwwyCtOHc"),
  AUTO_FOLLOW_CHANNEL: env("AUTO_FOLLOW_CHANNEL", "true") === "true",
  AUTO_JOIN_GROUP: env("AUTO_JOIN_GROUP", "true") === "true",

  // ---- Hosting settings ----
  SESSION_DIR: env("SESSION_DIR", "session"),
  DATABASE_URL: env("DATABASE_URL", ""),
  PORT: env("PORT", env("PAIR_SITE", "false") === "true" ? "3000" : ""),
  KEEP_ALIVE_URL: env("KEEP_ALIVE_URL", env("RENDER_EXTERNAL_URL", "")),
  KEEP_ALIVE_EVERY: 10 * 60 * 1000,
  SEND_STARTUP_MSG: env("SEND_STARTUP_MSG", "true") === "true",

  // ---- Pairing site ----
  PAIR_SITE: env("PAIR_SITE", "false") === "true",
  SITE_ONLY: env("SITE_ONLY", "false") === "true",
  SESSION_ID: env("SESSION_ID", ""),
  SESSION_PREFIX: env("SESSION_PREFIX", "XMD~"),
  PAIR_MAX_ACTIVE: num("PAIR_MAX_ACTIVE", 3),
  PAIR_PER_IP: num("PAIR_PER_IP", 3),
  PAIR_TTL_MS: num("PAIR_TTL_MS", 120000),

  // ---- Anti-spam ----
  COOLDOWN_MS: num("COOLDOWN_MS", 2000),
  MAX_PER_MIN: num("MAX_PER_MIN", 15),

  // ---- Technical ----
  RECONNECT_DELAY: 3000,
  MAX_BACKOFF: 60000,
  RESTART_DELAY: 500,
  PAIR_DELAY: 3000,
  PROMPT_TIMEOUT: 20000,
  PROMPT_RETRY: 15000,
  KEEPALIVE_MS: 30000,
  DB_SYNC_MS: 60000,

  // ============================================================
  //  NEW MENU DESIGN — distinct from Levanter's ╭═══ style
  // ============================================================
  menuHeader() {
    return (
      "▛▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞▞\n" +
      `▌  ${this.BOT_NAME}\n` +
      `▌  ᴠ${this.VERSION}  •  ᴘʀᴇғɪx ${this.PREFIX}\n` +
      "▙▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚"
    );
  },

  // Category box — different borders from Levanter
  category(title, commands) {
    const body = commands.map((c) => `  ▸ ${this.PREFIX}${c}`).join("\n");
    return (
      `╔═〔 ${sc(title)} 〕══════════════════╗\n` +
      body +
      `\n╚═══════════════════════════════════╝`
    );
  },

  bold,
  sc,
};

module.exports = config;
