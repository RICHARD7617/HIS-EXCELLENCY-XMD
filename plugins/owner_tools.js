"use strict";

const C = require("../config");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const viewonce = require("../lib/viewonce");

// UNIVERSAL TOGGLE HELPER
async function handleToggle(ctx, key, label) {
  const db = ctx.db();
  if (!db.bot) db.bot = {};
  if (!db.groups) db.groups = {};
  
  const isGroup = ctx.isGroup;
  const targetObj = isGroup ? (db.groups[ctx.from] ||= {}) : db.bot;
  
  const requested = ctx.args?.[0]?.toLowerCase();
  const defaultValue = isGroup ? false : true;
  let currentState = targetObj[key] ?? defaultValue;
  
  if (requested === "on") {
    targetObj[key] = true;
  } else if (requested === "off") {
    targetObj[key] = false;
  } else {
    targetObj[key] = !currentState;
  }

  ctx.saveDB(db);
  ctx.reply(`${targetObj[key] ? "✅ Enabled" : "❌ Disabled"} *${label || key}*`);
}


function getCpanelConfig(ctx) {
  const db = ctx.db();
  db.bot ||= {};
  db.bot.cpanel ||= {
    domain: process.env.PANEL_DOMAIN || "",
    appKey: process.env.PANEL_APP_KEY || "",
    clientKey: process.env.PANEL_CLIENT_KEY || "",
    eggId: Number(process.env.PANEL_EGG_ID || 1),
    locationId: Number(process.env.PANEL_LOC_ID || 1),
    nestId: Number(process.env.PANEL_NEST_ID || 1),
    dockerImage: process.env.PANEL_DOCKER_IMAGE || "ghcr.io/pterodactyl/yolks:nodejs_20",
    startupCmd: process.env.PANEL_STARTUP || "npm start",
    paymentInfo: "",
    promptText: ""
  };
  return db.bot.cpanel;
}

