"use strict";

const WORDS = [
  ["apple", "A fruit that can keep the doctor away"],
  ["shadow", "It follows you in sunlight but disappears in darkness"],
  ["keyboard", "It has keys but cannot open doors"],
  ["river", "It runs but never walks"],
  ["clock", "It has a face and two hands but no arms or legs"],
  ["echo", "It answers when you call but has no mouth"],
  ["candle", "I grow shorter as I give you light"],
  ["map", "I show you the world but contain no land"],
  ["needle", "I have an eye but cannot see"],
  ["book", "I have a spine and pages but no bones"]
];
const BOT_WORDS = ["tiger", "river", "robot", "table", "eagle", "earth", "house", "lemon", "night", "train", "north", "happy", "yellow"];

function state(ctx) {
  const db = ctx.db();
  if (!db.games || typeof db.games !== "object") db.games = {};
  return db.games;
}
function save(ctx) { ctx.saveDB(ctx.db()); }
function key(ctx) { return ctx.from; }
function boardText(b) {
  const glyph = { X: "❌", O: "⭕", 1: "1️⃣", 2: "2️⃣", 3: "3️⃣", 4: "4️⃣", 5: "5️⃣", 6: "6️⃣", 7: "7️⃣", 8: "8️⃣", 9: "9️⃣" };
  return [0, 1, 2].map(r => b.slice(r * 3, r * 3 + 3).map(v => glyph[v] || "⬜").join(" ")).join("\n");
}
function winner(b) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,c,d] of lines) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? "draw" : null;
}
function botMove(b) {
  const open = b.map((v,i) => v ? -1 : i).filter(i => i >= 0);
  // Win if possible, otherwise block the player, otherwise take center/corner/random.
  for (const mark of ["O", "X"]) {
    for (const i of open) { const test = b.slice(); test[i] = mark; if (winner(test) === mark) return i; }
  }
  if (open.includes(4)) return 4;
  const corners = open.filter(i => [0,2,6,8].includes(i));
  const choices = corners.length ? corners : open;
  return choices[Math.floor(Math.random() * choices.length)];
}

const commands = {
  tictactoe: async (s, m, a, c) => {
    const games = state(c), k = key(c), move = Number(a[0]);
    if (!a.length || ["start", "new", "reset"].includes(String(a[0]).toLowerCase())) {
      games[k] = { type: "ttt", board: Array(9).fill(""), status: "playing" };
      save(c);
      return c.reply(`🎮 *TIC-TAC-TOE — You vs Bot*\nYou are ❌, bot is ⭕.\n\n${boardText(games[k].board)}\n\nPlay with *.tictactoe 1-9*.`);
    }
    const g = games[k];
    if (!g || g.type !== "ttt" || g.status !== "playing") return c.reply("Start a game first with *.tictactoe start*.");
    if (!Number.isInteger(move) || move < 1 || move > 9) return c.reply("Choose a square from 1 to 9.");
    const i = move - 1;
    if (g.board[i]) return c.reply("That square is already occupied. Choose another.");
    g.board[i] = "X";
    let result = winner(g.board);
    if (!result) { const bi = botMove(g.board); if (bi !== undefined) g.board[bi] = "O"; result = winner(g.board); }
    if (result) g.status = result;
    save(c);
    const end = result === "X" ? "🏆 You win!" : result === "O" ? "🤖 Bot wins. Try again!" : result === "draw" ? "🤝 It's a draw!" : "Your turn: *.tictactoe 1-9*";
    return c.reply(`🎮 *TIC-TAC-TOE*\n\n${boardText(g.board)}\n\n${end}`);
  },
  wrg: async (s, m, a, c) => {
    const games = state(c), k = `${key(c)}:wrg`;
    if (!a.length || ["start", "new"].includes(String(a[0]).toLowerCase())) {
      const [answer, clue] = WORDS[Math.floor(Math.random() * WORDS.length)];
      games[k] = { answer, clue, tries: 0 };
      save(c);
      return c.reply(`🧩 *WORD RIDDLE*\n${clue}\n\nReply with *.wrg <answer>*.`);
    }
    const g = games[k];
    if (!g) return c.reply("Start a riddle with *.wrg start*.");
    const guess = a.join(" ").trim().toLowerCase();
    if (guess === g.answer) { delete games[k]; save(c); return c.reply("🎉 Correct! You solved the riddle. Start another with *.wrg start*."); }
    g.tries++;
    save(c);
    return c.reply(`❌ Not quite. Attempts: ${g.tries}. Try again with *.wrg <answer>*.`);
  },
  wcg: async (s, m, a, c) => {
    const games = state(c), k = `${key(c)}:wcg`;
    if (!a.length || ["start", "new"].includes(String(a[0]).toLowerCase())) {
      const word = BOT_WORDS[Math.floor(Math.random() * BOT_WORDS.length)];
      games[k] = { last: word, used: [word] };
      save(c);
      return c.reply(`🔤 *WORD CHAIN*\nI start with *${word}*. Your word must begin with *${word.slice(-1).toUpperCase()}*.\nUse *.wcg <word>*.`);
    }
    const g = games[k];
    if (!g) return c.reply("Start a word chain with *.wcg start*.");
    const word = a.join("").toLowerCase();
    if (!/^[a-z]{2,20}$/.test(word)) return c.reply("Use one English word (2–20 letters).");
    if (word[0] !== g.last.slice(-1)) return c.reply(`Your word must start with *${g.last.slice(-1).toUpperCase()}*.`);
    if (g.used.includes(word)) return c.reply("That word has already been used in this round.");
    g.used.push(word); g.last = word;
    const options = BOT_WORDS.filter(w => w[0] === word.slice(-1) && !g.used.includes(w));
    if (!options.length) { save(c); return c.reply(`👏 Nice word: *${word}*. I can't find a reply in my small word list. You win this round! Start again with *.wcg start*.`); }
    const reply = options[Math.floor(Math.random() * options.length)];
    g.used.push(reply); g.last = reply;
    save(c);
    return c.reply(`✅ *${word}*\n🤖 My word: *${reply}*\nYour next word must start with *${reply.slice(-1).toUpperCase()}*.`);
  }
};
module.exports = { commands };
