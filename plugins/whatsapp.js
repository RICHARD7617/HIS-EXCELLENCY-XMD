const commands = {
  async read(sock, message, args, ctx) {
    await sock.readMessages([message.key]);
    ctx.reply("✅ Chat marked as read.");
  },

  async react(sock, message, args, ctx) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) return ctx.reply("❌ Reply to a message with .react ❤️");
    const emoji = args[0] || "❤️";
    try {
      await sock.sendMessage(ctx.from, { react: { text: emoji, key: message.message.extendedTextMessage.contextInfo.stanzaId ? { remoteJid: ctx.from, id: message.message.extendedTextMessage.contextInfo.stanzaId, participant: message.message.extendedTextMessage.contextInfo.participant } : message.key } });
    } catch (e) { ctx.reply(`❌ ${e.message}`); }
  },

  async clear(sock, message, args, ctx) {
    if (!ctx.isGroup) return ctx.reply("❌ Only works in groups.");
    try {
      const meta = await sock.groupMetadata(ctx.from);
      if (meta.announce) return ctx.reply("⚠️ Group is locked (mute). Can't clear."); // Basic check
      await sock.sendMessage(ctx.from, { text: "🧹 Clearing messages...", delete: message.key });
      // Baileys cannot literally clear all chat history, so we just delete the command.
      ctx.reply("✅ Message cleared.");
    } catch (e) { ctx.reply(`❌ ${e.message}`); }
  },

  async setstatus(sock, message, args, ctx) {
    const text = args.join(" ");
    if (!text) return ctx.reply("Usage: .setstatus Hello World");
    try {
      await sock.sendMessage("status@broadcast", { text });
      ctx.reply("✅ Status uploaded!");
    } catch (e) { ctx.reply(`❌ ${e.message}`); }
  }
};

module.exports = { commands };
