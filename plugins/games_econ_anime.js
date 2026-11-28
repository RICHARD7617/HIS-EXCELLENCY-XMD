"use strict";

const axios = require("axios");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const C = require("../config");

const commands = {};

function getEndpoint(key, fallback) {
  return C?.API_URLS?.[key] || process.env[`${key}_API_URL`] || fallback;
}

function extractUrl(payload) {
  if (!payload) return "";
  if (typeof payload === "string" && /^https?:\/\//i.test(payload.trim())) {
    return payload.trim();
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractUrl(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof payload === "object") {
    for (const [k, v] of Object.entries(payload)) {
      if (
        typeof v === "string" &&
        /^https?:\/\//i.test(v) &&
        /url|image|img|gif|link|src|media/i.test(k)
      ) {
        return v;
      }
      const nested = extractUrl(v);
      if (nested) return nested;
    }
  }
  return "";
}

async function fetchMediaBuffer(endpoint, params = {}) {
  const res = await axios.get(endpoint, {
    params,
    responseType: "arraybuffer",
    timeout: 20000,
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  const type = String(res.headers["content-type"] || "").toLowerCase();
  if (type.startsWith("image/") || type.startsWith("video/")) {
    return { buffer: Buffer.from(res.data), mimetype: type.split(";")[0], url: endpoint };
  }

  let json = null;
  try {
    json = JSON.parse(Buffer.from(res.data).toString("utf8"));
  } catch (_) {}

  const mediaUrl = extractUrl(json);
  if (!mediaUrl) return { json };

  const mediaRes = await axios.get(mediaUrl, {
    responseType: "arraybuffer",
    timeout: 20000,
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  const mediaType = String(mediaRes.headers["content-type"] || "image/jpeg").split(";")[0];
  return { buffer: Buffer.from(mediaRes.data), mimetype: mediaType, url: mediaUrl, json };
}

// ============================================================
// IMAGE & ANIME TOOLS (WIRED TO YOUR ENDPOINTS)
// ============================================================
commands.image = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  try {
    if (!q || /blue\s*archive/i.test(q)) {
      const baUrl = getEndpoint("BLUEARCHIVE", "https://prexzyapis.com/random/bluearchive");
      const media = await fetchMediaBuffer(baUrl);
      if (media?.buffer?.length) {
        return s.sendMessage(
          c.from,
          { image: media.buffer, caption: `🖼️ *${q || "Random Anime Image"}*` },
          { quoted: m }
        );
      }
    }

    const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(q)}?width=1024&height=1024&nologo=true`;
    const media = await fetchMediaBuffer(imgUrl);
    if (media?.buffer?.length) {
      return s.sendMessage(
        c.from,
        { image: media.buffer, caption: `🖼️ *Image:* ${q}` },
        { quoted: m }
      );
    }
    return c.reply(`❌ Could not fetch image for *${q}*.`);
  } catch (e) {
    return c.reply(`❌ image failed: ${e.message}`);
  }
};

commands.anime = async (s, m, a, c) => {
  const q = a.join(" ").trim();
  if (!q) {
    try {
      const quoteUrl = getEndpoint("ANIME_QUOTE", "https://apis.emmyhenztech.name.ng/api/anime-quote");
      const { data } = await axios.get(quoteUrl, { timeout: 15000 });
      const quote =
        data?.quote || data?.result?.quote || data?.data?.quote || data?.result || data?.message;
      const char = data?.character || data?.result?.character || data?.data?.character || "";
      const anime = data?.anime || data?.result?.anime || data?.data?.anime || "";
      if (quote && typeof quote === "string") {
        return c.reply(
          `🎌 *Anime Quote*\n_"${quote}"_${char || anime ? `\n— *${char}*${anime ? ` (${anime})` : ""}` : ""}`
        );
      }
    } catch (_) {}
    return c.reply(`Usage: ${c.prefix}anime <anime title>`);
  }

  try {
    const searchUrl = getEndpoint(
      "ANIME_SEARCH",
      "https://apis.emmyhenztech.name.ng/api/animeheaven-search"
    );
    const { data } = await axios.get(searchUrl, {
      params: { q, query: q, search: q },
      timeout: 20000
    });

    const list = Array.isArray(data)
      ? data
      : Array.isArray(data?.result)
      ? data.result
      : Array.isArray(data?.data)
      ? data.data
      : [];

    if (!list.length) {
      return c.reply(`🎌 *Anime Search (${q}):* No results returned.`);
    }

    const lines = list.slice(0, 6).map((item, i) => {
      if (typeof item === "string") return `${i + 1}. ${item}`;
      const title = item.title || item.name || `Result ${i + 1}`;
      const link = item.url || item.link || "";
      return `${i + 1}. *${title}*${link ? `\n   ${link}` : ""}`;
    });

    return c.reply(`🎌 *Anime Results for "${q}":*\n\n${lines.join("\n\n")}`);
  } catch (e) {
    return c.reply(`❌ anime search failed: ${e.message}`);
  }
};

commands.art = async (s, m, a, c) => {
  const prompt = a.join(" ").trim();
  if (!prompt) return c.reply(`Usage: ${c.prefix}art <art prompt>`);
  try {
    const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      `${prompt}, digital anime illustration, vibrant art`
    )}?width=1024&height=1024&nologo=true`;
    const media = await fetchMediaBuffer(imgUrl);
    if (media?.buffer?.length) {
      return s.sendMessage(
        c.from,
        { image: media.buffer, caption: `🎨 *Art:* ${prompt}` },
        { quoted: m }
      );
    }
    return c.reply(`🎨 *Art Prompt:* ${prompt}`);
  } catch (e) {
    return c.reply(`❌ art generation failed: ${e.message}`);
  }
};

commands.real = async (s, m, a, c) => {
  const prompt = a.join(" ").trim();
  if (!prompt) return c.reply(`Usage: ${c.prefix}real <photorealistic prompt>`);
  try {
    const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      `${prompt}, photorealistic, 8k DSLR photography`
    )}?width=1024&height=1024&nologo=true`;
    const media = await fetchMediaBuffer(imgUrl);
    if (media?.buffer?.length) {
      return s.sendMessage(
        c.from,
        { image: media.buffer, caption: `📸 *Realistic:* ${prompt}` },
        { quoted: m }
      );
    }
    return c.reply(`📸 *Realistic Prompt:* ${prompt}`);
  } catch (e) {
    return c.reply(`❌ realistic generation failed: ${e.message}`);
  }
};

commands.imgconvert = async (s, m, a, c) => {
  const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const imgMsg = m.message?.imageMessage || quoted?.imageMessage;
  const urlArg = a.find((x) => /^https?:\/\//i.test(x)) || "";
  if (!imgMsg && !urlArg) {
    return c.reply(`Reply to an image or pass an image URL with ${c.prefix}imgconvert <png|jpg|webp>`);
  }

  try {
    const convUrl = getEndpoint(
      "IMAGE_CONVERTER",
      "https://apis.emmyhenztech.name.ng/api/image-converter"
    );
    const format = (a.find((x) => /^(png|jpg|jpeg|webp)$/i.test(x)) || "png").toLowerCase();

    if (urlArg) {
      const media = await fetchMediaBuffer(convUrl, { url: urlArg, format });
      if (media?.buffer?.length) {
        return s.sendMessage(
          c.from,
          { image: media.buffer, caption: `🔄 *Converted (${format.toUpperCase()})*` },
          { quoted: m }
        );
      }
    }

    if (imgMsg) {
      const stream = await downloadContentFromMessage(imgMsg, "image");
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      return s.sendMessage(
        c.from,
        { image: Buffer.concat(chunks), caption: `🔄 *Image Processed (${format.toUpperCase()})*` },
        { quoted: m }
      );
    }

    return c.reply("❌ Image conversion failed.");
  } catch (e) {
    return c.reply(`❌ imgconvert failed: ${e.message}`);
  }
};

// ============================================================
// ANIME REACTIONS
// ============================================================
const ANIME_REACTIONS = [
  "awoo", "bully", "cringe", "cry", "cuddle", "dance", "glomp", "highfive",
  "hug", "kill", "lick", "megumin", "neko", "pat", "shinobu", "trap",
  "trap2", "waifu", "wink", "yeet"
];

const WAIFU_PICS_MAP = {
  trap2: "trap"
};

commands.animemenu = async (s, m, a, c) => {
  return c.reply("*Anime Reaction Commands:*\n" + ANIME_REACTIONS.join(", "));
};

for (const rx of ANIME_REACTIONS) {
  commands[rx] = async (s, m, a, c) => {
    const mentioned =
      m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
      m.message?.extendedTextMessage?.contextInfo?.participant ||
      "";
    const targetTag = mentioned ? " @" + mentioned.split("@")[0] : "";
    const mentions = mentioned ? [c.sender, mentioned] : [c.sender];
    const caption =
      "*@" +
      c.sender.split("@")[0] +
      "* *" +
      rx +
      "*" +
      targetTag +
      (a.length ? " — " + a.join(" ") : "");

    try {
      const endpointSlug = WAIFU_PICS_MAP[rx] || rx;
      const { data } = await axios.get(`https://api.waifu.pics/sfw/${endpointSlug}`, {
        timeout: 12000
      });
      if (data?.url) {
        const mediaRes = await axios.get(data.url, {
          responseType: "arraybuffer",
          timeout: 15000
        });
        const buf = Buffer.from(mediaRes.data);
        const isGif = /\.gif(\?.*)?$/i.test(data.url);
        return s.sendMessage(
          c.from,
          isGif
            ? { video: buf, gifPlayback: true, caption, mentions }
            : { image: buf, caption, mentions },
          { quoted: m }
        );
      }
    } catch (_) {}

    return s.sendMessage(c.from, { text: caption, mentions }, { quoted: m });
  };
}

