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
  // ---- EDIT THIS ----
  BOT_NAME: "🔥𝐇𝐈𝐒 𝐄𝐗𝐂𝐄𝐋𝐋𝐄𝐍𝐂𝐘 𝐗𝐌𝐃 𝟎𝟎𝟏🔥",
  OWNER_NAME: "𝐉𝐀𝐍𝐀𝐌😁",
  OWNER_NUMBER: "254738993575",
  PAIR_NUMBER: "254738993575", // WhatsApp number to link the bot to (env PAIR_NUMBER is the fallback)
  PREFIX: ".",
  MODE: "PUBLIC", // PUBLIC or PRIVATE (owner only)
  VERSION: "2.0.0",
  TIMEZONE: "Africa/Lagos",
  BOT_IMAGE:
    "https://res.cloudinary.com/dqxlb29uz/image/upload/v1794998818/avatars/url-ff1f3e4e-396b-4bb3-866c-8417344022a8.jpg",

  // ---- Technical settings ----
  SESSION_DIR: "session", // auth folder name
  RECONNECT_DELAY: 3000, // ms before reconnecting after a drop
  RESTART_DELAY: 500, // ms for code 515 (restart required)
  PAIR_DELAY: 3000, // ms after socket creation before requesting the pairing code
  PROMPT_TIMEOUT: 20000, // ms to wait for typed input before giving up
  PROMPT_RETRY: 15000, // ms before retrying when no number is available
  KEEPALIVE_MS: 30000, // keep-alive interval

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
