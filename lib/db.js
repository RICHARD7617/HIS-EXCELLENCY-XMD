"use strict";

const fs = require("fs");
const path = require("path");
const C = require("../config");
const DB_PATH = path.join(__dirname, "..", "database.json");
const storage = require("./storage");

let cache = null;
let writeQueue = Promise.resolve();
let postgresEnabled = false;

function defaultShape() { return { groups: {}, bot: { mode: "PUBLIC" } }; }
function ensureShape(data) {
  if (!data || typeof data !== "object") return defaultShape();
  if (!data.groups || typeof data.groups !== "object") data.groups = {};
  if (!data.bot || typeof data.bot !== "object") data.bot = {};
  if (!data.bot.mode) data.bot.mode = "PUBLIC";
  return data;
}

async function initDatabase() {
  if (process.env.DATABASE_URL) {
    const persisted = await storage.loadAppState();
    if (persisted) cache = ensureShape(persisted);
    else {
      cache = loadLegacyFile();
      await storage.saveAppState(cache);
    }
    postgresEnabled = true;
  } else {
    cache = loadLegacyFile();
    console.warn("[db] DATABASE_URL is not set; local JSON storage is temporary on Heroku.");
  }
  if (cache.bot.prefix && cache.bot.prefix !== C.PREFIX) C.PREFIX = cache.bot.prefix;
  return cache;
}

function loadLegacyFile() {
  try {
    if (!fs.existsSync(DB_PATH)) return defaultShape();
    return ensureShape(JSON.parse(fs.readFileSync(DB_PATH, "utf8")));
  } catch (error) {
    console.error("[db] local read error:", error.message);
    return defaultShape();
  }
}

function getDB() {
  if (!cache) cache = loadLegacyFile();
  return cache;
}

function saveDB(db) {
  const data = ensureShape(db);
  cache = data;
  if (postgresEnabled) {
    writeQueue = writeQueue.then(() => storage.saveAppState(data)).catch(error => {
      console.error("[db] PostgreSQL save failed:", error.message);
    });
    return true;
  }
  try {
    const tmp = `${DB_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, DB_PATH);
    return true;
  } catch (error) {
    console.error("[db] local save error:", error.message);
    return false;
  }
}

async function flushDB() { await writeQueue; }
function getGroup(jid) {
  const db = getDB();
  if (!db.groups[jid]) db.groups[jid] = {
    antilink: false, antisticker: false, antiimage: false, antivideo: false,
    antiaudio: false, antimention: false, antibadword: false, antispam: false,
    welcome: false, goodbye: false, mute: false, onlyadmins: false,
    badwords: [], warnings: {}, banned: []
  };
  return db.groups[jid];
}
function saveGroup(jid, settings) { const db = getDB(); db.groups[jid] = settings; return saveDB(db); }
function setMode(mode) { const db = getDB(); db.bot.mode = String(mode).toUpperCase(); return saveDB(db); }
function getMode() { return String(getDB().bot.mode || "PUBLIC").toUpperCase(); }

module.exports = { initDatabase, flushDB, getDB, saveDB, getGroup, saveGroup, getMode, setMode, DB_PATH };
