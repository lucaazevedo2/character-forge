/* Equipment v1. Legacy inventory names remain a compatibility projection. */
const EQUIPMENT_FORMAT_VERSION=1;
const EQ_ABILITIES=['str','dex','con','int','wis','cha'];
const eqNumber=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const eqModifier=v=>Math.floor((v-10)/2);
function equipmentID(){if(typeof crypto.randomUUID==='function')return crypto.randomUUID();return 'eq-'+Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('')}
function equipmentItem(name='',catalog={},id=equipmentID()){
 const shield=catalog.armor_category==='Shield',armor=!!catalog.armor_class&&!shield;
 const properties=(catalog.properties||[]).map(p=>p.name||p.index||p).join(', ');
 return {id,name,catalogId:catalog.index||null,catalogName:catalog.name||null,quantity:1,weight:Math.max(0,eqNumber(catalog.weight)),carried:true,equipped:false,type:shield?'shield':armor?'armor':catalog.damage?'weapon':'gear',properties,notes:'',requiresAttunement:!!catalog.attunement,attuned:false,
 armor:{baseAC:catalog.armor_class?.base||10,category:String(catalog.armor_category||'light').toLowerCase(),dexCap:catalog.armor_class?.max_bonus??2,strength:catalog.str_minimum||0,stealthDisadvantage:!!catalog.stealth_disadvantage},shieldBonus:2,
 attack:{enabled:!!catalog.damage,ability:/finesse/i.test(properties)?'finesse':catalog.weapon_range==='Ranged'?'dex':'str',proficient:true,damageDice:catalog.damage?.damage_dice||'1d6',damageType:catalog.damage?.damage_type?.name||'Bludgeoning',extraDamage:'',extraDamageType:'',range:catalog.range?.normal?catalog.range.normal+(catalog.range.long?'/'+catalog.range.long:'')+' ft.':'5 ft.',kind:catalog.weapon_range==='Ranged'?'ranged':'melee',magicBonus:0,versatile:false},
 resource:{enabled:false,current:0,max:0,recharge:'manual',consumeQuantity:/potion|ammunition/i.test(name)},modifiers:[]};
}
function migrateEquipment(character,lookup=()=>null,idFactory=()=>equipmentID()){
 const c=JSON.parse(JSON.stringify(character));if(c.equipmentFormatVersion>EQUIPMENT_FORMAT_VERSION)throw Error('This equipment save needs a newer Character Forge version.');
 if(c.equipmentFormatVersion===EQUIPMENT_FORMAT_VERSION&&Array.isArray(c.equipmentItems))return c;
 c.equipmentFormatVersion=EQUIPMENT_FORMAT_VERSION;c.equipmentItems=[];c.inventoryItemIds=[];
 (c.inventory||[]).forEach((entry,i)=>{const name=typeof entry==='string'?entry:entry.name||'Unnamed item',it=equipmentItem(name,lookup(name)||{},idFactory());
 if(entry&&typeof entry==='object')Object.assign(it,entry,{id:entry.id||it.id});
 it.equipped=(c.equipped||[]).includes(i)||!!it.equipped;
 const cat=lookup(name)||{},override=c.weaponAttackOverrides?.[cat.index||name];
 if(override){it.attack={...it.attack,...{ability:override.attackAbility||it.attack.ability,damageAbility:override.damageAbility||null,proficient:override.proficient??true,damageDice:override.damageDice||it.attack.damageDice,damageType:override.damageType||it.attack.damageType,extraDamage:override.damage2Enabled?override.damage2Dice:'',extraDamageType:override.damage2Type||'',range:override.range||it.attack.range,magicBonus:override.magicBonus||0,attackBonus:override.attackBonus||0,damageBonus:override.damageBonus||0}};it.legacyAttackOverride=JSON.parse(JSON.stringify(override));}
 c.equipmentItems.push(it);c.inventoryItemIds.push(it.id);
 });c.equipmentInventorySnapshot=[...(c.inventory||[])];return c;
}
function equipmentAttunementLimit(character={}){
 const c=character._root||character,level=(c.klass==='artificer'?eqNumber(c.level):0)+(c.multiclass||[]).filter(k=>k.klass==='artificer').reduce((n,k)=>n+eqNumber(k.level),0);
 return level>=18?6:level>=14?5:level>=10?4:3;
}
function activeEquipment(items,limit=3){const permitted=new Set(items.filter(i=>i.requiresAttunement&&i.attuned).slice(0,limit).map(i=>i.id));return items.filter(i=>i.quantity>0&&i.equipped&&(!i.requiresAttunement||i.attuned&&permitted.has(i.id)))}
function equipmentLinkedAttacks(items){return items.filter(i=>i.quantity>0&&i.attack?.enabled).map(i=>({id:'inventory:'+i.id,itemId:i.id,name:i.name,...i.attack}))}
/* Pure: neither base stats nor inventory is mutated. Exact/minimum set the base;
   additive modifiers follow. Stable item order breaks competing exact ties. */
