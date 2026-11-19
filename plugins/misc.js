// plugins/misc.js
const os = require("os");

async function reply(sock, message, from, text) {
  return sock.sendMessage(from, { text }, { quoted: message });
}

const commands = {
  // .uptime — same info as .runtime but through plugin system
  async uptime(sock, message, args, ctx) {
    await reply(sock, message, ctx.from, `⏱ Uptime: ${ctx.runtime()}`);
  },

  // .server — system stats
  async server(sock, message, args, ctx) {
    const total = Math.round(os.totalmem() / 1024 / 1024);
    const free = Math.round(os.freemem() / 1024 / 1024);
    const used = total - free;
    const text =
      `🖥 *SERVER STATS*\n\n` +
      `▸ Platform: ${os.platform()} (${os.arch()})\n` +
      `▸ CPU cores: ${os.cpus().length}\n` +
      `▸ RAM: ${used}MB / ${total}MB used\n` +
      `▸ Uptime: ${ctx.runtime()}\n` +
      `▸ Node: ${process.version}`;
    await reply(sock, message, ctx.from, text);
  },

  // .calc 2+2
  async calc(sock, message, args, ctx) {
    const expr = args.join(" ");
    if (!expr) return reply(sock, message, ctx.from, "Usage: .calc 2+2");
    try {
      // Safe eval — only digits and operators
      if (!/^[\d+\-*/().\s%]+$/.test(expr)) {
        return reply(sock, message, ctx.from, "❌ Only numbers and + - * / ( ) allowed.");
      }
      const result = Function(`"use strict"; return (${expr})`)();
      await reply(sock, message, ctx.from, `🧮 ${expr} = *${result}*`);
    } catch (e) {
      await reply(sock, message, ctx.from, `❌ Invalid expression.`);
    }
  },

  // .whoami
  async whoami(sock, message, args, ctx) {
    await reply(sock, message, ctx.from,
      `👤 You are: ${ctx.sender.split("@")[0]}\n` +
      `📱 Chat: ${ctx.from.split("@")[0]}\n` +
      `👥 Group: ${ctx.isGroup ? "Yes" : "No"}`
    );
  },

  // .afk
  async afk(sock, message, args, ctx) {
    await reply(sock, message, ctx.from, "😴 You are now AFK.");
  },

  // .qr text  → returns a qr code image using free API
  async qr(sock, message, args, ctx) {
    const text = args.join(" ");
    if (!text) return reply(sock, message, ctx.from, "Usage: .qr some text");
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(text)}`;
    try {
      await sock.sendMessage(ctx.from, { image: { url }, caption: `QR for: ${text}` }, { quoted: message });
    } catch (e) {
      await reply(sock, message, ctx.from, `❌ QR failed: ${e.message}`);
    }
  },

  // .tts text → stub for now (needs external)
  async tts(sock, message, args, ctx) {
    await reply(sock, message, ctx.from, "🔇 TTS not configured yet. Add a TTS API key in config.js");
  },

  // .emix — placeholder
  async emix(sock, message, args, ctx) {
    await reply(sock, message, ctx.from, "🎨 emix needs an API key. Add it in config.js");
  },
};

module.exports = { commands };
