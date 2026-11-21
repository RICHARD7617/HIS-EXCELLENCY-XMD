"use strict";

const fs = require("fs");
const path = require("path");
const C = require("../config");

const commands = {
  // ================= OWNER CONTROLS =================
  setprefix: async (s, m, a, c) => {
    if (!c.isOwner) return c.reply("❌ Owner only.");
    const newPrefix = a[0];
    if (!newPrefix) return c.reply(`Usage: ${c.prefix}setprefix <new_prefix>`);
    C.PREFIX = newPrefix;
    c.reply(`✅ Prefix changed to: *${newPrefix}*`);
  },
  
  prefix: async (s, m, a, c) => {
    c.reply(`Current prefix: *${c.prefix}*`);
  },

  owner: async (s, m, a, c) => {
    c.reply(`👑 *Owner Info*\nName: ${C.OWNER_NAME}\nNumber: ${C.OWNER_NUMBER}`);
  },

  mode: async (s, m, a, c) => {
    if (!c.isOwner) return;
    c.reply(`Current mode: *${c.config.MODE}*`);
  },

  public: async (s, m, a, c) => {
    if (!c.isOwner) return;
    C.MODE = "PUBLIC";
    c.reply("✅ Bot is now in *PUBLIC* mode.");
  },

  private: async (s, m, a, c) => {
    if (!c.isOwner) return;
    C.MODE = "PRIVATE";
    c.reply("🔒 Bot is now in *PRIVATE* mode.");
  },

  pair: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const num = a[0];
    if (!num) return c.reply("Usage: .pair 254712345678");
    try {
      const code = await s.requestPairingCode(num.replace(/\D/g, ""));
      c.reply(`🔑 Pairing Code: *${code}*`);
    } catch (e) {
      c.reply(`❌ Failed: ${e.message}`);
    }
  },

  antidelete: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const db = c.db();
    db.bot.antidelete = !db.bot.antidelete;
    c.saveDB(db);
    c.reply(`${db.bot.antidelete ? "✅ Enabled" : "❌ Disabled"} Anti-Delete.`);
  },

  // ================= SYSTEM & MAINTENANCE =================
  restart: async (s, m, a, c) => {
    if (!c.isOwner) return;
    await c.reply("🔄 Restarting bot...");
    process.exit(0); // Render will auto-restart this
  },

  getsettings: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const db = c.db();
    c.reply(`⚙️ *Settings*\nMode: ${db.bot.mode}\nAnti-Delete: ${db.bot.antidelete ? "On" : "Off"}\nAuto-Read: ${db.bot.autoread ? "On" : "Off"}`);
  },

  test: async (s, m, a, c) => {
    c.reply("✅ Bot is responding perfectly!");
  },

  // ================= AUTOMATION (Toggles) =================
  autoread: async (s, m, a, c) => toggleAuto(c, "autoread"),
  autotyping: async (s, m, a, c) => toggleAuto(c, "autotyping"),
  autorecording: async (s, m, a, c) => toggleAuto(c, "autorecording"),
  autorecordtyping: async (s, m, a, c) => toggleAuto(c, "autorecordtyping"),
  autoreact: async (s, m, a, c) => toggleAuto(c, "autoreact"),
  autoreactstatus: async (s, m, a, c) => toggleAuto(c, "autoreactstatus"),
  autoviewstatus: async (s, m, a, c) => toggleAuto(c, "autoviewstatus"),

  // ================= CONTACT TOOLS =================
    save: async (s, m, a, c) => {
    // 1. Get the quoted message (the status/media you replied to)
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) return c.reply("❌ Please reply to an image, video, or View Once status to save it.");

    // 2. Unwrap it (in case it's a View Once)
    let msg = quoted.viewOnceMessageV2?.message || 
              quoted.viewOnceMessageV2Extension?.message || 
              quoted.viewOnceMessage?.message || 
              quoted;

    // 3. Check if it's media
    const type = Object.keys(msg)[0];
    const validTypes = ["imageMessage", "videoMessage", "audioMessage", "documentMessage"];

    if (!validTypes.includes(type)) {
      return c.reply("❌ The replied message is not a savable media file.");
    }

    try {
      const { downloadMediaMessage } = require("@whiskeysockets/baileys");
      
      // 4. Download the media buffer
      const fakeMsg = { message: msg, key: m.key };
      const buffer = await downloadMediaMessage(fakeMsg, "buffer", {}, { logger: console, reuploadRequest: s.updateMediaMessage });
      
      // 5. Prepare the caption
      const caption = msg[type].caption ? msg[type].caption : "";
      const finalCaption = `📥 *Media Saved*\n\n${caption}`;

      // 6. Send it back to the chat (or to your DM)
      // If you want it sent to the chat:
      await s.sendMessage(c.from, {
        [type.replace("Message", "")]: buffer, // Converts 'imageMessage' to 'image'
        caption: finalCaption
      }, { quoted: m });

      // Optional: If you want it sent to your OWN inbox instead, uncomment the lines below:
      // const ownerJid = process.env.OWNER_NUMBER + "@s.whatsapp.net";
      // await s.sendMessage(ownerJid, { [type.replace("Message", "")]: buffer, caption: finalCaption });

    } catch (err) {
      c.reply(`❌ Failed to save media: ${err.message}`);
    }
  },
  vv: async (s, m, a, c) => {
    // 1. Dig deep into the message context to find the view-once message
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) return c.reply("❌ Please reply to a View Once image or video.");

    // 2. Extract the inner message (WhatsApp hides it in wrappers)
    let msg = quoted.viewOnceMessageV2?.message || 
              quoted.viewOnceMessageV2Extension?.message || 
              quoted.viewOnceMessage?.message || 
              quoted;

    // 3. Find the media type
    const type = Object.keys(msg)[0];
    if (!["imageMessage", "videoMessage"].includes(type)) {
      return c.reply("❌ The replied message is not a View Once image or video.");
    }

    try {
      // 4. Download the media
      const { downloadMediaMessage } = require("@whiskeysockets/baileys");
      const buffer = await downloadMediaMessage(
        { message: msg, key: m.message.extendedTextMessage.contextInfo.stanzaId ? { id: m.message.extendedTextMessage.contextInfo.stanzaId, remoteJid: c.from } : m.key },
        "buffer",
        {},
        { logger: console, reuploadRequest: s.updateMediaMessage }
      );

      // 5. Resend it as a normal message
      const caption = msg[type].caption || "";
      if (type === "imageMessage") {
        await s.sendMessage(c.from, { image: buffer, caption: `📸 *View Once Opened*\n${caption}` }, { quoted: m });
      } else {
        await s.sendMessage(c.from, { video: buffer, caption: `🎥 *View Once Opened*\n${caption}` }, { quoted: m });
      }
    } catch (err) {
      c.reply(`❌ Failed to open media: ${err.message}`);
    }
  }
};

// Helper for Automation toggles
async function toggleAuto(c, key) {
  if (!c.isOwner) return;
  const db = c.db();
  if (!db.bot) db.bot = {};
  db.bot[key] = !db.bot[key];
  c.saveDB(db);
  c.reply(`${db.bot[key] ? "✅ Enabled" : "❌ Disabled"} *${key}*`);
}

commands.vv2 = commands.vv; // Alias vv2 to vv

module.exports = { commands };