async function pteroReq(cfg, endpoint, method = "GET", body = null) {
  const base = String(cfg.domain || "").replace(/\/+$/, "");
  if (!base || !cfg.appKey) {
    throw new Error("Panel URL or Application API key not configured. Use setlink and setkey first.");
  }
  const res = await fetch(base + "/api/application" + endpoint, {
    method,
    headers: {
      "Authorization": "Bearer " + cfg.appKey,
      "Accept": "Application/vnd.pterodactyl.v1+json",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errMsg = data?.errors?.[0]?.detail || data?.message || ("HTTP " + res.status);
    throw new Error(errMsg);
  }
  return data;
}


function extractTargetNumber(m, a) {
  const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  const quoted = m.message?.extendedTextMessage?.contextInfo?.participant;
  const raw = a[0] || mentioned || quoted || "";
  return String(raw).split("@")[0].split(":")[0].replace(/\D/g, "");
}

function getSudoList(ctx) {
  const db = ctx.db();
  db.bot ||= {};
  if (!Array.isArray(db.bot.sudoUsers)) db.bot.sudoUsers = [];
  if (typeof db.bot.sudomode !== "boolean") db.bot.sudomode = true;
  db.bot.sudoLinks ||= {};
  return db;
}

const commands = {
  // ================= OWNER CONTROLS =================
  setprefix: async (s, m, a, c) => {
    if (!c.isOwner) return;
    if (!a[0]) return c.reply("Provide a prefix.");
    const db = c.db(); db.bot.prefix = a[0]; c.saveDB(db); C.PREFIX = a[0];
    c.reply(`✅ Prefix set to: *${a[0]}*`);
  },
  prefix: async (s, m, a, c) => c.reply(`Current prefix: *${c.prefix}*`),
  mode: async (s, m, a, c) => c.reply(`Current mode: *${C.MODE}*`),
  
  public: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const db = c.db(); db.bot.mode = "PUBLIC"; c.saveDB(db); C.MODE = "PUBLIC";
    c.reply("✅ Bot is now in *PUBLIC* mode.");
  },
  private: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const db = c.db(); db.bot.mode = "PRIVATE"; c.saveDB(db); C.MODE = "PRIVATE";
    c.reply("🔒 Bot is now in *PRIVATE* mode.");
  },
  pair: async (s, m, a, c) => {
    if (!c.isOwner) return;
    if (!a[0]) return c.reply("Usage: .pair 254712345678");
    try {
      const code = await s.requestPairingCode(a[0].replace(/\D/g, ""));
      c.reply(`🔑 Pairing Code: *${code}*`);
    } catch (e) { c.reply(`❌ Failed: ${e.message}`); }
  },

  // ================= SYSTEM =================
  restart: async (s, m, a, c) => {
    if (!c.isOwner) return;
    await c.reply("🔄 Restarting...");
    setTimeout(() => process.exit(0), 1000); 
  },
  getsettings: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const bot = c.db().bot || {};
    const automations = ["autoread", "autotyping", "autorecording", "autorecordtyping", "autoreact", "autoreactstatus", "autoviewstatus", "antidelete"]
      .map(k => `${bot[k] ?? true ? "✅" : "❌"} ${k}`).join("\n");
    c.reply(`⚙️ *Settings*\nMode: *${C.MODE}*\nPrefix: *${C.PREFIX}*\n\n*Automations:*\n${automations}`);
  },
  test: async (s, m, a, c) => c.reply("✅ Bot is responding perfectly!"),

  // ================= AUTOMATION =================
  autoread: async (s, m, a, c) => handleToggle(c, "autoread", "Auto Read"),
  autotyping: async (s, m, a, c) => handleToggle(c, "autotyping", "Auto Typing"),
  autorecording: async (s, m, a, c) => handleToggle(c, "autorecording", "Auto Recording"),
  autorecordtyping: async (s, m, a, c) => handleToggle(c, "autorecordtyping", "Auto Record & Typing"),
  autoreact: async (s, m, a, c) => handleToggle(c, "autoreact", "Auto React"),
  autoreactstatus: async (s, m, a, c) => {
    const db = c.db(); db.bot ||= {}; db.bot.autoreactstatus = true; c.saveDB(db);
    return c.reply("✅ Auto-react to WhatsApp statuses is permanently enabled.");
  },
  autoreactchannels: async (s, m, a, c) => {
    const db = c.db(); db.bot ||= {}; db.bot.autoreactchannels = true; c.saveDB(db);
    return c.reply("✅ Auto-react to WhatsApp channels is permanently enabled.");
  },
  autoviewstatus: async (s, m, a, c) => handleToggle(c, "autoviewstatus", "Auto View Status"),
  antidelete: async (s, m, a, c) => handleToggle(c, "antidelete", "Anti-Delete"),

  // ================= CONTACT TOOLS =================
  vv: async (s, m, a, c) => {
    console.log("[owner_tools] vv called");

    if (!c.isOwner) {
      return c.reply("❌ Owner only. Your number was not recognized as owner.");
    }

    const result = await viewonce.openFromReply(m, s);
    if (!result.found) return c.reply(viewonce.errorText(result));

    await viewonce.sendOpened(
      s,
      c.from,
      result.found,
      result.buffer,
      result.found.media.caption || "📸 *View Once Opened*",
      { quoted: m }
    );
  },

  vv2: async (s, m, a, c) => {
    console.log("[owner_tools] vv2 called");

    if (!c.isOwner) {
      return c.reply("❌ Owner only. Your number was not recognized as owner.");
    }

    const result = await viewonce.openFromReply(m, s);
    if (!result.found) return c.reply(viewonce.errorText(result));

    const targetNum = viewonce.norm(process.env.OWNER_NUMBER || C.OWNER_NUMBER || s.user?.id);
    if (!targetNum) return c.reply("❌ Owner JID/number is not configured.");
    const botJid = `${targetNum}@s.whatsapp.net`;

    await viewonce.sendOpened(
      s,
      botJid,
      result.found,
      result.buffer,
      `📸 *View Once Opened (private)*\n\nFrom chat: ${c.from}`
    );

    if (c.from !== botJid) await c.reply("✅ Sent to your private chat.");
  },
  setbotname: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const name = a.join(" ").trim();
    if (!name) return c.reply("Usage: " + c.prefix + "setbotname <name>");
    const db = c.db(); db.bot ||= {}; db.bot.botName = name; c.saveDB(db);
    C.BOT_NAME = name;
    try { if (typeof s.updateProfileName === "function") await s.updateProfileName(name); } catch {}
    return c.reply("✅ Bot name updated to: *" + name + "*");
  },
  resetbotname: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const db = c.db(); db.bot ||= {}; delete db.bot.botName; c.saveDB(db);
    const defName = "HIS EXCELLENCY XMD";
    C.BOT_NAME = defName;
    try { if (typeof s.updateProfileName === "function") await s.updateProfileName(defName); } catch {}
    return c.reply("✅ Bot name reset to: *" + defName + "*");
  },
  setowner: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quotedSender = m.message?.extendedTextMessage?.contextInfo?.participant;
    const raw = a[0] || mentioned || quotedSender || "";
    const num = String(raw).split("@")[0].split(":")[0].replace(/\D/g, "");
    if (!num) return c.reply("Usage: " + c.prefix + "setowner <number|@user>");
    const db = c.db(); db.bot ||= {}; db.bot.ownerNumber = num; c.saveDB(db);
    C.OWNER_NUMBER = num;
    return c.reply("✅ Owner number set to: *" + num + "*");
  },
  resetowner: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const db = c.db(); db.bot ||= {}; delete db.bot.ownerNumber; c.saveDB(db);
    const defOwner = process.env.OWNER_NUMBER || "";
    C.OWNER_NUMBER = defOwner;
    return c.reply("✅ Owner number reset." + (defOwner ? " Active: *" + defOwner + "*" : ""));
  },
  iamowner: async (s, m, a, c) => {
    const senderNum = String(c.sender || "").split("@")[0].split(":")[0].replace(/\D/g, "");
    const botNum = String(s.user?.id || "").split("@")[0].split(":")[0].replace(/\D/g, "");
    const ownerNum = String(c.db()?.bot?.ownerNumber || C.OWNER_NUMBER || process.env.OWNER_NUMBER || "").replace(/\D/g, "");
    if (!c.isOwner && senderNum && botNum && senderNum === botNum) {
      const db = c.db(); db.bot ||= {}; db.bot.ownerNumber = senderNum; c.saveDB(db);
      C.OWNER_NUMBER = senderNum;
      return c.reply("✅ Registered *" + senderNum + "* as bot owner.");
    }
    return c.reply(c.isOwner ? "👑 You are recognized as *Owner* (" + (ownerNum || senderNum) + ")." : "❌ You are not recognized as *Owner*.");
  },
  setfooter: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const footer = a.join(" ").trim();
    if (!footer) return c.reply("Usage: " + c.prefix + "setfooter <text>");
    const db = c.db(); db.bot ||= {}; db.bot.footer = footer; c.saveDB(db);
    C.FOOTER = footer;
    return c.reply("✅ Footer updated to: *" + footer + "*");
  },
  setpp: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const quotedImg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
    const directImg = m.message?.imageMessage;
    if (!directImg && !quotedImg) {
      return c.reply("Reply to or send an image with " + c.prefix + "setpp");
    }
    try {
      const { downloadMediaMessage } = require("@whiskeysockets/baileys");
      const targetMsg = directImg ? m : {
        key: {
          remoteJid: c.from,
          id: m.message.extendedTextMessage.contextInfo.stanzaId,
          participant: m.message.extendedTextMessage.contextInfo.participant
        },
        message: { imageMessage: quotedImg }
      };
      const buf = await downloadMediaMessage(targetMsg, "buffer", {}, { reuploadRequest: s.updateMediaMessage });
      const targetJid = s.user?.id ? String(s.user.id).split(":")[0] + "@s.whatsapp.net" : c.from;
      await s.updateProfilePicture(targetJid, buf);
      return c.reply("✅ Bot profile picture updated.");
    } catch (e) {
      return c.reply("❌ Failed to update profile picture: " + e.message);
    }
  },
  blockdetect: async (s, m, a, c) => {
    if (!c.isOwner) return;
    return handleToggle(c, "blockdetect", "Block Detect");
  },
  silent: async (s, m, a, c) => {
    if (!c.isOwner) return;
    return handleToggle(c, "silent", "Silent Mode");
  },
  anticall: async (s, m, a, c) => {
    if (!c.isOwner) return;
    return handleToggle(c, "anticall", "Anti-Call");
  },
  antideletestatus: async (s, m, a, c) => {
    if (!c.isOwner) return;
    return handleToggle(c, "antideletestatus", "Anti-Delete Status");
  },
  antiedit: async (s, m, a, c) => {
    if (!c.isOwner) return;
    return handleToggle(c, "antiedit", "Anti-Edit");
  },
  blockall: async (s, m, a, c) => {
    if (!c.isOwner) return;
    try {
      const chats = typeof s.groupFetchAllParticipating === "function" ? await s.groupFetchAllParticipating() : {};
      const jids = Object.keys(chats || {});
      let count = 0;
      for (const jid of jids) {
        const parts = chats[jid]?.participants || [];
        for (const p of parts) {
          const num = String(p.id || p.jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");
          const ownerNum = String(c.db()?.bot?.ownerNumber || C.OWNER_NUMBER || process.env.OWNER_NUMBER || "").replace(/\D/g, "");
          const botNum = String(s.user?.id || "").split("@")[0].split(":")[0].replace(/\D/g, "");
          if (num && num !== ownerNum && num !== botNum) {
            try { await s.updateBlockStatus(num + "@s.whatsapp.net", "block"); count++; } catch {}
          }
        }
      }
      return c.reply("✅ Blocked *" + count + "* participant(s) across participating groups.");
    } catch (e) {
      return c.reply("❌ blockall failed: " + e.message);
    }
  },
  unblockall: async (s, m, a, c) => {
    if (!c.isOwner) return;
    try {
      const list = typeof s.fetchBlocklist === "function" ? await s.fetchBlocklist() : [];
      let count = 0;
      for (const jid of list || []) {
        try { await s.updateBlockStatus(jid, "unblock"); count++; } catch {}
      }
      return c.reply("✅ Unblocked *" + count + "* user(s).");
    } catch (e) {
      return c.reply("❌ unblockall failed: " + e.message);
    }
  },
  broadcast: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const text = a.join(" ").trim();
    if (!text) return c.reply("Usage: " + c.prefix + "broadcast <message>");
    try {
      const groups = typeof s.groupFetchAllParticipating === "function" ? Object.keys(await s.groupFetchAllParticipating()) : [];
      let sent = 0;
      for (const jid of groups) {
        if (jid === c.from) continue;
        try {
          await s.sendMessage(jid, { text: "📣 *Broadcast*\n\n" + text });
          sent++;
        } catch {}
      }
      return c.reply("✅ Broadcast sent to *" + sent + "* group(s).");
    } catch (e) {
      return c.reply("❌ Broadcast failed: " + e.message);
    }
  },
  shutdown: async (s, m, a, c) => {
    if (!c.isOwner) return;
    await c.reply("🛑 Shutting down bot...");
    setTimeout(() => process.exit(0), 500);
  },
  setchannel: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const raw = (a[0] || "").trim();
    if (!raw) return c.reply("Usage: " + c.prefix + "setchannel <jid@newsletter|channel-url>");
    let jid = raw;
    const urlMatch = raw.match(/whatsapp\.com\/channel\/([A-Za-z0-9_-]+)/i);
    if (urlMatch && typeof s.newsletterMetadata === "function") {
      try {
        const meta = await s.newsletterMetadata("invite", urlMatch[1]);
        if (meta?.id) jid = meta.id;
      } catch (e) {
        return c.reply("❌ Could not resolve channel invite: " + e.message);
      }
    }
    if (!jid.endsWith("@newsletter")) {
      return c.reply("❌ Provide a valid *<id>@newsletter* JID or WhatsApp channel link.");
    }
    const db = c.db();
    db.bot ||= {};
    db.bot.channelJid = jid;
    c.saveDB(db);
    C.CHANNEL_JID = jid;
    try {
      if (typeof s.newsletterFollow === "function") await s.newsletterFollow(jid);
      else if (s.newsletter?.follow) await s.newsletter.follow(jid);
    } catch {}
    return c.reply("✅ Channel set to: *" + jid + "*");
  },
  resetchannel: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const db = c.db();
    db.bot ||= {};
    delete db.bot.channelJid;
    c.saveDB(db);
    const fallback = process.env.CHANNEL_JID || "";
    C.CHANNEL_JID = fallback;
    return c.reply("✅ Channel reset." + (fallback ? " Active: *" + fallback + "*" : " No custom channel configured."));
  },
  workingreload: async (s, m, a, c) => {
    if (!c.isOwner) return;
    try {
      const pluginsDir = path.join(process.cwd(), "plugins");
      for (const k of Object.keys(require.cache)) {
        if (k.startsWith(pluginsDir)) delete require.cache[k];
      }
      const { loadPlugins } = require("./loader");
      const fresh = loadPlugins((...args) => console.log("[reload]", ...args));
      const targetMap = global.__BOT_PLUGINS;
      if (targetMap instanceof Map) {
        const nextEntries = fresh instanceof Map ? [...fresh.entries()] : Object.entries(fresh || {});
        targetMap.clear();
        for (const [k, v] of nextEntries) targetMap.set(k, v);
        targetMap.__initHooks = fresh.__initHooks || [];
        const activeSock = (typeof global.__BOT_SOCK === "function" ? global.__BOT_SOCK() : null) || s;
        for (const { file, fn } of targetMap.__initHooks || []) {
          try { await fn(activeSock); } catch {}
        }
        return c.reply("✅ Reloaded *" + targetMap.size + "* plugin command(s) & hooks.");
      }
      return c.reply("✅ Plugin cache cleared (map reference not found).");
    } catch (e) {
      return c.reply("❌ Reload failed: " + e.message);
    }
  },
  reloadenv: async (s, m, a, c) => {
    if (!c.isOwner) return;
    try {
      const envPath = path.join(process.cwd(), ".env");
      if (!fs.existsSync(envPath)) return c.reply("⚠️ No *.env* file found in project root.");
      const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
      let count = 0;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
        if (key in C) C[key] = val;
        count++;
      }
      return c.reply("✅ Reloaded *" + count + "* key(s) from *.env*.");
    } catch (e) {
      return c.reply("❌ reloadenv failed: " + e.message);
    }
  },
  setsetting: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const key = (a[0] || "").trim();
    const rawVal = a.slice(1).join(" ").trim();
    if (!key || rawVal === "") {
      return c.reply("Usage: " + c.prefix + "setsetting <key> <value>");
    }
    let parsed = rawVal;
    if (rawVal.toLowerCase() === "true") parsed = true;
    else if (rawVal.toLowerCase() === "false") parsed = false;
    else if (/^-?\d+(\.\d+)?$/.test(rawVal)) parsed = Number(rawVal);

    const db = c.db();
    db.bot ||= {};
    db.bot[key] = parsed;
    c.saveDB(db);
    if (key in C) C[key] = parsed;
    return c.reply("✅ Setting *" + key + "* = *" + String(parsed) + "*");
  },
  disk: async (s, m, a, c) => {
    if (!c.isOwner) return;
    try {
      const out = execSync("df -h .", { encoding: "utf8" }).trim();
      return c.reply("💾 *Disk Usage*\n```\n" + out + "\n```");
    } catch (e) {
      return c.reply("❌ disk failed: " + e.message);
    }
  },
  df: async (s, m, a, c) => {
    if (!c.isOwner) return;
    try {
      const out = execSync("df -h", { encoding: "utf8" }).trim();
      return c.reply("💽 *Filesystem df*\n```\n" + out.slice(0, 1800) + "\n```");
    } catch (e) {
      return c.reply("❌ df failed: " + e.message);
    }
  },
  du: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const target = a[0] || ".";
    try {
      const out = execSync("du -sh " + JSON.stringify(target), { encoding: "utf8" }).trim();
      return c.reply("📁 *Directory Size*\n```\n" + out + "\n```");
    } catch (e) {
      return c.reply("❌ du failed: " + e.message);
    }
  },
  ps: async (s, m, a, c) => {
    if (!c.isOwner) return;
    try {
      const out = execSync("ps -eo pid,comm,%cpu,%mem --sort=-%cpu | head -n 15", { encoding: "utf8" }).trim();
      return c.reply("📊 *Top Processes*\n```\n" + out + "\n```");
    } catch (e) {
      return c.reply("❌ ps failed: " + e.message);
    }
  },
  pwd: async (s, m, a, c) => {
    if (!c.isOwner) return;
    return c.reply("📂 *Working Directory:* `" + process.cwd() + "`");
  },
  ls: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const target = path.resolve(process.cwd(), a[0] || ".");
    try {
      const entries = fs.readdirSync(target, { withFileTypes: true }).map(d => (d.isDirectory() ? "📁 " : "📄 ") + d.name);
      return c.reply("📂 *" + path.relative(process.cwd(), target || ".") + "*\n" + (entries.join("\n").slice(0, 2000) || "(empty)"));
    } catch (e) {
      return c.reply("❌ ls failed: " + e.message);
    }
  },
  cat: async (s, m, a, c) => {
    if (!c.isOwner) return;
    if (!a[0]) return c.reply("Usage: " + c.prefix + "cat <file>");
    const target = path.resolve(process.cwd(), a[0]);
    try {
      const content = fs.readFileSync(target, "utf8").slice(0, 2000);
      return c.reply("📄 *" + a[0] + "*\n```\n" + content + "\n```");
    } catch (e) {
      return c.reply("❌ cat failed: " + e.message);
    }
  },
  head: async (s, m, a, c) => {
    if (!c.isOwner) return;
    if (!a[0]) return c.reply("Usage: " + c.prefix + "head <file> [lines]");
    const n = Math.min(Number(a[1]) || 20, 80);
    try {
      const lines = fs.readFileSync(path.resolve(process.cwd(), a[0]), "utf8").split(/\r?\n/).slice(0, n).join("\n");
      return c.reply("⬆️ *head (" + n + ") " + a[0] + "*\n```\n" + lines.slice(0, 2000) + "\n```");
    } catch (e) {
      return c.reply("❌ head failed: " + e.message);
    }
  },
  tail: async (s, m, a, c) => {
    if (!c.isOwner) return;
    if (!a[0]) return c.reply("Usage: " + c.prefix + "tail <file> [lines]");
    const n = Math.min(Number(a[1]) || 20, 80);
    try {
      const lines = fs.readFileSync(path.resolve(process.cwd(), a[0]), "utf8").split(/\r?\n/).slice(-n).join("\n");
      return c.reply("⬇️ *tail (" + n + ") " + a[0] + "*\n```\n" + lines.slice(0, 2000) + "\n```");
    } catch (e) {
      return c.reply("❌ tail failed: " + e.message);
    }
  },
  grep: async (s, m, a, c) => {
    if (!c.isOwner) return;
    if (!a[0]) return c.reply("Usage: " + c.prefix + "grep <pattern> [path]");
    const searchPath = a[1] || ".";
    try {
      const out = execSync("grep -rn --exclude-dir={node_modules,.git} " + JSON.stringify(a[0]) + " " + JSON.stringify(searchPath) + " | head -n 25", { encoding: "utf8" }).trim();
      return c.reply("🔎 *grep* `" + a[0] + "`\n```\n" + (out || "No matches") + "\n```");
    } catch (e) {
      return c.reply("🔎 *grep* `" + a[0] + "`: No matches or error.");
    }
  },
  stat: async (s, m, a, c) => {
    if (!c.isOwner) return;
    if (!a[0]) return c.reply("Usage: " + c.prefix + "stat <file>");
    try {
      const st = fs.statSync(path.resolve(process.cwd(), a[0]));
      return c.reply("ℹ️ *Stat: " + a[0] + "*\nSize: *" + st.size + "* bytes\nModified: *" + st.mtime.toISOString() + "*");
    } catch (e) {
      return c.reply("❌ stat failed: " + e.message);
    }
  },
  envkeys: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const keys = Object.keys(process.env).sort();
    return c.reply("🔑 *Environment Keys (" + keys.length + ")*\n" + keys.join(", ").slice(0, 2000));
  },
  package: async (s, m, a, c) => {
    if (!c.isOwner) return;
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
      const deps = Object.keys(pkg.dependencies || {}).slice(0, 20).join(", ");
      return c.reply("📦 *" + (pkg.name || "app") + "* v" + (pkg.version || "0.0.0") + "\nMain: `" + (pkg.main || "index.js") + "`\nDeps: " + (deps || "none"));
    } catch (e) {
      return c.reply("❌ package failed: " + e.message);
    }
  },
  findcommands: async (s, m, a, c) => {
    const query = (a[0] || "").toLowerCase();
    const map = global.__BOT_PLUGINS;
    const names = map instanceof Map ? [...map.keys()] : [];
    const filtered = query ? names.filter(n => n.includes(query)) : names;
    return c.reply("🧭 *Commands (" + filtered.length + ")*" + (query ? " matching *" + query + "*" : "") + ":\n" + (filtered.slice(0, 80).join(", ") || "None"));
  },
  latestupdates: async (s, m, a, c) => {
    try {
      const logOut = execSync("git log -n 5 --oneline", { encoding: "utf8" }).trim();
      return c.reply("🆕 *Latest Updates*\n```\n" + logOut + "\n```");
    } catch (e) {
      return c.reply("🆕 *Latest Updates*: Git history unavailable (" + e.message + ")");
    }
  },
  panel: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const mem = process.memoryUsage();
    return c.reply(
      "🖥️ *System Panel*\n" +
      "Bot: *" + (C.BOT_NAME || "HIS EXCELLENCY XMD") + "*\n" +
      "Mode: *" + (C.MODE || "PUBLIC") + "* | Prefix: *" + (C.PREFIX || ".") + "*\n" +
      "RSS: *" + Math.round(mem.rss / 1024 / 1024) + " MB* | Heap: *" + Math.round(mem.heapUsed / 1024 / 1024) + " MB*\n" +
      "PID: *" + process.pid + "* | Node: *" + process.version + "*"
    );
  },
  debugchat: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const last = global.__LAST_MSG?.get(c.from) || null;
    return c.reply(
      "🐞 *Debug Chat*\n" +
      "Chat JID: `" + c.from + "`\n" +
      "Sender JID: `" + c.sender + "`\n" +
      "IsGroup: *" + c.isGroup + "* | IsOwner: *" + c.isOwner + "*\n" +
      "LastMsg: `" + JSON.stringify(last).slice(0, 600) + "`"
    );
  },
  exec: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const cmdStr = a.join(" ").trim();
    if (!cmdStr) return c.reply("Usage: " + c.prefix + "exec <shell command>");
    try {
      const out = execSync(cmdStr, { encoding: "utf8", timeout: 15000 }).trim();
      return c.reply("💻 *exec*\n```\n" + (out.slice(0, 2000) || "(no output)") + "\n```");
    } catch (e) {
      const errOut = (e.stdout || "") + "\n" + (e.stderr || e.message || "");
      return c.reply("⚠️ *exec error*\n```\n" + errOut.trim().slice(0, 2000) + "\n```");
    }
  },
  gitclone: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const url = (a[0] || "").trim();
    if (!url || !/^https?:\/\/github\.com\/[^/]+\/[^/]+/i.test(url)) {
      return c.reply("Usage: " + c.prefix + "gitclone <https://github.com/owner/repo>");
    }
    const cleanUrl = url.replace(/\.git$/i, "");
    const repoName = cleanUrl.split("/").filter(Boolean).pop().replace(/[^A-Za-z0-9._-]/g, "_");
    const cloneDir = path.join(process.cwd(), "tmp", "clones", repoName + "_" + Date.now());
    fs.mkdirSync(path.dirname(cloneDir), { recursive: true });
    await c.reply("📥 Cloning *" + cleanUrl + "*...");
    try {
      execSync("git clone --depth 1 " + JSON.stringify(cleanUrl + ".git") + " " + JSON.stringify(cloneDir), {
        encoding: "utf8",
        timeout: 60000
      });
      const filesCount = Number(execSync("find " + JSON.stringify(cloneDir) + " -not -path '*/.*' -type f | wc -l", { encoding: "utf8" }).trim()) || 0;
      const sizeText = execSync("du -sh " + JSON.stringify(cloneDir), { encoding: "utf8" }).trim().split(/\s+/)[0] || "N/A";
      return c.reply(
        "✅ Cloned *" + repoName + "*\n" +
        "Files: *" + filesCount + "* | Size: *" + sizeText + "*\n" +
        "Path: `" + path.relative(process.cwd(), cloneDir) + "`"
      );
    } catch (e) {
      return c.reply("❌ gitclone failed: " + (e.stderr || e.message || "").slice(0, 1200));
    }
  },

  repanalyze: async (s, m, a, c) => {
    const raw = (a[0] || "").trim();
    let slug = "RICHARD7617/HIS-EXCELLENCY-XMD";
    if (raw) {
      const mUrl = raw.match(/github\.com\/([^/]+\/[^/#?]+)/i);
      slug = (mUrl ? mUrl[1] : raw).replace(/\.git$/i, "");
    }
    try {
      const res = await fetch("https://api.github.com/repos/" + slug, {
        headers: { "User-Agent": "HIS-EXCELLENCY-XMD" }
      });
      if (!res.ok) {
        return c.reply("❌ GitHub API returned *" + res.status + "* for `" + slug + "`.");
      }
      const data = await res.json();
      return c.reply(
        "📊 *Repo Analysis: " + (data.full_name || slug) + "*\n" +
        (data.description ? "📝 " + data.description + "\n" : "") +
        "⭐ Stars: *" + (data.stargazers_count ?? 0) + "* | 🍴 Forks: *" + (data.forks_count ?? 0) + "*\n" +
        "🐞 Open Issues: *" + (data.open_issues_count ?? 0) + "* | 💻 Language: *" + (data.language || "N/A") + "*\n" +
        "🌿 Default Branch: *" + (data.default_branch || "main") + "*\n" +
        "🕒 Updated: *" + (data.pushed_at || "N/A") + "*\n" +
        "🔗 " + (data.html_url || "https://github.com/" + slug)
      );
    } catch (e) {
      return c.reply("❌ repanalyze failed: " + e.message);
    }
  },

  zip: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const relTarget = (a[0] || ".").trim();
    const absTarget = path.resolve(process.cwd(), relTarget);
    if (!fs.existsSync(absTarget)) {
      return c.reply("❌ Path not found: `" + relTarget + "`");
    }
    const tmpDir = path.join(process.cwd(), "tmp");
    fs.mkdirSync(tmpDir, { recursive: true });
    const baseName = path.basename(absTarget) || "workspace";
    const zipFile = path.join(tmpDir, baseName + "-" + Date.now() + ".zip");
    try {
      execSync(
        "zip -r " + JSON.stringify(zipFile) + " " + JSON.stringify(path.basename(absTarget)) + " -x \"node_modules/*\" \".git/*\" \"tmp/*\"",
        { cwd: path.dirname(absTarget), encoding: "utf8", timeout: 60000 }
      );
      const buf = fs.readFileSync(zipFile);
      await s.sendMessage(c.from, {
        document: buf,
        mimetype: "application/zip",
        fileName: path.basename(zipFile),
        caption: "📦 Archive of *" + relTarget + "* (" + Math.round(buf.length / 1024) + " KB)"
      }, { quoted: m });
      try { fs.unlinkSync(zipFile); } catch {}
    } catch (e) {
      return c.reply("❌ zip failed: " + (e.stderr || e.message || "").slice(0, 1200));
    }
  },

  update: async (s, m, a, c) => {
    if (!c.isOwner) return;
    await c.reply("🔄 Checking & pulling latest updates from Git...");
    try {
      const out = execSync("git pull", { encoding: "utf8", timeout: 60000 }).trim();
      return c.reply("✅ *Git Update*\n```\n" + (out.slice(0, 1800) || "Already up to date.") + "\n```");
    } catch (e) {
      return c.reply("❌ update failed: " + (e.stderr || e.message || "").slice(0, 1200));
    }
  },
  setlink: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const url = (a[0] || "").trim().replace(/\/+$/, "");
    if (!url || !/^https?:\/\//i.test(url)) {
      return c.reply("Usage: " + c.prefix + "setlink <https://panel.example.com>");
    }
    const db = c.db();
    const cfg = getCpanelConfig(c);
    cfg.domain = url;
    c.saveDB(db);
    return c.reply("✅ Panel URL saved: *" + url + "*");
  },

  setkey: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const appKey = (a[0] || "").trim();
    const clientKey = (a[1] || "").trim();
    if (!appKey) {
      return c.reply("Usage: " + c.prefix + "setkey <ptla_app_key> [ptlc_client_key]");
    }
    const db = c.db();
    const cfg = getCpanelConfig(c);
    cfg.appKey = appKey;
    if (clientKey) cfg.clientKey = clientKey;
    c.saveDB(db);
    return c.reply("✅ Panel API key(s) saved.");
  },

  nestconfig: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const eggId = Number(a[0]);
    const locationId = Number(a[1]);
    if (!eggId || !locationId) {
      return c.reply("Usage: " + c.prefix + "nestconfig <eggId> <locationId> [nestId] [dockerImage]");
    }
    const db = c.db();
    const cfg = getCpanelConfig(c);
    cfg.eggId = eggId;
    cfg.locationId = locationId;
    if (a[2] && Number(a[2])) cfg.nestId = Number(a[2]);
    if (a[3]) cfg.dockerImage = a.slice(3).join(" ").trim();
    c.saveDB(db);
    return c.reply(
      "✅ *Nest Config Updated*\n" +
      "Egg ID: *" + cfg.eggId + "* | Location ID: *" + cfg.locationId + "* | Nest ID: *" + cfg.nestId + "*\n" +
      "Image: `" + cfg.dockerImage + "`"
    );
  },

  setpayment: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const info = a.join(" ").trim();
    if (!info) return c.reply("Usage: " + c.prefix + "setpayment <payment details>");
    const db = c.db();
    const cfg = getCpanelConfig(c);
    cfg.paymentInfo = info;
    c.saveDB(db);
    return c.reply("✅ Payment details saved.");
  },

  prompt: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const text = a.join(" ").trim();
    const db = c.db();
    const cfg = getCpanelConfig(c);
    if (!text) {
      return c.reply(cfg.promptText ? "📝 *Saved CPanel Prompt:*\n" + cfg.promptText : "Usage: " + c.prefix + "prompt <text>");
    }
    cfg.promptText = text;
    c.saveDB(db);
    return c.reply("✅ CPanel prompt saved.");
  },

  cpanelmenu: async (s, m, a, c) => {
    const cfg = getCpanelConfig(c);
    const p = c.prefix;
    return c.reply(
      "🖥️ *CPANEL MENU*\n" +
      "Panel URL: " + (cfg.domain ? "*" + cfg.domain + "*" : "❌ Not set") + "\n" +
      "App Key: " + (cfg.appKey ? "✅ Set" : "❌ Missing") + " | Client Key: " + (cfg.clientKey ? "✅ Set" : "—") + "\n" +
      "Egg: *" + cfg.eggId + "* | Location: *" + cfg.locationId + "* | Nest: *" + cfg.nestId + "*\n" +
      (cfg.paymentInfo ? "💳 *Payment:* " + cfg.paymentInfo + "\n" : "") +
      "\n*Commands:*\n" +
      "• " + p + "setlink <url>\n" +
      "• " + p + "setkey <appKey> [clientKey]\n" +
      "• " + p + "nestconfig <eggId> <locId> [nestId] [image]\n" +
      "• " + p + "createuser <user> <email> [pass]\n" +
      "• " + p + "createpanel <userId> <name> <ram> <disk> <cpu>\n" +
      "• " + p + "createunlimited <userId> <name>\n" +
      "• " + p + "setpayment <details>\n" +
      "• " + p + "prompt <text>"
    );
  },

  createuser: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const username = (a[0] || "").trim();
    const email = (a[1] || "").trim();
    const password = (a[2] || ("Pass@" + Math.random().toString(36).slice(2, 8))).trim();
    if (!username || !email) {
      return c.reply("Usage: " + c.prefix + "createuser <username> <email> [password]");
    }
    try {
      const cfg = getCpanelConfig(c);
      const res = await pteroReq(cfg, "/users", "POST", {
        email,
        username,
        first_name: username,
        last_name: "User",
        password
      });
      const attr = res?.attributes || {};
      return c.reply(
        "✅ *Panel User Created*\n" +
        "ID: *" + attr.id + "*\n" +
        "Username: *" + attr.username + "*\n" +
        "Email: *" + attr.email + "*\n" +
        "Password: `" + password + "`\n" +
        "URL: " + (cfg.domain || "")
      );
    } catch (e) {
      return c.reply("❌ createuser failed: " + e.message);
    }
  },

  createpanel: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const userId = Number(a[0]);
    const name = (a[1] || "").trim();
    const memory = Number(a[2] || 1024);
    const disk = Number(a[3] || 2048);
    const cpu = Number(a[4] || 100);
    if (!userId || !name) {
      return c.reply("Usage: " + c.prefix + "createpanel <userId> <name> [ramMB] [diskMB] [cpu%]");
    }
    try {
      const cfg = getCpanelConfig(c);
      const res = await pteroReq(cfg, "/servers", "POST", {
        name,
        user: userId,
        egg: cfg.eggId,
        docker_image: cfg.dockerImage,
        startup: cfg.startupCmd,
        environment: { CMD_RUN: cfg.startupCmd },
        limits: { memory, swap: 0, disk, io: 500, cpu },
        feature_limits: { databases: 1, backups: 1, allocations: 1 },
        deploy: { locations: [cfg.locationId], dedicated_ip: false, port_range: [] }
      });
      const attr = res?.attributes || {};
      return c.reply(
        "✅ *Server Created*\n" +
        "ID: *" + attr.id + "* | UUID: `" + (attr.uuid || "") + "`\n" +
        "Name: *" + attr.name + "*\n" +
        "Specs: *" + memory + "MB RAM* / *" + disk + "MB Disk* / *" + cpu + "% CPU*"
      );
    } catch (e) {
      return c.reply("❌ createpanel failed: " + e.message);
    }
  },

  createunlimited: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const userId = Number(a[0]);
    const name = (a[1] || "").trim();
    if (!userId || !name) {
      return c.reply("Usage: " + c.prefix + "createunlimited <userId> <name>");
    }
    try {
      const cfg = getCpanelConfig(c);
      const res = await pteroReq(cfg, "/servers", "POST", {
        name,
        user: userId,
        egg: cfg.eggId,
        docker_image: cfg.dockerImage,
        startup: cfg.startupCmd,
        environment: { CMD_RUN: cfg.startupCmd },
        limits: { memory: 0, swap: 0, disk: 0, io: 500, cpu: 0 },
        feature_limits: { databases: 5, backups: 5, allocations: 5 },
        deploy: { locations: [cfg.locationId], dedicated_ip: false, port_range: [] }
      });
      const attr = res?.attributes || {};
      return c.reply(
        "♾️ *Unlimited Server Created*\n" +
        "ID: *" + attr.id + "* | UUID: `" + (attr.uuid || "") + "`\n" +
        "Name: *" + attr.name + "*\n" +
        "Specs: *Unlimited RAM / Disk / CPU*"
      );
    } catch (e) {
      return c.reply("❌ createunlimited failed: " + e.message);
    }
  },
  addsudo: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const num = extractTargetNumber(m, a);
    if (!num) return c.reply("Usage: " + c.prefix + "addsudo <number|@user|reply>");
    const db = getSudoList(c);
    if (!db.bot.sudoUsers.includes(num)) {
      db.bot.sudoUsers.push(num);
      c.saveDB(db);
    }
    return c.reply("✅ Added *" + num + "* to sudo users (" + db.bot.sudoUsers.length + " total).");
  },

  delsudo: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const num = extractTargetNumber(m, a);
    if (!num) return c.reply("Usage: " + c.prefix + "delsudo <number|@user|reply>");
    const db = getSudoList(c);
    const before = db.bot.sudoUsers.length;
    db.bot.sudoUsers = db.bot.sudoUsers.filter(x => x !== num);
    c.saveDB(db);
    return c.reply(db.bot.sudoUsers.length < before ? "✅ Removed *" + num + "* from sudo users." : "⚠️ *" + num + "* was not in the sudo list.");
  },

  listsudo: async (s, m, a, c) => {
    const db = getSudoList(c);
    const list = db.bot.sudoUsers;
    if (!list.length) return c.reply("📋 *Sudo Users:* None configured.");
    return c.reply("👑 *Sudo Users (" + list.length + ")* [Mode: *" + (db.bot.sudomode ? "ON" : "OFF") + "*]\n" + list.map((u, i) => (i + 1) + ". +" + u).join("\n"));
  },

  getsudo: async (s, m, a, c) => {
    return commands.listsudo(s, m, a, c);
  },

  checksudo: async (s, m, a, c) => {
    const num = extractTargetNumber(m, a) || String(c.sender || "").split("@")[0].split(":")[0].replace(/\D/g, "");
    const db = getSudoList(c);
    const linked = db.bot.sudoLinks[num];
    const isSudo = db.bot.sudoUsers.includes(num) || (linked && db.bot.sudoUsers.includes(linked));
    return c.reply("🔍 Number *" + num + "*: " + (isSudo ? "✅ *IS* a sudo user." : "❌ *NOT* a sudo user."));
  },

  clearsudo: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const db = getSudoList(c);
    const count = db.bot.sudoUsers.length;
    db.bot.sudoUsers = [];
    db.bot.sudoLinks = {};
    c.saveDB(db);
    return c.reply("🗑️ Cleared *" + count + "* sudo user(s).");
  },

  sudomode: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const db = getSudoList(c);
    const arg = (a[0] || "").toLowerCase();
    if (arg === "on") db.bot.sudomode = true;
    else if (arg === "off") db.bot.sudomode = false;
    else db.bot.sudomode = !db.bot.sudomode;
    c.saveDB(db);
    return c.reply((db.bot.sudomode ? "✅ Enabled" : "❌ Disabled") + " *Sudo Mode*");
  },

  sudoinfo: async (s, m, a, c) => {
    const db = getSudoList(c);
    const ownerNum = String(db.bot.ownerNumber || process.env.OWNER_NUMBER || C.OWNER_NUMBER || "").replace(/\D/g, "");
    return c.reply(
      "ℹ️ *Sudo System Info*\n" +
      "Sudo Mode: *" + (db.bot.sudomode ? "Enabled" : "Disabled") + "*\n" +
      "Primary Owner: *" + (ownerNum || "Bot Self") + "*\n" +
      "Total Sudo Users: *" + db.bot.sudoUsers.length + "*\n" +
      "LID Links: *" + Object.keys(db.bot.sudoLinks).length + "*"
    );
  },

  mysudo: async (s, m, a, c) => {
    const senderNum = String(c.sender || "").split("@")[0].split(":")[0].replace(/\D/g, "");
    const db = getSudoList(c);
    const linked = db.bot.sudoLinks[senderNum];
    const inSudo = db.bot.sudoUsers.includes(senderNum) || (linked && db.bot.sudoUsers.includes(linked));
    return c.reply(
      "👤 *Your Access Status*\n" +
      "Number/ID: *" + senderNum + "*\n" +
      "Owner/Elevated: *" + (c.isOwner ? "Yes" : "No") + "*\n" +
      "In Sudo List: *" + (inSudo ? "Yes" : "No") + "*"
    );
  },

  sudodebug: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const db = getSudoList(c);
    const senderNum = String(c.sender || "").split("@")[0].split(":")[0].replace(/\D/g, "");
    return c.reply(
      "🐞 *Sudo Debug*\n" +
      "Sender: `" + c.sender + "` (" + senderNum + ")\n" +
      "sudomode: *" + db.bot.sudomode + "*\n" +
      "sudoUsers: `" + JSON.stringify(db.bot.sudoUsers) + "`\n" +
      "sudoLinks: `" + JSON.stringify(db.bot.sudoLinks) + "`"
    );
  },

  linksudo: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const id1 = String(a[0] || "").replace(/\D/g, "");
    const id2 = String(a[1] || "").replace(/\D/g, "");
    if (!id1 || !id2) {
      return c.reply("Usage: " + c.prefix + "linksudo <lidNumber> <phoneNumber>");
    }
    const db = getSudoList(c);
    db.bot.sudoLinks[id1] = id2;
    if (!db.bot.sudoUsers.includes(id2)) db.bot.sudoUsers.push(id2);
    c.saveDB(db);
    return c.reply("🔗 Linked ID *" + id1 + "* -> Sudo *" + id2 + "*");
  },
  jid: async (s, m, a, c) => {
    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quoted = m.message?.extendedTextMessage?.contextInfo?.participant;
    const raw = a[0] || mentioned || quoted || "";
    let target = c.from;
    if (raw) {
      const num = String(raw).split("@")[0].split(":")[0].replace(/\D/g, "");
      target = raw.includes("@") ? raw : (num + "@s.whatsapp.net");
    }
    return c.reply("🆔 *JID:* `" + target + "`");
  },

  gjid: async (s, m, a, c) => {
    if (!c.isGroup && typeof s.groupFetchAllParticipating === "function") {
      try {
        const all = await s.groupFetchAllParticipating();
        const list = Object.values(all || {});
        if (!list.length) return c.reply("No groups found.");
        const lines = list.slice(0, 30).map((g, i) => (i + 1) + ". *" + (g.subject || "Group") + "* — `" + g.id + "`");
        return c.reply("👥 *Group JIDs (" + list.length + ")*\n" + lines.join("\n"));
      } catch (e) {
        return c.reply("❌ gjid failed: " + e.message);
      }
    }
    return c.reply("👥 *Group JID:* `" + c.from + "`");
  },

  pp: async (s, m, a, c) => {
    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quoted = m.message?.extendedTextMessage?.contextInfo?.participant;
    const raw = a[0] || mentioned || quoted || "";
    let target = c.isGroup ? (quoted || mentioned || c.from) : c.from;
    if (raw) {
      const num = String(raw).split("@")[0].split(":")[0].replace(/\D/g, "");
      target = raw.includes("@") ? raw : (num + "@s.whatsapp.net");
    }
    try {
      const url = await s.profilePictureUrl(target, "image");
      return s.sendMessage(c.from, { image: { url }, caption: "🖼️ Profile Picture" }, { quoted: m });
    } catch {
      return c.reply("❌ Could not fetch profile picture (may be private or unset).");
    }
  },

  fullpp: async (s, m, a, c) => {
    return commands.pp(s, m, a, c);
  },

  block: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quoted = m.message?.extendedTextMessage?.contextInfo?.participant;
    const raw = a[0] || mentioned || quoted || (!c.isGroup ? c.from : "");
    if (!raw) return c.reply("Usage: " + c.prefix + "block <number|@user|reply>");
    const num = String(raw).split("@")[0].split(":")[0].replace(/\D/g, "");
    const jid = raw.includes("@") ? raw : (num + "@s.whatsapp.net");
    try {
      await s.updateBlockStatus(jid, "block");
      return c.reply("🚫 Blocked *" + num + "*");
    } catch (e) {
      return c.reply("❌ block failed: " + e.message);
    }
  },

  unblock: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    const quoted = m.message?.extendedTextMessage?.contextInfo?.participant;
    const raw = a[0] || mentioned || quoted || "";
    if (!raw) return c.reply("Usage: " + c.prefix + "unblock <number|@user|reply>");
    const num = String(raw).split("@")[0].split(":")[0].replace(/\D/g, "");
    const jid = raw.includes("@") ? raw : (num + "@s.whatsapp.net");
    try {
      await s.updateBlockStatus(jid, "unblock");
      return c.reply("✅ Unblocked *" + num + "*");
    } catch (e) {
      return c.reply("❌ unblock failed: " + e.message);
    }
  },

  bio: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const text = a.join(" ").trim();
    if (!text) return c.reply("Usage: " + c.prefix + "bio <status text>");
    try {
      if (typeof s.updateProfileStatus === "function") {
        await s.updateProfileStatus(text);
      } else if (typeof s.setStatus === "function") {
        await s.setStatus(text);
      }
      const db = c.db(); db.bot ||= {}; db.bot.bio = text; c.saveDB(db);
      return c.reply("✅ Profile bio updated to: *" + text + "*");
    } catch (e) {
      return c.reply("❌ bio failed: " + e.message);
    }
  },

  setname: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const name = a.join(" ").trim();
    if (!name) return c.reply("Usage: " + c.prefix + "setname <profile name>");
    try {
      if (typeof s.updateProfileName === "function") {
        await s.updateProfileName(name);
      }
      const db = c.db(); db.bot ||= {}; db.bot.botName = name; c.saveDB(db);
      C.BOT_NAME = name;
      return c.reply("✅ Profile name updated to: *" + name + "*");
    } catch (e) {
      return c.reply("❌ setname failed: " + e.message);
    }
  },

  creator: async (s, m, a, c) => {
    const ownerNum = String(c.db()?.bot?.ownerNumber || process.env.OWNER_NUMBER || C.OWNER_NUMBER || "254700000000").replace(/\D/g, "");
    const botName = C.BOT_NAME || "HIS EXCELLENCY XMD";
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:" + botName + " Creator",
      "TEL;type=CELL;type=VOICE;waid=" + ownerNum + ":+" + ownerNum,
      "END:VCARD"
    ].join("\n");
    return s.sendMessage(c.from, {
      contacts: { displayName: botName + " Creator", contacts: [{ vcard }] }
    }, { quoted: m });
  },

  react: async (s, m, a, c) => {
    const emoji = (a[0] || "❤️").trim();
    const ctxInfo = m.message?.extendedTextMessage?.contextInfo;
    const targetKey = ctxInfo?.stanzaId
      ? {
          remoteJid: c.from,
          id: ctxInfo.stanzaId,
          fromMe: false,
          ...(ctxInfo.participant ? { participant: ctxInfo.participant } : {})
        }
      : m.key;
    try {
      await s.sendMessage(c.from, { react: { text: emoji, key: targetKey } });
    } catch (e) {
      return c.reply("❌ react failed: " + e.message);
    }
  },

  save: async (s, m, a, c) => {
    if (!c.isOwner) return;
    const res = await viewonce.openFromReply(m);
    if (res.found) {
      await viewonce.sendOpened(
        s,
        c.from,
        res.found,
        res.buffer,
        res.found.media.caption || "💾 *Saved Media / Status*"
      );
      return;
    }
    const quotedText = m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
      m.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text;
    if (quotedText) {
      return c.reply("💾 *Saved Text:*\n\n" + quotedText);
    }
    return c.reply("Reply to a status or media message with " + c.prefix + "savestatus");
  },

  save: async (s, m, a, c) => {
    return commands.savestatus(s, m, a, c);
  },







  };

module.exports = commands;