const commands = {};

const ANIME_REACTIONS = [
  "awoo", "bully", "cringe", "cry", "cuddle", "dance", "glomp", "highfive",
  "hug", "kill", "lick", "megumin", "neko", "pat", "shinobu", "trap",
  "trap2", "waifu", "wink", "yeet"
];

commands.animemenu = async (s, m, a, c) => {
  return c.reply("*Anime Reaction Commands:*\n" + ANIME_REACTIONS.join(", "));
};

for (const rx of ANIME_REACTIONS) {
  commands[rx] = async (s, m, a, c) => {
    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.message?.extendedTextMessage?.contextInfo?.participant || "";
    const targetTag = mentioned ? " @" + mentioned.split("@")[0] : "";
    const mentions = mentioned ? [mentioned] : [];
    return s.sendMessage(c.from, {
      text: "*@" + c.sender.split("@")[0] + "* *" + rx + "*" + targetTag + (a.length ? " — " + a.join(" ") : ""),
      mentions: [c.sender, ...mentions]
    }, { quoted: m });
  };
}

const wallets = new Map();
function getWallet(jid) {
  if (!wallets.has(jid)) {
    wallets.set(jid, { wallet: 500, bank: 0, lastDaily: 0 });
  }
  return wallets.get(jid);
}

commands.economymenu = async (s, m, a, c) => {
  return c.reply("*Economy Commands:*\nbalance, daily, work, deposit, withdraw, pay, rob, gamble, leaderboard, profile");
};

commands.balance = async (s, m, a, c) => {
  const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || c.sender;
  const w = getWallet(target);
  return c.reply("*Balance (@" + target.split("@")[0] + ")*\nWallet: *$" + w.wallet + "*\nBank: *$" + w.bank + "*\nTotal: *$" + (w.wallet + w.bank) + "*", { mentions: [target] });
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
  const jobs = ["built a web scraper", "debugged a microservice", "designed a logo pack", "moderated a community", "ran a benchmark"];
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
  if (victim.wallet < 50) return c.reply("@" + target.split("@")[0] + " does not have enough cash in wallet to rob.", { mentions: [target] });
  const success = Math.random() < 0.5;
  if (success) {
    const stolen = Math.min(victim.wallet, Math.floor(Math.random() * 100) + 25);
    victim.wallet -= stolen;
    robber.wallet += stolen;
    return c.reply("You robbed *$" + stolen + "* from @" + target.split("@")[0] + "!", { mentions: [target] });
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
  const lines = rows.map((r, i) => (i + 1) + ". @" + r.jid.split("@")[0] + " — *$" + r.total + "*");
  return c.reply("*Economy Leaderboard*\n\n" + lines.join("\n"), { mentions: rows.map(r => r.jid) });
};

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
  const masked = [...word].map(ch => (ch === letter ? ch.toUpperCase() : "_")).join(" ");
  return c.reply("*Hangman*\nGuess: *" + letter.toUpperCase() + "*\nBoard: " + masked);
};

commands.numberguess = async (s, m, a, c) => {
  const pick = parseInt(a[0], 10);
  const secret = Math.floor(Math.random() * 10) + 1;
  if (!pick || pick < 1 || pick > 10) return c.reply("Usage: " + c.prefix + "numberguess <1-10>");
  return c.reply(pick === secret ? "Spot on! Both picked *" + secret + "*!" : "You picked *" + pick + "*, secret was *" + secret + "*.");
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
  const outcome = player > 21 ? "Bust! Dealer wins." : (dealer > 21 || player > dealer ? "You win!" : (player === dealer ? "Push (tie)." : "Dealer wins."));
  return c.reply("*Blackjack*\nYour hand: *" + player + "* | Dealer: *" + dealer + "*\n" + outcome);
};

commands.trivia = async (s, m, a, c) => {
  const pool = [
    { q: "Which data structure uses LIFO order?", ans: "Stack" },
    { q: "What HTTP status code means Not Found?", ans: "404" },
    { q: "Which planet is known as the Red Planet?", ans: "Mars" }
  ];
  const item = pool[Math.floor(Math.random() * pool.length)];
  return c.reply("*Trivia*\n" + item.q + "\nAnswer: " + item.ans);
};

commands.chess = async (s, m, a, c) => {
  const move = a.join(" ").trim() || "e4";
  return c.reply("*Chess Move:* *" + move + "*\nBoard move logged. Reply with your next move (e.g. Nf3 or e5).");
};

commands.snake = async (s, m, a, c) => {
  const dir = (a[0] || "right").toLowerCase();
  return c.reply("*Snake Game*\nDirection: *" + dir.toUpperCase() + "*\nUse " + c.prefix + "snake up|down|left|right to steer.");
};

commands.quiz = async (s, m, a, c) => commands.trivia(s, m, a, c);

commands.truthdetector = async (s, m, a, c) => {
  const statement = a.join(" ").trim();
  if (!statement) return c.reply("Usage: " + c.prefix + "truthdetector <statement>");
  const pct = Math.floor(Math.random() * 101);
  return c.reply("*Truth Detector*\nStatement: _\"" + statement + "\"_\nTruth Score: *" + pct + "%*");
};


commands.kiss = async (s, m, a, c) => {
  const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || m.message?.extendedTextMessage?.contextInfo?.participant || "";
  const targetTag = mentioned ? " @" + mentioned.split("@")[0] : "";
  const mentions = mentioned ? [mentioned] : [];
  return s.sendMessage(c.from, {
    text: "*@" + c.sender.split("@")[0] + "* *kiss*" + targetTag + (a.length ? " — " + a.join(" ") : ""),
    mentions: [c.sender, ...mentions]
  }, { quoted: m });
};

module.exports = { commands };
