"use strict";

function normalizeNumber(value) {
  return String(value || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");
}

function isAdmin(participant) {
  if (!participant) return false;
  return (
    participant.admin === "admin" ||
    participant.admin === "superadmin" ||
    participant.admin === true ||
    participant.isAdmin === true
  );
}

function findParticipant(metadata, jid) {
  if (!metadata || !Array.isArray(metadata.participants)) return null;
  const target = normalizeNumber(jid);
  return metadata.participants.find((p) => {
    return (
      p.id === jid ||
      p.jid === jid ||
      p.lid === jid ||
      normalizeNumber(p.id) === target ||
      normalizeNumber(p.jid) === target ||
      normalizeNumber(p.lid) === target
    );
  });
}

function isBotAdmin(socket, metadata) {
  if (!socket?.user?.id) return false;
  const bot = findParticipant(metadata, socket.user.id);
  return isAdmin(bot);
}

function isUserAdmin(metadata, jid) {
  return isAdmin(findParticipant(metadata, jid));
}

function resolveTarget(args, message, metadata) {
  if (args && args.length > 0 && args[0]) {
    const raw = String(args[0]).replace(/[^0-9]/g, "");
    if (!raw) return null;
    return `${raw}@s.whatsapp.net`;
  }

  const mentioned = message?.message?.extendedTextMessage?.contextInfo?.mentionedJid;
  if (mentioned && mentioned.length > 0) return mentioned[0];

  const quoted = message?.message?.extendedTextMessage?.contextInfo?.participant;
  if (quoted) return quoted;

  return null;
}

function jidToNumber(jid) {
  return normalizeNumber(jid);
}

module.exports = {
  normalizeNumber,
  isAdmin,
  findParticipant,
  isBotAdmin,
  isUserAdmin,
  resolveTarget,
  jidToNumber
};
