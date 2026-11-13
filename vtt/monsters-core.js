/* Editable 2014 stat blocks reuse the existing compendium; no catalog IDs change. */
(()=>{
  'use strict';
  const abilities=['strength','dexterity','constitution','intelligence','wisdom','charisma'];
  const sections={traits:'Traits',actions:'Actions',bonusActions:'Bonus actions',reactions:'Reactions',legendaryActions:'Legendary actions',lairActions:'Lair actions',mythicActions:'Mythic actions'};
  const textFields=['name','role','size','type','subtype','alignment','armor','hitDice','saves','skills','vulnerabilities','resistances','immunities','conditionImmunities','senses','languages','challenge','equipment','description','tactics','regionalEffects','source','sourceId','spellAbility','spells','innateSpells'];
  const numericFields={ac:[0,100],hp:[1,100000],proficiency:[0,30],initiative:[-30,50],xp:[0,10000000],passivePerception:[0,100],walk:[0,1000],fly:[0,1000],swim:[0,1000],climb:[0,1000],burrow:[0,1000],legendaryBudget:[0,100],legendaryResistances:[0,100],lairInitiative:[0,100],casterLevel:[0,30],spellDC:[0,100],spellAttack:[-30,100],...Object.fromEntries(abilities.map(a=>[a,[1,40]]))};
  const clone=x=>JSON.parse(JSON.stringify(x)),mod=n=>Math.floor((n-10)/2),sign=n=>(n>=0?'+':'')+n;
  function blank(){return {name:'New monster',role:'Monster',size:'Medium',type:'humanoid',subtype:'',alignment:'unaligned',armor:'',hitDice:'1d8',saves:'',skills:'',vulnerabilities:'',resistances:'',immunities:'',conditionImmunities:'',senses:'',languages:'',challenge:'0',equipment:'',description:'',tactics:'',regionalEffects:'',source:'Custom',sourceId:'',spellAbility:'',spells:'',innateSpells:'',hover:false,...Object.fromEntries(Object.keys(numericFields).map(k=>[k,abilities.includes(k)?10:0])),ac:10,hp:4,proficiency:2,walk:30,passivePerception:10,lairInitiative:20,...Object.fromEntries(Object.keys(sections).map(k=>[k,[]])),slots:Array(10).fill(0)};}
  function validate(s){
    if(!s||typeof s!=='object'||Array.isArray(s)||JSON.stringify(s).length>58000)throw Error('Stat block is too large.');
    const keys=[...textFields,...Object.keys(numericFields),...Object.keys(sections),'slots','hover'];
    if(Object.keys(s).some(k=>!keys.includes(k)))throw Error('Unsupported stat block field.');
    for(const k of textFields)if(typeof s[k]!=='string'||s[k].length>(['spells','innateSpells','description','tactics','regionalEffects'].includes(k)?8000:2000))throw Error('Invalid '+k+'.');
    if(!s.name.trim()||s.name.length>120||!['Monster','NPC'].includes(s.role)||!['Tiny','Small','Medium','Large','Huge','Gargantuan'].includes(s.size))throw Error('Enter a name and valid creature size.');
    for(const [k,[min,max]] of Object.entries(numericFields))if(!Number.isFinite(s[k])||s[k]<min||s[k]>max)throw Error(k+' must be between '+min+' and '+max+'.');
    if(typeof s.hover!=='boolean'||!Array.isArray(s.slots)||s.slots.length!==10||s.slots.some(n=>!Number.isInteger(n)||n<0||n>100))throw Error('Invalid spell slots.');
    for(const k of Object.keys(sections)){
      if(!Array.isArray(s[k])||s[k].length>40)throw Error('Too many '+sections[k]+'.');
      for(const a of s[k]){
        if(!a||Object.keys(a).some(k=>!['name','description','attack','damage','damageType','save','range','usage','cost'].includes(k))||typeof a.name!=='string'||!a.name.trim()||a.name.length>120)throw Error('Every ability needs a name.');
        for(const k of ['description','attack','damage','damageType','save','range','usage','cost'])if(typeof a[k]!=='string'||a[k].length>(k==='description'?8000:300))throw Error('Invalid ability '+k+'.');
        if(a.attack&&!/^[+-]?\d{1,3}$/.test(a.attack))throw Error('Attack bonus must be a number.');
        if(a.damage&&!/^(?:\d{1,3}d\d{1,4}|\d{1,5})(?:\s*[+-]\s*(?:\d{1,3}d\d{1,4}|\d{1,5}))*$/.test(a.damage))throw Error('Use damage dice such as 2d6+3.');
      }
    }
    return s;
  }
  function feature(a){if(typeof a==='string')a={name:'Ability',desc:a};return {name:a.name||'Ability',description:typeof a.desc==='string'?a.desc:(a.desc||[]).join('\n'),attack:a.attack_bonus===undefined?'':String(a.attack_bonus),damage:(a.damage||[]).map(d=>d.damage_dice).filter(Boolean).join('+'),damageType:(a.damage||[]).map(d=>d.damage_type?.name).filter(Boolean).join(', '),save:a.dc?`${a.dc.dc_type?.name||''} DC ${a.dc.dc_value||''}; ${a.dc.success_type||''}`:'',range:'',usage:a.usage?(a.usage.type==='recharge on roll'?`Recharge ${a.usage.min_value||5}–${a.usage.dice||'6'}`:a.usage.times?`${a.usage.times}/${a.usage.type}`:a.usage.type):'',cost:a.cost===undefined?'':String(a.cost)};}
  function fromCatalog(m){
    const s=blank();s.name=m.name;s.source='SRD 5.1 · CC BY 4.0 · dnd5eapi.co';s.sourceId=m.index||m.id||'';
    for(const k of ['size','type','subtype','alignment',...abilities])if(m[k]!==undefined)s[k]=m[k];
    s.ac=typeof m.armor_class==='number'?m.armor_class:m.armor_class?.[0]?.value||10;s.armor=(m.armor_class||[])[0]?.type||'';
    s.hp=m.hit_points||1;s.hitDice=m.hit_points_roll||(m.hit_dice?m.hit_dice+((parseInt(m.hit_dice)||1)*mod(s.constitution)?sign((parseInt(m.hit_dice)||1)*mod(s.constitution)):''):'');s.challenge=String(m.challenge_rating??0);s.xp=m.xp??({'0':10,'0.125':25,'0.25':50,'0.5':100}[String(m.challenge_rating)]??[10,200,450,700,1100,1800,2300,2900,3900,5000,5900,7200,8400,10000,11500,13000,15000,18000,20000,22000,25000,33000,41000,50000,62000,75000,90000,105000,120000,135000,155000][Number(m.challenge_rating)]??0);s.proficiency=m.proficiency_bonus||Math.max(2,Math.ceil(Number(m.challenge_rating||0)/4)+1);s.initiative=mod(s.dexterity);
    for(const k of ['walk','fly','swim','climb','burrow'])s[k]=parseInt(m.speed?.[k])||0;s.hover=!!m.speed?.hover;
    const prof=(m.proficiencies||[]);s.saves=prof.filter(p=>p.proficiency?.name?.startsWith('Saving Throw:')).map(p=>p.proficiency.name.replace('Saving Throw: ','')+' '+sign(p.value)).join(', ');s.skills=prof.filter(p=>p.proficiency?.name?.startsWith('Skill:')).map(p=>p.proficiency.name.replace('Skill: ','')+' '+sign(p.value)).join(', ');
    for(const [k,key] of Object.entries({vulnerabilities:'damage_vulnerabilities',resistances:'damage_resistances',immunities:'damage_immunities',conditionImmunities:'condition_immunities'}))s[k]=(m[key]||[]).map(x=>typeof x==='string'?x:x.name).join(', ');
    s.senses=Object.entries(m.senses||{}).filter(([k])=>k!=='passive_perception').map(([k,v])=>k.replaceAll('_',' ')+' '+v).join(', ');s.passivePerception=m.senses?.passive_perception||10;s.languages=m.languages||'';s.description=m.desc||'';
    s.traits=(m.special_abilities||[]).map(feature);s.actions=(m.actions||[]).map(feature);s.bonusActions=(m.bonus_actions||[]).map(feature);s.reactions=(m.reactions||[]).map(feature);s.legendaryActions=(m.legendary_actions||[]).map(feature);s.legendaryBudget=s.legendaryActions.length?3:0;s.lairActions=(m.lair_actions||[]).map(feature);s.regionalEffects=Array.isArray(m.regional_effects)?m.regional_effects.join('\n'):m.regional_effects||'';
    const spell=(m.special_abilities||[]).find(a=>a.spellcasting)?.spellcasting;
    if(spell){s.casterLevel=spell.level||0;s.spellAbility=spell.ability?.name||'';s.spellDC=spell.dc||0;s.spellAttack=spell.modifier||0;for(const [level,n]of Object.entries(spell.slots||{}))s.slots[Number(level)]=Number(n);s.spells=(spell.spells||[]).map(x=>`${x.name}${x.usage?' · '+JSON.stringify(x.usage):''}`).join('\n');}
    return validate(s);
  }
  function toToken(s,scene,{resourceId,image='',assetId=null,x=scene.grid*2,y=scene.grid*2}={}){
    validate(s);const size={Tiny:.5,Small:1,Medium:1,Large:2,Huge:3,Gargantuan:4}[s.size];
    return {id:crypto.randomUUID(),name:s.name,x:Math.max(0,Math.min(scene.width-size*scene.grid,x)),y:Math.max(0,Math.min(scene.height-size*scene.grid,y)),size,rotation:0,color:'#b5a2ff',hp:s.hp,maxHp:s.hp,image,_imageAssetId:assetId,hidden:false,locked:false,ownerIds:[],meta:{layer:'tokens'},details:{ac:s.ac,speed:s.walk,initiative:s.initiative,tempHp:0,notes:JSON.stringify({creatureResource:resourceId}),stats:{...Object.fromEntries(abilities.map(k=>[k.slice(0,3).toUpperCase(),mod(s[k])])),PROF:s.proficiency}}};
  }
  const api={abilities,sections,textFields,numericFields,blank,validate,feature,fromCatalog,toToken,mod,sign,clone};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else window.ForgeVTTMonstersCore=api;
})();
