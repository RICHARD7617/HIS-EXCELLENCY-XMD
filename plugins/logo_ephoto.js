const commands = {};

const LOGOS = ["goldlogo","silverlogo","platinumlogo","chromelogo","diamondlogo","bronzelogo","steellogo","copperlogo","titaniumlogo","firelogo","icelogo","iceglowlogo","lightninglogo","aqualogo","rainbowlogo","sunlogo","moonlogo","dragonlogo","phoenixlogo","wizardlogo","crystallogo","darkmagiclogo","shadowlogo","smokelogo","bloodlogo","neonlogo","glowlogo","gradientlogo","matrixlogo"];
const EPHOTO = ["colorfulglow","advancedglow","neononline","blueneon","neontext","neonlight","greenneon","greenlightneon","blueneonlogo","galaxyneon","retroneon","multicolorneon","hackerneon","devilwings","glowtext","blackpinkneon","neonglitch","colorfulneonlight","wooden3d","cubic3d","wooden3donline","water3d","cuongthi3d","text3d","graffiti3d","silver3d","style3d","metal3d","ruby3d","birthday3d","metallogo3d","pig3d","avengers3d","hologram3d","gradient3d","stone3d","space3d","sand3d","gradienttext3d","lightbulb3d","snow3d","papercut3d","underwater3d","shinymetallic3d","gradientstyle3d","beach3d","crack3d","wood3d","americanflag3d","christmas3d","nigeriaflag3d","christmassnow3d","goldenchristmas3d","decorativemetal3d","colorfulpaint3d","glossysilver3d","balloon3d","comic3d","ephotomenu"];

for (const name of LOGOS) {
  commands[name] = async (s, m, a, c) => {
    const text = a.join(" ").trim();
    if (!text) return c.reply("Usage: " + c.prefix + name + " <brand or text>");
    const styleLabel = name.replace(/logo$/i, "").toUpperCase();
    const prompt = styleLabel + " emblem logo for " + text + ", sharp vector studio badge, high contrast";
    const url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) + "?nologo=true";
    return s.sendMessage(c.from, { image: { url }, caption: "✨ *" + styleLabel + " Logo:* *" + text + "*" }, { quoted: m });
  };
}

for (const fx of EPHOTO) {
  commands[fx] = async (s, m, a, c) => {
    if (fx === "ephotomenu") {
      return c.reply("🎨 *Ephoto & 3D Text Effects:*\n" + EPHOTO.filter(x => x !== "ephotomenu").join(", "));
    }
    const text = a.join(" ").trim();
    if (!text) return c.reply("Usage: " + c.prefix + fx + " <text>");
    const prompt = fx + " text effect displaying " + text + ", bold typography, studio lighting";
    const url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) + "?nologo=true";
    return s.sendMessage(c.from, { image: { url }, caption: "🖌️ *" + fx.toUpperCase() + ":* *" + text + "*" }, { quoted: m });
  };
}

module.exports = { commands };