// ============================================================
// ECONOMY
// ============================================================
const wallets = new Map();
function getWallet(jid) {
  if (!wallets.has(jid)) {
    wallets.set(jid, { wallet: 500, bank: 0, lastDaily: 0 });
  }
  return wallets.get(jid);
}

commands.economymenu = async (s, m, a, c) => {
  return c.reply(
    "*Economy Commands:*\nbalance, daily, work, deposit, withdraw, pay, rob, gamble, leaderboard, profile"
  );
};

commands.balance = async (s, m, a, c) => {
  const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || c.sender;
  const w = getWallet(target);
  return c.reply(
    "*Balance (@" +
      target.split("@")[0] +
      ")*\nWallet: *$" +
      w.wallet +
      "*\nBank: *$" +
      w.bank +
      "*\nTotal: *$" +
      (w.wallet + w.bank) +
      "*",
    { mentions: [target] }
  );
};

commands.profile = async (s, m, a, c) => commands.balance(s, m, a, c);

commands.daily = async (s, m, a, c) => {
  const w = getWallet(c.sender);
  const now = Date.now();
  const cooldown = 24 * 60 * 60 * 1000;
  if (now - w.lastDaily < cooldown) {
    const remMin = Math.ceil((cooldown - (now - w.lastDaily)) / 60000);
    return c.reply("Daily reward already claimed. Try again in ~" + remMin + " minutes.");
  }
  const reward = 250;
  w.wallet += reward;
  w.lastDaily = now;
  return c.reply("*Daily Reward:* Claimed *$" + reward + "*! Wallet: *$" + w.wallet + "*");
};

