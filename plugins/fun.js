"use strict";

const axios = require("axios");

const commands = {
  joke: async (s, m, a, c) => {
    try {
      const r = await axios.get("https://official-joke-api.appspot.com/random_joke", { timeout: 8000 });
      await c.reply(`😂 ${r.data.setup}\n\n${r.data.punchline}`);
    } catch { await c.reply("Could not fetch a joke right now."); }
  },
  quote: async (s, m, a, c) => {
    try {
      const r = await axios.get("https://api.quotable.io/random", { timeout: 8000 });
      await c.reply(`💬 "${r.data.content}"\n\n— ${r.data.author}`);
    } catch { await c.reply("Could not fetch a quote right now."); }
  },
  truth: async (s, m, a, c) => {
    const list = [
      "What's your most embarrassing moment?",
      "Have you ever lied to your best friend?",
      "What's the last thing you searched on Google?",
      "Who in this group would you trade lives with?",
      "What's a secret you've never told anyone?"
    ];
    await c.reply(`🎯 *Truth:* ${list[Math.floor(Math.random() * list.length)]}`);
  },
  dare: async (s, m, a, c) => {
    const list = [
      "Send a voice note singing your favorite song.",
      "Change your profile picture to a cartoon for 1 hour.",
      "Message the last person you texted 'I love you'.",
      "Post the oldest photo in your gallery.",
      "Say the alphabet backwards in a voice note."
    ];
    await c.reply(`🔥 *Dare:* ${list[Math.floor(Math.random() * list.length)]}`);
  },
  goodmorning: async (s, m, a, c) => c.reply(`🌅 Good morning, ${m.pushName || "friend"}! Have a great day.`),
  goodnight: async (s, m, a, c) => c.reply(`🌙 Good night, ${m.pushName || "friend"}. Sleep well.`),
  device: async (s, m, a, c) => {
    const q = m.message?.extendedTextMessage?.contextInfo?.participant || c.sender;
    await c.reply(`Device info requires a WhatsApp presence lookup, which is unreliable on linked devices. Requested for ${q.split("@")[0]}.`);
  },
  getjid: async (s, m, a, c) => c.reply(`Your JID: ${c.sender}\nChat JID: ${c.from}`)
};

module.exports = { commands };
