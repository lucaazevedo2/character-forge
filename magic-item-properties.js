/* Acquisition defaults only: existing inventory and player edits are never overwritten. */
function magicPropertyRows(it){return MAGIC_PROPERTY_DATA.modifiers.filter(r=>r.name.toLowerCase()===(it.displayName||it.name).toLowerCase()||r.name.toLowerCase()===it.name.toLowerCase())}
function magicChargeRow(it){return MAGIC_PROPERTY_DATA.charges.find(r=>r.name.toLowerCase()===(it.displayName||it.name).toLowerCase()||r.name.toLowerCase()===it.name.toLowerCase())}
function magicPropertySpec(it){
 const rows=magicPropertyRows(it),text=rows.map(r=>r.props).join('; '),n=it.name.toLowerCase();
 let kind=magicEnhancement(it)?.kind;
 if(!kind&&rows.some(r=>r.cat==='Armor & shields'))kind=/shield/i.test(n)?'shield':'armor';
 if(!kind&&rows.some(r=>r.cat==='Weapons'||r.cat==='Wondrous/staff/rod items that work as weapons')&&!/bracers|tattoo|insignia|wraps/i.test(n))kind='weapon';
 let fixed=/quarterstaff|staff|pestle/i.test(text+' '+n)?'Quarterstaff':/mace/i.test(text+' '+n)?'Mace':/dagger/i.test(n)?'Dagger':/greataxe/i.test(n)?'Greataxe':/longbow|moonbow/i.test(n)?'Longbow':/whip|lash/i.test(n)?'Whip':/war pick/i.test(n)?'War pick':/trident/i.test(n)?'Trident':/sickle/i.test(n)?'Sickle':null;
 if(kind==='armor')fixed=/studded leather/i.test(text)?'Studded Leather':/chain shirt/i.test(text)?'Chain Shirt':/chain mail/i.test(text)?'Chain Mail':/scale mail/i.test(text)?'Scale Mail':/plate \(base|plate \(/i.test(text)?'Plate':/leather \(base/i.test(text)?'Leather':null;
 let variants=[];
 if(/belt of giant strength/i.test(n))variants=magicRarity(it)==='Very Rare'?[['Stone / frost giant',23],['Fire giant',25]]:magicRarity(it)==='Legendary'?[['Cloud giant',27],['Storm giant',29]]:[['Hill giant',21]];
 if(/ioun stone/i.test(n))variants=[['Agility','dex'],['Fortitude','con'],['Insight','wis'],['Intellect','int'],['Leadership','cha'],['Strength','str'],['Protection','ac'],['Mastery','pb']];
 if(/gambler.s blade/i.test(n))variants=[['+1',1],['+2',2],['+3',3]];
 const bases=kind?allItems().filter(b=>!isMagicItem(b)&&(kind==='weapon'?!!b.damage:kind==='shield'?b.armor_category==='Shield':!!b.armor_class&&b.armor_category!=='Shield')&&(!/mithral/i.test(n)||/medium|heavy/i.test(b.armor_category))&&(!/safeguarding/i.test(n)||/heavy/i.test(b.armor_category))):[];
 return {rows,text,kind,fixed,bases,variants};
}
function magicPopulateEquipment(it,base,variant){
 const spec=magicPropertySpec(it),item=magicEnhancement(it)?magicEnhancedEquipment(it,base):equipmentItem(it.name,base||it);
 item.magicCatalogId=it.index;item.magicPropertiesVersion=1;item.requiresAttunement=!!it.attunement;item.magicEffects=[];item.conditions={};
 item.notes=[item.notes,'Magic item: '+it.name,it.source?'Rules: '+it.source:'',...spec.rows.map(r=>r.props)].filter(Boolean).join('\n');
 const add=(target,value,operation='add',condition=null,extra={})=>{if(!item.modifiers.some(m=>m.target===target&&m.value===value&&m.operation===operation&&m.condition===condition))item.modifiers.push({target,value,operation,...(condition?{condition}:{}),...extra});};
 const condition=(label)=>{const key='effect'+item.magicEffects.length;item.magicEffects.push({id:key,label});item.conditions[key]=false;return key;};
 for(const row of spec.rows){
  if(row.cat.startsWith('Permanent')){item.permanentAbility=({Bodily:'con',Gainful:'str',Quickness:'dex',Clear:'int',Leadership:'cha',Understanding:'wis'})[Object.keys({Bodily:1,Gainful:1,Quickness:1,Clear:1,Leadership:1,Understanding:1}).find(k=>row.name.includes(k))];continue;}
  const text=row.props;
  for(const raw of text.split(';')){
   const t=raw.trim();if(!t)continue;
   const conditional=/conditional|activated|while held|only for|only while|while not|while in|vs constructs|unarmed strikes|longbow\/shortbow|wizard spells|sorcerer spells|bard spell|warlock spells|druid\/ranger|cleric\/paladin|CHA-based/i.test(t);
   const cond=conditional?condition(t):null;
   const bonus=Number(t.match(/\+(\d+)\s+(?:attack\s*(?:and|\/)\s*damage|attack\/damage)/i)?.[1]||t.match(/^\+(\d+) attack and damage/i)?.[1]||0);
   if(bonus&&item.attack.enabled&&!magicEnhancement(it)){
    if(cond){item.magicAttackEffects||=[];item.magicAttackEffects.push({condition:cond,bonus})}else item.attack.magicBonus=bonus;
   }
   const ac=t.match(/\bAC\s*\+(\d+)/i);if(ac&&!/base AC/i.test(t)&&!magicEnhancement(it))add('ac',+ac[1],'add',cond);
   const set=t.match(/\b(STR|DEX|CON|INT|WIS|CHA) set to (?:at least )?(\d+)/i);if(set)add(set[1].toLowerCase(),+set[2],'minimum',cond);
   const ability=t.match(/\b(STR|DEX|CON|INT|WIS|CHA)\s*\+(\d+)/i);if(ability)add(ability[1].toLowerCase(),+ability[2],'add',cond,/max 20/i.test(t)?{cap:20}:{});
   const saves=t.match(/(?:all saving throws|saving throws|saves)\s*\+(\d+)/i);if(saves)add('saveAll',+saves[1],'add',cond);
   const checks=t.match(/ability checks\s*\+(\d+)/i);if(checks)add('checkAll',+checks[1],'add',cond);
   const spell=t.match(/spell attack(?: and DC)?\s*\+(\d+)/i);if(spell)add('magicAttack',+spell[1],'add',cond);if(spell&&/spell attack and DC/i.test(t))add('spellDC',+spell[1],'add',cond);
   const dc=t.match(/(?:spell save DC|save DC|DC)\s*\+(\d+)/i);if(dc)add('spellDC',+dc[1],'add',cond);
   const init=t.match(/initiative\s*\+(\d+)/i);if(init)add('initiative',+init[1],'add',cond);
   const skill=t.match(/(Athletics|Sleight of Hand)\s*\+(\d+)/i);if(skill)add('skill_'+(skill[1].toLowerCase()==='sleight of hand'?'sleight':skill[1].toLowerCase()),+skill[2],'add',cond);
   if(/max HP \+1 per character level/i.test(t))add('maxHP',1,'add',cond,{scale:'level'});
   else if(/max HP \+10 \+ character level/i.test(t))add('maxHP',10,'add',cond,{scale:'plusLevel'});
   const speed=t.match(/(?:walking speed|speed) \+(\d+)/i);if(speed)add('speed',+speed[1],'add',cond);
   if(/walking speed at least 30/i.test(t))add('speed',30,'minimum',cond);
   if(/walking speed x2/i.test(t))add('speed',2,'multiply',cond);
   const movement=t.match(/(Flying|Swimming|Climbing|Burrowing) speed (?:= walking speed|(\d+) ft)/i);if(movement)add(movement[1].toLowerCase()+'Speed',+(movement[2]||0),'minimum',cond,movement[2]?{}:{scale:'walking'});
   const extra=t.match(/(?:extra damage mentioned:|extra)\s*(\d+d\d+)\s+(\w+)/i);if(extra&&item.attack.enabled){const key=cond||(/may be conditional|on crit|against/i.test(t)?condition(t):null);item.magicDamageEffects||=[];item.magicDamageEffects.push({condition:key,dice:extra[1],type:extra[2]})}
  }
 }
 if(/belt of giant strength/i.test(it.name)){item.modifiers=item.modifiers.filter(m=>m.target!=='str');add('str',Number(variant||21),'minimum')}
 if(/ioun stone/i.test(it.name)&&variant)add(variant,variant==='ac'||variant==='pb'?1:2,'add',null,variant==='ac'||variant==='pb'?{}:{cap:20});
 if(/gambler.s blade/i.test(it.name))item.attack.magicBonus=Number(variant||1);
 if(/mithral/i.test(it.name)){item.armor.strength=0;item.armor.stealthDisadvantage=false}
 if(/serpent scale/i.test(it.name)){item.armor.dexCap=99;item.armor.stealthDisadvantage=false}
 if(/scorpion armor/i.test(it.name))item.armor.stealthDisadvantage=false;
 if(/shield of the tortoise/i.test(it.name)){item.shieldBonus=1;item.modifiers=item.modifiers.filter(m=>m.target!=='ac')}
 if(/robe of the archmagi/i.test(it.name))item.unarmoredAC=15;
 if(/bracers of defense/i.test(it.name)){const m=item.modifiers.find(m=>m.target==='ac');if(m){delete m.condition;m.requiresUnarmored=true;m.requiresNoShield=true}}
 if(/badge of the watch/i.test(it.name)){const m=item.modifiers.find(m=>m.target==='ac');if(m){delete m.condition;m.requiresNoShield=true}}
 if(/bracers of archery/i.test(it.name)){const key=condition('Using a longbow or shortbow');add('rangedDamage',2,'add',key,{weaponNames:['longbow','shortbow']})}
 if(/eldritch claw tattoo|insignia of claws|wraps of unarmed prowess/i.test(it.name)){const key=condition('Using unarmed strikes or an eligible natural weapon');const bonus=/wraps/i.test(it.name)?({'Uncommon':1,'Rare':2,'Very Rare':3}[magicRarity(it)]||1):1;for(const target of ['meleeAttack','meleeDamage'])add(target,bonus,'add',key,{unarmedOnly:true})}
 if(/dragon mask/i.test(it.name))add('ac',0,'add',condition('Dragon mask unarmored AC'),{abilityValue:'cha',requiresUnarmored:true});
 if(/orb of skoraeus/i.test(it.name))add('save_con',2,'add',condition('Maintaining concentration'));
 const charge=magicChargeRow(it);
 // Figurine durations are hours, not charges; do not turn those into a charge pool.
 if(charge&&!/figurine of wondrous power/i.test(it.name)){
  const fixed=/^\d+$/.test(charge.max),initial=fixed?Number(charge.max):typeof rollCustomAttackDice==='function'?Math.max(0,rollCustomAttackDice(charge.max.replace(/\s/g,'')).total):0;item.resource={enabled:true,current:initial,max:initial,recharge:'manual',consumeQuantity:false,rechargeText:charge.recharge,initialRoll:fixed?'':charge.max};
  item.notes+='\nCharges: '+charge.max+'; '+charge.recharge;
 }
 return item;
}
function magicRechargeAmount(resource,roll=expression=>rollCustomAttackDice(expression).total){
 const text=resource.rechargeText||'';
 if(/can't recharge|none stated/i.test(text))return null;
 const dice=text.match(/regains?\s+(\d+d\d+\s*(?:[+−-]\s*\d+)?)/i);
 if(dice)return Math.max(0,roll(dice[1].replace(/−/g,'-').replace(/\s/g,'')));
 if(/regains?\s+(?:all|all of)/i.test(text))return resource.max;
 const flat=text.match(/regains?\s+(\d+)\s+(?:expended )?charge/i);return flat?Number(flat[1]):null;
}
