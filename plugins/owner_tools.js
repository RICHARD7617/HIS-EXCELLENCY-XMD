"use strict";

const C = require("../config");

async function handleToggle(ctx, key, label) {
  const db = ctx.db();
  if (!db.bot) db.bot = {};
  if (!db.groups) db.groups = {};
  
  const isGroup = ctx.isGroup;
  const targetObj = isGroup ? (db.groups[ctx.from] ||= {}) : db.bot;
  
  // 1. Get the requested state from args (e.g., "on" or "off")
  const requested = ctx.args?.[0]?.toLowerCase();
  
  // 2. Default current state to true if it's undefined (Except for group moderations which default to false)
  const defaultValue = isGroup ? false : true;
  let currentState = targetObj[key] ?? defaultValue;
  
  // 3. Apply the new state
  if (requested === "on") {
    targetObj[key] = true;
  } else if (requested === "off") {
    targetObj[key] = false;
  } else {
    targetObj[key] = !currentState; // Just flip it if no args provided
  }

  // 4. Save to DB
  ctx.saveDB(db);

  // 5. Reply
  ctx.reply(`${targetObj[key] ? "✅ Enabled" : "❌ Disabled"} *${label || key}*`);
}
const commands = {
  // ================= OWNER CONTROLS =================
  setprefix: async (s, m, a, c) => {
    if (!c.isOwner) return;
    if (!a[0]) return c.reply("Provide a prefix.");
    const db = c.db();
    db.bot.prefix = a[0];
    c.saveDB(db);
    C.PREFIX = a[0];
    c.reply(`✅ Prefix set to: *${a[0]}*`);
  },
  prefix: async (s, m, a, c) => c.reply(`Current prefix: *${c.prefix}*`),
  mode: async (s, m, a, c) => c.reply(`Current mode: *${C.MODE}*`),
  
  public: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const db = c.db(); db.bot.mode = "PUBLIC"; c.saveDB(db); C.MODE = "PUBLIC";
    c.reply("✅ Bot is now in *PUBLIC* mode.");
  },
  private: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const db = c.db(); db.bot.mode = "PRIVATE"; c.saveDB(db); C.MODE = "PRIVATE";
    c.reply("🔒 Bot is now in *PRIVATE* mode.");
  },

  pair: async (s, m, a, c) => {
    if (!c.isOwner) return;
    if (!a[0]) return c.reply("Usage: .pair 254712345678");
    try {
      const code = await s.requestPairingCode(a[0].replace(/\D/g, ""));
      c.reply(`🔑 Pairing Code: *${code}*`);
    } catch (e) { c.reply(`❌ Failed: ${e.message}`); }
  },

  antidelete: async (s, m, a, c) => toggleAuto(c, "antidelete"),

  // ================= SYSTEM =================
  restart: async (s, m, a, c) => {
    if (!c.isOwner) return;
    await c.reply("🔄 Restarting...");
    setTimeout(() => process.exit(0), 1000); 
  },
  getsettings: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const bot = c.db().bot || {};
    const automations = ["autoread", "autotyping", "autorecording", "autorecordtyping", "autoreact", "autoreactstatus", "autoviewstatus", "antidelete"]
      .map(k => `${bot[k] ? "✅" : "❌"} ${k}`).join("\n");
    c.reply(`⚙️ *Settings*\nMode: *${C.MODE}*\nPrefix: *${C.PREFIX}*\n\n*Automations:*\n${automations}`);
  },
  setsettings: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const key = a[0]?.toLowerCase();
    const val = a[1]?.toLowerCase() === "true";
    if (!key) return c.reply("Usage: .setsettings <setting> <true/false>");
    const db = c.db();
    if (!db.bot) db.bot = {};
    db.bot[key] = val;
    c.saveDB(db);
    c.reply(`✅ Setting *${key}* updated to: *${val}*`);
  },
  test: async (s, m, a, c) => c.reply("✅ Bot is responding perfectly!"),

  // ================= AUTOMATION =================
  autoread: async (s, m, a, c) => toggleAuto(c, "autoread"),
  autotyping: async (s, m, a, c) => toggleAuto(c, "autotyping"),
  autorecording: async (s, m, a, c) => toggleAuto(c, "autorecording"),
  autorecordtyping: async (s, m, a, c) => toggleAuto(c, "autorecordtyping"),
  autoreact: async (s, m, a, c) => toggleAuto(c, "autoreact"),
  autoreactstatus: async (s, m, a, c) => toggleAuto(c, "autoreactstatus"),
  autoviewstatus: async (s, m, a, c) => toggleAuto(c, "autoviewstatus"),

  // ================= CONTACT TOOLS =================
  vv: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) return c.reply("❌ Reply to a View Once.");
    let msg = quoted.viewOnceMessageV2?.message || quoted.viewOnceMessageV2Extension?.message || quoted.viewOnceMessage?.message || quoted;
    const type = Object.keys(msg)[0];
    if (!["imageMessage", "videoMessage"].includes(type)) return c.reply("❌ Not a View Once media.");
    try {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      const stream = await downloadContentFromMessage(msg[type], type.replace("Message", ""));
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      await s.sendMessage(c.from, { [type.replace("Message", "")]: buffer, caption: `📸 View Once Opened` }, { quoted: m });
    } catch (err) { c.reply(`❌ Failed: ${err.message}`); }
  }
};

commands.vv2 = commands.vv;
module.exports = { commands };