function computeStats(base,items=[]){
 const attunementLimit=base.attunementLimit??3,active=activeEquipment(items,attunementLimit),entries=active.flatMap(i=>(i.modifiers||[]).filter(m=>Number.isFinite(Number(m.value))&&(!m.condition||i.conditions?.[m.condition])&&(!m.requiresUnarmored||!active.some(x=>x.type==='armor'))&&(!m.requiresNoShield||!active.some(x=>x.type==='shield'))).map(m=>({...m,value:m.abilityValue?eqModifier(base.abilities?.[m.abilityValue]||10):m.scale==='level'?Number(m.value)*(base.level||1):m.scale==='plusLevel'?Number(m.value)+(base.level||1):Number(m.value),source:i.name,itemId:i.id})));
 const values={},breakdown={};let currentAttack=null;
 function apply(key,value,initial=[{source:'Base / class / manual',value}],target=key){
  let n=eqNumber(value);const sources=[...initial];
  const matching=entries.filter(m=>m.target===target&&(!m.weaponNames||m.weaponNames.some(n=>String(currentAttack?.name||'').toLowerCase().includes(n)))&&(!m.unarmedOnly||/unarmed|claw|bite|natural/i.test(currentAttack?.name||'')));
  for(const m of matching.filter(m=>m.operation==='exact')){const d=m.value-n;n=m.value;sources.push({...m,value:d,configuredValue:m.value})}
  for(const m of matching.filter(m=>m.operation==='minimum')){const d=Math.max(n,m.value)-n;n+=d;if(d)sources.push({...m,value:d,configuredValue:m.value})}
  for(const m of matching.filter(m=>m.operation==='add')){const d=m.cap?Math.max(0,Math.min(m.value,m.cap-n)):m.value;n+=d;sources.push({...m,value:d})}
  for(const m of matching.filter(m=>m.operation==='multiply')){const d=n*(m.value-1);n+=d;sources.push({...m,value:d})} values[key]=n;breakdown[key]=sources;return n;
 }
 apply('pb',base.pb||0);const pbDifference=values.pb-(base.pb||0),pbDelta=key=>Math.floor(values.pb*(base.proficiencyFactors?.[key]||0))-Math.floor((base.pb||0)*(base.proficiencyFactors?.[key]||0));
 const abilities=base.abilities||{};for(const a of EQ_ABILITIES)apply(a,abilities[a]??10);
 const delta=a=>eqModifier(values[a])-eqModifier(abilities[a]??10);
 const directEntries=[...entries],shared=(target)=>directEntries.filter(m=>m.target===target);
 const dependent=(a,multiplier=1)=>delta(a)?[{source:a.toUpperCase()+' modifier ('+(breakdown[a]||[]).filter(s=>s.itemId).map(s=>s.source).join(', ')+')',value:delta(a)*multiplier,itemId:(breakdown[a]||[]).find(s=>s.itemId)?.itemId}]:[];
 // Shared save/check operations enter each final target's pipeline.
 for(const a of EQ_ABILITIES){
  const saveKey='save_'+a,checkKey='check_'+a;
  for(const [key,all] of [[saveKey,'saveAll'],[checkKey,'checkAll']]){
   const injected=shared(all).map(m=>({...m,target:key}));entries.push(...injected);
   const raw=base.values?.[key]??eqModifier(abilities[a]??10);apply(key,raw+delta(a)+pbDelta(key),[{source:'Base / class / manual',value:raw},...dependent(a)]);
  }
 }
 for(const [skill,a] of Object.entries(base.skillAbilities||{})){
  const key='skill_'+skill;entries.push(...shared('checkAll').map(m=>({...m,target:key})),...shared('check_'+a).map(m=>({...m,target:key})));
  apply(key,(base.values?.[key]||0)+delta(a)+pbDelta(key),[{source:'Base / class / manual',value:base.values?.[key]||0},...dependent(a)]);
 }
 let armor=active.find(i=>i.type==='armor'),shield=active.find(i=>i.type==='shield');const dex=eqModifier(values.dex);
 let ac,sources;
 if(base.manualAC){ac=base.ac;sources=[{source:'Manual AC',value:ac}];}
 else if(armor){const category=armor.armor?.category||'light',d=category==='heavy'?0:category==='medium'?Math.min(dex,eqNumber(armor.armor?.dexCap,2)):dex;
  ac=eqNumber(armor.armor?.baseAC,10)+d;sources=[{source:armor.name+' armor',itemId:armor.id,value:eqNumber(armor.armor?.baseAC,10)},{source:'DEX'+((breakdown.dex||[]).some(s=>s.itemId)?' ('+breakdown.dex.filter(s=>s.itemId).map(s=>s.source).join(', ')+')':''),value:d,itemId:(breakdown.dex||[]).find(s=>s.itemId)?.itemId}];
 }else{
  const candidates=[...(base.unarmored||[{value:10,abilities:['dex'],source:'Unarmored'}])];
  for(const item of active)if(item.unarmoredAC)candidates.push({value:item.unarmoredAC,abilities:['dex'],source:item.name});
  const chosen=candidates.map(x=>({...x,total:x.value+(x.abilities||[]).reduce((n,a)=>n+eqModifier(values[a]),0)})).sort((a,b)=>b.total-a.total).find(x=>!x.noShield||!shield)||{total:10+dex,source:'Unarmored',abilities:['dex'],value:10};
  ac=chosen.total;sources=[{source:chosen.source,value:chosen.value},...(chosen.abilities||[]).map(a=>({source:a.toUpperCase(),value:eqModifier(values[a])}))];
 }
 if(shield){ac+=eqNumber(shield.shieldBonus,2);sources.push({source:shield.name+' shield',itemId:shield.id,value:eqNumber(shield.shieldBonus,2)})}
 if(base.acExtra){ac+=base.acExtra;sources.push({source:'Class / race / manual bonuses',value:base.acExtra})}
 if(armor&&base.defense&&!base.legacyArmor){ac++;sources.push({source:'Defense fighting style',value:1})}
 apply('ac',ac,sources);
 apply('saveAll',base.values?.saveAll||0);
 for(const key of ['meleeAttack','rangedAttack','meleeDamage','rangedDamage','speed','initiative','passive','maxHP','spellDC','magicAttack','flyingSpeed','swimmingSpeed','climbingSpeed','burrowingSpeed']){
  let v=(key==='pb'?base.pb:base.values?.[key])||0,derived=[];for(const m of entries)if(m.target===key&&m.scale==='walking')m.value=values.speed||base.values?.speed||0;
  if(key==='initiative'){v+=delta('dex');derived=dependent('dex');}
  if(key==='maxHP'){const difference=base.hpDice?base.hpDice.reduce((n,die)=>n+Math.max(1,die+eqModifier(values.con))-Math.max(1,die+eqModifier(abilities.con??10)),0):delta('con')*(base.level||1);v+=difference;derived=difference?[{source:'CON modifier ('+(breakdown.con||[]).filter(s=>s.itemId).map(s=>s.source).join(', ')+')',value:difference,itemId:(breakdown.con||[]).find(s=>s.itemId)?.itemId}]:[];}
  if(key==='passive'){const difference=values.skill_perception-(base.values?.skill_perception||0);v+=difference;if(difference)derived=[{source:'Perception changes ('+(breakdown.skill_perception||[]).filter(s=>s.itemId).map(s=>s.source).join(', ')+')',value:difference,itemId:(breakdown.skill_perception||[]).find(s=>s.itemId)?.itemId}];}
  if(['spellDC','magicAttack'].includes(key)&&base.castingAbility){v+=delta(base.castingAbility)+pbDifference;derived=dependent(base.castingAbility);}
  apply(key,v,[{source:'Base / class / manual',value:base.values?.[key]||0},...derived]);
 }
 const attacks=equipmentLinkedAttacks(items),attackStats={};
 for(const a of [...attacks,...(base.customAttacks||[])]){
  currentAttack=a;const item=items.find(i=>i.id===a.itemId),enabled=!item||active.some(i=>i.id===item.id),property=item?.properties||'';
  let ability=a.ability||a.attackAbility||'str';if(ability==='finesse'||item&&/finesse/i.test(property))ability=values.dex>values.str?'dex':'str';
  const abilityBonus=ability==='none'?0:ability==='spell'?eqModifier(values[base.castingAbility||'int']):eqModifier(values[ability]??10);
  const kind=a.kind||a.inventoryKind||(/ranged/i.test(a.range||'')?'ranged':'melee'),bonus=base.weaponBonuses?.[a.itemId]||{};
  const magic=enabled?eqNumber(a.magicBonus)+(item?.magicAttackEffects||[]).filter(e=>item.conditions?.[e.condition]).reduce((n,e)=>n+e.bonus,0):0,attack=abilityBonus+(a.proficient?(values.pb??base.pb??0):0)+eqNumber(a.attackBonus)+magic+(enabled?bonus.attack||0:0);
  const da=a.damageAbility||ability,damageAbility=da==='none'?0:da==='spell'?eqModifier(values[base.castingAbility||'int']):eqModifier(values[da]??10);
  const damage=damageAbility+eqNumber(a.damageBonus)+magic+(enabled?bonus.damage||0:0);
  const abilitySources=(breakdown[ability]||[]).filter(s=>s.itemId),sources=[{source:'Ability modifier'+(abilitySources.length?' ('+abilitySources.map(s=>s.source).join(', ')+')':''),itemId:abilitySources[0]?.itemId,value:abilityBonus},{source:'Proficiency',value:a.proficient?(values.pb??base.pb??0):0},{source:item?item.name+' / weapon bonuses':'Weapon / manual bonuses',itemId:item?.id,value:attack-abilityBonus-(a.proficient?(values.pb??base.pb??0):0)}];
  attackStats[a.id]={attack:apply('attack:'+a.id,attack,sources,kind==='ranged'?'rangedAttack':'meleeAttack'),damage:apply('damage:'+a.id,damage,[{source:'Ability / weapon / manual'+(abilitySources.length?' ('+abilitySources.map(s=>s.source).join(', ')+')':''),itemId:item?.id||abilitySources[0]?.itemId,value:damage}],kind==='ranged'?'rangedDamage':'meleeDamage')};
 }
 const weight=Math.round(items.filter(i=>i.carried).reduce((n,i)=>n+Math.max(0,eqNumber(i.quantity))*Math.max(0,eqNumber(i.weight)),0)*1e6)/1e6;
 values.carriedWeight=weight;values.capacity=values.str*15;
 const warnings=[];if(items.filter(i=>i.attuned&&i.requiresAttunement).length>attunementLimit)warnings.push('More than '+attunementLimit+' items are attuned. Unattune items to stay within your '+attunementLimit+'-item limit.');
 if(active.filter(i=>i.type==='armor').length>1)warnings.push('More than one body armor is equipped; only the first applies.');
 if(active.filter(i=>i.type==='shield').length>1)warnings.push('More than one shield is equipped; only the first applies.');
 if(armor&&values.str<eqNumber(armor.armor?.strength))warnings.push('Armor Strength requirement not met.');
 if(armor?.armor?.stealthDisadvantage)warnings.push('Equipped armor imposes disadvantage on Stealth.');
 return {values,breakdown,warnings,attacks,attackStats,attunementLimit,activeIds:active.map(i=>i.id)};
}
function equipmentStatTooltip(result,key){return key+' '+result.values[key]+' = '+(result.breakdown[key]||[]).filter(s=>s.value).map(s=>s.value+' from '+s.source).join(' + ')}
if(typeof module!=='undefined')module.exports={equipmentItem,migrateEquipment,computeStats,equipmentLinkedAttacks,activeEquipment,equipmentAttunementLimit};
/* Consolidate only interchangeable plain gear. Never merge weapons, attuned /
   equipped objects, resources, modifiers, or objects referenced by infusions. */
