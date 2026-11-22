"use strict";

const { Pool } = require("pg");
const crypto = require("crypto");
const { BufferJSON, initAuthCreds, proto } = require("@whiskeysockets/baileys");

let pool = null;
let ready = false;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured. Add a PostgreSQL database before deploying persistent storage.");
  }
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
      max: Number(process.env.PG_POOL_MAX || 5),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000
    });
    pool.on("error", error => console.error("[storage] PostgreSQL pool error:", error.message));
  }
  return pool;
}

async function initStorage() {
  if (ready) return;
  // Fail fast rather than ever persisting WhatsApp credentials without encryption.
  getEncryptionKey();
  const db = getPool();
  await db.query(`CREATE TABLE IF NOT EXISTS xmd_app_state (
    state_key TEXT PRIMARY KEY,
    state_value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS xmd_auth_creds (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    creds JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS xmd_auth_keys (
    key_type TEXT NOT NULL,
    key_id TEXT NOT NULL,
    key_value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (key_type, key_id)
  )`);
  ready = true;
  console.log("[storage] PostgreSQL storage is ready.");
}

function getEncryptionKey() {
  const raw = String(process.env.XMD_STORAGE_KEY || "").trim();
  if (!raw) {
    throw new Error("XMD_STORAGE_KEY is required when PostgreSQL storage is enabled. Generate one with: openssl rand -base64 32");
  }
  let key;
  if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, "hex");
  else key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("XMD_STORAGE_KEY must decode to exactly 32 bytes (base64 or 64-character hex).");
  return key;
}

function encode(value) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(value, BufferJSON.replacer), "utf8");
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return JSON.stringify({
    __xmd_encrypted: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64")
  });
}

function decode(value) {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (parsed && parsed.__xmd_encrypted === 1) {
    const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(parsed.iv, "base64"));
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
    const plain = Buffer.concat([decipher.update(Buffer.from(parsed.data, "base64")), decipher.final()]).toString("utf8");
    return JSON.parse(plain, BufferJSON.reviver);
  }
  // Backward-compatible read of older unencrypted rows. They are encrypted on next write.
  return JSON.parse(JSON.stringify(parsed), BufferJSON.reviver);
}

async function loadAppState() {
  await initStorage();
  const result = await getPool().query("SELECT state_value FROM xmd_app_state WHERE state_key = $1", ["main"]);
  return result.rows[0] ? decode(result.rows[0].state_value) : null;
}

async function saveAppState(state) {
  await initStorage();
  await getPool().query(
    `INSERT INTO xmd_app_state(state_key,state_value,updated_at) VALUES($1,$2::jsonb,NOW())
     ON CONFLICT(state_key) DO UPDATE SET state_value=EXCLUDED.state_value, updated_at=NOW()`,
    ["main", encode(state)]
  );
}

async function usePostgresAuthState(initialCreds = null) {
  await initStorage();
  const db = getPool();
  const result = await db.query("SELECT creds FROM xmd_auth_creds WHERE id=1");
  const creds = result.rows[0] ? decode(result.rows[0].creds) : (initialCreds || initAuthCreds());
  if (!result.rows[0] && initialCreds) {
    await db.query("INSERT INTO xmd_auth_creds(id,creds,updated_at) VALUES(1,$1::jsonb,NOW()) ON CONFLICT(id) DO NOTHING", [encode(creds)]);
  }

  const keys = {
    async get(type, ids) {
      if (!ids.length) return {};
      const result = await db.query(
        "SELECT key_id,key_value FROM xmd_auth_keys WHERE key_type=$1 AND key_id = ANY($2::text[])",
        [type, ids]
      );
      const values = {};
      for (const row of result.rows) {
        let value = decode(row.key_value);
        if (type === "app-state-sync-key" && value) {
          value = proto.Message.AppStateSyncKeyData.fromObject(value);
        }
        values[row.key_id] = value;
      }
      return values;
    },
    async set(data) {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        for (const [type, entries] of Object.entries(data || {})) {
          for (const [id, value] of Object.entries(entries || {})) {
            if (value == null) {
              await client.query("DELETE FROM xmd_auth_keys WHERE key_type=$1 AND key_id=$2", [type, id]);
            } else {
              await client.query(
                `INSERT INTO xmd_auth_keys(key_type,key_id,key_value,updated_at) VALUES($1,$2,$3::jsonb,NOW())
                 ON CONFLICT(key_type,key_id) DO UPDATE SET key_value=EXCLUDED.key_value,updated_at=NOW()`,
                [type, id, encode(value)]
              );
            }
          }
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    }
  };

  return {
    state: { creds, keys },
    async saveCreds() {
      await db.query(
        `INSERT INTO xmd_auth_creds(id,creds,updated_at) VALUES(1,$1::jsonb,NOW())
         ON CONFLICT(id) DO UPDATE SET creds=EXCLUDED.creds,updated_at=NOW()`,
        [encode(creds)]
      );
    },
    async clearAuthState() {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM xmd_auth_keys");
        await client.query(
          `INSERT INTO xmd_auth_creds(id,creds,updated_at) VALUES(1,$1::jsonb,NOW())
           ON CONFLICT(id) DO UPDATE SET creds=EXCLUDED.creds,updated_at=NOW()`,
          [encode(creds)]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    }
  };
}

async function closeStorage() {
  if (pool) await pool.end();
  pool = null;
  ready = false;
}

module.exports = { initStorage, loadAppState, saveAppState, usePostgresAuthState, closeStorage };
