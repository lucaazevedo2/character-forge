/* Racial magic audit: level-gated grants, separate uses, source labels and class-list expansions.
   Uses existing catalog IDs and existing resourceState/save/rest flows. */
(() => {
'use strict';
const aliases={'highelf':'5et-elf-high-phb',drow:'5et-elf-drow-phb',forestgnome:'5et-gnome-forest-phb',tiefling:'5et-tiefling-phb','protector-aasimar':'5et-aasimar-protector-vgm','scourge-aasimar':'5et-aasimar-scourge-vgm','fallen-aasimar':'5et-aasimar-fallen-vgm',duergar:'5et-dwarf-duergar-mtf',fairy:'5et-fairy-wbtw',firbolg:'5et-firbolg-vgm','air-genasi':'5et-genasi-air-eepc','earth-genasi':'5et-genasi-earth-eepc','fire-genasi':'5et-genasi-fire-eepc','water-genasi':'5et-genasi-water-eepc',githyanki:'5et-gith-githyanki-mtf',githzerai:'5et-gith-githzerai-mtf',triton:'5et-triton-vgm','yuan-ti':'5et-yuan-ti-pureblood-vgm'};
const norm=x=>String(x||'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]/g,'');
const spellAliases={'tensersfloatingdisk':'floatingdisk','leomundstinyhut':'tinyhut','leomundssecretchest':'secretchest','mordenkainensfaithfulhound':'faithfulhound','mordenkainensprivatesanctum':'privatesanctum','bigbyshand':'arcanehand'};
let suppress=false,renderCache=null;
const without=fn=>{const old=suppress;suppress=true;try{return fn()}finally{suppress=old}};
function race(c){const root=c._root||c;return RACES.find(r=>r.id===(aliases[root.race]||root.race))}
function choices(c,r){const root=c._root||c;return root.catalogRaceChoices?.[root.race]||root.catalogRaceChoices?.[r.id]||{}}
function spell(ref){const n=norm(String(ref).split('|')[0].split('#')[0]),alias=spellAliases[n];return allSpells().find(s=>norm(s.name)===n||norm(s.name)===alias)}
function pack(c,r){const packs=r?.additionalSpells||[],n=Number(choices(c,r).spellPackage);return packs[Number.isInteger(n)&&n>=0&&n<packs.length?n:0]||{}}
function ability(c,r,p){const a=p.ability,pick=choices(c,r).spellAbility;return typeof a==='string'?a:a?.choose?.includes(pick)?pick:a?.choose?.[0]||'cha'}
function feature(r,s){return (r.traits||[]).find(t=>/racial magic|racial cantrip|cantrip|cast misty step/i.test(t[1])&&(norm(t[1]).includes(norm(s.name))||/cantrip/i.test(t[1])&&s.level===0))?.[0]||'Racial Magic'}
function allGrants(c,{locked=false}={}){
 const root=c._root||c,r=race(root);if(!r||suppress)return [];if(renderCache?.has(root)&&!locked)return renderCache.get(root);
 // Container races ask the player to pick a mutually exclusive version first.
 if(r.catalogContainer&&r.additionalSpells?.length&&/Kobold Legacy|Variant Feature \(Choose 1\)/.test(JSON.stringify(r.traits)))return [];
 const p=pack(root,r),out=[],pick=choices(root,r);let choiceIndex=0;
 function add(ref,state){const s=spell(ref);if(!s)return;const cast=String(ref).match(/#(\d+)$/);let g={key:`race-spell:${r.id}:${s.index}`,spell:s.index,race:r.id,name:feature(r,s)+' · '+r.name,ability:ability(root,r,p),unlock:state.unlock||1,atWill:s.level===0||!!state.atWill,reset:state.reset||'long',max:state.max||1,slotAllowed:!!(r.traits||[]).some(t=>/also use appropriate spell slots/i.test(t[1])),castLevel:cast?Number(cast[1]):s.level,components:'Normal spell components are required.',note:'',source:r.source};
  if(r.id.includes('yuan-ti')&&s.index==='animal-friendship'){g.atWill=true;g.note='Targets snakes only.';g.slotAllowed=false}
  if(r.id==='5et-gnome-deep-dmg'&&s.index==='nondetection')g.atWill=true;
  if(r.id==='5et-siren-psx')g.components='No material components required for this racial casting.';
  if(r.id==='5et-gnome-deep-dmg')g.components='No material components required for this innate casting.';
  if(r.id.includes('gith')){g.components='No spell components required for this racial casting.';if(s.index==='mage-hand')g.note='The hand is invisible.'}
  if(r.id==='5et-dwarf-mark-of-warding-erlw'||r.sourceCode==='EEPC'&&['levitate','pass-without-trace'].includes(s.index)||r.id==='5et-deep-gnome-mpmm'&&s.index==='nondetection')g.components='No material components required for this racial casting.';
  if(r.id==='5et-genasi-earth-mpmm'&&s.index==='blade-ward')g.note='You can also cast it as a bonus action a number of times equal to your proficiency bonus per long rest.';
  if(r.id.includes('duergar'))g.note=s.index==='enlarge-reduce'?'Racial casting: enlarge option, self only.':r.sourceCode==='MTF'?'Racial casting: self only.':'';
  if(r.id==='5et-dwarf-duergar-mtf')g.note+=' Cannot use this trait in direct sunlight.';
  if(r.id==='5et-elf-pallid-egw'&&s.index==='invisibility')g.note='Racial casting: self only.';
  if(r.id==='5et-human-mark-of-making-erlw'&&s.index==='magic-weapon')g.note='Racial casting lasts 1 hour and does not require concentration.';
  if(r.id==='5et-firbolg-mpmm'&&s.index==='disguise-self'||r.id==='5et-firbolg-vgm'&&s.index==='disguise-self')g.note='Firbolg Magic can make you appear up to 3 feet shorter.';
  if(r.id==='5et-tiefling-mammon-mtf'&&s.index==='floating-disk')g.reset='short';
  if(r.id==='5et-tiefling-mammon-mtf'&&s.index==='arcane-lock')g.components='No material components required for this racial casting.';
  if((locked||totalLevel(root)>=g.unlock)&&!out.some(x=>x.key===g.key))out.push(g);
 }
 function walk(o,state){if(typeof o==='string'){add(o,state);return}if(Array.isArray(o)){o.forEach(x=>walk(x,state));return}if(!o||typeof o!=='object')return;
  if(typeof o.choose==='string'){const rule=o.choose.match(/level=(\d+)/),klass=o.choose.match(/class=([^|]+)/i)?.[1]?.toLowerCase();if(rule?.[1]!=='0')return;for(let i=0;i<(o.count||1);i++){const key='cantrip'+choiceIndex++,chosen=pick[key]||(root.race==='highelf'&&key==='cantrip0'?root.racialCantrip:null),s=spellById(chosen);if(s?.level===0&&(!klass||classMember(s,klass)))add(s.name,state)}return}
  for(const [key,v]of Object.entries(o)){
   if(key==='daily'||key==='rest'){for(const [count,refs]of Object.entries(v))walk(refs,{...state,reset:key==='rest'?'short':'long',max:parseInt(count,10)||1})}
   else if(key==='will'||key==='atWill')walk(v,{...state,atWill:true});
   else if(/^\d+$/.test(key))walk(v,{...state,unlock:Number(key)});
   else if(key==='_')walk(v,state);
  }
 }
 walk(p.known,{unlock:1});walk(p.innate,{unlock:1});if(renderCache&&!locked)renderCache.set(root,out);return out;
}
function expanded(c,s){const r=race(c);if(!r||s.level<1||!without(()=>caster(c))||without(()=>caster(c))?.racialOnly||without(()=>caster(c))?.featOnly||s.level>maxSpellLevel(c))return false;const names=pack(c,r).expanded?.['s'+s.level]||[];return names.some(n=>spell(n)?.index===s.index)}
function grants(c){return c._root?[]:allGrants(c)}
// Replacing the old cantrip-only reader also prevents invalid optional choices leaking in.
catalogCantrips=c=>grants(c).filter(g=>spellById(g.spell)?.level===0).map(g=>g.spell);
const oldAutomatic=automaticSpells;
automaticSpells=function(c){const base=oldAutomatic(c).filter(g=>g.mode!=='racial');return [...base,...(suppress?[]:grants(c).map(g=>({spell:g.spell,mode:'racial',subclass:'race:'+g.race,unlock:g.unlock}))) ]};
const oldCaster=caster;
caster=function(c){const base=oldCaster(c);if(base&&!base.racialOnly)return base;const g=grants(c)[0];return g?{ability:g.ability,cantrips_known:0,spells_known:0,racialOnly:true}:null};
const oldAccess=spellAccess;
spellAccess=function(c,s){if(!s)return oldAccess(c,s);const base=without(()=>oldAccess(c,s)),gs=grants(c).filter(g=>g.spell===s.index);if(gs.length)return {...base,eligible:true,automatic:true,origin:'Racial granted · '+gs.map(g=>g.name).join(' · '),racialGrants:gs};if(expanded(c,s)&&!base.eligible)return {eligible:true,expanded:true,origin:'Racial expanded list · Spells of the Mark'};return base};
const oldResources=classResourceDefinitions;
classResourceDefinitions=function(c){const gs=grants(c),bonus=gs.find(g=>g.race==='5et-genasi-earth-mpmm'&&g.spell==='blade-ward');return [...oldResources(c),...gs.filter(g=>!g.atWill).map(g=>({...g,name:spellById(g.spell).name+' · '+g.name,className:'Race',note:'slot-free racial casting'})),...(bonus?[{...bonus,key:bonus.key+':bonus',name:'Blade Ward · bonus action',max:proficiency(c),atWill:false,className:'Race',reset:'long',note:'Merge with Stone'}]:[])]};
const available=(c,g)=>g.atWill||trackedResourceState(c._root||c,g).current>0;
const label=g=>g.atWill?'At will':`${g.max}/${g.reset==='short'?'short or long':'long'} rest`;
function consume(c,key){const gs=grants(c),bonus=classResourceDefinitions(c).find(g=>g.key===key&&g.key.endsWith(':bonus')),g=gs.find(g=>g.key===key)||bonus;if(!g||!available(c,g))return false;if(!g.atWill)trackedResourceState(c._root||c,g).current--;const s=spellById(g.spell);spellView(c).message=s.name+' cast via '+g.name+(key.endsWith(':bonus')?' as a bonus action':'')+(g.castLevel>s.level?' at level '+g.castLevel:'')+'.';if(s.attack_type)sheetRoll(s.name+' attack',proficiency(c)+mod(c,g.ability)+adjustment(c,'magicAttack'),{attack:true});return true}
const oldCastUI=spellWorkspaceCast;
spellWorkspaceCast=function(s,c,a,ready){if(!a.racialGrants)return oldCastUI(s,c,a,ready);const gs=a.racialGrants;let h=gs.map(g=>`<button type="button" class="spell-action" data-racial-cast="${esc(g.key)}" ${available(c,g)?'':'disabled'}>${available(c,g)?'Cast · '+label(g):'Used · '+label(g)}${g.castLevel>s.level?' · L'+g.castLevel:''}</button>`).join('');const bonus=classResourceDefinitions(c).find(g=>g.spell===s.index&&g.key.endsWith(':bonus'));if(bonus)h+=`<button type="button" class="spell-action" data-racial-cast="${esc(bonus.key)}" ${available(c,bonus)?'':'disabled'}>Bonus action · ${trackedResourceState(c._root||c,bonus).current}/${bonus.max}</button>`;
 const ordinary=without(()=>ordinarySpellReady(c,s));if(a.featGrants?.length)h+=without(()=>oldCastUI(s,c,{...a,racialGrants:null},ready));else if(s.level>0&&(gs.some(g=>g.slotAllowed)||ordinary))h+='<span class="spell-status">Spell slot:</span>'+oldCastUI(s,c,{...a,automatic:false,arcanum:false},true);return h};
const oldCast=castSpell;
castSpell=function(c,id,lv){const gs=grants(c).filter(g=>g.spell===id),s=spellById(id);if(!gs.length)return oldCast(c,id,lv);if(!s||s.level===0)return !!s;const ordinary=without(()=>ordinarySpellReady(c,s)),feat=featSpellGrants(c).some(g=>g.spell===id&&g.slotAllowed);if(!gs.some(g=>g.slotAllowed)&&!ordinary&&!feat)return false;const use=c.klass==='warlock'?maxSpellLevel(c):lv;if(!Number.isInteger(use)||use<s.level||!slotAvailable(c,use))return false;c.spent||={};c.spent[use]=(c.spent[use]||0)+1;spellView(c).message=s.name+' cast using a level '+use+' spell slot (normal components).';if(s.attack_type)sheetRoll(s.name+' attack',proficiency(c)+mod(c,gs[0].ability)+adjustment(c,'magicAttack'),{attack:true});return true};
const oldDetail=spellDetail;
spellDetail=function(s,c){return oldDetail(s,c)+grants(c).filter(g=>g.spell===s.index).map(g=>`<div class="racial-casting-note feat-casting-note"><b>Racial granted · ${esc(g.name)} · ${label(g)}</b><p>Unlocked at character level ${g.unlock}. ${g.atWill?'No spell slot required.':'This casting does not expend a spell slot.'}${g.castLevel>s.level?' Cast at level '+g.castLevel+'.':''}</p><p>Spellcasting ability: ${esc(ABL_NAMES[g.ability])}. ${esc(g.components)} ${esc(g.note)}</p><p>${g.slotAllowed?'You may also cast this spell using an appropriate spell slot; normal components apply.':'Knowing this racial spell alone does not grant spell-slot casting.'}</p>${sourceLink(g.source)}</div>`).join('')};
const oldHit=spellWorkspaceHit;
spellWorkspaceHit=function(s,c){const g=grants(c).find(g=>g.spell===s.index);if(!g)return oldHit(s,c);return s.attack_type?fmt(proficiency(c)+mod(c,g.ability)+adjustment(c,'magicAttack')):s.dc?.dc_type?.name?s.dc.dc_type.name+' '+(8+proficiency(c)+mod(c,g.ability)+adjustment(c,'spellDC')):'—'};
const oldRow=spellWorkspaceOwnedRow;
spellWorkspaceOwnedRow=function(s,c,ui){const gs=grants(c).filter(g=>g.spell===s.index);const html=oldRow(s,c,ui);return gs.length?html.replace('class="spell-entry"',gs.some(g=>available(c,g))?'class="spell-entry racial-spell-available"':'class="spell-entry racial-spell-expended"'):html};
function racialChoicesUI(el,c){if(c._root)return;const r=race(c);if(!r||!r.additionalSpells?.length||r.catalogContainer&&/Kobold Legacy|Variant Feature \(Choose 1\)/.test(JSON.stringify(r.traits)))return;const p=pack(c,r),pick=choices(c,r),rules=[];function walk(o){if(Array.isArray(o))o.forEach(walk);else if(o&&typeof o==='object'){if(typeof o.choose==='string'){if(/level=0/.test(o.choose))for(let i=0;i<(o.count||1);i++)rules.push({key:'cantrip'+rules.length,klass:o.choose.match(/class=([^|]+)/i)?.[1]?.toLowerCase()});return}Object.values(o).forEach(walk)}}walk(p.known);
const options=(key,title,rows,value)=>`<label>${esc(title)}<select data-racial-choice="${esc(key)}">${rows.map(([id,name])=>optionHTML(id,name,value)).join('')}</select></label>`;let html='';if(r.additionalSpells.length>1)html+=options('spellPackage','Racial magic option',r.additionalSpells.map((v,i)=>[String(i),Object.values(v.known||{}).flat(Infinity).filter(x=>typeof x==='string').map(x=>spell(x)?.name||x).join(', ')||'Option '+(i+1)]),String(pick.spellPackage||0));for(const rule of rules)html+=options(rule.key,(rule.klass?catalogTitle(rule.klass)+' ':'')+'racial cantrip',[['','Choose a cantrip…'],...allSpells().filter(s=>s.level===0&&!s.ua&&(!rule.klass||classMember(s,rule.klass))).sort((a,b)=>a.name.localeCompare(b.name)).map(s=>[s.index,s.name])],pick[rule.key]||(c.race==='highelf'?c.racialCantrip:''));if(p.ability?.choose)html+=options('spellAbility','Racial spellcasting ability',p.ability.choose.map(a=>[a,ABL_NAMES[a]]),ability(c,r,p));if(!html)return;const box=document.createElement('details');box.className='racial-magic-choices';box.innerHTML='<summary>Racial magic choices · '+esc(r.name)+'</summary><p>These racial choices do not spend class spell selections.</p><div class="extra-grid">'+html+'</div>';el.querySelector('.spellbook-title')?.after(box);box.querySelectorAll('[data-racial-choice]').forEach(n=>n.onchange=()=>{c.catalogRaceChoices||={};const saved=c.catalogRaceChoices[c.race]||={};saved[n.dataset.racialChoice]=n.value;if(c.race==='highelf'&&n.dataset.racialChoice==='cantrip0')c.racialCantrip=n.value;scheduleSave();renderSheet()});}
const oldRender=renderSpells;
renderSpells=function(el,c){const prior=renderCache;renderCache=new WeakMap();try{oldRender(el,c)}finally{renderCache=prior}racialChoicesUI(el,c);el.querySelectorAll('[data-racial-cast]').forEach(b=>b.onclick=()=>{if(consume(c,b.dataset.racialCast)){scheduleSave();renderSheet()}});};
const oldGroups=spellWorkspaceGroup;
spellWorkspaceGroup=function(ss,c,ui,picker){return oldGroups(ss,c,ui,picker).replaceAll('Feat granted · separate uses','Granted spells · separate uses')};
const oldCounts=spellCountText;
spellCountText=function(c){const n=grants(c).length,other=automaticSpells(c).filter(g=>g.mode!=='racial').length,base=oldCounts(c).replace(/<span><b>\d+<\/b> (?:subclass )?granted · no selection cost<\/span>/,other?`<span><b>${other}</b> subclass granted · no selection cost</span>`:'');return base+(n?`<span><b>${n}</b> racial granted · no selection cost</span>`:'')};
window.ForgeRacialMagic={cacheContext:()=>suppress?'ordinary':'racial',grants:allGrants,race,spell,consume,available,expanded,aliases,choices,pack};
})();
// A direct character route may render while the optional scripts are still loading.
if(!window.FORGE_VIEW_ONLY&&typeof draft!=='undefined'&&draft&&['sheet','wizard'].includes(view))render();
