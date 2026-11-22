"use strict";
const commands = {
  budget: async (s,m,a,c) => {
    const d=c.db().budgets[c.sender] || {income:[],expenses:[]};
    const income=d.income.reduce((n,x)=>n+x.amount,0), expenses=d.expenses.reduce((n,x)=>n+x.amount,0);
    return c.reply(`💰 *YOUR BUDGET SUMMARY*\nIncome: ${income.toFixed(2)}\nExpenses: ${expenses.toFixed(2)}\nBalance: ${(income-expenses).toFixed(2)}\n\nUse ${c.prefix}income <amount> <note> or ${c.prefix}expense <amount> <note>.`);
  },
  income: async (s,m,a,c) => record(c,a,"income"),
  expense: async (s,m,a,c) => record(c,a,"expenses"),
  delbudget: async (s,m,a,c) => { if(!c.isOwner) return c.reply("Owner only."); const db=c.db(); if(a[0]==="all") delete db.budgets[c.sender]; else { const i=Number(a[0]); const d=db.budgets[c.sender]; if(!d||!Number.isInteger(i)||i<1||i>(d.income.length+d.expenses.length)) return c.reply(`Usage: ${c.prefix}delbudget <entry-number|all>`); const all=[...d.income.map(x=>({...x,type:"income"})),...d.expenses.map(x=>({...x,type:"expenses"}))]; const item=all[i-1]; d[item.type].splice(d[item.type].findIndex(x=>x.id===item.id),1); } c.saveDB(db); return c.reply("✅ Budget record updated."); },
  summary: async (s,m,a,c) => commands.budget(s,m,a,c)
};
function record(c,a,type){ const amount=Number(a[0]); if(!Number.isFinite(amount)||amount<=0) return c.reply(`Usage: ${c.prefix}${type==="income"?"income":"expense"} <positive-amount> <note>`); const db=c.db(); db.budgets[c.sender] ||= {income:[],expenses:[]}; const item={id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,amount,note:a.slice(1).join(" ").slice(0,160),at:new Date().toISOString()}; db.budgets[c.sender][type].push(item); c.saveDB(db); return c.reply(`✅ Recorded ${type==="income"?"income":"expense"}: ${amount.toFixed(2)}${item.note?` — ${item.note}`:""}`); }
module.exports={commands};
