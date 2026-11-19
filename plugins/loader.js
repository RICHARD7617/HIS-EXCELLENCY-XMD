// plugins/loader.js
// Scans the plugins folder and returns a Map of commandName -> handler
const fs = require("fs");
const path = require("path");

function loadPlugins(log = console.log) {
  const registry = new Map();
  const dir = __dirname;

  const files = fs
    .readdirSync(dir)
    .filter(f => f.endsWith(".js") && f !== "loader.js");

  for (const file of files) {
    try {
      const mod = require(path.join(dir, file));

      // Each plugin file exports either:
      //   { commands: { name: handler, ... } }   OR
      //   { name: handler, otherName: handler }   OR
      //   a function(sock, message, args, ctx) for stubs
      const commands = mod.commands || mod;

      if (typeof commands !== "object" && typeof commands !== "function") {
        log(`[loader] skip ${file} (bad export)`);
        continue;
      }

      for (const [name, handler] of Object.entries(commands)) {
        if (typeof handler !== "function") continue;
        const key = name.toLowerCase();
        if (registry.has(key)) {
          log(`[loader] duplicate command "${key}" in ${file}, keeping first`);
          continue;
        }
        registry.set(key, { handler, source: file });
      }

      log(`[loader] loaded ${file} (${Object.keys(commands).length} commands)`);
    } catch (err) {
      log(`[loader] FAILED to load ${file}:`, err.message);
    }
  }

  log(`[loader] total commands registered: ${registry.size}`);
  return registry;
}

module.exports = { loadPlugins };
