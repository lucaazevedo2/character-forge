/* Equipment integration: existing class/feat/manual calculations remain authoritative. */
let equipmentGuard=false,equipmentCache=new WeakMap();
let equipmentLookupContext=null;
const equipmentCatalogOriginal=itemData;
itemData=function(name){
 const known=equipmentCatalogOriginal(name);if(known)return known;
 const root=equipmentLookupContext||(typeof draft!=='undefined'?draft:null),item=root?.equipmentItems?.find(i=>i.name===name);if(!item)return known;
 const base=item.catalogName?equipmentCatalogOriginal(item.catalogName)||{}:{},weapon=item.type==='weapon',armor=item.type==='armor',shield=item.type==='shield';
 const properties=['finesse','heavy','two-handed','versatile','reach','thrown','ammunition','light'].filter(p=>item.properties.toLowerCase().includes(p)).map(p=>({index:p,name:p}));
 return {...base,index:base.index||'equipment-'+item.id,name:item.name,weight:item.weight,attunement:item.requiresAttunement,equipment_category:{index:weapon?'weapon':armor||shield?'armor':'adventuring-gear',name:item.type},weapon_category:weapon?(base.weapon_category||'Custom'):undefined,weapon_range:item.attack.kind==='ranged'?'Ranged':'Melee',properties,damage:weapon?{damage_dice:item.attack.damageDice,damage_type:{name:item.attack.damageType}}:undefined,armor_category:shield?'Shield':armor?item.armor.category[0].toUpperCase()+item.armor.category.slice(1):undefined,armor_class:armor?{base:item.armor.baseAC,dex_bonus:item.armor.category!=='heavy',max_bonus:item.armor.category==='medium'?item.armor.dexCap:undefined}:shield?{base:item.shieldBonus,dex_bonus:false}:undefined};
};