commands.work = async (s, m, a, c) => {
  const w = getWallet(c.sender);
  const jobs = [
    "built a web scraper",
    "debugged a microservice",
    "designed a logo pack",
    "moderated a community",
    "ran a benchmark"
  ];
  const earned = Math.floor(Math.random() * 120) + 50;
  const job = jobs[Math.floor(Math.random() * jobs.length)];
  w.wallet += earned;
  return c.reply("You " + job + " and earned *$" + earned + "*. Wallet: *$" + w.wallet + "*");
};

commands.deposit = async (s, m, a, c) => {
  const w = getWallet(c.sender);
  const amt = a[0] === "all" ? w.wallet : parseInt(a[0], 10);
  if (!amt || amt <= 0 || amt > w.wallet) return c.reply("Usage: " + c.prefix + "deposit <amount|all>");
  w.wallet -= amt;
  w.bank += amt;
  return c.reply("Deposited *$" + amt + "* into bank. Bank: *$" + w.bank + "* | Wallet: *$" + w.wallet + "*");
};

commands.withdraw = async (s, m, a, c) => {
  const w = getWallet(c.sender);
  const amt = a[0] === "all" ? w.bank : parseInt(a[0], 10);
  if (!amt || amt <= 0 || amt > w.bank) return c.reply("Usage: " + c.prefix + "withdraw <amount|all>");
  w.bank -= amt;
  w.wallet += amt;
  return c.reply("Withdrew *$" + amt + "* to wallet. Wallet: *$" + w.wallet + "* | Bank: *$" + w.bank + "*");
};

commands.pay = async (s, m, a, c) => {
  const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  const amt = parseInt(a[1] || a[0], 10);
  if (!target || !amt || amt <= 0) return c.reply("Usage: " + c.prefix + "pay @user <amount>");
  const senderW = getWallet(c.sender);
  if (senderW.wallet < amt) return c.reply("Insufficient wallet balance ($" + senderW.wallet + ").");
  const recvW = getWallet(target);
  senderW.wallet -= amt;
  recvW.wallet += amt;
  return c.reply("Sent *$" + amt + "* to @" + target.split("@")[0] + ".", { mentions: [target] });
};

commands.rob = async (s, m, a, c) => {
  const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (!target || target === c.sender) return c.reply("Usage: " + c.prefix + "rob @user");
  const robber = getWallet(c.sender);
  const victim = getWallet(target);
  if (victim.wallet < 50) {
    return c.reply("@" + target.split("@")[0] + " does not have enough cash in wallet to rob.", {
      mentions: [target]
    });
  }
  const success = Math.random() < 0.5;
  if (success) {
    const stolen = Math.min(victim.wallet, Math.floor(Math.random() * 100) + 25);
    victim.wallet -= stolen;
    robber.wallet += stolen;
    return c.reply("You robbed *$" + stolen + "* from @" + target.split("@")[0] + "!", {
      mentions: [target]
    });
  }
  const fine = Math.min(robber.wallet, 50);
  robber.wallet -= fine;
  return c.reply("Caught! You paid a *$" + fine + "* fine.", { mentions: [c.sender] });
};

