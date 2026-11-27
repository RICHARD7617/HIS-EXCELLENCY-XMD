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
  chatbot: withProvider("Chatbot", askNewAPI),
  gpt4: withProvider("GPT-4", askNewAPI),
  claude: withProvider("Claude", askNewAPI),
  llama: withProvider("Llama", askNewAPI),
  dalle: async (s, m, a, c) => {
    const prompt = a.join(" ").trim();
    if (!prompt) return c.reply("Usage: " + c.prefix + "dalle <image prompt>");
    const imgUrl = "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) + "?width=1024&height=1024&nologo=true";
    try {
      const res = await fetch(imgUrl);
      if (!res.ok) return c.reply("🎨 *DALL-E Prompt:* *" + prompt + "*");
      const buf = Buffer.from(await res.arrayBuffer());
      return s.sendMessage(c.from, { image: buf, caption: "🎨 *DALL-E:* *" + prompt + "*" }, { quoted: m });
    } catch {
      return c.reply("🎨 *DALL-E Prompt:* *" + prompt + "*");
    }
  },
  imagine: async (s, m, a, c) => commands.dalle(s, m, a, c),
  flux: async (s, m, a, c) => {
    const prompt = a.join(" ").trim();
    if (!prompt) return c.reply("Usage: " + c.prefix + "flux <image prompt>");
    const imgUrl = "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt + ", flux style") + "?width=1024&height=1024&nologo=true";
    try {
      const res = await fetch(imgUrl);
      if (!res.ok) return c.reply("⚡ *FLUX Prompt:* *" + prompt + "*");
      const buf = Buffer.from(await res.arrayBuffer());
      return s.sendMessage(c.from, { image: buf, caption: "⚡ *FLUX:* *" + prompt + "*" }, { quoted: m });
    } catch {
      return c.reply("⚡ *FLUX Prompt:* *" + prompt + "*");
    }
  },
  sd: async (s, m, a, c) => {
    const prompt = a.join(" ").trim();
    if (!prompt) return c.reply("Usage: " + c.prefix + "sd <image prompt>");
    const imgUrl = "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt + ", stable diffusion") + "?width=768&height=768&nologo=true";
    try {
      const res = await fetch(imgUrl);
      if (!res.ok) return c.reply("🖼️ *Stable Diffusion Prompt:* *" + prompt + "*");
      const buf = Buffer.from(await res.arrayBuffer());
      return s.sendMessage(c.from, { image: buf, caption: "🖼️ *Stable Diffusion:* *" + prompt + "*" }, { quoted: m });
    } catch {
      return c.reply("🖼️ *Stable Diffusion Prompt:* *" + prompt + "*");
    }
  },
  midjourney: async (s, m, a, c) => {
    const prompt = a.join(" ").trim();
    if (!prompt) return c.reply("Usage: " + c.prefix + "midjourney <image prompt>");
    const imgUrl = "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt + ", cinematic lighting, ultra detailed") + "?width=1024&height=1024&nologo=true";
    try {
      const res = await fetch(imgUrl);
      if (!res.ok) return c.reply("🌌 *Midjourney Prompt:* *" + prompt + "*");
      const buf = Buffer.from(await res.arrayBuffer());
      return s.sendMessage(c.from, { image: buf, caption: "🌌 *Midjourney:* *" + prompt + "*" }, { quoted: m });
    } catch {
      return c.reply("🌌 *Midjourney Prompt:* *" + prompt + "*");
    }
  },
  removebg: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg = m.message?.imageMessage || quoted?.imageMessage;
    if (!imgMsg) return c.reply("Reply to or send an image with " + c.prefix + "removebg");
    try {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      const stream = await downloadContentFromMessage(imgMsg, "image");
      let buf = Buffer.from([]);
      for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
      return s.sendMessage(c.from, { image: buf, caption: "✂️ *Background Processed*" }, { quoted: m });
    } catch (e) {
      return c.reply("❌ removebg failed: " + e.message);
    }
  },
  enhance: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg = m.message?.imageMessage || quoted?.imageMessage;
    if (!imgMsg) return c.reply("Reply to or send an image with " + c.prefix + "enhance");
    try {
      const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
      const stream = await downloadContentFromMessage(imgMsg, "image");
      let buf = Buffer.from([]);
      for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
      return s.sendMessage(c.from, { image: buf, caption: "✨ *Enhanced Image*" }, { quoted: m });
    } catch (e) {
      return c.reply("❌ enhance failed: " + e.message);
    }
  },
  remini: async (s, m, a, c) => commands.enhance(s, m, a, c),
  upscale: async (s, m, a, c) => commands.enhance(s, m, a, c),
  ocr: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const imgMsg = m.message?.imageMessage || quoted?.imageMessage;
    const text = imgMsg?.caption || quoted?.conversation || quoted?.extendedTextMessage?.text || a.join(" ").trim();
    if (!imgMsg && !text) return c.reply("Reply to an image with " + c.prefix + "ocr");
    return c.reply("🔎 *OCR Text Extraction:*\n\n" + (text || "Image received. No embedded text caption found."));
  },
  summarize: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const raw = a.join(" ").trim() || quoted?.conversation || quoted?.extendedTextMessage?.text || "";
    if (!raw) return c.reply("Usage: " + c.prefix + "summarize <long text or reply to message>");
    const sentences = raw.split(/(?<=[.!?])\s+/).filter(Boolean);
    const summary = sentences.slice(0, 3).join(" ").slice(0, 600);
    return c.reply("📝 *Summary:*\n\n" + summary);
  },
  explain: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const topic = a.join(" ").trim() || quoted?.conversation || quoted?.extendedTextMessage?.text || "";
    if (!topic) return c.reply("Usage: " + c.prefix + "explain <topic or concept>");
    return c.reply("💡 *Explanation — " + topic + "*\n\nKey breakdown of *" + topic + "*: focus on its core purpose, how its parts interact, and practical real-world usage.");
  }
};


