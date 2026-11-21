"use strict";

const C = require("../config");

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
  autoreactstatus: async (s, m, a, c) => handleToggle(c, "autoreactstatus", "Auto React Status"),
  autoviewstatus: async (s, m, a, c) => handleToggle(c, "autoviewstatus", "Auto View Status"),
  antidelete: async (s, m, a, c) => handleToggle(c, "antidelete", "Anti-Delete"),

  // ================= CONTACT TOOLS =================
  vv: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) return c.reply("❌ Please reply to a View Once image or video.");

    // 1. Dig into the wrappers to find the actual image/video
    let targetMsg = null;
    let type = null;

    if (quoted.viewOnceMessageV2?.message) {
      targetMsg = quoted.viewOnceMessageV2.message;
      type = Object.keys(targetMsg)[0];
    } else if (quoted.viewOnceMessageV2Extension?.message) {
      targetMsg = quoted.viewOnceMessageV2Extension.message;
      type = Object.keys(targetMsg)[0];
    } else if (quoted.viewOnceMessage?.message) {
      targetMsg = quoted.viewOnceMessage.message;
      type = Object.keys(targetMsg)[0];
    } else if (quoted.imageMessage || quoted.videoMessage) {
      // If they somehow sent it without the wrapper but it's still media
      targetMsg = quoted;
      type = quoted.imageMessage ? "imageMessage" : "videoMessage";
    }

    // 2. Check if we found valid media
    if (!targetMsg || !type || !["imageMessage", "videoMessage"].includes(type)) {
      return c.reply("❌ The replied message is not a View Once image or video.");
    }

    try {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      
      // 3. Extract the media data (contains the url, mediaKey, directPath)
      const media = targetMsg[type];
      
      // 4. Download the stream directly from the media object
      const stream = await downloadContentFromMessage(media, type.replace("Message", ""));
      
      let buffer = Buffer.from([]);
      for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
      }
      
      // 5. Send it back
      const caption = media.caption ? `\n\n${media.caption}` : "";
      await s.sendMessage(c.from, { 
        [type.replace("Message", "")]: buffer, 
        caption: `📸 *View Once Opened*${caption}` 
      }, { quoted: m });

    } catch (err) { 
      c.reply(`❌ Failed to open View Once: ${err.message}`); 
    }
  },

  save: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) return c.reply("❌ Reply to media to save it.");
    
    let msg = quoted.viewOnceMessageV2?.message || 
              quoted.viewOnceMessageV2Extension?.message || 
              quoted.viewOnceMessage?.message || 
              quoted;

    const type = Object.keys(msg)[0];
    const validTypes = ["imageMessage", "videoMessage", "audioMessage", "documentMessage"];
    if (!validTypes.includes(type)) return c.reply("❌ Not a savable media file.");

    try {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      const stream = await downloadContentFromMessage(msg[type], type.replace("Message", ""));
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      
      const caption = msg[type].caption ? msg[type].caption : "";
      
      await s.sendMessage(c.from, { 
        [type.replace("Message", "")]: buffer, 
        caption: `📥 *Media Saved*\n\n${caption}` 
      }, { quoted: m });
      
    } catch (err) { 
      c.reply(`❌ Failed to save: ${err.message}`); 
    }
  }
};

commands.vv2 = commands.vv;
module.exports = { commands };
