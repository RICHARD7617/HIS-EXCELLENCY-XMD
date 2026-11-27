"use strict";

const { getDB, saveDB, getGroup } = require("./db");

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function normalizeNumber(v) {
  return String(v || "").split("@")[0].split(":")[0].replace(/\D/g, "");
}

function isAdmin(p) {
  return Boolean(
    p && (p.admin === "admin" || p.admin === "superadmin" || p.isAdmin === true)
  );
}

// Spam tracker (in-memory; survives until process restart)
const spamMap = new Map();

// Message & status cache for antidelete / antiedit
const msgStore = new Map();
function cacheIncomingMessage(msg) {
  try {
    const id = msg?.key?.id;
    const remoteJid = msg?.key?.remoteJid;
    if (!id || !remoteJid || !msg?.message) return;
    msgStore.set(remoteJid + ":" + id, {
      key: msg.key,
      message: msg.message,
      sender: msg.key.participant || remoteJid,
      ts: Date.now()
    });
    if (msgStore.size > 2000) {
      const oldestKey = msgStore.keys().next().value;
      msgStore.delete(oldestKey);
    }
  } catch {}
}

 // key: group|user -> { count, firstTs, lastTs }

// ------------------------------------------------------------
// Main registration — called after every socket creation
// ------------------------------------------------------------
function registerEventHandlers(socket, log = console.log) {
  if (!socket || !socket.ev) return;

  // ==========================================================
  // WELCOME / GOODBYE / ANTI-LEAVE
  // ==========================================================
  socket.ev.on("group-participants.update", async (update) => {
    try {
      const { id: groupJid, participants, action } = update;
      if (!groupJid || !participants?.length) return;

      const db = getDB();
      const settings = db.groups[groupJid];
      if (!settings) return;

      let meta = null;
      const getMeta = async () => {
        if (meta) return meta;
        try { meta = await socket.groupMetadata(groupJid); } catch { meta = null; }
        return meta;
      };

      // ---------- ADD / JOIN ----------
      if (action === "add") {
        // Anti-leave: re-add anyone who was in the ban list, kick them again
        if (settings.banlist?.length) {
          for (const p of participants) {
            if (settings.banlist.includes(p.id)) {
              try {
                await socket.groupParticipantsUpdate(groupJid, [p.id], "remove");
              } catch {}
            }
          }
        }

        if (settings.welcome) {
          const m = await getMeta();
          const subject = m?.subject || "this group";
          const desc = m?.desc || "";
          const lines = participants
            .map((p) => `👋 Welcome @${normalizeNumber(p.id)} to *${subject}*!`)
            .join("\n");
          const text = desc ? `${lines}\n\n📝 ${desc}` : lines;
          const mentions = participants.map((p) => p.id);
          await socket
            .sendMessage(groupJid, { text, mentions })
            .catch((e) => log("[welcome] send failed:", e.message));
        }
      }

      // ---------- REMOVE / LEAVE ----------
      if (action === "remove") {
        // Anti-demote/react: could track removed admins here
        if (settings.goodbye) {
          const m = await getMeta();
          const subject = m?.subject || "the group";
          for (const p of participants) {
            await socket
              .sendMessage(groupJid, {
                text: `👋 @${normalizeNumber(p.id)} left *${subject}*.`,
                mentions: [p.id],
              })
              .catch((e) => log("[goodbye] send failed:", e.message));
          }
        }
      }

      // ---------- PROMOTE / DEMOTE ----------
      if (action === "promote" && settings.antipromote) {
        const m = await getMeta();
        const botJid = socket.user?.id;
        for (const p of participants) {
          try {
            const botP = m?.participants?.find(
              (x) => normalizeNumber(x.id) === normalizeNumber(botJid)
            );
            if (isAdmin(botP)) {
              await socket.groupParticipantsUpdate(groupJid, [p.id], "demote");
            }
          } catch {}
        }
      }

      if (action === "demote" && settings.antidemote) {
        const m = await getMeta();
        const botJid = socket.user?.id;
        for (const p of participants) {
          try {
            const botP = m?.participants?.find(
              (x) => normalizeNumber(x.id) === normalizeNumber(botJid)
            );
            if (isAdmin(botP)) {
              await socket.groupParticipantsUpdate(groupJid, [p.id], "promote");
            }
          } catch {}
        }
      }
    } catch (err) {
      log("[group-participants] error:", err.message);
    }
  });

  // ==========================================================
  // ANTI-CALL
  // ==========================================================
  socket.ev.on("call", async (calls) => {
    try {
      const db = getDB();
      const botMode = String(db.bot?.mode || "PUBLIC").toUpperCase();

      for (const call of calls || []) {
        if (call.status !== "offer") continue;

        const callerNumber = normalizeNumber(call.from);
        const ownerNumber = normalizeNumber(process.env.OWNER_NUMBER || "");

        // In PRIVATE mode, only allow owner calls; in PUBLIC, reject unknown calls if flag set
        const reject =
          (botMode === "PRIVATE" && callerNumber !== ownerNumber) ||
          (botMode === "PUBLIC" && db.bot?.anticall === true);

        if (reject) {
          try {
            await socket.rejectCall(call.id, call.from);
          } catch (e) {
            log("[call] reject failed:", e.message);
          }
        }
      }
    } catch (err) {
      log("[call] error:", err.message);
    }
  });

  // ==========================================================
  // ANTI-MODERATION on messages (sticker / image / video / audio /
  // mention / badword / spam / group-link / status-mention)
  // ==========================================================
  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const message of messages || []) {
      try {
        if (!message?.message || !message.key?.remoteJid) continue;
        const from = message.key.remoteJid;
        if (!from.endsWith("@g.us")) continue;
        if (message.key.fromMe) continue;

        const db = getDB();
        const settings = db.groups[from];
        if (!settings) continue;

        const sender = message.key.participant || from;
        const senderNum = normalizeNumber(sender);
        const botNum = normalizeNumber(socket.user?.id);
        if (senderNum === botNum) continue;

        // Is this sender an admin/owner? Admins bypass enforcement
        let senderIsAdmin = false;
        let meta = null;
        const needMeta =
          settings.antisticker || settings.antiimage || settings.antivideo ||
          settings.antiaudio || settings.antimention || settings.antibadword ||
          settings.antispam || settings.antigrouplink;

        if (needMeta) {
          try {
            meta = await socket.groupMetadata(from);
            const p = meta.participants.find(
              (x) => normalizeNumber(x.id) === senderNum
            );
            senderIsAdmin = isAdmin(p);
          } catch {}
        }

        // Owner always bypasses
        const ownerNum = normalizeNumber(process.env.OWNER_NUMBER || "");
        if (senderIsAdmin || senderNum === ownerNum) continue;

        const m = message.message;
        const text =
          m.conversation ||
          m.extendedTextMessage?.text ||
          m.imageMessage?.caption ||
          m.videoMessage?.caption ||
          "";

        let violated = null;

        // ---- Sticker ----
        if (settings.antisticker && m.stickerMessage) violated = "sticker";

        // ---- Image ----
        if (settings.antiimage && m.imageMessage && !m.imageMessage.viewOnce) violated = "image";

        // ---- Video ----
        if (settings.antivideo && m.videoMessage) violated = "video";

        // ---- Audio ----
        if (settings.antiaudio && m.audioMessage) violated = "audio";

        // ---- Mention everyone (@everyone style) ----
        if (settings.antimention) {
          const mentions = m.extendedTextMessage?.contextInfo?.mentionedJid || [];
          if (mentions.length >= 10) violated = "mention";
        }

        // ---- Group link ----
        if (settings.antigrouplink && /chat\.whatsapp\.com\//i.test(text)) {
          violated = "group-link";
        }

        // ---- Bad word ----
        if (settings.antibadword && settings.badwords?.length) {
          const lower = text.toLowerCase();
          for (const bad of settings.badwords) {
            if (lower.includes(bad)) { violated = "badword"; break; }
          }
        }

        // ---- Spam (5+ msgs in 10s from same user) ----
        if (settings.antispam) {
          const key = `${from}|${senderNum}`;
          const now = Date.now();
          const rec = spamMap.get(key) || { count: 0, firstTs: now, lastTs: now };
          if (now - rec.firstTs > 10000) { rec.count = 0; rec.firstTs = now; }
          rec.count++;
          rec.lastTs = now;
          spamMap.set(key, rec);
          if (rec.count >= 5) violated = "spam";
        }

        if (!violated) continue;

        // Delete the message
        try {
          await socket.sendMessage(from, { delete: message.key });
        } catch {}

        // Warn the offender (but don't warn for spam again — throttle)
        try {
          if (violated !== "spam") {
            await socket.sendMessage(from, {
              text: `🚫 *Anti-${violated} triggered*\n\n@${senderNum} — your message was removed.`,
              mentions: [sender],
            });
          }
        } catch {}
      } catch (err) {
        log("[auto-mod] error:", err.message);
      }
    }
  });

  log("[events] group-participants, call, auto-mod listeners registered");
}

module.exports = { registerEventHandlers };
