"use strict";

const C = require("../config");
const viewonce = require("../lib/viewonce");

// UNIVERSAL TOGGLE HELPER
async function handleToggle(ctx, key, label) {
  const db = ctx.db();
  if (!db.bot) db.bot = {};
  if (!db.groups) db.groups = {};
  
  const isGroup = ctx.isGroup;
  const targetObj = isGroup ? (db.groups[ctx.from] ||= {}) : db.bot;
  
  const requested = ctx.args?.[0]?.toLowerCase();
  const defaultValue = isGroup ? false : true;
  let currentState = targetObj[key] ?? defaultValue;
  
  if (requested === "on") {
    targetObj[key] = true;
  } else if (requested === "off") {
    targetObj[key] = false;
  } else {
    targetObj[key] = !currentState;
  }

  ctx.saveDB(db);
  ctx.reply(`${targetObj[key] ? "✅ Enabled" : "❌ Disabled"} *${label || key}*`);
}

const commands = {
  // ================= OWNER CONTROLS =================
  setprefix: async (s, m, a, c) => {
    if (!c.isOwner) return;
    if (!a[0]) return c.reply("Provide a prefix.");
    const db = c.db(); db.bot.prefix = a[0]; c.saveDB(db); C.PREFIX = a[0];
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
      .map(k => `${bot[k] ?? true ? "✅" : "❌"} ${k}`).join("\n");
    c.reply(`⚙️ *Settings*\nMode: *${C.MODE}*\nPrefix: *${C.PREFIX}*\n\n*Automations:*\n${automations}`);
  },
  test: async (s, m, a, c) => c.reply("✅ Bot is responding perfectly!"),

  // ================= AUTOMATION =================
  autoread: async (s, m, a, c) => handleToggle(c, "autoread", "Auto Read"),
  autotyping: async (s, m, a, c) => handleToggle(c, "autotyping", "Auto Typing"),
  autorecording: async (s, m, a, c) => handleToggle(c, "autorecording", "Auto Recording"),
  autorecordtyping: async (s, m, a, c) => handleToggle(c, "autorecordtyping", "Auto Record & Typing"),
  autoreact: async (s, m, a, c) => handleToggle(c, "autoreact", "Auto React"),
  autoreactstatus: async (s, m, a, c) => {
    const db = c.db(); db.bot ||= {}; db.bot.autoreactstatus = true; c.saveDB(db);
    return c.reply("✅ Auto-react to WhatsApp statuses is permanently enabled.");
  },
  autoreactchannels: async (s, m, a, c) => {
    const db = c.db(); db.bot ||= {}; db.bot.autoreactchannels = true; c.saveDB(db);
    return c.reply("✅ Auto-react to WhatsApp channels is permanently enabled.");
  },
  autoviewstatus: async (s, m, a, c) => handleToggle(c, "autoviewstatus", "Auto View Status"),
  antidelete: async (s, m, a, c) => handleToggle(c, "antidelete", "Anti-Delete"),

  // ================= CONTACT TOOLS =================
  vv: async (s, m, a, c) => {
    console.log("[owner_tools] vv called");

    if (!c.isOwner) {
      return c.reply("❌ Owner only. Your number was not recognized as owner.");
    }

    const result = await viewonce.openFromReply(m);
    if (!result.found) return c.reply(viewonce.errorText(result));

    await viewonce.sendOpened(
      s,
      c.from,
      result.found,
      result.buffer,
      result.found.media.caption || "📸 *View Once Opened*",
      { quoted: m }
    );
  },

  vv2: async (s, m, a, c) => {
    console.log("[owner_tools] vv2 called");

    if (!c.isOwner) {
      return c.reply("❌ Owner only. Your number was not recognized as owner.");
    }

    const result = await viewonce.openFromReply(m);
    if (!result.found) return c.reply(viewonce.errorText(result));

    const botJid = `${viewonce.norm(s.user?.id)}@s.whatsapp.net`;

    await viewonce.sendOpened(
      s,
      botJid,
      result.found,
      result.buffer,
      `📸 *View Once Opened (private)*\n\nFrom chat: ${c.from}`
    );

    if (c.from !== botJid) await c.reply("✅ Sent to your private chat.");
  },
  };

module.exports = commands;