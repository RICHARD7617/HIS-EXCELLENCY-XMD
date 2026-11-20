"use strict";

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "database.json");

let cache = null;
let cacheMtime = 0;

function defaultShape() {
  return {
    groups: {},
    bot: { mode: "PUBLIC" }
  };
}

function ensureShape(data) {
  if (!data || typeof data !== "object") return defaultShape();
  if (!data.groups || typeof data.groups !== "object") data.groups = {};
  if (!data.bot || typeof data.bot !== "object") data.bot = {};
  if (!data.bot.mode) data.bot.mode = "PUBLIC";
  return data;
}

function getDB() {
  try {
    if (cache) return cache;

    if (!fs.existsSync(DB_PATH)) {
      cache = defaultShape();
      fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2));
      return cache;
    }

    const stat = fs.statSync(DB_PATH);
    if (cache && stat.mtimeMs === cacheMtime) return cache;

    cache = ensureShape(JSON.parse(fs.readFileSync(DB_PATH, "utf8")));
    cacheMtime = stat.mtimeMs;
    return cache;
  } catch (error) {
    console.error("[db] read error:", error.message);
    return defaultShape();
  }
}

function saveDB(db) {
  try {
    const data = ensureShape(db);
    const tmp = `${DB_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, DB_PATH);
    cache = data;
    cacheMtime = fs.statSync(DB_PATH).mtimeMs;
    return true;
  } catch (error) {
    console.error("[db] save error:", error.message);
    return false;
  }
}

function getGroup(jid) {
  const db = getDB();
  if (!db.groups[jid]) {
    db.groups[jid] = {
      antilink: false,
      antisticker: false,
      antiimage: false,
      antivideo: false,
      antiaudio: false,
      antimention: false,
      antibadword: false,
      antispam: false,
      welcome: false,
      goodbye: false,
      mute: false,
      onlyadmins: false,
      badwords: [],
      warnings: {},
      banned: []
    };
  }
  return db.groups[jid];
}

function saveGroup(jid, settings) {
  const db = getDB();
  db.groups[jid] = settings;
  return saveDB(db);
}

function setMode(mode) {
  const db = getDB();
  db.bot.mode = String(mode).toUpperCase();
  return saveDB(db);
}

function getMode() {
  return String(getDB().bot.mode || "PUBLIC").toUpperCase();
}

module.exports = {
  getDB,
  saveDB,
  getGroup,
  saveGroup,
  getMode,
  setMode,
  DB_PATH
};
