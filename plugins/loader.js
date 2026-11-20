const fs = require("fs");
const path = require("path");

function loadPlugins(log = console.log) {
  const registry = new Map();
  const dir = __dirname;

  if (!fs.existsSync(dir)) {
    log("[loader] Plugins directory not found.");
    return registry;
  }

  const files = fs.readdirSync(dir)
    .filter(file =>
      file.endsWith(".js") &&
      file !== "loader.js"
    )
    .sort();

  for (const file of files) {
    try {
      const filePath = path.join(dir, file);
      const mod = require(filePath);

      const commands = mod.commands || mod;

      if (
        !commands ||
        typeof commands !== "object" ||
        Array.isArray(commands)
      ) {
        log(`[loader] Skipped ${file}: invalid exports.`);
        continue;
      }

      let loaded = 0;

      for (const [name, handler] of Object.entries(commands)) {
        if (typeof handler !== "function") continue;

        const key = name.toLowerCase().trim();

        if (!key) continue;

        if (registry.has(key)) {
          log(
            `[loader] Duplicate command "${key}" in ${file}.`
          );
          continue;
        }

        registry.set(key, {
          handler,
          source: file,
        });

        loaded++;
      }

      log(`[loader] Loaded ${file}: ${loaded} commands.`);

    } catch (error) {
      log(
        `[loader] FAILED ${file}: ${error.stack || error.message}`
      );
    }
  }

  log(`[loader] Total commands registered: ${registry.size}`);

  return registry;
}

module.exports = { loadPlugins };
