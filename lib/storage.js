"use strict";

const { Pool } = require("pg");
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

const encode = value => JSON.stringify(value, BufferJSON.replacer);
const decode = value => typeof value === "string"
  ? JSON.parse(value, BufferJSON.reviver)
  : JSON.parse(JSON.stringify(value), BufferJSON.reviver);

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