function consolidateEquipment(character){
 const c=character,protectedIds=new Set();
 for(const state of Object.values(c.classChoiceData||{}))for(const a of Object.values(state.assignments||{})){const id=a.equipmentItemId||c.inventoryItemIds?.[a.index];if(id)protectedIds.add(id)}
 const groups=new Map(),items=[],aliases=new Map();let changed=false;
 for(const item of c.equipmentItems||[]){
  const eligible=item.type==='gear'&&!item.equipped&&!item.attuned&&!item.requiresAttunement&&!item.attack?.enabled&&!item.resource?.enabled&&!(item.modifiers||[]).length&&!protectedIds.has(item.id);
  const {id,quantity,...identity}=item,key=eligible?JSON.stringify(identity):null,existing=eligible?groups.get(key):null;
  if(existing){existing.quantity+=Math.max(0,eqNumber(quantity));aliases.set(id,existing.id);changed=true;}
  else{items.push(item);if(eligible)groups.set(key,item)}
 }
 if(changed){c.equipmentItems=items;c.inventoryItemIds=(c.inventoryItemIds||[]).map(id=>aliases.get(id)||id)}
 c.equipmentStackVersion=1;return changed;
}
if(typeof module!=='undefined')module.exports.consolidateEquipment=consolidateEquipment;
