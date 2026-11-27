"use strict";

const { getDB, saveDB } = require("../lib/db");
function groupSettings(jid) {
  const db = getDB();
  db.groups[jid] ||= {};
  return { db, settings: db.groups[jid] };
}
function jidNumber(jid) { return String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, ""); }
function mentioned(message) {
  const m = message.message || {};
  const content = m.extendedTextMessage || m.imageMessage || m.videoMessage || m.documentMessage || {};
  return content.contextInfo?.mentionedJid || [];
}
function quotedJid(message) {
  const m = message.message || {};
  const content = m.extendedTextMessage || m.imageMessage || m.videoMessage || {};
  return content.contextInf0o?.participant || null;
}
function targets(message, args) {
  const ids = mentioned(message);
  if (ids.length) return [...new Set(ids)];
  const q = quotedJid(message);
  if (q) return [q];
  const nums = args.map(x => x.replace(/\D/g, "")).filter(x => x.length >= 7 && x.length <= 15);
  return [...new Set(nums.map(n => `${n}@s.whatsapp.net`))];
}
function isAdmin(p) { return Boolean(p && (p.admin === "admin" || p.admin === "superadmin" || p.isAdmin)); }
async function metadata(sock, ctx) {
  if (!ctx.isGroup) throw new Error("This command only works in groups.");
  return sock.groupMetadata(ctx.from);
}
async function permissions(sock, ctx, message, requireBotAdmin = true) {
  const meta = await metadata(sock, ctx);
  
  // 1. Get raw string numbers
  const senderNum = jidNumber(ctx.sender);
  const selfNum = jidNumber(sock.user?.id);
  
  // 2. Get the FULL JID of the bot (handles the @s.whatsapp.net part)
  const selfJid = sock.user?.id.split(":")[0] + "@s.whatsapp.net";

  // 3. Find the sender
  const senderP = meta.participants.find(p => 
    jidNumber(p.id) === senderNum || 
    jidNumber(p.jid) === senderNum || 
    jidNumber(p.lid) === senderNum
  );
  
  // 4. Find the bot (Checks ID, JID, LID, and number matching)
  const botP = meta.participants.find(p => 
    p.id === sock.user?.id ||
    p.id === selfJid ||
    p.jid === selfJid ||
    p.lid === selfJid ||
    jidNumber(p.id) === selfNum || 
    jidNumber(p.jid) === selfNum || 
    jidNumber(p.lid) === selfNum
  );
  
  // 5. Check permissions
  if (!ctx.isOwner && !isAdmin(senderP)) {
    throw new Error("Only group admins can use this command.");
  }
  
  if (requireBotAdmin && !isAdmin(botP)) {
    throw new Error("Please make the bot a group admin first.");
  }
  
  return meta;
}
async function reply(ctx, text) { return ctx.reply(text); }
async function toggle(ctx, key, label, value) {
  const { db, settings } = groupSettings(ctx.from);
  settings[key] = value === undefined ? !settings[key] : Boolean(value);
  saveDB(db);
  return reply(ctx, `${settings[key] ? "✅ Enabled" : "❌ Disabled"} *${label}*`);
}
async function participantAction(sock, message, ctx, args, action, verb) {
  await permissions(sock, ctx, message, true);
  const ids = targets(message, args);
  if (!ids.length) return reply(ctx, `Usage: ${ctx.prefix}${ctx.command} @user (or reply to their message)`);

  const ok = [];
  const failed = [];

  for (const id of ids) {
    try {
      const result = await sock.groupParticipantsUpdate(ctx.from, [id], action);
      const status = Number(result?.[0]?.status);
      if (!status || [200, 201].includes(status)) ok.push(id);
      else failed.push({ id, status });
    } catch (err) {
      failed.push({ id, error: err.message });
    }
  }

  const lines = [];
  if (ok.length) lines.push(`✅ ${verb}: ${ok.map(jidNumber).map(n => `@${n}`).join(", ")}`);
  if (failed.length) {
    lines.push(`⚠️ Failed (${failed.length}):`);
    for (const f of failed) {
      const reason = f.error ? f.error : `status ${f.status}`;
      lines.push(`  • ${jidNumber(f.id)} — ${reason}`);
    }
  }
  return reply(ctx, lines.join("\n"));
}
const commands = {
  // GROUP MEMBERSHIP / ADMINISTRATION
  add: async (s,m,a,c) => participantAction(s,m,c,a,"add","Add request sent"),
  promote: async (s,m,a,c) => participantAction(s,m,c,a,"promote","Promoted"),
  demote: async (s,m,a,c) => participantAction(s,m,c,a,"demote","Demoted"),
  kick: async (s,m,a,c) => participantAction(s,m,c,a,"remove","Removed"),
  promoteall: async (s, m, a, c) => {
  const meta = await permissions(s, c, m, true);
  const botNum = jidNumber(s.user?.id);
  const ids = meta.participants
    .filter(p => !isAdmin(p) && jidNumber(p.id || p.jid || p.lid) !== botNum)
    .map(p => p.id || p.jid || p.lid)
    .filter(Boolean);

  if (!ids.length) return reply(c, "No members need promotion.");

  let ok = 0, fail = 0;
  for (const id of ids) {
    try {
      const r = await s.groupParticipantsUpdate(c.from, [id], "promote");
      const status = Number(r?.[0]?.status);
      if (!status || [200, 201].includes(status)) ok++;
      else fail++;
    } catch {
      fail++;
    }
  }
  return reply(c, `✅ Promoted ${ok} member(s).` + (fail ? `\n⚠️ ${fail} failed.` : ""));
},
 demoteall: async (s, m, a, c) => {
  const meta = await permissions(s, c, m, true);
  const botNum = jidNumber(s.user?.id);
  const ids = meta.participants
    .filter(p => isAdmin(p) && jidNumber(p.id || p.jid || p.lid) !== botNum)
    .map(p => p.id || p.jid || p.lid)
    .filter(Boolean);

  if (!ids.length) return reply(c, "No admins available to demote.");

  let ok = 0, fail = 0;
  for (const id of ids) {
    try {
      const r = await s.groupParticipantsUpdate(c.from, [id], "demote");
      const status = Number(r?.[0]?.status);
      if (!status || [200, 201].includes(status)) ok++;
      else fail++;
    } catch {
      fail++;
    }
  }
  return reply(c, `✅ Demoted ${ok} admin(s).` + (fail ? `\n⚠️ ${fail} failed.` : ""));
},
  kickall: async (s, m, a, c) => {
  const meta = await permissions(s, c, m, true);

  const botNum = jidNumber(s.user?.id);
  const senderNum = jidNumber(c.sender);

  const ids = meta.participants
    .filter(p => {
      const n = jidNumber(p.id || p.jid || p.lid);
      if (n === botNum) return false;
      if (n === senderNum) return false;
      if (isAdmin(p)) return false;           // don't touch admins
      if (meta.owner && jidNumber(meta.owner) === n) return false;
      return true;
    })
    .map(p => p.id || p.jid || p.lid)
    .filter(Boolean);

  if (!ids.length) return reply(c, "No removable members found.");

  const ok = [];
  const failed = [];

  for (const id of ids) {
    try {
      const result = await s.groupParticipantsUpdate(c.from, [id], "remove");
      const status = Number(result?.[0]?.status);
      if (!status || [200, 201].includes(status)) ok.push(id);
      else failed.push({ id, status });
    } catch (err) {
      failed.push({ id, error: err.message });
    }
  }

  return reply(
    c,
    `✅ Removed ${ok.length} member(s).` +
      (failed.length ? `\n⚠️ ${failed.length} failed (protected or owner).` : "")
  );
},
  mute: async (s,m,a,c) => { await permissions(s,c,m,true); await s.groupSettingUpdate(c.from,"announcement"); return reply(c,"🔇 Only admins can now send messages."); },
  unmute: async (s,m,a,c) => { await permissions(s,c,m,true); await s.groupSettingUpdate(c.from,"not_announcement"); return reply(c,"🔊 All members can now send messages."); },
  onlyadmins: async (s,m,a,c) => { const mode=(a[0]||"").toLowerCase(); if(!mode)return reply(c,`Usage: ${c.prefix}onlyadmins on/off`); await permissions(s,c,m,true); await s.groupSettingUpdate(c.from,mode==="on"?"announcement":"not_announcement"); return reply(c,mode==="on"?"🔒 Admin-only messaging enabled.":"🔓 Member messaging enabled."); },
  gctime: async (s,m,a,c) => { await permissions(s,c,m,true); const mins=Number(a[0]); if(!Number.isInteger(mins)||mins<0)return reply(c,`Usage: ${c.prefix}gctime <minutes> (0 disables)`); const seconds=mins*60; if(typeof s.groupToggleEphemeral!=="function")return reply(c,"❌ This Baileys version does not expose groupToggleEphemeral."); await s.groupToggleEphemeral(c.from,seconds); return reply(c,mins?`⏳ Disappearing messages set to ${mins} minutes.`:"✅ Disappearing messages disabled."); },
  creategroup: async (s,m,a,c) => { if(!c.isOwner)return reply(c,"❌ Owner only."); const name=a.join(" ").trim(); if(!name)return reply(c,`Usage: ${c.prefix}creategroup Group Name`); const result=await s.groupCreate(name,[c.sender]); return reply(c,`✅ Group created: ${result.subject}\nID: ${result.id}`); },

  // BAN LIST / WARNINGS
  ban: async (s,m,a,c) => { await permissions(s,c,m,true); const ids=targets(m,a); if(!ids.length)return reply(c,`Usage: ${c.prefix}ban @user`); const {db,settings}=groupSettings(c.from); settings.banlist ||= []; for(const id of ids)if(!settings.banlist.includes(id))settings.banlist.push(id); saveDB(db); for(const id of ids)await s.groupParticipantsUpdate(c.from,[id],"remove"); return reply(c,`🚫 Added ${ids.length} member(s) to the group ban list and sent removal request.`); },
  unban: async (s,m,a,c) => { await permissions(s,c,m,false); const ids=targets(m,a); if(!ids.length)return reply(c,`Usage: ${c.prefix}unban @user`); const {db,settings}=groupSettings(c.from); settings.banlist=(settings.banlist||[]).filter(id=>!ids.includes(id)); saveDB(db); return reply(c,`✅ Removed ${ids.length} member(s) from the ban list.`); },
  clearbanlist: async (s,m,a,c) => { await permissions(s,c,m,false); const {db,settings}=groupSettings(c.from); settings.banlist=[]; saveDB(db); return reply(c,"✅ Group ban list cleared."); },
  warn: async (s,m,a,c) => { await permissions(s,c,m,true); const ids=targets(m,a); if(!ids.length)return reply(c,`Usage: ${c.prefix}warn @user [reason]`); const {db,settings}=groupSettings(c.from); settings.warnings ||= {}; const removed=[]; for(const id of ids){ settings.warnings[id]=(settings.warnings[id]||0)+1; if(settings.warnings[id]>=(settings.maxWarnings||3)){ await s.groupParticipantsUpdate(c.from,[id],"remove").catch(()=>{}); removed.push(id); delete settings.warnings[id]; } } saveDB(db); return reply(c,`⚠️ Warning recorded.\nReason: ${a.slice(1).join(" ")||"Not specified"}\n${ids.map(id=>`${jidNumber(id)}: ${settings.warnings[id]||0} warning(s)`).join("\n")}${removed.length?`\n🚫 Removed after reaching the warning limit: ${removed.map(jidNumber).join(", ")}`:""}`); },
  warnings: async (s,m,a,c) => { await permissions(s,c,m,false); const ids=targets(m,a); const {settings}=groupSettings(c.from); if(ids.length)return reply(c,`⚠️ ${jidNumber(ids[0])} has ${settings.warnings?.[ids[0]]||0} warning(s).`); const rows=Object.entries(settings.warnings||{}); return reply(c,rows.length?"⚠️ *Group warnings*\n"+rows.map(([id,n])=>`• ${jidNumber(id)}: ${n}`).join("\n"):"No warnings recorded."); },
  resetwarn: async (s,m,a,c) => { await permissions(s,c,m,false); const ids=targets(m,a); const {db,settings}=groupSettings(c.from); if(ids.length)for(const id of ids)delete settings.warnings?.[id]; else settings.warnings={}; saveDB(db); return reply(c,ids.length?"✅ Selected warning records reset.":"✅ All group warnings reset."); },
  setwarn: async (s,m,a,c) => { await permissions(s,c,m,false); const n=Number(a[0]); if(!Number.isInteger(n)||n<1||n>20)return reply(c,`Usage: ${c.prefix}setwarn <1-20>`); const {db,settings}=groupSettings(c.from); settings.maxWarnings=n; saveDB(db); return reply(c,`✅ Warning limit set to ${n}. Members reaching this limit will be removed when warned.`); },

  // MODERATION SWITCHES
  antilink: async (s,m,a,c) => { await permissions(s,c,m,true); return toggle(c,"antilink","Antilink"); },
  antileave: async (s,m,a,c) => { await permissions(s,c,m,false); return toggle(c,"antileave","Antileave"); },
  antibadword: async (s,m,a,c) => { await permissions(s,c,m,false); return toggle(c,"antibadword","Anti-badword"); },
  antisticker: async (s,m,a,c) => { await permissions(s,c,m,false); return toggle(c,"antisticker","Anti-sticker"); },
  antiimage: async (s,m,a,c) => { await permissions(s,c,m,false); return toggle(c,"antiimage","Anti-image"); },
  antivideo: async (s,m,a,c) => { await permissions(s,c,m,false); return toggle(c,"antivideo","Anti-video"); },
  antiaudio: async (s,m,a,c) => { await permissions(s,c,m,false); return toggle(c,"antiaudio","Anti-audio"); },
  antimention: async (s,m,a,c) => { await permissions(s,c,m,false); return toggle(c,"antimention","Anti-mention"); },
  antistatusmention: async (s,m,a,c) => { await permissions(s,c,m,false); return toggle(c,"antistatusmention","Anti-status-mention"); },
  antigrouplink: async (s,m,a,c) => { await permissions(s,c,m,false); return toggle(c,"antigrouplink","Anti-group-link"); },
  antidemote: async (s,m,a,c) => { await permissions(s,c,m,false); return toggle(c,"antidemote","Anti-demote"); },
  antipromote: async (s,m,a,c) => { await permissions(s,c,m,false); return toggle(c,"antipromote","Anti-promote"); },
  antigroupcall: async (s,m,a,c) => { await permissions(s,c,m,false); return toggle(c,"antigroupcall","Anti-group-call"); },
  antispam: async (s,m,a,c) => { await permissions(s,c,m,false); return toggle(c,"antispam","Anti-spam"); },
  addbadword: async (s,m,a,c) => { await permissions(s,c,m,false); const word=a.join(" ").trim().toLowerCase(); if(!word)return reply(c,`Usage: ${c.prefix}addbadword <word>`); const {db,settings}=groupSettings(c.from); settings.badwords ||= []; if(!settings.badwords.includes(word))settings.badwords.push(word); saveDB(db); return reply(c,`✅ Added bad word: ${word}`); },
  removebadword: async (s,m,a,c) => { await permissions(s,c,m,false); const word=a.join(" ").trim().toLowerCase(); if(!word)return reply(c,`Usage: ${c.prefix}removebadword <word>`); const {db,settings}=groupSettings(c.from); settings.badwords=(settings.badwords||[]).filter(x=>x!==word); saveDB(db); return reply(c,`✅ Removed bad word: ${word}`); },
  listbadword: async (s,m,a,c) => { await permissions(s,c,m,false); const {settings}=groupSettings(c.from); return reply(c,(settings.badwords||[]).length?"🚫 *Blocked words*\n"+settings.badwords.map(x=>`• ${x}`).join("\n"):"No blocked words configured."); },
  welcome: async (s,m,a,c) => { await permissions(s,c,m,false); return toggle(c,"welcome","Welcome messages"); },
  goodbye: async (s,m,a,c) => { await permissions(s,c,m,false); return toggle(c,"goodbye","Goodbye messages"); },
  joinapproval: async (s,m,a,c) => { await permissions(s,c,m,true); const {db,settings}=groupSettings(c.from); const mode=(a[0]||"").toLowerCase(); const enabled=mode==="on"?true:mode==="off"?false:!settings.joinapproval; if(typeof s.groupJoinApprovalMode!=="function")return reply(c,"❌ Join approval is not supported by this Baileys build."); await s.groupJoinApprovalMode(c.from,enabled?"on":"off"); settings.joinapproval=enabled; saveDB(db); return reply(c,`${enabled?"✅ Enabled":"❌ Disabled"} *Join approval*`); },

  // GROUP INFORMATION / TOOLS
  groupinfo: async (s,m,a,c) => { const meta=await metadata(s,c); const admins=meta.participants.filter(isAdmin).length; return reply(c,`👥 *${meta.subject}*\n\n🆔 ${meta.id}\n👤 Members: ${meta.participants.length}\n🛡️ Admins: ${admins}\n👑 Owner: ${meta.owner||"Not available"}\n📅 Created: ${meta.creation?new Date(meta.creation*1000).toLocaleString():"Not available"}\n📝 Description: ${meta.desc||"Not set"}`); },
  ginfo: async (s,m,a,c) => commands.groupinfo(s,m,a,c),
  grouplink: async (s,m,a,c) => { await permissions(s,c,m,true); const code=await s.groupInviteCode(c.from); return reply(c,`🔗 https://chat.whatsapp.com/${code}`); },
  invite: async (s,m,a,c) => commands.grouplink(s,m,a,c),
  link: async (s,m,a,c) => commands.grouplink(s,m,a,c),
  revoke: async (s,m,a,c) => { await permissions(s,c,m,true); await s.groupRevokeInvite(c.from); return reply(c,"✅ Group invite link revoked. A new link is now active."); },
  setdesc: async (s,m,a,c) => { await permissions(s,c,m,true); const desc=a.join(" ").trim(); if(!desc)return reply(c,`Usage: ${c.prefix}setdesc <new description>`); await s.groupUpdateDescription(c.from,desc); return reply(c,"✅ Group description updated."); },
  getdesc: async (s,m,a,c) => { const meta=await metadata(s,c); return reply(c,meta.desc||"This group has no description."); },
  tagadmin: async (s,m,a,c) => { const meta=await metadata(s,c); const ids=meta.participants.filter(isAdmin).map(p=>p.id); if(!ids.length)return reply(c,"No admins found."); return s.sendMessage(c.from,{text:`🛡️ *Group admins*\n${ids.map(id=>`@${jidNumber(id)}`).join(" ")}`,mentions:ids},{quoted:m}); },
  tagall: async (s,m,a,c) => { const meta=await metadata(s,c); const ids=meta.participants.map(p=>p.id); return s.sendMessage(c.from,{text:`📢 ${a.join(" ")||"Attention everyone!"}\n\n${ids.map(id=>`@${jidNumber(id)}`).join(" ")}`,mentions:ids},{quoted:m}); },
  hidetag: async (s,m,a,c) => { const meta=await metadata(s,c); const ids=meta.participants.map(p=>p.id); return s.sendMessage(c.from,{text:a.join(" ")||"📢 Attention everyone!",mentions:ids},{quoted:m}); },
  listadmins: async (s,m,a,c) => { const meta=await metadata(s,c); const ids=meta.participants.filter(isAdmin); return reply(c,ids.length?"🛡️ *Admins*\n"+ids.map(p=>`• ${jidNumber(p.id)}`).join("\n"):"No admins found."); },
  getparticipants: async (s,m,a,c) => { const meta=await metadata(s,c); return reply(c,`👥 *Participants (${meta.participants.length})*\n`+meta.participants.map((p,i)=>`${i+1}. ${jidNumber(p.id)}${isAdmin(p)?" (admin)":""}`).join("\n")); },
  getgpp: async (s,m,a,c) => { await metadata(s,c); try { const url=await s.profilePictureUrl(c.from,"image"); return s.sendMessage(c.from,{image:{url},caption:"🖼️ Group profile picture"},{quoted:m}); } catch { return reply(c,"This group has no public profile picture."); } },
  gpp: async (s,m,a,c) => commands.getgpp(s,m,a,c),
  getjid: async (s,m,a,c) => reply(c,`Group JID: ${c.from}`),
  approveall: async (s, m, a, c) => {
  await permissions(s, c, m, true);
  if (typeof s.groupRequestParticipantsList !== "function")
    return reply(c, "❌ Join-request approval is not supported by this Baileys build.");
  const req = await s.groupRequestParticipantsList(c.from);
  if (!req.length) return reply(c, "No pending join requests.");
  let ok = 0, fail = 0;
  for (const p of req) {
    const id = p.jid || p.id;
    try {
      await s.groupRequestParticipantsUpdate(c.from, [id], "approve");
      ok++;
    } catch {
      fail++;
    }
  }
  return reply(c, `✅ Approved ${ok} request(s).` + (fail ? `\n⚠️ ${fail} failed.` : ""));
},

  rejectall: async (s, m, a, c) => {
  await permissions(s, c, m, true);
  if (typeof s.groupRequestParticipantsList !== "function")
    return reply(c, "❌ Join-request management is not supported by this Baileys build.");
  const req = await s.groupRequestParticipantsList(c.from);
  if (!req.length) return reply(c, "No pending join requests.");
  let ok = 0, fail = 0;
  for (const p of req) {
    const id = p.jid || p.id;
    try {
      await s.groupRequestParticipantsUpdate(c.from, [id], "reject");
      ok++;
    } catch {
      fail++;
    }
  }
  return reply(c, `✅ Rejected ${ok} request(s).` + (fail ? `\n⚠️ ${fail} failed.` : ""));
},
  listonline: async (s,m,a,c) => { const meta=await metadata(s,c); const ids=meta.participants.filter(p=>p.presence?.lastKnownPresence==="available").map(p=>p.id); return reply(c,ids.length?"🟢 *Online participants*\n"+ids.map(jidNumber).join("\n"):"WhatsApp has not provided online presence for this group."); },
  listinactive: async (s,m,a,c) => { const meta=await metadata(s,c); return reply(c,`WhatsApp does not provide reliable last-active timestamps for all members. Group currently has ${meta.participants.length} participants.`); },
  fangtrace: async (s,m,a,c) => { const meta=await metadata(s,c); return reply(c,`🔎 Group trace\nName: ${meta.subject}\nJID: ${meta.id}\nMembers: ${meta.participants.length}\nAdmins: ${meta.participants.filter(isAdmin).length}`); },
  disp: async (s,m,a,c) => { const {settings}=groupSettings(c.from); return reply(c,"⚙️ *Group settings*\n"+Object.entries(settings).filter(([k,v])=>typeof v==="boolean").map(([k,v])=>`${v?"✅":"❌"} ${k}`).join("\n")+`\nBan list: ${(settings.banlist||[]).length}\nBad words: ${(settings.badwords||[]).length}`); },
  togstatus: async (s,m,a,c) => { await permissions(s,c,m,false); return toggle(c,"antistatusmention","Status mention protection"); },
};

module.exports = { commands };