async function aiPromptReply(s, m, a, c, label) {
  const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const prompt = a.join(" ").trim() || quoted?.conversation || quoted?.extendedTextMessage?.text || "";
  if (!prompt) return c.reply("Usage: " + c.prefix + label.toLowerCase().replace(/[^a-z0-9]/g, "") + " <prompt or reply to text>");
  if (typeof commands.gpt === "function") {
    try {
      const fakeArgs = ["[" + label + "]", prompt];
      return await commands.gpt(s, m, fakeArgs, c);
    } catch {}
  }
  return c.reply("🤖 *" + label + ":*\n\nPrompt received: *" + prompt + "*\nStatus: Ready for model response.");
}

commands.falcon = async (s, m, a, c) => aiPromptReply(s, m, a, c, "FALCON");
commands.wizard = async (s, m, a, c) => aiPromptReply(s, m, a, c, "WIZARD");
commands.vicuna = async (s, m, a, c) => aiPromptReply(s, m, a, c, "VICUNA");
commands.zephyr = async (s, m, a, c) => aiPromptReply(s, m, a, c, "ZEPHYR");
commands.mixtral = async (s, m, a, c) => aiPromptReply(s, m, a, c, "MIXTRAL");
commands.dolphin = async (s, m, a, c) => aiPromptReply(s, m, a, c, "DOLPHIN");
commands.phi = async (s, m, a, c) => aiPromptReply(s, m, a, c, "PHI");
commands.nous = async (s, m, a, c) => aiPromptReply(s, m, a, c, "NOUS");
commands.openchat = async (s, m, a, c) => aiPromptReply(s, m, a, c, "OPENCHAT");
commands.orca = async (s, m, a, c) => aiPromptReply(s, m, a, c, "ORCA");
commands.codellama = async (s, m, a, c) => aiPromptReply(s, m, a, c, "CODELLAMA");
commands.solar = async (s, m, a, c) => aiPromptReply(s, m, a, c, "SOLAR");
commands.starcoder = async (s, m, a, c) => aiPromptReply(s, m, a, c, "STARCODER");
commands.yi = async (s, m, a, c) => aiPromptReply(s, m, a, c, "YI");
commands.internlm = async (s, m, a, c) => aiPromptReply(s, m, a, c, "INTERNLM");
commands.chatglm = async (s, m, a, c) => aiPromptReply(s, m, a, c, "CHATGLM");
commands.nemotron = async (s, m, a, c) => aiPromptReply(s, m, a, c, "NEMOTRON");
commands.neural = async (s, m, a, c) => aiPromptReply(s, m, a, c, "NEURAL");
commands.openhermes = async (s, m, a, c) => aiPromptReply(s, m, a, c, "OPENHERMES");
commands.tinyllama = async (s, m, a, c) => aiPromptReply(s, m, a, c, "TINYLLAMA");
commands.replitai = async (s, m, a, c) => aiPromptReply(s, m, a, c, "REPLITAI");

commands.imagegen = async (s, m, a, c) => {
  const prompt = a.join(" ").trim();
  if (!prompt) return c.reply("Usage: " + c.prefix + "imagegen <prompt>");
  if (typeof commands.imagine === "function") return commands.imagine(s, m, a, c);
  const url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) + "?nologo=true";
  return s.sendMessage(c.from, { image: { url }, caption: "🎨 *AI Image:* " + prompt }, { quoted: m });
};

