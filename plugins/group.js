// plugins/group.js
function isAdminOrOwner(msg, sock, ctx) {
  return true; // For now, allow anyone. Add admin check later.
}

const commands = {
  // .gpp — get group profile picture
  async gpp(sock, message, args, ctx) {
    if (!ctx.isGroup) {
      return sock.sendMessage(ctx.from, { text: "❌ Only works in groups." }, { quoted: message });
    }
    try {
      const url = await sock.profilePictureUrl(ctx.from, "image");
      await sock.sendMessage(ctx.from, { image: { url }, caption: "📷 Group profile picture" }, { quoted: message });
    } catch (e) {
      await sock.sendMessage(ctx.from, { text: "❌ No group profile picture." }, { quoted: message });
    }
  },

  // .ginfo — group info
  async ginfo(sock, message, args, ctx) {
    if (!ctx.isGroup) {
      return sock.sendMessage(ctx.from, { text: "❌ Only works in groups." }, { quoted: message });
    }
    try {
      const meta = await sock.groupMetadata(ctx.from);
      const text =
        `👥 *${meta.subject}*\n\n` +
        `▸ ID: ${meta.id}\n` +
        `▸ Members: ${meta.participants.length}\n` +
        `▸ Owner: ${meta.owner || "unknown"}\n` +
        `▸ Created: ${new Date(meta.creation * 1000).toLocaleString()}`;
      await sock.sendMessage(ctx.from, { text }, { quoted: message });
    } catch (e) {
      await sock.sendMessage(ctx.from, { text: `❌ ${e.message}` }, { quoted: message });
    }
  },

  // .tag — tag everyone (mention all)
  async tag(sock, message, args, ctx) {
    if (!ctx.isGroup) {
      return sock.sendMessage(ctx.from, { text: "❌ Only works in groups." }, { quoted: message });
    }
    try {
      const meta = await sock.groupMetadata(ctx.from);
      const mentions = meta.participants.map(p => p.id);
      const text = `📢 ${args.join(" ") || "Attention everyone!"}\n\n` +
        mentions.map(m => `@${m.split("@")[0]}`).join(" ");
      await sock.sendMessage(ctx.from, { text, mentions }, { quoted: message });
    } catch (e) {
      await sock.sendMessage(ctx.from, { text: `❌ ${e.message}` }, { quoted: message });
    }
  },

  // .kick @user
  async kick(sock, message, args, ctx) {
    if (!ctx.isGroup) {
      return sock.sendMessage(ctx.from, { text: "❌ Only works in groups." }, { quoted: message });
    }
    const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentioned.length) {
      return sock.sendMessage(ctx.from, { text: "❌ Mention someone: .kick @user" }, { quoted: message });
    }
    try {
      await sock.groupParticipantsUpdate(ctx.from, mentioned, "remove");
      await sock.sendMessage(ctx.from, { text: `✅ Kicked ${mentioned.map(m => "@" + m.split("@")[0]).join(", ")}`, mentions: mentioned }, { quoted: message });
    } catch (e) {
      await sock.sendMessage(ctx.from, { text: `❌ ${e.message}` }, { quoted: message });
    }
  },

  // .add 254712345678
  async add(sock, message, args, ctx) {
    if (!ctx.isGroup) {
      return sock.sendMessage(ctx.from, { text: "❌ Only works in groups." }, { quoted: message });
    }
    const num = (args[0] || "").replace(/\D/g, "");
    if (!num) {
      return sock.sendMessage(ctx.from, { text: "Usage: .add 254712345678" }, { quoted: message });
    }
    try {
      await sock.groupParticipantsUpdate(ctx.from, [`${num}@s.whatsapp.net`], "add");
      await sock.sendMessage(ctx.from, { text: `✅ Added ${num}` }, { quoted: message });
    } catch (e) {
      await sock.sendMessage(ctx.from, { text: `❌ ${e.message}` }, { quoted: message });
    }
  },

  // .promote @user
  async promote(sock, message, args, ctx) {
    if (!ctx.isGroup) return;
    const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentioned.length) return sock.sendMessage(ctx.from, { text: "❌ Mention someone." }, { quoted: message });
    try {
      await sock.groupParticipantsUpdate(ctx.from, mentioned, "promote");
      await sock.sendMessage(ctx.from, { text: `✅ Promoted to admin.`, mentions: mentioned }, { quoted: message });
    } catch (e) {
      await sock.sendMessage(ctx.from, { text: `❌ ${e.message}` }, { quoted: message });
    }
  },

  // .demote @user
  async demote(sock, message, args, ctx) {
    if (!ctx.isGroup) return;
    const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (!mentioned.length) return sock.sendMessage(ctx.from, { text: "❌ Mention someone." }, { quoted: message });
    try {
      await sock.groupParticipantsUpdate(ctx.from, mentioned, "demote");
      await sock.sendMessage(ctx.from, { text: `✅ Demoted.`, mentions: mentioned }, { quoted: message });
    } catch (e) {
      await sock.sendMessage(ctx.from, { text: `❌ ${e.message}` }, { quoted: message });
    }
  },

  // .mute / .unmute (group announcement only)
  async mute(sock, message, args, ctx) {
    if (!ctx.isGroup) return;
    try {
      await sock.groupSettingUpdate(ctx.from, "announcement");
      await sock.sendMessage(ctx.from, { text: "🔇 Group muted (only admins can chat)." }, { quoted: message });
    } catch (e) {
      await sock.sendMessage(ctx.from, { text: `❌ ${e.message}` }, { quoted: message });
    }
  },

  async unmute(sock, message, args, ctx) {
    if (!ctx.isGroup) return;
    try {
      await sock.groupSettingUpdate(ctx.from, "not_announcement");
      await sock.sendMessage(ctx.from, { text: "🔊 Group unmuted." }, { quoted: message });
    } catch (e) {
      await sock.sendMessage(ctx.from, { text: `❌ ${e.message}` }, { quoted: message });
    }
  },

  // .left
  async left(sock, message, args, ctx) {
    if (!ctx.isGroup) return;
    try {
      await sock.groupLeave(ctx.from);
    } catch (e) {}
  },

  // .invite — get group invite link
  async invite(sock, message, args, ctx) {
    if (!ctx.isGroup) return;
    try {
      const code = await sock.groupInviteCode(ctx.from);
      await sock.sendMessage(ctx.from, { text: `🔗 Invite: https://chat.whatsapp.com/${code}` }, { quoted: message });
    } catch (e) {
      await sock.sendMessage(ctx.from, { text: `❌ ${e.message}` }, { quoted: message });
    }
  },
};

module.exports = { commands };
