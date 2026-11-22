"use strict";
const commands={
 setvar: async(s,m,a,c)=>{if(!c.isOwner)return c.reply("Owner only."); const [key,...value]=a; if(!key||!value.length)return c.reply(`Usage: ${c.prefix}setvar <name> <value>`); const db=c.db(); db.vars[key]=value.join(" "); c.saveDB(db); return c.reply(`✅ Saved ${key}.`);},
 getvar: async(s,m,a,c)=>{const key=a[0]; if(!key)return c.reply(`Usage: ${c.prefix}getvar <name>`); const value=c.db().vars[key]; return c.reply(value===undefined?"Variable not found.":String(value));},
 delvar: async(s,m,a,c)=>{if(!c.isOwner)return c.reply("Owner only."); const key=a[0]; if(!key)return c.reply(`Usage: ${c.prefix}delvar <name>`); const db=c.db(); delete db.vars[key]; c.saveDB(db); return c.reply(`✅ Deleted ${key}.`);},
 allvar: async(s,m,a,c)=>{if(!c.isOwner)return c.reply("Owner only."); const vars=c.db().vars||{}; const keys=Object.keys(vars); return c.reply(keys.length?keys.map(k=>`• ${k} = ${String(vars[k]).slice(0,120)}`).join("\n"):"No stored variables.");}
}; module.exports={commands};
