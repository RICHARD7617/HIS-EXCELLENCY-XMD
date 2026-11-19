const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "..", "database.json");
function getDB() {
  if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({ groups: {} }));
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}
function saveDB(db) { fs.writeFileSync(dbPath, JSON.stringify(db, null, 2)); }

const commands = {
  async gpp(sock, message, args, ctx) {
    if (!ctx.isGroup) return ctx.reply("❌ Only works in groups.");
    try {
      const url = await sock.profilePictureUrl(ctx.from, "image");
      await sock.sendMessage(ctx.from, { image: { url }, caption: "📷 Group profile picture" }, { quoted: message });
    } catch (e) { ctx.reply("❌ No group profile picture."); }
  },

  async ginfo(sock, message, args, ctx) {
    if (!ctx.isGroup) return ctx.reply("❌ Only works in groups.");
    try {
      const meta = await sock.groupMetadata(ctx.from);
      const text = `👥 *${meta.subject}*\n\n▸ ID: ${meta.id}\n▸ Members: ${meta.participants.length}\n▸ Owner: ${meta.owner || "unknown"}\n▸ Created: ${new Date(meta.creation * 1000).toLocaleString()}`;
      sock.sendMessage(ctx.from, { text }, { quoted: message });
    } catch (e) { ctx.reply(`❌ ${e.message}`); }
  },

  async tag(sock, message, args, ctx) {
    if (!ctx.isGroup) return ctx.reply("❌ Only works in groups.");
    try {
      const meta = await sock.groupMetadata(ctx.from);
      const mentions = meta.participants.map(p => p.id);
      const text = `📢 ${args.join(" ") || "Attention everyone!"}\n\n` + mentions.map(m => `@${m.split("@")[0]}`).join(" ");
      sock.sendMessage(ctx.from, { text, mentions }, { quoted: message });
    } catch (e) { ctx.reply(`❌ ${e.message}`); }
  },

  async kick(sock, message, args, ctx) {
    if (!ctx.isGroup) return;
    const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentioned.length) return ctx.reply("❌ Mention someone: .kick @user");
    try {
      await sock.groupParticipantsUpdate(ctx.from, mentioned, "remove");
      sock.sendMessage(ctx.from, { text: `✅ Kicked.`, mentions: mentioned }, { quoted: message });
    } catch (e) { ctx.reply(`❌ ${e.message}`); }
  },

  async add(sock, message, args, ctx) {
    if (!ctx.isGroup) return;
    const num = (args[0] || "").replace(/\D/g, "");
    if (!num) return ctx.reply("Usage: .add 254712345678");
    try {
      await sock.groupParticipantsUpdate(ctx.from, [`${num}@s.whatsapp.net`], "add");
      ctx.reply(`✅ Added ${num}`);
    } catch (e) { ctx.reply(`❌ ${e.message}`); }
  },

  async promote(sock, message, args, ctx) {
    if (!ctx.isGroup) return;
    const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentioned.length) return ctx.reply("❌ Mention someone.");
    try {
      await sock.groupParticipantsUpdate(ctx.from, mentioned, "promote");
      sock.sendMessage(ctx.from, { text: `✅ Promoted.`, mentions: mentioned }, { quoted: message });
    } catch (e) { ctx.reply(`❌ ${e.message}`); }
  },

  async demote(sock, message, args, ctx) {
    if (!ctx.isGroup) return;
    const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentioned.length) return ctx.reply("❌ Mention someone.");
    try {
      await sock.groupParticipantsUpdate(ctx.from, mentioned, "demote");
      sock.sendMessage(ctx.from, { text: `✅ Demoted.`, mentions: mentioned }, { quoted: message });
    } catch (e) { ctx.reply(`❌ ${e.message}`); }
  },

  async mute(sock, message, args, ctx) {
    if (!ctx.isGroup) return;
    try {
      await sock.groupSettingUpdate(ctx.from, "announcement");
      ctx.reply("🔇 Group muted.");
    } catch (e) { ctx.reply(`❌ ${e.message}`); }
  },

  async unmute(sock, message, args, ctx) {
    if (!ctx.isGroup) return;
    try {
      await sock.groupSettingUpdate(ctx.from, "not_announcement");
      ctx.reply("🔊 Group unmuted.");
    } catch (e) { ctx.reply(`❌ ${e.message}`); }
  },

  async left(sock, message, args, ctx) {
    if (!ctx.isGroup) return;
    try { await sock.groupLeave(ctx.from); } catch (e) {}
  },

  async invite(sock, message, args, ctx) {
    if (!ctx.isGroup) return;
    try {
      const code = await sock.groupInviteCode(ctx.from);
      ctx.reply(`🔗 Invite: https://chat.whatsapp.com/${code}`);
    } catch (e) { ctx.reply(`❌ ${e.message}`); }
  },

  async antilink(sock, message, args, ctx) {
    if (!ctx.isGroup) return;
    const db = getDB();
    if (!db.groups[ctx.from]) db.groups[ctx.from] = {};
    db.groups[ctx.from].antilink = !db.groups[ctx.from].antilink;
    saveDB(db);
    ctx.reply(db.groups[ctx.from].antilink ? "✅ Antilink Enabled" : "❌ Antilink Disabled");
  },

  async antistatus(sock, message, args, ctx) {
    if (!ctx.isGroup) return;
    const db = getDB();
    if (!db.groups[ctx.from]) db.groups[ctx.from] = {};
    db.groups[ctx.from].antistatus = !db.groups[ctx.from].antistatus;
    saveDB(db);
    ctx.reply(db.groups[ctx.from].antistatus ? "✅ Anti-status Enabled" : "❌ Anti-status Disabled");
  }
};

module.exports = { commands };
