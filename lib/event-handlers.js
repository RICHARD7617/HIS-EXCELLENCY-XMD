"use strict";

const { getDB, saveDB, getGroup } = require("./db");

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function normalizeNumber(v) {
  return String(v || "").split("@")[0].split(":")[0].replace(/\D/g, "");
}

function participantJid(p) {
  if (!p) return "";
  return typeof p === "string" ? p : p.id || p.jid || "";
}

function isAdmin(p) {
  return Boolean(
    p && (p.admin === "admin" || p.admin === "superadmin" || p.isAdmin === true)
  );
}

function unwrapMessage(msg) {
  let m = msg;
  for (let i = 0; i < 4 && m; i++) {
    if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
    else if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
    else if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
    else if (m.viewOnceMessageV2Extension?.message) m = m.viewOnceMessageV2Extension.message;
    else if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;
    else break;
  }
  return m;
}

function extractText(m) {
  if (!m) return "";
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    ""
  );
}

// Spam tracker (in-memory; survives until process restart)
const spamMap = new Map();

// Message cache for antidelete / antiedit
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

// ------------------------------------------------------------
// Main registration — called after every socket creation
// ------------------------------------------------------------
function registerEventHandlers(socket, log = console.log) {
  if (!socket || !socket.ev) return;

  // ==========================================================
  // WELCOME / GOODBYE / ANTI-LEAVE / ANTI-PROMOTE / ANTI-DEMOTE
  // ==========================================================
  socket.ev.on("group-participants.update", async (update) => {
    try {
      const { id: groupJid, participants, action } = update;
      if (!groupJid || !participants?.length) return;

      const db = getDB();
      const settings = db.groups?.[groupJid];
      if (!settings) return;

      const jids = participants.map(participantJid).filter(Boolean);
      if (!jids.length) return;

      let meta = null;
      const getMeta = async () => {
        if (meta) return meta;
        try {
          meta = await socket.groupMetadata(groupJid);
        } catch {
          meta = null;
        }
        return meta;
      };

      // ---------- ADD / JOIN ----------
      if (action === "add") {
        if (settings.banlist?.length) {
          for (const jid of jids) {
            const num = normalizeNumber(jid);
            const banned = settings.banlist.some(
              (b) => b === jid || (num && normalizeNumber(b) === num)
            );
            if (banned) {
              try {
                await socket.groupParticipantsUpdate(groupJid, [jid], "remove");
              } catch {}
            }
          }
        }

        if (settings.welcome) {
          const m = await getMeta();
          const subject = m?.subject || "this group";
          const desc = m?.desc || "";
          const lines = jids
            .map((jid) => `👋 Welcome @${normalizeNumber(jid)} to *${subject}*!`)
            .join("\n");
          const text = desc ? `${lines}\n\n📝 ${desc}` : lines;
          await socket
            .sendMessage(groupJid, { text, mentions: jids })
            .catch((e) => log("[welcome] send failed:", e.message));
        }
      }

      // ---------- REMOVE / LEAVE ----------
      if (action === "remove") {
        if (settings.goodbye) {
          const m = await getMeta();
          const subject = m?.subject || "the group";
          for (const jid of jids) {
            await socket
              .sendMessage(groupJid, {
                text: `👋 @${normalizeNumber(jid)} left *${subject}*.`,
                mentions: [jid]
              })
              .catch((e) => log("[goodbye] send failed:", e.message));
          }
        }
      }

      // ---------- PROMOTE ----------
      if (action === "promote" && settings.antipromote) {
        const m = await getMeta();
        const botJid = socket.user?.id;
        const botP = m?.participants?.find(
          (x) => normalizeNumber(participantJid(x)) === normalizeNumber(botJid)
        );
        if (isAdmin(botP)) {
          for (const jid of jids) {
            try {
              await socket.groupParticipantsUpdate(groupJid, [jid], "demote");
            } catch {}
          }
        }
      }

      // ---------- DEMOTE ----------
      if (action === "demote" && settings.antidemote) {
        const m = await getMeta();
        const botJid = socket.user?.id;
        const botP = m?.participants?.find(
          (x) => normalizeNumber(participantJid(x)) === normalizeNumber(botJid)
        );
        if (isAdmin(botP)) {
          for (const jid of jids) {
            try {
              await socket.groupParticipantsUpdate(groupJid, [jid], "promote");
            } catch {}
          }
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
  // ANTI-DELETE & ANTI-EDIT
  // ==========================================================
  socket.ev.on("messages.update", async (updates) => {
    try {
      const db = getDB();
      for (const upd of updates || []) {
        const remoteJid = upd?.key?.remoteJid;
        const msgId = upd?.key?.id;
        if (!remoteJid || !msgId) continue;

        const cached = msgStore.get(remoteJid + ":" + msgId);
        const settings = remoteJid.endsWith("@g.us") ? db.groups?.[remoteJid] : null;
        const ownerJid = db.bot?.ownerJid || (process.env.OWNER_NUMBER ? `${normalizeNumber(process.env.OWNER_NUMBER)}@s.whatsapp.net` : "");
        const alertJid = remoteJid.endsWith("@g.us") ? remoteJid : ownerJid;

        // Edited message detection
        const editedPayload =
          upd?.update?.message?.editedMessage?.message ||
          upd?.update?.message?.protocolMessage?.editedMessage ||
          null;

        if (editedPayload && (settings?.antiedit || db.bot?.antiedit)) {
          const oldText = extractText(unwrapMessage(cached?.message)) || "(non-text message)";
          const newText = extractText(unwrapMessage(editedPayload)) || "(non-text message)";
          const actor = cached?.sender || upd?.key?.participant || remoteJid;
          if (alertJid) {
            await socket
              .sendMessage(alertJid, {
                text:
                  `✏️ *Anti-Edit Detected*\n` +
                  `User: @${normalizeNumber(actor)}\n` +
                  `Before: ${oldText}\n` +
                  `After: ${newText}`,
                mentions: [actor]
              })
              .catch(() => {});
          }
        }

        // Deleted message detection
        const isDeleted =
          upd?.update?.message === null ||
          upd?.update?.messageStubType === 1 ||
          upd?.update?.message?.protocolMessage?.type === 0;

        if (isDeleted && cached && (settings?.antidelete || db.bot?.antidelete)) {
          const actor = cached.sender || remoteJid;
          const oldText = extractText(unwrapMessage(cached.message));
          if (alertJid) {
            await socket
              .sendMessage(alertJid, {
                text:
                  `🗑️ *Anti-Delete Detected*\n` +
                  `Sender: @${normalizeNumber(actor)}` +
                  (oldText ? `\nMessage: ${oldText}` : "\nMessage: (media/attachment)"),
                mentions: [actor]
              })
              .catch(() => {});
          }
        }
      }
    } catch (err) {
      log("[messages.update] error:", err.message);
    }
  });

  // ==========================================================
  // CACHE + ANTI-MODERATION ON INCOMING MESSAGES
  // ==========================================================
  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const message of messages || []) {
      try {
        if (!message?.message || !message.key?.remoteJid) continue;
        cacheIncomingMessage(message);

        const from = message.key.remoteJid;
        if (!from.endsWith("@g.us")) continue;
        if (message.key.fromMe) continue;

        const db = getDB();
        const settings = db.groups?.[from];
        if (!settings) continue;

        const sender = message.key.participant || from;
        const senderNum = normalizeNumber(sender);
        const botNum = normalizeNumber(socket.user?.id);
        if (senderNum === botNum) continue;

        let senderIsAdmin = false;
        const needMeta =
          settings.antisticker ||
          settings.antiimage ||
          settings.antivideo ||
          settings.antiaudio ||
          settings.antimention ||
          settings.antistatusmention ||
          settings.antibadword ||
          settings.antispam ||
          settings.antigrouplink;

        if (needMeta) {
          try {
            const meta = await socket.groupMetadata(from);
            const p = meta.participants.find(
              (x) => normalizeNumber(participantJid(x)) === senderNum
            );
            senderIsAdmin = isAdmin(p);
          } catch {}
        }

        const ownerNum = normalizeNumber(process.env.OWNER_NUMBER || "");
        if (senderIsAdmin || senderNum === ownerNum) continue;

        const m = unwrapMessage(message.message);
        const text = extractText(m);

        let violated = null;

        if (settings.antisticker && m.stickerMessage) violated = "sticker";

        if (settings.antiimage && m.imageMessage && !m.imageMessage.viewOnce) {
          violated = "image";
        }

        if (settings.antivideo && m.videoMessage && !m.videoMessage.viewOnce) {
          violated = "video";
        }

        if (settings.antiaudio && m.audioMessage) violated = "audio";

        if (settings.antimention) {
          const mentions = m.extendedTextMessage?.contextInfo?.mentionedJid || [];
          if (mentions.length >= 10) violated = "mention";
        }

        if (
          settings.antistatusmention &&
          (m.groupStatusMentionMessage ||
            m.statusMentionMessage ||
            m.extendedTextMessage?.contextInfo?.remoteJid === "status@broadcast")
        ) {
          violated = "status-mention";
        }

        if (settings.antigrouplink && /chat\.whatsapp\.com\//i.test(text)) {
          violated = "group-link";
        }

        if (settings.antibadword && settings.badwords?.length) {
          const lower = text.toLowerCase();
          for (const bad of settings.badwords) {
            if (bad && lower.includes(String(bad).toLowerCase())) {
              violated = "badword";
              break;
            }
          }
        }

        if (settings.antispam) {
          const key = `${from}|${senderNum}`;
          const now = Date.now();
          const rec = spamMap.get(key) || { count: 0, firstTs: now, lastTs: now };
          if (now - rec.firstTs > 10000) {
            rec.count = 0;
            rec.firstTs = now;
          }
          rec.count++;
          rec.lastTs = now;
          spamMap.set(key, rec);
          if (rec.count >= 5) violated = "spam";
        }

        if (!violated) continue;

        try {
          await socket.sendMessage(from, { delete: message.key });
        } catch {}

        try {
          if (violated !== "spam") {
            await socket.sendMessage(from, {
              text: `🚫 *Anti-${violated} triggered*\n\n@${senderNum} — your message was removed.`,
              mentions: [sender]
            });
          }
        } catch {}
      } catch (err) {
        log("[auto-mod] error:", err.message);
      }
    }
  });

  log("[events] group-participants, call, messages.update, auto-mod listeners registered");
}

module.exports = { registerEventHandlers };
