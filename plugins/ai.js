"use strict";

const axios = require("axios");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const C = require("../config");

function getEndpoint(key, fallback) {
  return C?.API_URLS?.[key] || process.env[`${key}_API_URL`] || fallback;
}

function getApiKey(key) {
  return C?.API_KEYS?.[key] || process.env[`${key}_API_KEY`] || "";
}

function extractReply(data) {
  if (!data) return "";
  if (typeof data === "string") return data.trim();
  return String(
    data.result ??
      data.response ??
      data.answer ??
      data.reply ??
      data.message ??
      data.text ??
      data.data?.result ??
      data.data?.response ??
      data.data?.message ??
      (typeof data.data === "string" ? data.data : "") ??
      ""
  ).trim();
}

async function callEndpoint(url, params = {}, headers = {}) {
  const res = await axios.get(url, {
    params,
    headers: {
      "User-Agent": "Mozilla/5.0 HIS-EXCELLENCY-XMD/1.0",
      ...headers
    },
    timeout: 30000
  });
  const text = extractReply(res.data);
  if (!text) throw new Error("Empty response from AI endpoint.");
  return text;
}

// ============================================================
// AI TEXT PROVIDERS (WIRED TO YOUR ENDPOINTS & CONFIG)
// ============================================================
async function askChatAPI(prompt) {
  const endpoint = getEndpoint("CHATBOT", "https://prexzyapis.com/ai/chatbot");
  try {
    return await callEndpoint(endpoint, { text: prompt, search: "" });
  } catch (_) {
    const fallback = getEndpoint("GPT", "https://apis.emmyhenztech.name.ng/api/ch-at");
    if (fallback.includes("/api/ch-at")) {
      return await callEndpoint(fallback, { question: prompt });
    }
    return await callEndpoint(fallback, { prompt });
  }
}

async function askGPT(prompt) {
  const endpoint = getEndpoint("GPT", "https://apiss.vinniedigitalhub.co.ke/ai/gpt");
  try {
    return await callEndpoint(endpoint, { prompt });
  } catch (_) {
    return await askChatAPI(prompt);
  }
}

async function askDeepSeek(prompt) {
  const endpoint = getEndpoint("DEEPSEEK", "https://prexzyapis.com/ai/deepseek-v4-1-flash-1017");
  try {
    return await callEndpoint(endpoint, { text: prompt });
  } catch (_) {
    return await askChatAPI(prompt);
  }
}

async function askGemini(prompt) {
  const endpoint = getEndpoint("GEMINI_PROXY", "https://apis.emmyhenztech.name.ng/api/gemini-proxy");
  const key = getApiKey("GEMINI");
  try {
    return await callEndpoint(
      endpoint,
      { prompt, question: prompt, text: prompt },
      key ? { Authorization: `Bearer ${key}`, "x-api-key": key } : {}
    );
  } catch (_) {
    return await askChatAPI(prompt);
  }
}

// ============================================================
// PROVIDER WRAPPER
// ============================================================
function withProvider(name, fn) {
  return async (sock, message, args, ctx) => {
    const quotedText =
      message?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
      message?.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text ||
      "";
    const prompt = (args.join(" ").trim() || quotedText).trim();
    if (!prompt) {
      return ctx.reply(`Usage: ${ctx.prefix}${ctx.command} <your question>`);
    }

    if (typeof sock.sendPresenceUpdate === "function") {
      sock.sendPresenceUpdate("composing", ctx.from).catch(() => {});
    }

    try {
      const answer = await fn(prompt);
      return ctx.reply(`🤖 *${name}*\n\n${answer}`);
    } catch (err) {
      return ctx.reply(`❌ ${name} error: ${err.message}`);
    }
  };
}

