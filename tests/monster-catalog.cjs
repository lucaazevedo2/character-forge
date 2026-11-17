const A=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const rows=JSON.parse(fs.readFileSync('dist/monster-catalog.json','utf8')),legacy=require('../scripts/bestiary-legacy.json'),M=require('../dist/vtt/monsters-core');
A.equal(rows.length,5070);A.equal(new Set(rows.map(m=>m.index)).size,rows.length);
for(const m of legacy)A(rows.some(x=>x.index===m.index&&x.name===m.name),'Saved legacy reference '+m.index);
const imported=rows.filter(x=>x.source!=='SRD51');A.equal(imported.filter(x=>!x.variant_of).length,4683);A.equal(rows.filter(x=>x.token_image&&!x.variant_of).length,4550);
for(const m of imported)A(!JSON.stringify(m).includes('{@'),'No raw 5etools tags: '+m.name);
for(const m of rows.filter(x=>x.token_image)){A(/^assets\/monsters\/[a-f0-9]{24}\.webp$/.test(m.token_image));A(fs.existsSync('dist/'+m.token_image),m.name+' token exists');}
const aeromancer=rows.find(x=>x.name==='Aarakocra Aeromancer'&&x.source==='XMM');A(aeromancer);A.equal(aeromancer.xp,1100);A(aeromancer.actions.some(x=>x.name==='Spellcasting'&&x.desc.includes('Gust of Wind')));
const arrigal=rows.find(x=>x.name==='Arrigal'&&x.source==='CoS');A(arrigal.hit_points>0);A(arrigal.actions.length>0);A(arrigal.special_abilities.length>0);
const lich=rows.find(x=>x.index==='lich');A(lich.lair_actions.length);A(lich.regional_effects||lich.lair_actions[0].desc.length>100);A.equal(lich.xp,33000);
A(rows.find(x=>x.name==='Frog'&&x.source==='MM').xp===0,'Explicit zero XP must stay zero');
A.equal(rows.filter(x=>x.variant_of).length,368);A(rows.some(x=>x.name==='Battle Familiar (Brute)'));A(rows.some(x=>x.mythic_actions?.length));A(rows.some(x=>x.regional_effects?.length));
const ctx={window:{},URL,File,document:{baseURI:'https://qa.invalid/'},fetch:async()=>({ok:true,json:async()=>rows}),prompt:()=>null};vm.createContext(ctx);vm.runInContext(fs.readFileSync('dist/monsters.js','utf8'),ctx);
(async()=>{const api=ctx.window.ForgeMonsters;A.equal(api.rows.length,0);await api.load();A.equal(api.rows.length,5070);
for(const m of rows){const original=JSON.stringify(m),html=api.block(m);A(html.includes('Hit Points'));for(const key of ['special_abilities','actions','bonus_actions','reactions','legendary_actions','mythic_actions','lair_actions'])for(const a of m[key]||[])A(html.includes(a.name.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll("'",'&#39;').replaceAll('<','&lt;').replaceAll('>','&gt;')),m.name+' '+a.name);
if(m.is_incomplete)A.throws(()=>M.fromCatalog(m),/No combat statistics/);else{const s=M.fromCatalog(m);A.equal(s.hp,m.hit_points??1);A.equal(s.name,m.name);A.equal(s.mythicActions.length,m.mythic_actions?.length||0);A.equal(s.lairActions.length,m.lair_actions?.length||0);A.equal(s.sourceId,m.index);}
A.equal(JSON.stringify(m),original);}
const hostile={...rows[0],token_image:'javascript:alert(1)',name:'<img src=x onerror=alert(1)>'};A(!api.block(hostile).includes('<img'));A(api.block(hostile).includes('&lt;img'));
const variable=rows.find(m=>m.hit_points===null&&!m.is_incomplete);A.equal(api.prepare(variable),null);ctx.prompt=()=> '75';A.equal(api.prepare(variable).hit_points,75);A.equal(variable.hit_points,null);
console.log('PASS all 4,683 uploaded entries plus 368 named variants; 334 preserved IDs; 4,550 token mappings; inherited/legendary/mythic rules, explicit 0 XP, variable HP, escaped text and complete campaign stat-block conversion.');})().catch(e=>{console.error(e);process.exitCode=1});
