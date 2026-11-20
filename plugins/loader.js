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
      
      // Get the commands object (either mod.commands or mod itself)
      const commands = mod.commands || mod;

      if (typeof commands !== "object") {
        log(`[loader] skip ${file} (bad export)`);
        continue;
      }

      for (const [name, handler] of Object.entries(commands)) {
        // Ensure handler is a function. If it's an object with a run method, extract it.
        let finalHandler = handler;
        if (typeof handler !== "function") {
            if (typeof handler?.run === "function") finalHandler = handler.run.bind(handler);
            else if (typeof handler?.handler === "function") finalHandler = handler.handler;
            else continue; // Skip if it's not callable
        }

        const key = name.toLowerCase();
        if (registry.has(key)) {
          log(`[loader] duplicate command "${key}" in ${file}, keeping first`);
          continue;
        }
        registry.set(key, { handler: finalHandler, source: file });
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
