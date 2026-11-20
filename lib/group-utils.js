"use strict";

function normalizeNumber(v) {
  return String(v || "").split("@")[0].split(":")[0].replace(/\D/g, "");
}

function isAdmin(p) {
  return Boolean(p && (p.admin === "admin" || p.admin === "superadmin" || p.isAdmin === true));
}

function findParticipant(metadata, jid) {
  if (!metadata?.participants) return null;
  const target = normalizeNumber(jid);
  return metadata.participants.find(
    (p) =>
      p.id === jid ||
      p.jid === jid ||
      p.lid === jid ||
      normalizeNumber(p.id) === target ||
      normalizeNumber(p.jid) === target ||
      normalizeNumber(p.lid) === target
  );
}

function isBotAdmin(socket, metadata) {
  if (!socket?.user?.id) return false;
  return isAdmin(findParticipant(metadata, socket.user.id));
}

function isUserAdmin(metadata, jid) {
  return isAdmin(findParticipant(metadata, jid));
}

module.exports = { normalizeNumber, isAdmin, findParticipant, isBotAdmin, isUserAdmin };