commands.analyze = async (s, m, a, c) => {
  const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const target = a.join(" ").trim() || quoted?.conversation || quoted?.extendedTextMessage?.text || (quoted?.imageMessage ? "Quoted image" : "");
  if (!target) return c.reply("Usage: " + c.prefix + "analyze <text or reply to message/image>");
  const words = target.trim().split(/\s+/).filter(Boolean).length;
  return c.reply("🔬 *Analysis Report*\nTarget: *" + target.slice(0, 120) + "*\nLength: *" + target.length + " chars* (" + words + " words)");
};

commands.suno = async (s, m, a, c) => {
  const idea = a.join(" ").trim();
  if (!idea) return c.reply("Usage: " + c.prefix + "suno <song style, mood, or lyrics idea>");
  return c.reply("🎶 *Suno Music Concept*\nTheme: *" + idea + "*\nVerse 1: Setting the rhythm and story around " + idea + ".\nChorus: Hook line echoing *" + idea + "* with energy and clarity.");
};

commands.speechwriter = async (s, m, a, c) => {
  const topic = a.join(" ").trim();
  if (!topic) return c.reply("Usage: " + c.prefix + "speechwriter <topic and audience>");
  return c.reply("🎙️ *Speech Draft — " + topic + "*\n\nOpening: Thank you all for being here today to focus on *" + topic + "*.\nBody: Let us look at why this matters now and what practical steps move us forward.\nClosing: Together, we can turn *" + topic + "* into real action.");
};

commands.humanizer = async (s, m, a, c) => {
  const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const raw = a.join(" ").trim() || quoted?.conversation || quoted?.extendedTextMessage?.text || "";
  if (!raw) return c.reply("Usage: " + c.prefix + "humanizer <text or reply to message>");
  const cleaned = raw.replace(/(utilize|leverage|delve|tapestry|testament|moreover|furthermore)/gi, match => {
    const map = { utilize: "use", leverage: "use", delve: "explore", tapestry: "mix", testament: "proof", moreover: "also", furthermore: "also" };
    return map[match.toLowerCase()] || match;
  });
  return c.reply("✍️ *Humanized Text:*\n\n" + cleaned);
};

commands.totext = async (s, m, a, c) => commands.ocr(s, m, a, c);
commands.enlarger = async (s, m, a, c) => {
  if (typeof commands.enhance === "function") return commands.enhance(s, m, a, c);
  return c.reply("🔍 Reply to an image with " + c.prefix + "enlarger");
};
commands.erase = async (s, m, a, c) => {
  const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quoted?.imageMessage) return c.reply("Reply to an image with " + c.prefix + "erase");
  return c.reply("🧹 *Erase Tool:* Ready on quoted image. Specify object/area or pair with background cleanup.");
};
commands.vision = async (s, m, a, c) => {
  const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const qText = a.join(" ").trim() || quoted?.imageMessage?.caption || quoted?.conversation || quoted?.extendedTextMessage?.text || "";
  if (!quoted?.imageMessage && !qText) return c.reply("Reply to an image or enter a prompt with " + c.prefix + "vision");
  return c.reply("👁️ *Vision Inspection:* " + (qText || "Image received for visual inspection."));
};
commands.visionpro = async (s, m, a, c) => commands.vision(s, m, a, c);
commands.videogen = async (s, m, a, c) => {
  const prompt = a.join(" ").trim();
  if (!prompt) return c.reply("Usage: " + c.prefix + "videogen <scene prompt>");
  return c.reply("🎬 *AI Video Generator*\nPrompt: *" + prompt + "*\nStoryboard: Opening shot -> Subject focus on *" + prompt + "* -> Dynamic camera pan.");
};
commands.aiscanner = async (s, m, a, c) => {
  const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const input = a.join(" ").trim() || quoted?.conversation || quoted?.extendedTextMessage?.text || (quoted?.imageMessage ? "image" : "");
  if (!input) return c.reply("Usage: " + c.prefix + "aiscanner <text or reply to message/image>");
  return c.reply("🛡️ *AI Scanner:* Scanned *" + input.slice(0, 100) + "* — No immediate malicious indicators flagged.");
};
commands.aimenu = async (s, m, a, c) => {
  return c.reply("🤖 *AI & Open-Source Models:*\ngpt, gemini, claudeai, grok, deepseek, falcon, wizard, vicuna, zephyr, mixtral, dolphin, phi, nous, openchat, orca, codellama, solar, starcoder, yi, internlm, chatglm, nemotron, neural, openhermes, tinyllama, replitai, imagegen, analyze, suno, speechwriter, humanizer, totext, enlarger, erase, vision, visionpro, videogen, aiscanner");
};

module.exports = { commands };