const equipmentOriginal={proficiency,score:finalScore,ac:armorClass,hp:maxHP,initiative,skill:skillBonus,save:saveBonus,adjustment,attack:customAttackBonus,damage:customAttackDamageBonus,render:renderSheet,rest:resetTrackedResources};
function equipmentInvalidate(){equipmentCache=new WeakMap()}
function equipmentProject(c){
 const prior=c.inventoryItemIds||[],inventory=[],ids=[],equipped=[],activeIDs=new Set(activeEquipment(c.equipmentItems||[],equipmentAttunementLimit(c)).map(i=>i.id));
 for(const i of c.equipmentItems||[]){const count=Math.max(0,Math.floor(eqNumber(i.quantity)));for(let n=0;n<count;n++){if(n===0&&activeIDs.has(i.id))equipped.push(inventory.length);inventory.push(i.name);ids.push(i.id)}}
 for(const state of Object.values(c.classChoiceData||{}))for(const a of Object.values(state.assignments||{})){const id=prior[a.index]||a.equipmentItemId,next=ids.indexOf(id);if(id)a.equipmentItemId=id;if(id&&next>=0){a.index=next;a.name=inventory[next]}else if(id)a.index=-1;}
 c.equipmentAttunementLimitSnapshot=equipmentAttunementLimit(c);c.inventory=inventory;c.inventoryItemIds=ids;c.equipped=equipped;c.equipmentInventorySnapshot=[...inventory];c.equipmentEquippedSnapshot=[...equipped];equipmentInvalidate();
}
function equipmentEnsure(c){
 c=c?._root||c;if(!c)return;
 if(c.equipmentFormatVersion!==EQUIPMENT_FORMAT_VERSION||!Array.isArray(c.equipmentItems)){Object.assign(c,migrateEquipment(c,name=>equipmentCatalogOriginal(name)));for(const i of c.equipmentItems){const cat=itemData(i.catalogName||i.name);if(cat?.damage&&!i.legacyAttackOverride&&classOf(c))i.attack.proficient=hasWeaponProficiency(c,cat)}consolidateEquipment(c);equipmentProject(c);return c;}
 if(c.equipmentAttunementLimitSnapshot!==equipmentAttunementLimit(c))equipmentProject(c);
 if(c.equipmentStackVersion!==1){consolidateEquipment(c);equipmentProject(c)}
 const names=c.inventory||[],old=c.equipmentInventorySnapshot||[],oldEquipped=c.equipmentEquippedSnapshot||[];
 if(JSON.stringify(names)===JSON.stringify(old)&&JSON.stringify(c.equipped||[])===JSON.stringify(oldEquipped))return c;
 if(JSON.stringify(names)!==JSON.stringify(old)){
  const previous=c.equipmentItems,ids=c.inventoryItemIds||[],used=new Set(),counts=new Map(),newIds=[];
  for(let index=0;index<names.length;index++){
   let match=old[index]===names[index]&&!used.has(index)?index:old.findIndex((n,k)=>n===names[index]&&!used.has(k));
   let id=match>=0?ids[match]:null;if(match>=0)used.add(match);
   if(!id){const i=equipmentItem(String(names[index]),equipmentCatalogOriginal(String(names[index]))||{});i.equipped=(c.equipped||[]).includes(index);previous.push(i);id=i.id;}
   newIds.push(id);counts.set(id,(counts.get(id)||0)+1);
  }
  c.equipmentItems=previous.filter(i=>counts.has(i.id)||i.quantity===0).map(i=>({...i,quantity:counts.get(i.id)||0}));c.inventoryItemIds=newIds;
 }
 if(JSON.stringify(c.equipped||[])!==JSON.stringify(oldEquipped))for(const i of c.equipmentItems)i.equipped=(c.equipped||[]).some(n=>c.inventoryItemIds[n]===i.id);
 consolidateEquipment(c);equipmentProject(c);return c;
}
function equipmentVanillaAC(c,abilities,items){
 const m=a=>eqModifier(abilities[a]),body=items.find(i=>i.type==='armor'),shield=items.find(i=>i.type==='shield');
 let value=10+m('dex');if(body)value=body.armor.baseAC+(body.armor.category==='heavy'?0:body.armor.category==='medium'?Math.min(m('dex'),body.armor.dexCap??2):m('dex'));
 else{if(c.klass==='barbarian')value=Math.max(value,10+m('dex')+m('con'));if(c.klass==='monk'&&!shield)value=Math.max(value,10+m('dex')+m('wis'));if(c.klass==='sorcerer'&&c.subId==='srd')value=Math.max(value,13+m('dex'));if(raceOf(c)?.naturalAC)value=Math.max(value,raceOf(c).naturalAC);}
 return value+(shield?2:0)+(eqNumber(c.acBonus))+(body&&c.fightingStyle==='defense'?1:0);
}
/* Walking speed is a calculated stat, unless a character explicitly overrides it. */
function sheetMovementSpeed(c,activeItems=[]){
 const root=c._root||c,setting=manual(root),custom=Number(setting.speedValue);
 if(setting.speedMode==='manual'&&Number.isFinite(custom)&&custom>=0)return {value:Math.floor(custom),manual:true};
 const heavyArmor=activeItems.some(item=>item.type==='armor'&&String(item.armor?.category||'').toLowerCase()==='heavy');
 // The 2014 Fast Movement feature uses Barbarian class level, not total character level.
 const fastMovement=classContexts(root).some(ctx=>ctx.klass==='barbarian'&&Number(ctx.level)>=5)&&!heavyArmor;
 return {value:(raceOf(root)?.speed??30)+featBonus(root,'speedBonus')+(fastMovement?10:0),manual:false};
}
function equipmentStats(c){
 if(equipmentGuard)return null;if(equipmentCache.has(c)&&equipmentCache.get(c).base.level===totalLevel(c)&&equipmentCache.get(c).attunementLimit===equipmentAttunementLimit(c))return equipmentCache.get(c);equipmentEnsure(c);
 equipmentGuard=true;const priorLookup=equipmentLookupContext;equipmentLookupContext=c._root||c;
 try{
  const root=c._root||c,abilities=Object.fromEntries(EQ_ABILITIES.map(a=>[a,equipmentOriginal.score(c,a)])),values={},skillAbilities={};
  for(const a of EQ_ABILITIES){values['save_'+a]=equipmentOriginal.save(c,a);values['check_'+a]=eqModifier(abilities[a])+(manual(c).jack?Math.floor(proficiency(c)/2):0);}
  for(const s of SKILLS){skillAbilities[s.id]=s.abl;values['skill_'+s.id]=equipmentOriginal.skill(c,s.id)}
  values.saveAll=equipmentOriginal.adjustment(c,'saveAll');values.initiative=equipmentOriginal.initiative(c);values.maxHP=equipmentOriginal.hp(c);values.passive=10+values.skill_perception+equipmentOriginal.adjustment(c,'passive')+featBonus(c,'passivePerception');
  const castingAbility=caster(c)?.ability||'int',spellBase=proficiency(c)+eqModifier(abilities[castingAbility]||10);
  values.spellDC=8+spellBase+equipmentOriginal.adjustment(c,'spellDC');values.magicAttack=spellBase+equipmentOriginal.adjustment(c,'magicAttack');
  const items=root.equipmentItems||[],active=activeEquipment(items,equipmentAttunementLimit(root)),movement=sheetMovementSpeed(c,active);values.speed=movement.value;const oldItems=(c.equipped||[]).map(n=>{const cat=itemData(c.inventory[n]);return cat?equipmentItem(cat.name,cat,'legacy-'+n):null}).filter(Boolean);
  const manualAC=manual(c).acMode==='manual',wild=typeof wsForm==='function'&&!!wsForm(c),ac=equipmentOriginal.ac(c);
  const weaponBonuses={};for(const i of items){if(!i.attack?.enabled||!active.some(a=>a.id===i.id))continue;const index=root.inventoryItemIds.indexOf(i.id),cat=itemData(i.catalogName||i.name);if(cat&&index>=0&&typeof cfWeaponBonuses==='function')weaponBonuses[i.id]=cfWeaponBonuses(c,cat,index)}
  const hpDice=[];const primary=classOf(root);for(let n=1;n<=(root.level||1);n++)hpDice.push(n===1?primary.hitDie:(root.hpRolls?.[n]||Math.floor(primary.hitDie/2)+1));for(const entry of root.multiclass||[]){const k=nativeClassOf(entry);for(let n=0;n<(entry.level||1);n++)hpDice.push(Math.floor((k?.hitDie||6)/2)+1)}
  const base={attunementLimit:equipmentAttunementLimit(root),abilities,values,skillAbilities,hpDice,proficiencyFactors:Object.fromEntries([...EQ_ABILITIES.flatMap(a=>[['save_'+a,classOf(c).saves.includes(a)?1:0],['check_'+a,manual(c).jack?.5:0]]),...SKILLS.map(s=>['skill_'+s.id,skillRank(c,s.id)||(manual(c).jack?.5:0)])]),pb:proficiency(c),customAttacks:root.customAttacks||[],weaponBonuses,level:totalLevel(c),castingAbility,ac,manualAC:manualAC||wild,acExtra:manualAC||wild?0:ac-equipmentVanillaAC(c,abilities,oldItems),legacyArmor:oldItems.some(i=>i.type==='armor'),defense:typeof cfPicks==='function'&&classContexts(root).some(x=>cfPicks(x,'styles').includes('defense')),unarmored:[{value:10,abilities:['dex'],source:'Unarmored'}]};
  if(c.klass==='barbarian')base.unarmored.push({value:10,abilities:['dex','con'],source:'Barbarian Unarmored Defense'});
  if(c.klass==='monk')base.unarmored.push({value:10,abilities:['dex','wis'],source:'Monk Unarmored Defense',noShield:true});
  if(c.klass==='sorcerer'&&c.subId==='srd')base.unarmored.push({value:13,abilities:['dex'],source:'Draconic Resilience'});
  if(raceOf(c)?.naturalAC)base.unarmored.push({value:raceOf(c).naturalAC,abilities:[],source:'Natural armor'});
  const gear=wild?items.map(i=>({...i,equipped:false})):items;const effectiveGear=movement.manual?gear.map(i=>({...i,modifiers:(i.modifiers||[]).filter(m=>m.target!=='speed')})):gear;const result=computeStats(base,effectiveGear);result.base=base;equipmentCache.set(c,result);return result;
 }finally{equipmentGuard=false;equipmentLookupContext=priorLookup}
}
function equipmentReady(c){return !!(c&&nativeClassOf(c)&&c.race)}
proficiency=function(c){return equipmentGuard||!equipmentReady(c)?equipmentOriginal.proficiency(c):equipmentStats(c).values.pb};
finalScore=function(c,a){return equipmentGuard||!equipmentReady(c)?equipmentOriginal.score(c,a):equipmentStats(c).values[a]};
armorClass=function(c){return equipmentGuard||!equipmentReady(c)?equipmentOriginal.ac(c):equipmentStats(c).values.ac};
maxHP=function(c){return equipmentGuard||!equipmentReady(c)?equipmentOriginal.hp(c):Math.max(1,equipmentStats(c).values.maxHP)};
initiative=function(c){return equipmentGuard||!equipmentReady(c)?equipmentOriginal.initiative(c):equipmentStats(c).values.initiative};
skillBonus=function(c,s){return equipmentGuard||!equipmentReady(c)?equipmentOriginal.skill(c,s):equipmentStats(c).values['skill_'+s]??equipmentOriginal.skill(c,s)};
saveBonus=function(c,a){return equipmentGuard||!equipmentReady(c)?equipmentOriginal.save(c,a):equipmentStats(c).values['save_'+a]};
adjustment=function(c,key){
 if(equipmentGuard||!equipmentReady(c)||!['spellDC','magicAttack','passive','saveAll'].includes(key))return equipmentOriginal.adjustment(c,key);
 const r=equipmentStats(c);if(key==='saveAll')return r.values.saveAll;
 if(key==='passive')return r.values.passive-(10+skillBonus(c,'perception')+featBonus(c,'passivePerception'));
 const ability=caster(c)?.ability||'int',base=proficiency(c)+mod(c,ability)+(key==='spellDC'?8:0);return r.values[key]-base;
};
function equipmentAttackStats(c,a){const r=equipmentStats(c);return r.attackStats[a.id]||computeStats({...r.base,customAttacks:[a]},(c._root||c).equipmentItems).attackStats[a.id]}
customAttackBonus=function(c,a){return equipmentGuard?equipmentOriginal.attack(c,a):equipmentAttackStats(c,a)?.attack??equipmentOriginal.attack(c,a)};
customAttackDamageBonus=function(c,a,second=false){return equipmentGuard||second?equipmentOriginal.damage(c,a,second):equipmentAttackStats(c,a)?.damage??equipmentOriginal.damage(c,a,second)};
const equipmentOldEquippedAttack=renderEquippedAttack;
renderEquippedAttack=function(c,it,index,host){if(!c.equipmentFormatVersion)equipmentOldEquippedAttack(c,it,index,host)};
function equipmentAttackRecord(c,item){
 const a=item.attack,ability=(a.ability==='finesse'||/finesse/i.test(item.properties))?(mod(c,'dex')>mod(c,'str')?'dex':'str'):a.ability;
 const index=c.inventoryItemIds?.indexOf(item.id)??-1,cat=itemData(item.catalogName||item.name),bonuses=index>=0&&cat&&activeEquipment(c.equipmentItems,equipmentAttunementLimit(c)).some(i=>i.id===item.id)&&typeof cfWeaponBonuses==='function'?cfWeaponBonuses(c,cat,index):{attack:0,damage:0};
 const active=activeEquipment(c.equipmentItems,equipmentAttunementLimit(c)).some(i=>i.id===item.id);let dice=a.damageDice;
 const versatile=item.properties.match(/versatile\s*\(([^)]+)\)/i);if(a.versatile&&versatile)dice=versatile[1];
 return {...defaultCustomAttack(),...item.legacyAttackOverride,id:'inventory:'+item.id,itemId:item.id,name:item.name,inventoryKind:a.kind||(/ammunition/i.test(item.properties)?'ranged':'melee'),attackAbility:ability,damageAbility:a.damageAbility||ability,proficient:!!a.proficient,damageDice:dice,damageType:a.damageType,damage2Enabled:!!a.extraDamage||active&&(item.magicDamageEffects||[]).some(e=>!e.condition||item.conditions?.[e.condition]),damage2Dice:a.extraDamage||(active?(item.magicDamageEffects||[]).filter(e=>!e.condition||item.conditions?.[e.condition]).map(e=>e.dice).join('+'):''),damage2Type:a.extraDamageType||(active?(item.magicDamageEffects||[]).filter(e=>!e.condition||item.conditions?.[e.condition]).map(e=>e.type).join(' / '):''),damage2Ability:'none',range:/reach/i.test(item.properties)&&a.range==='5 ft.'?'10 ft.':a.range,magicBonus:active?eqNumber(a.magicBonus)+(item.magicAttackEffects||[]).filter(e=>item.conditions?.[e.condition]).reduce((n,e)=>n+e.bonus,0):0,attackBonus:eqNumber(a.attackBonus)+(bonuses.attack||0),damageBonus:eqNumber(a.damageBonus)+(bonuses.damage||0)};
}
const EQ_TARGETS=[['ac','Armor Class'],...EQ_ABILITIES.map(a=>[a,ABL_NAMES[a]]),...EQ_ABILITIES.map(a=>['save_'+a,ABL_NAMES[a]+' save']),['saveAll','All saving throws'],['checkAll','All ability checks'],...EQ_ABILITIES.map(a=>['check_'+a,ABL_NAMES[a]+' checks']),...SKILLS.map(s=>['skill_'+s.id,s.name]),['meleeAttack','Melee attack rolls'],['rangedAttack','Ranged attack rolls'],['meleeDamage','Melee damage'],['rangedDamage','Ranged damage'],['speed','Speed'],['initiative','Initiative'],['passive','Passive Perception'],['maxHP','Maximum HP'],['spellDC','Spell save DC'],['magicAttack','Spell attack bonus'],['pb','Proficiency bonus'],['flyingSpeed','Flying speed'],['swimmingSpeed','Swimming speed'],['climbingSpeed','Climbing speed'],['burrowingSpeed','Burrowing speed']];
function equipmentOptions(options,value){return options.map(([key,name])=>`<option value="${esc(key)}" ${value===key?'selected':''}>${esc(name)}</option>`).join('')}
function equipmentField(label,key,value,type='text',extra=''){return `<label>${esc(label)}<input data-eq-field="${key}" type="${type}" value="${esc(value??'')}" ${extra}></label>`}
function equipmentToggle(label,key,value){return `<label class="eq-toggle"><input type="checkbox" data-eq-field="${key}" ${value?'checked':''}>${label}</label>`}
const equipmentOpen=new Map();
function equipmentDetail(item){
 const a=item.attack,r=item.resource,armor=item.armor;
 return `<div class="eq-detail" ${equipmentOpen.get(item.id)?'':'hidden'} id="eq-detail-${esc(item.id)}"><div class="eq-toggles">${equipmentToggle('Equipped','equipped',item.equipped)}${equipmentToggle('Use as a resource','resource.enabled',r.enabled)}${equipmentToggle('Has an attack','attack.enabled',a.enabled)}${equipmentToggle('Requires attunement','requiresAttunement',item.requiresAttunement)}${item.requiresAttunement?equipmentToggle('Attuned','attuned',item.attuned):''}</div><div class="eq-fields"><label>Item type<select data-eq-field="type">${equipmentOptions([['gear','Gear'],['weapon','Weapon'],['armor','Armor'],['shield','Shield']],item.type)}</select></label>${equipmentField('Properties','properties',item.properties)}${item.type==='shield'?equipmentField('Shield AC bonus','shieldBonus',item.shieldBonus,'number','step="1"'):''}</div>
 ${item.type==='armor'?`<fieldset><legend>Armor</legend><div class="eq-fields">${equipmentField('Base AC','armor.baseAC',armor.baseAC,'number')}<label>Category<select data-eq-field="armor.category">${equipmentOptions([['light','Light'],['medium','Medium'],['heavy','Heavy']],armor.category)}</select></label>${equipmentField('DEX cap (medium)','armor.dexCap',armor.dexCap,'number')}${equipmentField('STR requirement','armor.strength',armor.strength,'number')}${equipmentToggle('Stealth disadvantage','armor.stealthDisadvantage',armor.stealthDisadvantage)}</div></fieldset>`:''}
 ${a.enabled?`<fieldset><legend>Linked attack</legend><div class="eq-fields"><label>Attack ability<select data-eq-field="attack.ability">${equipmentOptions([['str','STR'],['dex','DEX'],['finesse','Finesse: best STR / DEX']],a.ability)}</select></label>${equipmentToggle('Proficient','attack.proficient',a.proficient)}<label>Attack kind<select data-eq-field="attack.kind">${equipmentOptions([['melee','Melee'],['ranged','Ranged']],a.kind)}</select></label>${equipmentField('Damage dice','attack.damageDice',a.damageDice)}${equipmentField('Damage type','attack.damageType',a.damageType)}${equipmentField('Extra damage dice','attack.extraDamage',a.extraDamage)}${equipmentField('Extra damage type','attack.extraDamageType',a.extraDamageType)}${equipmentField('Range','attack.range',a.range)}${equipmentField('Magic attack / damage bonus','attack.magicBonus',a.magicBonus,'number')}${equipmentToggle('Use versatile damage (two hands)','attack.versatile',a.versatile)}</div><p class="hint">Finesse uses your better STR/DEX modifier. Heavy flags Small/Tiny disadvantage; Versatile uses the listed dice when selected. Thrown weapons retain their chosen ability; set attack kind to ranged when thrown.</p></fieldset>`:''}
 ${r.enabled?`<fieldset><legend>Resource</legend>${r.rechargeText?`<p class="hint">${esc(r.rechargeText)}${r.initialRoll?` Initial charges: roll ${esc(r.initialRoll)} and enter the result.`:''}</p>`:''}<div class="eq-fields">${equipmentField('Current uses','resource.current',r.current,'number','min="0"')}${equipmentField('Maximum uses','resource.max',r.max,'number','min="0"')}<label>Recharge<select data-eq-field="resource.recharge">${equipmentOptions([['short','Short rest'],['long','Long rest'],['dawn','Dawn'],['manual','Manual']],r.recharge)}</select></label>${equipmentToggle('Consume quantity instead','resource.consumeQuantity',r.consumeQuantity)}</div></fieldset>`:''}
 ${item.magicEffects?.length?`<fieldset><legend>Situational effects</legend>${item.magicEffects.map(e=>equipmentToggle(e.label,'conditions.'+e.id,item.conditions?.[e.id])).join('')}<p class="hint">Turn on only while the stated condition applies.</p></fieldset>`:''}
 ${item.permanentAbility?`<p class="hint">One-time use: increase ${esc(item.permanentAbility.toUpperCase())} and its maximum by 2 using the ability editor after completing the required reading. This is not an equipped bonus.</p>`:''}
 <fieldset><legend>Modifiers</legend><div class="eq-modifiers">${item.modifiers.map((m,n)=>`<div class="eq-modifier"><select aria-label="Modifier target" data-eq-mod="${n}" data-part="target">${equipmentOptions(EQ_TARGETS,m.target)}</select><select aria-label="Modifier operation" data-eq-mod="${n}" data-part="operation">${equipmentOptions([['add','Add bonus'],['minimum','Set minimum'],['exact','Set exact'],['multiply','Multiply']],m.operation)}</select><input type="number" step="any" aria-label="Modifier value" data-eq-mod="${n}" data-part="value" value="${eqNumber(m.value)}"><button class="btn ghost" data-eq-remove-mod="${n}" aria-label="Remove modifier">×</button></div>`).join('')}</div><button class="btn ghost" data-eq-add-mod>Add modifier</button><div class="eq-quick"><input aria-label="Quick modifier" placeholder="AC: +1 or STR: min 19" data-eq-quick><button class="btn ghost" data-eq-parse>Add</button></div><p class="hint" data-eq-error role="status"></p></fieldset>
 <label>Notes<textarea data-eq-field="notes" rows="3">${esc(item.notes)}</textarea></label><div class="toolbar"><button class="btn ghost" data-eq-delete>Delete item</button></div></div>`;
}
function equipmentSetPath(object,path,value){const keys=path.split('.');let o=object;for(const k of keys.slice(0,-1))o=o[k];o[keys.at(-1)]=value}
function equipmentCommit(c,focus){equipmentProject(c);scheduleSave();renderSheet();if(focus){const el=byId('scr-sheet').querySelector(focus);el?.focus({preventScroll:true})}}
function equipmentParseModifier(text){
 const m=text.trim().match(/^(.+?)\s*:\s*(?:(min(?:imum)?|exact|set)\s*)?([+-]?\d+(?:\.\d+)?)$/i);if(!m)return null;
 const target=EQ_TARGETS.find(([key,label])=>[key,label].some(x=>x.toLowerCase()===m[1].trim().toLowerCase()));
 return target?{target:target[0],operation:/^min/i.test(m[2]||'')?'minimum':m[2]?'exact':'add',value:Number(m[3])}:null;
}
function equipmentEditor(c,root){
 const panel=root.querySelector('[data-sheet-panel="equipment"]');if(!panel)return;
 // Keep the existing catalog/shop, wallet, export and class controls.
 panel.querySelector('#customItemName')?.remove();panel.querySelector('#addOther')?.remove();
 const oldHint=[...panel.querySelectorAll('.hint')].find(x=>x.textContent.startsWith('Equip armor to apply'));if(oldHint)oldHint.textContent='Item effects apply while equipped. Required attunement must also be active.';
 panel.querySelectorAll('.inventory-row,.inventory-sort-hint,.inv-list').forEach(x=>x.remove());
 let host=panel.querySelector('.eq-editor');if(!host){host=document.createElement('section');host.className='eq-editor';panel.append(host)}
 const result=equipmentStats(c);
 host.innerHTML=`<div class="eq-heading"><h3>Equipment</h3><button class="btn primary" data-eq-add>＋ Add item</button></div><p class="hint">Drag a handle to reorder. Keyboard: focus a handle and use ↑ / ↓.</p><div class="eq-column-labels" aria-hidden="true"><span></span><span>Carry</span><span>Qty</span><span>Item name</span><span>lb / item</span><span></span></div><div class="eq-list">${c.equipmentItems.map(i=>`<article class="eq-item" data-eq-id="${esc(i.id)}"><div class="eq-row"><button class="eq-handle" aria-label="Reorder ${esc(i.name)}" title="Drag, or use arrow keys">⠿</button><input type="checkbox" data-eq-field="carried" aria-label="Carried: ${esc(i.name)}" ${i.carried?'checked':''}><input type="number" min="0" step="1" data-eq-field="quantity" aria-label="Quantity: ${esc(i.name)}" value="${Math.max(0,eqNumber(i.quantity))}"><input data-eq-field="name" aria-label="Item name" value="${esc(i.name)}"><input type="number" min="0" step="any" data-eq-field="weight" aria-label="Per-item weight: ${esc(i.name)}" value="${Math.max(0,eqNumber(i.weight))}"><button class="eq-info" aria-label="Details: ${esc(i.name)}" aria-controls="eq-detail-${esc(i.id)}" aria-expanded="${!!equipmentOpen.get(i.id)}">i</button></div>${equipmentOpen.get(i.id)?equipmentDetail(i):`<div class="eq-detail" hidden id="eq-detail-${esc(i.id)}"></div>`}</article>`).join('')}</div><div class="eq-weight"><strong>Carried: ${result.values.carriedWeight} lb</strong><span>Capacity: ${result.values.capacity} lb (STR × 15)</span><span>Attuned: ${c.equipmentItems.filter(i=>i.attuned&&i.requiresAttunement).length} / ${result.attunementLimit}</span></div><div class="eq-warnings" role="status">${result.warnings.map(w=>'<p>'+esc(w)+'</p>').join('')}</div>`;
 host.querySelector('[data-eq-add]').onclick=()=>{const i=equipmentItem('New item');c.equipmentItems.push(i);equipmentOpen.set(i.id,true);equipmentCommit(c,`[data-eq-id="${i.id}"] [data-eq-field="name"]`)};
 for(const row of host.querySelectorAll('.eq-item')){
  const item=c.equipmentItems.find(i=>i.id===row.dataset.eqId);
  row.querySelector('.eq-info').onclick=()=>{equipmentOpen.set(item.id,!equipmentOpen.get(item.id));let detail=row.querySelector('.eq-detail');if(equipmentOpen.get(item.id)&&!detail.hasChildNodes()){detail.outerHTML=equipmentDetail(item);detail=row.querySelector('.eq-detail');equipmentBindRow(c,row,item)}detail.hidden=!equipmentOpen.get(item.id);row.querySelector('.eq-info').setAttribute('aria-expanded',String(!!equipmentOpen.get(item.id)))};
  equipmentBindRow(c,row,item);
 }
 equipmentWireDrag(host,c);
}
function equipmentBindRow(c,row,item){
  row.querySelectorAll('[data-eq-field]').forEach(input=>input.onchange=()=>{
   const path=input.dataset.eqField;let value=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;
   if(input.type==='number'&&!Number.isFinite(value))return;if(['quantity','weight','resource.current','resource.max'].includes(path)){value=Math.max(0,value);if(path==='quantity')value=Math.min(10000,Math.floor(value));}
   if(path==='attuned'&&value&&c.equipmentItems.filter(i=>i.id!==item.id&&i.attuned&&i.requiresAttunement).length>=equipmentAttunementLimit(c)){row.querySelector('[data-eq-error]').textContent='Attunement limit reached: unattune another item first.';input.checked=false;return;}
   if(path==='attack.damageDice'||path==='attack.extraDamage')try{if(value)parseCustomAttackDice(value)}catch(e){row.querySelector('[data-eq-error]').textContent=e.message;return;}
   equipmentSetPath(item,path,value);
   if(path==='properties'){if(/finesse/i.test(value))item.attack.ability='finesse';if(/ammunition/i.test(value))item.attack.kind='ranged';}
   if(path==='resource.max'||path==='resource.current')item.resource.current=Math.min(item.resource.max,item.resource.current);
   equipmentCommit(c,`[data-eq-id="${item.id}"] [data-eq-field="${path}"]`);
  });
  if(!row.querySelector('[data-eq-delete]'))return;
  row.querySelector('[data-eq-field=notes]').oninput=e=>{item.notes=e.target.value;scheduleSave()};
  row.querySelector('[data-eq-delete]').onclick=async()=>{if(!await window.forgeConfirm('Delete '+item.name+' and its linked attack/resource?','Delete item'))return;c.equipmentItems=c.equipmentItems.filter(i=>i.id!==item.id);equipmentCommit(c)};
  row.querySelector('[data-eq-add-mod]').onclick=()=>{item.modifiers.push({target:'ac',operation:'add',value:1});equipmentCommit(c)};
  row.querySelectorAll('[data-eq-remove-mod]').forEach(b=>b.onclick=()=>{item.modifiers.splice(Number(b.dataset.eqRemoveMod),1);equipmentCommit(c)});
  row.querySelectorAll('[data-eq-mod]').forEach(input=>input.onchange=()=>{const m=item.modifiers[Number(input.dataset.eqMod)];m[input.dataset.part]=input.dataset.part==='value'?eqNumber(input.value):input.value;equipmentCommit(c)});
  row.querySelector('[data-eq-parse]').onclick=()=>{const m=equipmentParseModifier(row.querySelector('[data-eq-quick]').value);if(!m){row.querySelector('[data-eq-error]').textContent='Use AC: +1, STR: min 19, or STR: exact 19.';return;}item.modifiers.push(m);equipmentCommit(c)};
}

