const axios = require("axios");

// If APIX has a specific URL, replace this. Otherwise, it usually mimics OpenAI.
const APIX_URL = "https://api.apix.com/v1/chat/completions"; 

async function queryAI(prompt, model, sock, message, ctx) {
  const apiKey = ctx.config.API_KEYS.APIX;
  if (!apiKey) {
    return ctx.reply("⚠️ APIX API key is missing. Add `APIX_API_KEY` to your environment variables.");
  }

  try {
    await sock.sendMessage(ctx.from, { text: "🤖 *Thinking...*" }, { quoted: message });
    
    const response = await axios.post(
      APIX_URL,
      {
        model: model, // e.g., gpt-3.5-turbo, gemini-pro
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 20000, // 20 seconds timeout
      }
    );

    const replyText = response.data.choices[0].message.content;
    await ctx.reply(replyText);
  } catch (error) {
    console.error("[AI ERROR]", error.response?.data || error.message);
    await ctx.reply(`❌ AI Error: ${error.response?.data?.error?.message || error.message}`);
  }
}

const commands = {
  async gpt(sock, message, args, ctx) {
    const prompt = args.join(" ");
    if (!prompt) return ctx.reply("Usage: .gpt What is the capital of France?");
    await queryAI(prompt, "gpt-3.5-turbo", sock, message, ctx);
  },

  async gemini(sock, message, args, ctx) {
    const prompt = args.join(" ");
    if (!prompt) return ctx.reply("Usage: .gemini Write a poem about the moon.");
    await queryAI(prompt, "gemini-pro", sock, message, ctx);
  },

  async bing(sock, message, args, ctx) {
    const prompt = args.join(" ");
    if (!prompt) return ctx.reply("Usage: .bing Who won the world cup in 2022?");
    await queryAI(prompt, "bing-search", sock, message, ctx);
  },

  async groq(sock, message, args, ctx) {
    const prompt = args.join(" ");
    if (!prompt) return ctx.reply("Usage: .groq Explain quantum physics.");
    await queryAI(prompt, "llama3-70b-8192", sock, message, ctx);
  }
};

module.exports = { commands };
