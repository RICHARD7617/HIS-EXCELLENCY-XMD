"use strict";

const axios = require("axios");
const C = require("../config");

async function askOpenAI(prompt) {
  const key = C.API_KEYS?.OPENAI;
  if (!key) throw new Error("OPENAI_API_KEY not set.");
  const r = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800
    },
    { headers: { Authorization: `Bearer ${key}` }, timeout: 30000 }
  );
  return r.data.choices?.[0]?.message?.content?.trim();
}

async function askGemini(prompt) {
  const key = C.API_KEYS?.GEMINI;
  if (!key) throw new Error("GEMINI_API_KEY not set.");
  const r = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    { contents: [{ parts: [{ text: prompt }] }] },
    { timeout: 30000 }
  );
  return r.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
}

async function askGroq(prompt) {
  const key = C.API_KEYS?.GROQ;
  if (!key) throw new Error("GROQ_API_KEY not set.");
  const r = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800
    },
    { headers: { Authorization: `Bearer ${key}` }, timeout: 30000 }
  );
  return r.data.choices?.[0]?.message?.content?.trim();
}

function withProvider(name, fn) {
  return async (sock, message, args, ctx) => {
    const prompt = args.join(" ").trim();
    if (!prompt) {
      return ctx.reply(`Usage: ${ctx.prefix}${ctx.command} <your question>`);
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

const commands = {
  gpt: withProvider("OpenAI", askOpenAI),
  chatgpt: withProvider("OpenAI", askOpenAI),
  ai: withProvider("OpenAI", askOpenAI),
  gemini: withProvider("Gemini", askGemini),
  bard: withProvider("Gemini", askGemini),
  groq: withProvider("Groq", askGroq),
  ilama: withProvider("Groq", askGroq),
  llama: withProvider("Groq", askGroq)
};

module.exports = { commands };