commands.gamble = async (s, m, a, c) => {
  const w = getWallet(c.sender);
  const bet = parseInt(a[0], 10);
  if (!bet || bet <= 0 || bet > w.wallet) return c.reply("Usage: " + c.prefix + "gamble <amount>");
  const win = Math.random() < 0.48;
  if (win) {
    w.wallet += bet;
    return c.reply("*JACKPOT!* You won *$" + bet + "*! Wallet: *$" + w.wallet + "*");
  }
  w.wallet -= bet;
  return c.reply("You lost *$" + bet + "*. Wallet: *$" + w.wallet + "*");
};

commands.leaderboard = async (s, m, a, c) => {
  const rows = [...wallets.entries()]
    .map(([jid, w]) => ({ jid, total: w.wallet + w.bank }))
    .sort((x, y) => y.total - x.total)
    .slice(0, 10);
  if (!rows.length) return c.reply("No economy records yet.");
  const lines = rows.map((r, i) => i + 1 + ". @" + r.jid.split("@")[0] + " — *$" + r.total + "*");
  return c.reply("*Economy Leaderboard*\n\n" + lines.join("\n"), { mentions: rows.map((r) => r.jid) });
};

// ============================================================
// GAMES
// ============================================================
const wordleBank = ["nodes", "logic", "query", "stack", "token", "cache", "array", "route"];
commands.wordle = async (s, m, a, c) => {
  const guess = (a[0] || "").toLowerCase().trim();
  const target = wordleBank[Math.floor(Math.random() * wordleBank.length)];
  if (!guess || guess.length !== 5) return c.reply("Usage: " + c.prefix + "wordle <5-letter-word>");
  const feedback = [...guess].map((ch, idx) => {
    if (ch === target[idx]) return "[G:" + ch.toUpperCase() + "]";
    if (target.includes(ch)) return "[Y:" + ch.toUpperCase() + "]";
    return "[B:" + ch.toUpperCase() + "]";
  });
  return c.reply("*Wordle*\n" + feedback.join(" ") + "\nTarget word: *" + target.toUpperCase() + "*");
};

commands.hangman = async (s, m, a, c) => {
  const letter = (a[0] || "").toLowerCase();
  const word = "javascript";
  if (!letter) return c.reply("Usage: " + c.prefix + "hangman <letter>");
  const masked = [...word].map((ch) => (ch === letter ? ch.toUpperCase() : "_")).join(" ");
  return c.reply("*Hangman*\nGuess: *" + letter.toUpperCase() + "*\nBoard: " + masked);
};

commands.numberguess = async (s, m, a, c) => {
  const pick = parseInt(a[0], 10);
  const secret = Math.floor(Math.random() * 10) + 1;
  if (!pick || pick < 1 || pick > 10) return c.reply("Usage: " + c.prefix + "numberguess <1-10>");
  return c.reply(
    pick === secret
      ? "Spot on! Both picked *" + secret + "*!"
      : "You picked *" + pick + "*, secret was *" + secret + "*."
  );
};

commands.slots = async (s, m, a, c) => {
  const symbols = ["CHERRY", "LEMON", "BELL", "GEM", "SEVEN"];
  const reels = [0, 1, 2].map(() => symbols[Math.floor(Math.random() * symbols.length)]);
  const win = reels[0] === reels[1] && reels[1] === reels[2];
  return c.reply("[ " + reels.join(" | ") + " ]\n" + (win ? "Triple match!" : "Try again!"));
};

commands.blackjack = async (s, m, a, c) => {
  const player = Math.floor(Math.random() * 11) + 12;
  const dealer = Math.floor(Math.random() * 8) + 15;
  const outcome =
    player > 21
      ? "Bust! Dealer wins."
      : dealer > 21 || player > dealer
      ? "You win!"
      : player === dealer
      ? "Push (tie)."
      : "Dealer wins.";
  return c.reply("*Blackjack*\nYour hand: *" + player + "* | Dealer: *" + dealer + "*\n" + outcome);
};

commands.trivia = async (s, m, a, c) => {
  const pool = [
    { q: "Which data structure uses LIFO order?", ans: "Stack" },
    { q: "What HTTP status code means Not Found?", ans: "404" },
    { q: "Which planet is known as the Red Planet?", ans: "Mars" }
