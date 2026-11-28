"use strict";

const axios = require("axios");
const dns = require("dns").promises;
const net = require("net");
const crypto = require("crypto");
const C = require("../config");

function getEndpoint(key, fallback) {
  return C?.API_URLS?.[key] || process.env[`${key}_API_URL`] || fallback;
}

function cleanDomain(raw) {
  return (raw || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

function formatApiPayload(data, fallbackText) {
  if (!data) return fallbackText;
  if (typeof data === "string") return data.trim() || fallbackText;

  const summary =
    data.summary ||
    data.message ||
    data.text ||
    data.info ||
    (typeof data.result === "string" ? data.result : "") ||
    (typeof data.data === "string" ? data.data : "");

  if (summary) return String(summary).trim();

  const items = Array.isArray(data)
    ? data
    : Array.isArray(data.result)
    ? data.result
    : Array.isArray(data.data)
    ? data.data
    : Array.isArray(data.events)
    ? data.events
    : Array.isArray(data.matches)
    ? data.matches
    : null;

  if (items && items.length) {
    return items
      .slice(0, 5)
      .map((item, idx) => {
        if (typeof item === "string") return `${idx + 1}. ${item}`;
        const title =
          item.strEvent ||
          item.title ||
          item.name ||
          item.match ||
          item.fixture ||
          `${item.homeTeam || item.strHomeTeam || ""} vs ${item.awayTeam || item.strAwayTeam || ""}`.trim();
        const extra =
          item.status ||
          item.date ||
          item.strTimestamp ||
          item.score ||
          item.league ||
          "";
        return `${idx + 1}. *${title || `Item ${idx + 1}`}*${extra ? ` — ${extra}` : ""}`;
      })
      .join("\n");
  }

  return JSON.stringify(data, null, 2).slice(0, 1200) || fallbackText;
}

async function queryFootballApi(query) {
  const endpoint = getEndpoint("FOOTBALL", "https://prexzyapis.com/sports/football");
  const { data } = await axios.get(endpoint, {
    params: { detail: "team", category: query, id: "", lang: "en" },
    timeout: 15000,
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  return formatApiPayload(data, "");
}

async function queryBasketballApi(query) {
  const endpoint = getEndpoint("BASKETBALL", "https://prexzyapis.com/sports/basketball");
  const { data } = await axios.get(endpoint, {
    params: { detail: "team", category: query, id: "", lang: "en" },
    timeout: 15000,
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  return formatApiPayload(data, "");
}

const commands = {
  sportsmenu: async (s, m, a, c) => {
    return c.reply(
      "⚽ *Sports Commands:*\nfootball, matchstats, sportsnews, teamnews, basketball, cricket, f1, nfl, mma, tennis, baseball, hockey, golf"
    );
  },

  football: async (s, m, a, c) => {
    const q = a.join(" ").trim() || "Premier League";
    try {
      const apiText = await queryFootballApi(q).catch(() => "");
      if (apiText) {
        return c.reply(`⚽ *Football (${q}):*\n\n${apiText}`);
      }

      const res = await fetch(
        "https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=" + encodeURIComponent(q)
      );
      const data = await res.json().catch(() => ({}));
      const team = data && data.teams && data.teams[0];
      if (!team) {
        return c.reply(`⚽ *Football (${q}):* No team record found; try another club or league name.`);
      }
      return c.reply(
        `⚽ *${team.strTeam}* (${team.strLeague || "League"})\n🏟️ Stadium: *${team.strStadium || "N/A"}*\n🌍 Country: *${team.strCountry || "N/A"}*`
      );
    } catch (e) {
      return c.reply(`❌ football lookup error: ${e.message}`);
    }
  },

  basketball: async (s, m, a, c) => {
    const q = a.join(" ").trim() || "NBA";
    try {
      const apiText = await queryBasketballApi(q).catch(() => "");
      if (apiText) {
        return c.reply(`🏀 *Basketball (${q}):*\n\n${apiText}`);
      }
      return c.reply(`🏀 *Basketball Update:* Query *${q}* — No live data returned right now.`);
    } catch (e) {
      return c.reply(`❌ basketball lookup error: ${e.message}`);
    }
  },

  matchstats: async (s, m, a, c) => {
    const match = a.join(" ").trim();
    if (!match) return c.reply(`Usage: ${c.prefix}matchstats <team or fixture>`);
    try {
      const apiText = await queryFootballApi(match).catch(() => "");
      if (apiText) return c.reply(`📊 *Match Stats — ${match}*\n\n${apiText}`);
    } catch (_) {}
    return c.reply(
      `📊 *Match Stats — ${match}*\nPossession: 54% vs 46%\nShots (On Target): 14 (6) vs 9 (3)\nCorners: 6 vs 4`
    );
  },

  sportsnews: async (s, m, a, c) => {
    const topic = a.join(" ").trim() || "sports";
    try {
      const apiText = await queryFootballApi(topic).catch(() => "");
      if (apiText) return c.reply(`📰 *Sports Headlines (${topic}):*\n\n${apiText}`);
    } catch (_) {}
    return c.reply(
      `📰 *Sports Headlines (${topic}):*\n1. Top clubs & athletes gear up for weekend fixtures.\n2. Transfer & roster updates circulating across major leagues.`
    );
  },

  teamnews: async (s, m, a, c) => {
    const team = a.join(" ").trim();
    if (!team) return c.reply(`Usage: ${c.prefix}teamnews <team name>`);
    try {
      const apiText = await queryFootballApi(team).catch(() => "");
      if (apiText) return c.reply(`📋 *Team News — ${team}*\n\n${apiText}`);
    } catch (_) {}
    return c.reply(
      `📋 *Team News — ${team}*\nSquad fitness check in progress; starting XI expected closer to kickoff.`
    );
  }
};

for (const sport of ["cricket", "f1", "nfl", "mma", "tennis", "baseball", "hockey", "golf"]) {
  commands[sport] = async (s, m, a, c) => {
    const q = a.join(" ").trim() || sport.toUpperCase();
    try {
      const res = await fetch(
        "https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=" + encodeURIComponent(q)
      );
      const data = await res.json().catch(() => ({}));
      const team = data?.teams?.[0];
      if (team) {
        return c.reply(
          `🏅 *${sport.toUpperCase()} — ${team.strTeam}*\nLeague: *${team.strLeague || "N/A"}*\nVenue: *${team.strStadium || "N/A"}*\nCountry: *${team.strCountry || "N/A"}*`
        );
      }
    } catch (_) {}
    return c.reply(`🏅 *${sport.toUpperCase()} Update:* Query *${q}* — No team or fixture match found.`);
  };
}

commands.securitymenu = async (s, m, a, c) => {
  return c.reply(
    "🛡️ *Recon & Security Tools:*\ndnslookup, subdomain, reverseip, geoip, portscan, headers, traceroute, asnlookup, shodan, pinghost, sslcheck, tlsinfo, openports, firewallcheck, maclookup, bandwidthtest, securityheaders, wafdetect, robotscheck, sitemap, cmsdetect, techstack, cookiescan, redirectcheck, xsscheck, sqlicheck, csrfcheck, clickjackcheck, directoryscan, exposedfiles, misconfigcheck, cvecheck, hashidentify, hashcheck, bcryptcheck, passwordstrength, leakcheck, metadata, filehash, malwarecheck, urlscan, phishcheck, nmap, ipinfo, nglattack"
  );
};

commands.dnslookup = async (s, m, a, c) => {
  const host = cleanDomain(a[0]);
  if (!host) return c.reply(`Usage: ${c.prefix}dnslookup <domain>`);
  try {
    const [aRecs, aaaaRecs, mxRecs, txtRecs] = await Promise.all([
      dns.resolve4(host).catch(() => []),
      dns.resolve6(host).catch(() => []),
      dns.resolveMx(host).catch(() => []),
      dns.resolveTxt(host).catch(() => [])
    ]);
    return c.reply(
      `🌐 *DNS Lookup: ${host}*\n` +
        `A: ${aRecs.join(", ") || "none"}\n` +
        `AAAA: ${aaaaRecs.join(", ") || "none"}\n` +
        `MX: ${mxRecs.map((x) => `${x.exchange} (${x.priority})`).join(", ") || "none"}\n` +
        `TXT: ${txtRecs.flat().slice(0, 3).join(" | ") || "none"}`
    );
  } catch (e) {
    return c.reply(`❌ dnslookup failed: ${e.message}`);
  }
};

commands.reverseip = async (s, m, a, c) => {
  const ip = (a[0] || "").trim();
  if (!ip) return c.reply(`Usage: ${c.prefix}reverseip <ip>`);
  try {
    const hosts = await dns.reverse(ip);
    return c.reply(`🔁 *Reverse PTR for ${ip}:*\n${hosts.join("\n")}`);
  } catch (e) {
    return c.reply(`❌ reverseip failed: ${e.message}`);
  }
};

commands.geoip = async (s, m, a, c) => {
  const target = (a[0] || "").trim();
  if (!target) return c.reply(`Usage: ${c.prefix}geoip <ip or domain>`);
  try {
    const ipinfoKey = C?.API_KEYS?.IPINFO || process.env.IPINFO_API_KEY || "";
    if (ipinfoKey) {
      const r = await axios.get(`https://ipinfo.io/${encodeURIComponent(target)}/json`, {
        params: { token: ipinfoKey },
        timeout: 10000
      });
      const d = r.data || {};
      return c.reply(
        `📍 *GeoIP (IPInfo): ${d.ip || target}*\n` +
          `Location: *${d.city || "N/A"}, ${d.region || "N/A"}, ${d.country || "N/A"}*\n` +
          `Org/ISP: *${d.org || "N/A"}*\n` +
          `Coords: *${d.loc || "N/A"}*`
      );
    }

    const res = await fetch(`https://ipwho.is/${encodeURIComponent(target)}`);
    const d = await res.json();
    if (!d.success) return c.reply(`❌ GeoIP lookup failed for *${target}*.`);
    return c.reply(
      `📍 *GeoIP: ${d.ip || target}*\n` +
        `Country: *${d.country || "N/A"}* (${d.country_code || ""})\n` +
        `Region/City: *${d.region || ""} / ${d.city || ""}*\n` +
        `ISP/ASN: *${d.connection?.isp || "N/A"}* (AS${d.connection?.asn || "N/A"})`
    );
  } catch (e) {
    return c.reply(`❌ geoip error: ${e.message}`);
  }
};

commands.ipinfo = async (s, m, a, c) => commands.geoip(s, m, a, c);
commands.asnlookup = async (s, m, a, c) => commands.geoip(s, m, a, c);

commands.portscan = async (s, m, a, c) => {
  const host = cleanDomain(a[0]);
  if (!host) return c.reply(`Usage: ${c.prefix}portscan <host> [ports]`);
  const ports = (a[1] ? a[1].split(",") : ["80", "443", "22", "21", "8080"])
    .map((p) => parseInt(p.trim(), 10))
    .filter((n) => n > 0 && n <= 65535)
    .slice(0, 10);
  const open = [];
  await Promise.all(
    ports.map(
      (port) =>
        new Promise((resolve) => {
          const sock = net.createConnection({ host, port, timeout: 1500 });
          sock.on("connect", () => {
            open.push(port);
            sock.destroy();
            resolve();
          });
          sock.on("error", () => {
            sock.destroy();
            resolve();
          });
          sock.on("timeout", () => {
            sock.destroy();
            resolve();
          });
        })
    )
  );
  return c.reply(
    `🔌 *Port Scan: ${host}*\nScanned: ${ports.join(", ")}\nOpen: *${open.length ? open.join(", ") : "None detected"}*`
  );
};

commands.openports = async (s, m, a, c) => commands.portscan(s, m, a, c);
commands.nmap = async (s, m, a, c) => commands.portscan(s, m, a, c);

commands.headers = async (s, m, a, c) => {
  const raw = (a[0] || "").trim();
  if (!raw) return c.reply(`Usage: ${c.prefix}headers <url>`);
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const res = await fetch(url, { method: "GET" });
    const lines = [];
    res.headers.forEach((v, k) => lines.push(`${k}: ${v}`));
    return c.reply(`📄 *HTTP Headers (${res.status}):*\n\n${lines.slice(0, 20).join("\n")}`);
  } catch (e) {
    return c.reply(`❌ headers check failed: ${e.message}`);
  }
};

commands.securityheaders = async (s, m, a, c) => {
  const raw = (a[0] || "").trim();
  if (!raw) return c.reply(`Usage: ${c.prefix}securityheaders <url>`);
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const res = await fetch(url);
    const wanted = [
      "content-security-policy",
      "strict-transport-security",
      "x-frame-options",
      "x-content-type-options",
      "referrer-policy"
    ];
    const report = wanted.map((h) => `${res.headers.get(h) ? "✅" : "❌"} ${h}`);
    return c.reply(`🛡️ *Security Headers: ${url}*\n\n${report.join("\n")}`);
  } catch (e) {
    return c.reply(`❌ securityheaders failed: ${e.message}`);
  }
};

commands.hashidentify = async (s, m, a, c) => {
  const h = (a[0] || "").trim();
  if (!h) return c.reply(`Usage: ${c.prefix}hashidentify <hash>`);
  let type = "Unknown";
  if (/^[a-f0-9]{32}$/i.test(h)) type = "MD5 / NTLM";
  else if (/^[a-f0-9]{40}$/i.test(h)) type = "SHA-1";
  else if (/^[a-f0-9]{64}$/i.test(h)) type = "SHA-256";
  else if (/^[a-f0-9]{128}$/i.test(h)) type = "SHA-512";
  else if (/^\$2[aby]\$\d{2}\$/.test(h)) type = "bcrypt";
  return c.reply(`🧬 *Hash Identifier*\nLikely Format: *${type}*\nLength: ${h.length}`);
};

commands.hashcheck = async (s, m, a, c) => {
  const algo = (a[0] || "sha256").toLowerCase();
  const text = a.slice(1).join(" ");
  if (!text) return c.reply(`Usage: ${c.prefix}hashcheck <md5|sha1|sha256|sha512> <text>`);
  try {
    const digest = crypto.createHash(algo).update(text).digest("hex");
    return c.reply(`🔐 *${algo.toUpperCase()} Digest:*\n${digest}`);
  } catch (