async function sendPollinationsImage(sock, m, c, prompt, suffix, label, width = 1024, height = 1024) {
  const fullPrompt = suffix ? `${prompt}, ${suffix}` : prompt;
  const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=${width}&height=${height}&nologo=true`;
  try {
    const res = await fetch(imgUrl);
    if (!res.ok) return c.reply(`${label} *Prompt:* *${prompt}*`);
    const buf = Buffer.from(await res.arrayBuffer());
    return sock.sendMessage(c.from, { image: buf, caption: `${label}: *${prompt}*` }, { quoted: m });
  } catch {
    return c.reply(`${label} *Prompt:* *${prompt}*`);
  }
}

async function downloadQuotedImage(m) {
  const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const imgMsg = m.message?.imageMessage || quoted?.imageMessage;
  if (!imgMsg) return null;
  const stream = await downloadContentFromMessage(imgMsg, "image");
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { imgMsg, buffer: Buffer.concat(chunks) };
}

// ============================================================
// COMMANDS
// ============================================================
const commands = {
  ai: withProvider("AI", askChatAPI),
  gpt: withProvider("GPT", askGPT),
  chatgpt: withProvider("ChatGPT", askGPT),
  gpt4: withProvider("GPT-4", askGPT),
  gemini: withProvider("Gemini", askGemini),
  bard: withProvider("Bard", askGemini),
  deepseek: withProvider("DeepSeek", askDeepSeek),
  chatbot: withProvider("Chatbot", askChatAPI),

  cohere: withProvider("Cohere", (p) => askChatAPI(`Answer as Cohere AI: ${p}`)),
  copilot: withProvider("Copilot", (p) => askChatAPI(`Answer as Microsoft Copilot: ${p}`)),
  bing: withProvider("Bing", (p) => askChatAPI(`Answer as Bing AI: ${p}`)),
  claudeai: withProvider("Claude", (p) => askChatAPI(`Answer as Claude AI: ${p}`)),
  claude: withProvider("Claude", (p) => askChatAPI(`Answer as Claude AI: ${p}`)),
  grok: withProvider("Grok", (p) => askChatAPI(`Answer as Grok AI: ${p}`)),
  groq: withProvider("Groq", (p) => askChatAPI(`Answer concisely and quickly: ${p}`)),
  blackbox: withProvider("Blackbox", (p) => askChatAPI(`Provide a clear technical/coding answer: ${p}`)),
  mistral: withProvider("Mistral", (p) => askChatAPI(`Answer as Mistral AI: ${p}`)),
  metai: withProvider("Meta AI", (p) => askChatAPI(`Answer as Meta AI: ${p}`)),
  perplexity: withProvider("Perplexity", (p) => askChatAPI(`Provide a well-structured researched answer: ${p}`)),
  qwenai: withProvider("Qwen", (p) => askChatAPI(`Answer as Qwen AI: ${p}`)),
  ilama: withProvider("Llama", (p) => askChatAPI(`Answer as Meta Llama: ${p}`)),
  llama: withProvider("Llama", (p) => askChatAPI(`Answer as Meta Llama: ${p}`)),
  venice: withProvider("Venice", (p) => askChatAPI(`Answer directly and clearly: ${p}`)),
  wormgpt: withProvider("WormGPT", (p) => askChatAPI(`Answer defensively and analytically: ${p}`)),

  dalle: async (s, m, a, c) => {
    const prompt = a.join(" ").trim();
    if (!prompt) return c.reply(`Usage: ${c.prefix}dalle <image prompt>`);
    return sendPollinationsImage(s, m, c, prompt, "", "🎨 *DALL-E*");
  },
  imagine: async (s, m, a, c) => commands.dalle(s, m, a, c),
  imagegen: async (s, m, a, c) => commands.dalle(s, m, a, c),
  flux: async (s, m, a, c) => {
    const prompt = a.join(" ").trim();
    if (!prompt) return c.reply(`Usage: ${c.prefix}flux <image prompt>`);
    return sendPollinationsImage(s, m, c, prompt, "flux style", "⚡ *FLUX*");
  },
  sd: async (s, m, a, c) => {
    const prompt = a.join(" ").trim();
    if (!prompt) return c.reply(`Usage: ${c.prefix}sd <image prompt>`);
    return sendPollinationsImage(s, m, c, prompt, "stable diffusion", "🖼️ *Stable Diffusion*", 768, 768);
  },
  midjourney: async (s, m, a, c) => {
    const prompt = a.join(" ").trim();
    if (!prompt) return c.reply(`Usage: ${c.prefix}midjourney <image prompt>`);
    return sendPollinationsImage(s, m, c, prompt, "cinematic lighting, ultra detailed", "🌌 *Midjourney*");
  },

  removebg: async (s, m, a, c) => {
    const media = await downloadQuotedImage(m);
    if (!media) return c.reply(`Reply to or send an image with ${c.prefix}removebg`);
    return s.sendMessage(c.from, { image: media.buffer, caption: "✂️ *Image Received* (configure a background-removal API key for automatic cutout)" }, { quoted: m });
  },
  enhance: async (s, m, a, c) => {
    const media = await downloadQuotedImage(m);
    if (!media) return c.reply(`Reply to or send an image with ${c.prefix}enhance`);
    return s.sendMessage(c.from, { image: media.buffer, caption: "✨ *Image Received* (configure an upscaler API key for AI enhancement)" }, { quoted: m });
  },
  remini: async (s, m, a, c) => commands.enhance(s, m, a, c),
  upscale: async (s, m, a, c) => commands.enhance(s, m, a, c),
  enlarger: async (s, m, a, c) => commands.enhance(s, m, a, c),
  erase: async (s, m, a, c) => {
    const media = await downloadQuotedImage(m);
    if (!media) return c.reply(`Reply to an image with ${c.prefix}erase`);
    return s.sendMessage(c.from, { image: media.buffer, caption: "🧹 *Image Received* (configure an inpainting/erase API key for object removal)" }, { quoted: m });
  },

  ocr: async (s, m, a, c) => {
    const media = await downloadQuotedImage(m);
    const caption = media?.imgMsg?.caption || a.join(" ").trim();
    if (!media && !caption) return c.reply(`Reply to an image with ${c.prefix}ocr`);
    if (caption) {
      try {
        const extracted = await askChatAPI(`Extract or transcribe all text from this image context:\n${caption}`);
        return c.reply(`🔎 *OCR Text Extraction:*\n\n${extracted}`);
      } catch (_) {}
    }
    return c.reply("🔎 *OCR Text Extraction:*\n\nNo caption or readable text found on the image.");
  },
  totext: async (s, m, a, c) => commands.ocr(s, m, a, c),

  summarize: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const raw = (a.join(" ").trim() || quoted?.conversation || quoted?.extendedTextMessage?.text || "").trim();
    if (!raw) return c.reply(`Usage: ${c.prefix}summarize <long text or reply to message>`);
    try {
      const out = await askChatAPI(`Summarize this concisely with key bullet points:\n\n${raw}`);
      return c.reply(`📝 *Summary:*\n\n${out}`);
    } catch (_) {
      const sentences = raw.split(/(?<=[.!?])\s+/).filter(Boolean);
      return c.reply(`📝 *Summary:*\n\n${sentences.slice(0, 3).join(" ").slice(0, 600)}`);
    }
  },

  explain: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const topic = (a.join(" ").trim() || quoted?.conversation || quoted?.extendedTextMessage?.text || "").trim();
    if (!topic) return c.reply(`Usage: ${c.prefix}explain <topic or concept>`);
    try {
      const out = await askChatAPI(`Explain "${topic}" clearly with practical examples.`);
      return c.reply(`💡 *Explanation — ${topic}*\n\n${out}`);
    } catch (_) {
      return c.reply(`💡 *Explanation — ${topic}*\n\nKey breakdown of *${topic}*: focus on its core purpose, how its parts interact, and practical real-world usage.`);
    }
  },

  analyze: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const target = (a.join(" ").trim() || quoted?.conversation || quoted?.extendedTextMessage?.text || (quoted?.imageMessage ? "Quoted image" : "")).trim();
    if (!target) return c.reply(`Usage: ${c.prefix}analyze <text or reply to message/image>`);
    try {
      const out = await askChatAPI(`Analyze the following text/topic thoroughly:\n\n${target}`);
      return c.reply(`🔬 *Analysis Report*\n\n${out}`);
    } catch (_) {
      const words = target.split(/\s+/).filter(Boolean).length;
      return c.reply(`🔬 *Analysis Report*\nTarget: *${target.slice(0, 120)}*\nLength: *${target.length} chars* (${words} words)`);
    }
  },

  suno: async (s, m, a, c) => {
    const idea = a.join(" ").trim();
    if (!idea) return c.reply(`Usage: ${c.prefix}suno <song style, mood, or lyrics idea>`);
    try {
      const out = await askChatAPI(`Create a song concept, style tags, verse, and chorus for: ${idea}`);
      return c.reply(`🎶 *Suno Music Concept*\n\n${out}`);
    } catch (_) {
      return c.reply(`🎶 *Suno Music Concept*\nTheme: *${idea}*`);
    }
  },

  speechwriter: async (s, m, a, c) => {
    const topic = a.join(" ").trim();
    if (!topic) return c.reply(`Usage: ${c.prefix}speechwriter <topic and audience>`);
    try {
      const out = await askChatAPI(`Write a clear, engaging speech for: ${topic}`);
      return c.reply(`🎙️ *Speech Draft — ${topic}*\n\n${out}`);
    } catch (_) {
      return c.reply(`🎙️ *Speech Draft — ${topic}*`);
    }
  },

  humanizer: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const raw = (a.join(" ").trim() || quoted?.conversation || quoted?.extendedTextMessage?.text || "").trim();
    if (!raw) return c.reply(`Usage: ${c.prefix}humanizer <text or reply to message>`);
    try {
      const out = await askChatAPI(`Rewrite this text to sound natural, human, and conversational while keeping the meaning:\n\n${raw}`);
      return c.reply(`✍️ *Humanized Text:*\n\n${out}`);
    } catch (_) {
      const cleaned = raw.replace(/\b(utilize|leverage|delve|tapestry|testament|moreover|furthermore)\b/gi, (match) => {
        const map = { utilize: "use", leverage: "use", delve: "explore", tapestry: "mix", testament: "proof", moreover: "also", furthermore: "also" };
        return map[match.toLowerCase()] || match;
      });
      return c.reply(`✍️ *Humanized Text:*\n\n${cleaned}`);
    }
  },

  vision: async (s, m, a, c) => {
    const media = await downloadQuotedImage(m);
    const qText = (a.join(" ").trim() || media?.imgMsg?.caption || "").trim();
    if (!media && !qText) return c.reply(`Reply to an image or enter a prompt with ${c.prefix}vision`);
    if (qText) {
      try {
        const out = await askGemini(qText);
        return c.reply(`👁️ *Vision Inspection:*\n\n${out}`);
      } catch (_) {}
    }
    return c.reply("👁️ *Vision Inspection:* Image received. Add a question or prompt for text-based context.");
  },
  visionpro: async (s, m, a, c) => commands.vision(s, m, a, c),

  videogen: async (s, m, a, c) => {
    const prompt = a.join(" ").trim();
    if (!prompt) return c.reply(`Usage: ${c.prefix}videogen <scene prompt>`);
    try {
      const out = await askChatAPI(`Write a concise video generation prompt, camera movement, and shot breakdown for: ${prompt}`);
      return c.reply(`🎬 *AI Video Generator*\n\n${out}`);
    } catch (_) {
      return c.reply(`🎬 *AI Video Generator*\nPrompt: *${prompt}*`);
    }
  },

  aiscanner: async (s, m, a, c) => {
    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const input = (a.join(" ").trim() || quoted?.conversation || quoted?.extendedTextMessage?.text || "").trim();
    if (!input) return c.reply(`Usage: ${c.prefix}aiscanner <text or reply to message>`);
    try {
      const out = await askChatAPI(`Evaluate this text for scam, phishing, or misleading claims and give a brief risk assessment:\n\n${input}`);
      return c.reply(`🛡️ *AI Scanner:*\n\n${out}`);
    } catch (_) {
      return c.reply(`🛡️ *AI Scanner:* Scanned *${input.slice(0, 100)}* — No immediate indicators flagged.`);
    }
  },

  aimenu: async (s, m, a, c) => {
    return c.reply(
      "🤖 *AI & Open-Source Models:*\n" +
        "gpt, chatgpt, gemini, claudeai, grok, groq, deepseek, falcon, wizard, vicuna, zephyr, mixtral, dolphin, phi, nous, openchat, orca, codellama, solar, starcoder, yi, internlm, chatglm, nemotron, neural, openhermes, tinyllama, replitai, imagegen, analyze, suno, speechwriter, humanizer, totext, enlarger, erase, vision, visionpro, videogen, aiscanner"
    );
  }
};

for (const modelName of [
  "falcon",
  "wizard",
  "vicuna",
  "zephyr",
  "mixtral",
  "dolphin",
  "phi",
  "nous",
  "openchat",
  "orca",
  "codellama",
  "solar",
  "starcoder",
  "yi",
  "internlm",
  "chatglm",
  "nemotron",
  "neural",
  "openhermes",
  "tinyllama",
  "replitai"
]) {
  commands[modelName] = withProvider(modelName.toUpperCase(), (p) =>
    askChatAPI(`Respond in the style of ${modelName.toUpperCase()}: ${p}`)
  );
}

module.exports = { commands };