function equipmentWireDrag(host,c){
 const list=host.querySelector('.eq-list');let drag=null,scrollFrame=0;
 const reorder=(id,to)=>{const from=c.equipmentItems.findIndex(i=>i.id===id);if(from<0||to<0||to>=c.equipmentItems.length)return;const [item]=c.equipmentItems.splice(from,1);c.equipmentItems.splice(to,0,item);equipmentCommit(c,`[data-eq-id="${id}"] .eq-handle`)};
 for(const handle of list.querySelectorAll('.eq-handle')){
  const row=handle.closest('.eq-item'),id=row.dataset.eqId;
  handle.onkeydown=e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const n=c.equipmentItems.findIndex(i=>i.id===id);reorder(id,n+(e.key==='ArrowUp'?-1:1))}};
  handle.onpointerdown=e=>{
   if(e.button!==0||drag)return;e.preventDefault();const rect=row.getBoundingClientRect(),detail=row.querySelector('.eq-detail');detail.hidden=true;
   const r=row.getBoundingClientRect(),gap=document.createElement('div');gap.className='eq-drop-gap';gap.style.height=r.height+'px';row.before(gap);
   drag={row,id,gap,x:e.clientX-r.left,y:Math.min(e.clientY-r.top,r.height-5),pointer:e.pointerId,original:c.equipmentItems.findIndex(i=>i.id===id),clientY:e.clientY};
   row.classList.add('eq-grabbed');Object.assign(row.style,{width:r.width+'px',left:r.left+'px',top:r.top+'px'});document.body.append(row);handle.setPointerCapture(e.pointerId);handle.setAttribute('aria-grabbed','true');document.body.classList.add('eq-sorting');
   const scroll=()=>{if(!drag)return;const y=drag.clientY,delta=y<85?-12:y>window.innerHeight-85?12:0;if(delta){window.scrollBy(0,delta);place(drag.clientY)}scrollFrame=requestAnimationFrame(scroll)};scrollFrame=requestAnimationFrame(scroll);
  };
  function place(y){
   if(!drag)return;const siblings=[...list.querySelectorAll('.eq-item')],before=new Map(siblings.map(el=>[el,el.getBoundingClientRect().top]));const next=siblings.find(el=>y<el.getBoundingClientRect().top+el.getBoundingClientRect().height/2);
   if(next)list.insertBefore(drag.gap,next);else list.append(drag.gap);
   if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)for(const el of siblings){const dy=before.get(el)-el.getBoundingClientRect().top;if(dy)el.animate([{transform:`translateY(${dy}px)`},{transform:'translateY(0)'}],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'})}
  }
  handle.onpointermove=e=>{if(!drag||drag.id!==id)return;drag.clientY=e.clientY;drag.row.style.left=e.clientX-drag.x+'px';drag.row.style.top=e.clientY-drag.y+'px';place(e.clientY)};
  const end=cancel=>{if(!drag||drag.id!==id)return;cancelAnimationFrame(scrollFrame);const d=drag;drag=null;const index=[...list.children].indexOf(d.gap);d.gap.replaceWith(d.row);d.row.classList.remove('eq-grabbed');d.row.removeAttribute('style');document.body.classList.remove('eq-sorting');handle.removeAttribute('aria-grabbed');if(cancel){renderSheet();return;}reorder(d.id,index)};
  handle.onpointerup=()=>end(false);handle.onpointercancel=()=>end(true);handle.onlostpointercapture=()=>{if(drag)end(true)};
  handle.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){e.preventDefault();end(true)}});
 }
}
function equipmentRenderAttacks(c,root){
 const host=root.querySelector('.weapon-attacks');if(!host||typeof wsForm==='function'&&wsForm(c))return;host.replaceChildren();
 for(const item of c.equipmentItems.filter(i=>i.quantity>0&&i.attack.enabled)){
  const a=equipmentAttackRecord(c,item),row=document.createElement('article');row.className='custom-attack-row';row.dataset.inventoryAttack=item.id;
  const heavy=/\bheavy\b/i.test(item.properties)&&/small|tiny/i.test(raceOf(c)?.size||'');
  row.innerHTML=`<div class="custom-attack-heading"><h4>${esc(item.name)} <small class="eq-source-badge">from inventory</small></h4><button class="btn ghost" data-open-item>Edit item</button></div><p>${esc(a.damageDice)} ${fmt(customAttackDamageBonus(c,a))} ${esc(a.damageType)}${a.damage2Enabled?' + '+esc(a.damage2Dice)+' '+esc(a.damage2Type):''}</p><p class="hint">${esc(a.range)}${!item.equipped?' · not equipped':''}${item.requiresAttunement&&!item.attuned?' · requires attunement':''}${heavy?' · Heavy: disadvantage for your size':''}</p><div class="toolbar"><button class="btn ghost" data-attack>Attack ${fmt(customAttackBonus(c,a))}</button><button class="btn ghost" data-damage>Damage</button><button class="btn ghost" data-critical>Critical damage</button></div>`;
  for(const [selector,key] of [['[data-attack]','attack:'],['[data-damage]','damage:']]){const button=row.querySelector(selector),result=equipmentStats(c);button.title=equipmentStatTooltip(result,key+a.id);if(result.breakdown[key+a.id]?.some(s=>s.itemId&&s.value))button.classList.add('eq-modified-stat')}
  row.querySelector('[data-attack]').onclick=()=>{const m=manual(c),prior=m.rollMode;if(heavy)m.rollMode=prior==='advantage'?'normal':'disadvantage';try{sheetRoll(a.name+' attack',customAttackBonus(c,a),{attack:true,critical:a.criticalRange})}finally{if(prior===undefined)delete m.rollMode;else m.rollMode=prior}};
  row.querySelector('[data-damage]').onclick=()=>rollCustomAttackDamage(c,a);row.querySelector('[data-critical]').onclick=()=>rollCustomAttackDamage(c,a,true);
  row.querySelector('[data-open-item]').onclick=()=>{equipmentOpen.set(item.id,true);desktopTab.set(c.id,'equipment');renderSheet();byId('scr-sheet').querySelector(`[data-eq-id="${item.id}"]`)?.scrollIntoView({block:'center',behavior:'smooth'})};host.append(row);
 }
 if(!host.children.length)host.innerHTML='<p class="hint">Turn on Has an attack in an item’s details to link an inventory attack.</p>';
}
function equipmentUseResource(c,id,delta=-1){const item=c.equipmentItems.find(i=>i.id===id);if(!item)return;const r=item.resource;if(r.consumeQuantity)item.quantity=Math.max(0,item.quantity+delta);else r.current=Math.max(0,Math.min(r.max,r.current+delta));equipmentCommit(c)}
function equipmentRenderResources(c,root){
 const panel=root.querySelector('.resource-panel');if(!panel)return;
 const items=c.equipmentItems.filter(i=>i.resource.enabled);if(!items.length)return;const section=document.createElement('div');section.className='eq-resource-list';section.innerHTML='<h4>Inventory resources</h4>';
 for(const item of items){const r=item.resource,row=document.createElement('div');row.className='resource-row';row.innerHTML=`<strong>${esc(item.name)}</strong><small>${r.consumeQuantity?'Quantity':esc(({short:'Short rest',long:'Long rest',dawn:'Dawn',manual:'Manual'})[r.recharge])}</small><div class="resource-counter"><button data-eq-spend aria-label="Use ${esc(item.name)}" ${!(r.consumeQuantity?item.quantity:r.current)?'disabled':''}>−</button><span>${r.consumeQuantity?eqNumber(item.quantity):eqNumber(r.current)+' / '+eqNumber(r.max)}</span><button data-eq-restore aria-label="Restore one ${esc(item.name)}">＋</button>${!r.consumeQuantity?'<button data-eq-reset>'+ (r.rechargeText?'Recharge':r.recharge==='dawn'?'Dawn':'Reset')+'</button>':''}</div>`;row.querySelector('[data-eq-spend]').onclick=()=>equipmentUseResource(c,item.id);row.querySelector('[data-eq-restore]').onclick=()=>equipmentUseResource(c,item.id,1);row.querySelector('[data-eq-reset]')?.addEventListener('click',()=>{if(r.rechargeText){const amount=magicRechargeAmount(r);if(amount===null)return;r.current=Math.min(r.max,r.current+amount)}else r.current=r.max;equipmentCommit(c)});section.append(row)}panel.append(section);
}
resetTrackedResources=function(c,rest){equipmentOriginal.rest(c,rest);equipmentEnsure(c);for(const item of c.equipmentItems){const r=item.resource;if(r.enabled&&!r.consumeQuantity&&(r.recharge===rest||rest==='long'&&r.recharge==='short'))r.current=r.max}equipmentInvalidate()};
function equipmentMarkStats(c,root){
 const result=equipmentStats(c),mark=(el,key)=>{if(!el)return;const direct=(result.breakdown[key]||[]).some(s=>s.itemId),different=key in result.base.abilities?result.values[key]!==result.base.abilities[key]:result.values[key]!==(key==='ac'?result.base.ac:result.base.values[key]);if(direct||different){el.classList.add('eq-modified-stat');el.title=equipmentStatTooltip(result,key);el.setAttribute('aria-description',el.title)}};
 mark(root.querySelector('#editAC'),'ac');mark(root.querySelector('#rollInit'),'initiative');
 for(const a of EQ_ABILITIES){const el=root.querySelector(`[data-chk="${a}"]`);mark(el,a);if(el)el.onclick=()=>sheetRoll(ABL_NAMES[a]+' check',result.values['check_'+a]);mark(root.querySelector(`[data-sv="${a}"]`),'save_'+a)}
 for(const s of SKILLS)mark(root.querySelector(`[data-skr="${s.id}"]`),'skill_'+s.id);
 const speed=[...root.querySelectorAll('.hint')].find(x=>x.textContent.includes('ft. · XP readiness'));if(speed){speed.textContent=`${raceOf(c).size||'Medium'} · ${result.values.speed} ft. · XP readiness is shown above. Milestone leveling remains available.`;mark(speed,'speed')}
 const passive=[...root.querySelectorAll('.hint')].find(x=>x.textContent.startsWith('Passive Perception'));if(passive){passive.textContent='Passive Perception '+result.values.passive;mark(passive,'passive')}
 root.querySelectorAll('.spell-metrics>div').forEach(el=>{const text=el.textContent.toLowerCase();if(text.includes('spell attack'))mark(el,'magicAttack');if(text.includes('save dc'))mark(el,'spellDC')});
 for(const el of root.querySelectorAll('.stat-big'))if(el.querySelector('.lb')?.textContent.trim().toLowerCase()==='speed'){const value=el.querySelector('.vl');if(value)value.textContent=result.values.speed;mark(el,'speed')}
 const hp=root.querySelector('.hp-panel');if(hp&&(result.breakdown.maxHP||[]).some(s=>s.itemId)){hp.classList.add('eq-modified-stat');hp.title=equipmentStatTooltip(result,'maxHP')}
}
const equipmentPreviousSave=scheduleSave;
scheduleSave=function(){if(draft)equipmentEnsure(draft);equipmentInvalidate();equipmentPreviousSave()};
renderSheet=function(){equipmentEnsure(draft);equipmentInvalidate();equipmentOriginal.render();equipmentEnsure(draft);equipmentEditor(draft,byId('scr-sheet'));equipmentRenderAttacks(draft,byId('scr-sheet'));equipmentRenderResources(draft,byId('scr-sheet'));equipmentMarkStats(draft,byId('scr-sheet'))};

// Creation screens also read derived stats; invalidate on every app render.
const equipmentPreviousAppRender=render;render=function(...args){equipmentInvalidate();return equipmentPreviousAppRender(...args)};
