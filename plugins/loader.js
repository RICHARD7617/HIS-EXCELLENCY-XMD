"use strict";

const fs = require("fs");
const path = require("path");

function loadPlugins(log = console.log) {
  const registry = new Map();
  const initHooks = [];
  const dir = __dirname;

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js") && f !== "loader.js")
    .sort((a, b) => (a === "stubs.js" ? 1 : 0) - (b === "stubs.js" ? 1 : 0));

  for (const file of files) {
    try {
      const mod = require(path.join(dir, file));

      if (typeof mod.init === "function") {
        initHooks.push({ file, fn: mod.init });
      }

      const commands = mod.commands || mod;

      if (typeof commands !== "object" || commands === null) {
        log(`[loader] skip ${file} (bad export)`);
        continue;
      }

      let count = 0;

      for (const [name, handler] of Object.entries(commands)) {
        if (name === "init") continue;

        let finalHandler = handler;
        if (typeof handler !== "function") {
          if (typeof handler?.run === "function") finalHandler = handler.run.bind(handler);
          else if (typeof handler?.handler === "function") finalHandler = handler.handler;
          else continue;
        }

        const key = name.toLowerCase();
        if (registry.has(key)) {
          log(`[loader] duplicate "${key}" in ${file}, keeping first`);
          continue;
        }

        registry.set(key, { handler: finalHandler, source: file });
        count++;
      }

      log(`[loader] loaded ${file} (${count} commands)`);
    } catch (err) {
      log(`[loader] FAILED to load ${file}:`, err.message);
    }
  }

  log(`[loader] total commands registered: ${registry.size}`);

  Object.defineProperty(registry, "__initHooks", {
    value: initHooks,
    enumerable: false,
    writable: false
  });

  return registry;
}

module.exports = { loadPlugins };
