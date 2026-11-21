"use strict";

const axios = require("axios");
const C = require("../config");

// ============================================================
// NEW UNIFIED AI API
// ============================================================
async function askNewAPI(prompt) {
  try {
    const r = await axios.get("https://apis.emmyhenztech.name.ng/api/ch-at", {
      params: { 
        question: prompt 
      },
      timeout: 30000 // 30 seconds timeout
    });
    
    // Extracts the reply safely
    return r.data.result || r.data.message || r.data.data || r.data.response || "No response received.";
  } catch (err) {
    throw new Error(err.response?.data?.message || err.message);
  }
}

// ============================================================
// PROVIDER WRAPPER
// ============================================================
function withProvider(name, fn) {
  return async (sock, message, args, ctx) => {
    const prompt = args.join(" ").trim();
    if (!prompt) {
      return ctx.reply(`Usage: ${ctx.prefix}${ctx.command} <your question>`);
    }

    // Optional: show typing indicator
    if (typeof sock.sendPresenceUpdate === "function") {
      sock.sendPresenceUpdate("composing", ctx.from).catch(() => {});
    }

    try {
      const answer = await fn(prompt);
      if (!answer) return ctx.reply(`⚠️ ${name} returned an empty reply.`);
      return ctx.reply(`🤖 *${name}*\n\n${answer}`);
    } catch (err) {
      return ctx.reply(`❌ ${name} error: ${err.message}`);
    }
  };
}

// ============================================================
// COMMANDS (Matching your exact menu screenshot)
// ============================================================
const commands = {
  // The core AI command
  ai: withProvider("AI", askNewAPI),
  
  // The full list from your menu
  gpt: withProvider("GPT", askNewAPI),
  chatgpt: withProvider("ChatGPT", askNewAPI),
  gemini: withProvider("Gemini", askNewAPI),
  cohere: withProvider("Cohere", askNewAPI),
  copilot: withProvider("Copilot", askNewAPI),
  bing: withProvider("Bing", askNewAPI),
  bard: withProvider("Bard", askNewAPI),
  claudeai: withProvider("Claude", askNewAPI),
  grok: withProvider("Grok", askNewAPI),
  groq: withProvider("Groq", askNewAPI),
  blackbox: withProvider("Blackbox", askNewAPI),
  mistral: withProvider("Mistral", askNewAPI),
  metai: withProvider("Meta AI", askNewAPI),
  perplexity: withProvider("Perplexity", askNewAPI),
  qwenai: withProvider("Qwen", askNewAPI),
  ilama: withProvider("Llama", askNewAPI),
  venice: withProvider("Venice", askNewAPI),
  wormgpt: withProvider("WormGPT", askNewAPI),
  deepseek: withProvider("DeepSeek", askNewAPI),
  chatbot: withProvider("Chatbot", askNewAPI)
};

module.exports = { commands };
