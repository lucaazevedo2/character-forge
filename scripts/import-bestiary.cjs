/* Offline import: node scripts/import-bestiary.cjs <received-directory>
 * Reads the original uploaded exports; resolves copies with upstream 5etools code.
 * Run scripts/import-bestiary-tokens.py first. No runtime dependency or build step.
 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
require('./bestiary-vendor/parser.js');require('./bestiary-vendor/utils.js');require('./bestiary-vendor/render.js');
const input=path.resolve(process.argv[2]||''),out=path.resolve(__dirname,'../dist');
const read=f=>JSON.parse(fs.readFileSync(path.join(input,f),'utf8'));
const raw=read('monsters.json').monster,groups=read('legendarygroups.json').legendaryGroup;
const templates=JSON.parse(fs.readFileSync(path.join(__dirname,'bestiary-vendor/template.json')));
globalThis.DataLoader={getAllFromCacheAll:prop=>templates[prop]||[]};
DataUtil.loadJSON=async u=>{if(u.endsWith('template.json'))return templates;throw Error('Unexpected remote dependency: '+u)};
const unknownTags=new Set();
function plain(v){if(v==null)return '';const str=String(v);try{return Renderer.stripTags(str)}catch(e){unknownTags.add(str);throw e;}}
function text(v){
 if(v==null)return '';if(typeof v!=='object')return plain(v);if(Array.isArray(v))return v.map(text).filter(Boolean).join('\n');
 if(v.type==='table')return [text(v.caption),text(v.colLabels),...(v.rows||[]).map(r=>(r.row||r).map(text).join(' | ')),text(v.footnotes)].filter(Boolean).join('\n');
 if(v.type==='list')return (v.items||[]).map(x=>'• '+text(x)).join('\n');
 if(v.type==='cell')return text(v.entry??v.roll?.exact??(v.roll?`${v.roll.min}–${v.roll.max}`:''));
 if(v.type==='image')return text(v.title||v.credit);
 if(v.entries||v.entry||v.items)return [text(v.name),text(v.entries??v.entry??v.items)].filter(Boolean).join('. ');
 if(v.special)return text(v.special);
 // Retain unusual structured entries rather than silently dropping content.
 return Object.entries(v).filter(([k])=>!['type','style','source','page','id','data'].includes(k)).map(([k,x])=>k+': '+text(x)).join('; ');
}
function feat(v,fallback='Ability'){
 const raw=JSON.stringify(v.entries??v.entry??v),hit=raw.match(/\{@hit ([+-]?\d+)}/),dc=raw.match(/\{@dc (\d+)}/),damage=[...raw.matchAll(/\{@damage ([^}|]+)(?:[^}]*)}\s+([a-z]+) damage/g)].filter(x=>/^(?:\d{1,3}d\d{1,4}|\d{1,5})(?:\s*[+-]\s*(?:\d{1,3}d\d{1,4}|\d{1,5}))*$/.test(x[1])).map(x=>({damage_dice:x[1].replace(/\s/g,''),damage_type:{name:x[2]}}));
 return {name:plain(v.name||fallback),desc:text(v.entries??v.entry??v),...(hit?{attack_bonus:Number(hit[1])}:{}),...(dc?{dc:{dc_type:{name:''},dc_value:Number(dc[1]),success_type:''}}:{}),...(damage.length?{damage}: {})};
}
function spell(s){
 const lines=[text(s.headerEntries)];
 for(const [k,label]of Object.entries({constant:'Constant',will:'At will',ritual:'Rituals'}))if(s[k])lines.push(label+': '+text(s[k]));
 for(const k of ['daily','rest','weekly','monthly','yearly','recharge','charges','legendary'])for(const [n,x]of Object.entries(s[k]||{}))lines.push(`${n.replace('e','')} / ${k}${n.endsWith('e')?' each':''}: ${text(x)}`);
 for(const [n,x]of Object.entries(s.spells||{}))lines.push(`${n==='0'?'Cantrips':`Level ${n}`}${x.slots!=null?` (${x.slots} slots)`:''}${x.lower!=null?` (levels ${x.lower}–${n})`:''}: ${text(x.spells)}`);
 lines.push(text(s.footerEntries));return {name:plain(s.name||'Spellcasting'),desc:lines.filter(Boolean).join('\n')};
}
function defenses(v,key){return (v||[]).map(x=>typeof x==='string'?plain(x):[text(x.preNote),text(x[key]||x.special),text(x.note)].filter(Boolean).join(' '))}
function convert(m,id){
 const type=Parser.monTypeToFullObj(m.type),sz=(Array.isArray(m.size)?m.size:[m.size||'M']).map(x=>Parser.sizeAbvToFull(x)),cr=typeof m.cr==='object'?m.cr.cr:m.cr;
 const rating=cr==null||cr==='Unknown'||cr==='—'?null:String(cr).includes('/')?Number(cr.split('/')[0])/Number(cr.split('/')[1]):Number(cr);
 const hp=m.hp?.average??(typeof m.hp?.special==='string'&&/^\d+$/.test(m.hp.special)?Number(m.hp.special):null);
 const ac=(m.ac||[]).map(x=>typeof x==='number'?{value:x}:{value:x.ac??null,type:[text(x.from),text(x.condition),text(x.special)].filter(Boolean).join(' ')});
 const row={index:id,name:m.name,source:m.source,source_name:Parser.sourceJsonToFull(m.source),source_page:m.page??null,size:sz[0],size_text:sz.join(' or '),type:typeof m.type==='string'?m.type.toLowerCase():typeof m.type.type==='string'?m.type.type.toLowerCase():type.asText,type_text:type.asText,subtype:(m.type.tags||[]).map(t=>typeof t==='string'?t:[t.prefix,t.tag].filter(Boolean).join(' ')).join(', '),alignment:(m.alignmentPrefix||'')+(m.alignment?.length?Parser.alignmentListToFull(m.alignment):'not specified'),armor_class:ac,hit_points:hp,hit_points_text:m.hp?.special?plain(m.hp.special):null,hit_points_roll:m.hp?.formula||'',speed:{},proficiencies:[],damage_vulnerabilities:defenses(m.vulnerable,'vulnerable'),damage_resistances:defenses(m.resist,'resist'),damage_immunities:defenses(m.immune,'immune'),condition_immunities:defenses(m.conditionImmune,'conditionImmune'),senses:{},languages:text(m.languages).replaceAll('\n',', '),challenge_rating:Number.isFinite(rating)?rating:null,challenge_text:cr||'Unknown',xp:cr==null?null:typeof m.cr==='object'&&m.cr.xp!=null?m.cr.xp:Parser.crToXpNumber(m.cr),proficiency_bonus:m.pbNote?null:Parser.crToPb(m.cr),special_abilities:(m.trait||[]).map(x=>feat(x)),actions:(m.action||[]).map(x=>feat(x)),bonus_actions:(m.bonus||[]).map(x=>feat(x)),reactions:(m.reaction||[]).map(x=>feat(x)),legendary_actions:(m.legendary||[]).map(x=>feat(x)),mythic_actions:(m.mythic||[]).map(x=>feat(x)),legendary_budget:m.legendaryActions??3,desc:text(m.entries),stat_notes:[],is_incomplete:!m.hp};
 for(const [k,v]of Object.entries(m.speed||{})){if(k==='canHover'){row.speed.hover=!!v;continue}row.speed[k]=typeof v==='number'?v+' ft.':v.number!=null?`${v.number} ft. ${text(v.condition)}`:text(v);}
 for(const [short,long]of Object.entries({str:'strength',dex:'dexterity',con:'constitution',int:'intelligence',wis:'wisdom',cha:'charisma'})){row[long]=typeof m[short]==='number'?m[short]:null;if(m[short]&&typeof m[short]==='object')row.stat_notes.push(short.toUpperCase()+': '+text(m[short]));}
 for(const [k,v]of Object.entries(m.save||{}))row.proficiencies.push({proficiency:{name:'Saving Throw: '+k.toUpperCase()},value:Number(v)});
 for(const [k,v]of Object.entries(m.skill||{})){if(Number.isFinite(Number(v)))row.proficiencies.push({proficiency:{name:'Skill: '+k},value:Number(v)});else row.stat_notes.push('Skill '+k+': '+text(v));}
 if(m.senses?.length)row.senses.special=text(m.senses).replaceAll('\n',', ');if(Number.isFinite(m.passive))row.senses.passive_perception=m.passive;else if(m.passive)row.stat_notes.push('Passive Perception: '+plain(m.passive));
 for(const s of m.spellcasting||[]){const key={action:'actions',bonus:'bonus_actions',reaction:'reactions',legendary:'legendary_actions',mythic:'mythic_actions'}[s.displayAs]||'special_abilities';row[key].push(spell(s));}
 for(const [k,heading]of Object.entries({actionHeader:'Actions',bonusHeader:'Bonus actions',reactionHeader:'Reactions',legendaryHeader:'Legendary actions',mythicHeader:'Mythic actions',variant:'Variants',footer:'Notes',gear:'Equipment',acSpecial:'Armor Class',pbNote:'Proficiency bonus'}))if(m[k])row.stat_notes.push(heading+': '+text(m[k]));
 if(m.size?.length>1)row.stat_notes.push('Size: '+row.size_text);
 if(typeof m.cr==='object')for(const [k,v]of Object.entries(m.cr))if(k!=='cr'&&k!=='xp')row.stat_notes.push('Challenge '+k+': '+text(v));
 if(m.initiative){row.stat_notes.push('Initiative: '+text(m.initiative));if(Number.isFinite(m.initiative.initiative))row.initiative_bonus=m.initiative.initiative;}
 if(m.legendaryGroup){const g=groups.find(g=>g.name===m.legendaryGroup.name&&g.source===m.legendaryGroup.source);if(g){row.lair_actions=g.lairActions?.length?[{name:'Lair actions',desc:text(g.lairActions)}]:[];row.regional_effects=text(g.regionalEffects);if(g.mythicEncounter)row.stat_notes.push('Mythic encounter: '+text(g.mythicEncounter));}else{row.stat_notes.push('Referenced legendary group unavailable in uploaded data: '+m.legendaryGroup.name+' ('+m.legendaryGroup.source+')');missingGroups.push({name:m.name,source:m.source,group:m.legendaryGroup});}}
 if(row.is_incomplete)row.stat_notes.push('This uploaded entry has no combat statistics. Configure it as a custom creature before use in combat.');
 if(row.hit_points==null&&row.hit_points_text)row.stat_notes.push('Variable HP — configure the combat HP for your encounter: '+row.hit_points_text);
 return row;
}
const missingGroups=[];
(async()=>{
 for(const prop of ['monsterTemplate','legendaryGroupTemplate'])for(const t of templates[prop])await DataUtil.generic._pMergeCopy({_mergeCache:{},_MERGE_REQUIRES_PRESERVE:{}},'bestiary.html',templates[prop],t,{isErrorOnMissing:true});
 raw.forEach(m=>m.__prop='monster');groups.forEach(g=>g.__prop='legendaryGroup');for(const m of raw)await DataUtil.monster.pMergeCopy(raw,m,{isErrorOnMissing:true});for(const g of groups)await DataUtil.legendaryGroup.pMergeCopy(groups,g,{isErrorOnMissing:true});
 const variants=raw.flatMap(m=>DataUtil.monster.getVersions(m));
 const all=[...raw,...variants];
 const legacy=JSON.parse(fs.readFileSync(path.join(__dirname,'bestiary-legacy.json'))),used=new Set(),tokens=read('token-map.json');
 const rows=all.map(m=>{const old=m.source==='MM'?legacy.find(x=>x.name.toLowerCase()===m.name.toLowerCase()):null;const id=old?.index||'5et-'+m.source.toLowerCase()+'-'+crypto.createHash('sha256').update(m.name).digest('hex').slice(0,16);if(old)used.add(old.index);const r=convert(m,id);const image=tokens[m.source+'|'+m.name]||(m._versionBase_isVersion?tokens[m._versionBase_source+'|'+m._versionBase_name]:null);if(image)r.token_image=image;if(m._versionBase_isVersion)r.variant_of=m._versionBase_name;return r;});
 rows.push(...legacy.filter(x=>!used.has(x.index)).map(x=>({...x,source:'SRD51',source_name:'System Reference Document 5.1'})));rows.sort((a,b)=>a.name.localeCompare(b.name)||a.source.localeCompare(b.source));
 if(new Set(rows.map(x=>x.index)).size!==rows.length)throw Error('Duplicate catalog IDs');if(unknownTags.size)throw Error('Unrendered tags');
 fs.writeFileSync(path.join(out,'monster-catalog.json'),JSON.stringify(rows));
 const report={uploadedMonsters:raw.length,expandedVariants:variants.length,existingIdsPreserved:legacy.length,existingPrintsMatched:used.size,legacyOnly:legacy.length-used.size,totalCatalog:rows.length,tokenMappings:Object.keys(tokens).length,inheritedRecordsResolved:raw.filter(m=>m._isCopy).length,incomplete:rows.filter(m=>m.is_incomplete).map(m=>({name:m.name,source:m.source})),variableHP:rows.filter(m=>m.hit_points==null&&!m.is_incomplete).length,missingLegendaryGroups:missingGroups};
 fs.writeFileSync(path.join(out,'monster-import-report.json'),JSON.stringify(report,null,2));console.log(report);
})().catch(e=>{console.error(e.stack);process.exitCode=1});
