const vm=require('vm'),fs=require('fs'),assert=require('assert');
let js=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].split('(async function(){\n  const saved=')[0];
const stub=new Proxy(function(){},{get:(t,k)=>k==='style'?{}:k==='querySelectorAll'?()=>[]:k==='querySelector'?()=>stub:k==='classList'?{add(){},remove(){},toggle(){}}:stub,apply:()=>stub,set:()=>true});
const ctx=vm.createContext({console,document:stub,window:stub,localStorage:{getItem:()=>null},location:{hash:''},setTimeout:()=>0,clearTimeout(){},crypto:require('crypto').webcrypto});
vm.runInContext(js,ctx);
for(const file of ['class-choices.js','wild-shape-data.js','wild-shape.js','equipment-model.js','equipment-editor.js'])vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..',file),'utf8'),ctx);
vm.runInContext(`
if(finalScore(newDraft(),'str')!==10)throw Error('new character creation regression');
const hero={id:'equipment-test',name:'Hero',klass:'fighter',subId:'srd',level:5,race:'human',background:'soldier',feats:[],inventory:[],equipped:[],base:{str:14,dex:14,con:14,int:10,wis:10,cha:10},stats:{str:14,dex:14,con:14,int:10,wis:10,cha:10},spells:[],prepared:[],customAttacks:[],classChoiceData:{}};
const beforeAC=armorClass(hero),beforeSTR=finalScore(hero,'str');
const sh=equipmentItem('+1 Shield',{},'shield-test');sh.type='shield';sh.equipped=true;sh.modifiers=[{target:'ac',operation:'add',value:1}];hero.equipmentItems.push(sh);equipmentProject(hero);
if(armorClass(hero)!==beforeAC+3)throw Error('integrated shield AC');
sh.equipped=false;equipmentProject(hero);if(armorClass(hero)!==beforeAC)throw Error('integrated unequip');
const g=equipmentItem('Gauntlets',{},'gauntlet-test');g.equipped=true;g.requiresAttunement=true;g.modifiers=[{target:'str',operation:'minimum',value:19}];hero.equipmentItems.push(g);equipmentProject(hero);if(finalScore(hero,'str')!==beforeSTR)throw Error('unattuned stats');g.attuned=true;equipmentProject(hero);if(finalScore(hero,'str')!==19)throw Error('attuned stats');
const sword=equipmentItem('Longsword',itemData('Longsword'),'sword-test');hero.equipmentItems.push(sword);equipmentProject(hero);const attack=equipmentAttackRecord(hero,sword);if(attack.id!=='inventory:sword-test'||attack.attackAbility!=='str')throw Error('stable linked attack');
hero.classChoiceData={test:{assignments:{infusion:{index:hero.inventoryItemIds.indexOf(sword.id),name:sword.name}}}};
hero.equipmentItems.reverse();equipmentProject(hero);if(hero.inventory[hero.classChoiceData.test.assignments.infusion.index]!=='Longsword')throw Error('infusion reorder remap');
hero.inventory.push('Rope');equipmentEnsure(hero);if(!hero.equipmentItems.some(i=>i.name==='Rope'))throw Error('legacy shop add');
const oldSwordId=sword.id;hero.inventory.splice(hero.inventory.indexOf('Rope'),1);equipmentEnsure(hero);if(hero.equipmentItems.some(i=>i.name==='Rope'))throw Error('legacy transfer removal');if(!hero.equipmentItems.some(i=>i.id===oldSwordId))throw Error('stable id lost');
const resource=equipmentItem('Wand',{},'wand');resource.resource={enabled:true,current:0,max:5,recharge:'manual',consumeQuantity:false};hero.equipmentItems.push(resource);equipmentProject(hero);resetTrackedResources(hero,'long');if(resource.resource.current!==0)throw Error('manual resource recharged');resource.resource.recharge='short';resetTrackedResources(hero,'short');if(resource.resource.current!==5)throw Error('short recharge');
console.log('PASS integrated shield/ability effects, stable linked attacks, infusion remapping, legacy additions/transfers and resource recharge');
`,ctx);
const {parseHTML}=require('linkedom');const {document:equipmentDocument}=parseHTML('<html><body><div id="equipment-test-root"><div class="weapon-attacks"></div></div></body></html>');ctx.document=equipmentDocument;ctx.equipmentTestRoot=equipmentDocument.getElementById('equipment-test-root');
vm.runInContext(`
equipmentRenderAttacks(hero,equipmentTestRoot);if(!equipmentTestRoot.querySelector('[data-inventory-attack="sword-test"]')||!equipmentTestRoot.textContent.includes('from inventory'))throw Error('linked attack not in Attacks UI');
const testSword=hero.equipmentItems.find(i=>i.id==='sword-test');testSword.attack.enabled=false;equipmentRenderAttacks(hero,equipmentTestRoot);if(equipmentTestRoot.querySelector('[data-inventory-attack="sword-test"]'))throw Error('disabled linked attack remains');
testSword.attack.enabled=true;hero.equipmentItems=hero.equipmentItems.filter(i=>i.id!=='sword-test');equipmentProject(hero);equipmentRenderAttacks(hero,equipmentTestRoot);if(equipmentTestRoot.querySelector('[data-inventory-attack="sword-test"]'))throw Error('deleted linked attack remains');
const restored=JSON.parse(JSON.stringify(hero));equipmentEnsure(restored);if(finalScore(restored,'str')!==finalScore(hero,'str'))throw Error('JSON/local/cloud payload round trip changed effects');if(JSON.stringify(restored.base)!==JSON.stringify(hero.base))throw Error('manual base values changed');
console.log('PASS linked Attacks UI appears/toggle-off/delete, inventory badge, and rich save round trip');
`,ctx);
vm.runInContext(`
for(const klass of ['monk','barbarian']){const unarmored={...newDraft(),id:'ac-'+klass,race:'human',klass,level:5,base:{str:12,dex:16,con:14,int:10,wis:14,cha:10},inventory:[],equipped:[]};const expected=10+mod(unarmored,'dex')+mod(unarmored,klass==='monk'?'wis':'con');if(armorClass(unarmored)!==expected)throw Error(klass+' AC changed');}
const transformed={...newDraft(),id:'shape-test',race:'human',klass:'druid',subId:'druid:moon',level:5,inventory:[],equipped:[],base:{str:8,dex:12,con:14,int:13,wis:18,cha:10},wildShape:{formId:'brown-bear',hp:34}};equipmentEnsure(transformed);const merged=equipmentItem('Merged gauntlets',{},'merged');merged.equipped=true;merged.modifiers=[{target:'str',operation:'exact',value:30},{target:'ac',operation:'add',value:10}];transformed.equipmentItems.push(merged);equipmentProject(transformed);if(finalScore(transformed,'str')!==19||armorClass(transformed)!==11||maxHP(transformed)!==34)throw Error('merged Wild Shape equipment applied');
console.log('PASS integrated Monk/Barbarian AC and inactive merged Wild Shape equipment');
`,ctx);
vm.runInContext(`
const artificer={...hero,id:'attunement-thresholds',klass:'artificer',level:9,multiclass:[],inventory:[],equipped:[],equipmentItems:[],equipmentFormatVersion:1,equipmentStackVersion:1};
for(let n=0;n<7;n++){const i=equipmentItem('Attuned item '+n,{},'attuned-'+n);i.equipped=i.attuned=i.requiresAttunement=true;i.modifiers=[{target:'str',operation:'add',value:1}];artificer.equipmentItems.push(i)}
equipmentTestRoot.innerHTML='<section data-sheet-panel="equipment"></section>';
equipmentProject(artificer);const artificerBaseSTR=equipmentOriginal.score(artificer,'str');
for(const [level,limit] of [[9,3],[10,4],[13,4],[14,5],[17,5],[18,6],[9,3],[18,6]]){
 artificer.level=level;const result=equipmentStats(artificer);
 if(result.attunementLimit!==limit||result.activeIds.length!==limit||artificer.equipped.length!==limit||result.values.str!==artificerBaseSTR+limit)throw Error('Artificer threshold '+level);
 if(!result.warnings.some(w=>w.includes('More than '+limit+' items')))throw Error('wrong dynamic warning');
 equipmentEditor(artificer,equipmentTestRoot);if(!equipmentTestRoot.textContent.includes('Attuned: 7 / '+limit))throw Error('wrong counter');
}
artificer.klass='fighter';artificer.level=8;artificer.multiclass=[{klass:'artificer',level:9}];equipmentInvalidate();if(equipmentStats(artificer).activeIds.length!==3)throw Error('total level incorrectly grants slots');
artificer.multiclass[0].level=10;if(equipmentStats(artificer).activeIds.length!==4)throw Error('secondary Artificer slots missing');
console.log('PASS Artificer 10/14/18 limits, effects, counter, warnings, multiclass and level reversal');
`,ctx);
for(const file of ['magic-items-data.js','magic-items.js'])vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..',file),'utf8'),ctx);
vm.runInContext(`
for(const kind of ['weapon','armor','shield'])for(const bonus of [1,2,3]){
 const rarity=(kind==='armor'?['Rare','Very Rare','Legendary']:['Uncommon','Rare','Very Rare'])[bonus-1];
 const catalog=MAGIC_ITEMS.find(i=>magicEnhancement(i)?.kind===kind&&i.rarity===rarity);
 const base=magicEnhancementBases(catalog).find(i=>kind==='weapon'?i.name==='Longsword':kind==='armor'?i.name==='Leather Armor':i.armor_category==='Shield')||magicEnhancementBases(catalog)[0];
 if(!base)throw Error('Missing base choices '+kind);
 const item=magicEnhancedEquipment(catalog,base);item.equipped=true;
 const plain=equipmentItem(base.name,base,'plain');plain.equipped=true;
 const statsBase={abilities:{str:16,dex:14,con:12,int:10,wis:10,cha:10},pb:3};
 const actual=computeStats(statsBase,[item]),expected=computeStats(statsBase,[plain]);
 if(kind==='weapon'){
  const a=actual.attackStats['inventory:'+item.id],b=expected.attackStats['inventory:plain'];
  if(a.attack-b.attack!==bonus||a.damage-b.damage!==bonus||item.attack.damageDice!==base.damage.damage_dice)throw Error('Weapon enhancement '+bonus);
 }else if(actual.values.ac-expected.values.ac!==bonus)throw Error('Armor enhancement '+bonus);
 if(item.name!==base.name+' +'+bonus||item.catalogName!==base.name)throw Error('Base identity lost');
 item.equipped=false;if(kind!=='weapon'&&computeStats(statsBase,[item]).values.ac!==12)throw Error('Inactive AC bonus');
 const saved=JSON.parse(JSON.stringify(item));if(JSON.stringify(saved)!==JSON.stringify(item))throw Error('Enhanced save round trip');
}
console.log('PASS +1/+2/+3 weapon attack and damage, armor/shield AC, base choices and save persistence');
`,ctx);
for(const file of ['magic-item-properties-data.js','magic-item-properties.js'])vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..',file),'utf8'),ctx);
vm.runInContext(`
for(const [name,dice,type,toggle] of [['Frost Brand','1d6','cold',false],['Sun Blade','1d8','radiant',false],['Flame Tongue','2d6','fire',true],['Holy Avenger','2d10','radiant',true]]){
 const catalog=MAGIC_ITEMS.find(i=>i.name===name),item=magicPopulateEquipment(catalog,itemData('Longsword'));
 item.equipped=true;item.attuned=true;hero.equipmentItems=[item];equipmentProject(hero);
 let attack=equipmentAttackRecord(hero,item);
 if(toggle){
  if(attack.damage2Enabled)throw Error(name+' should require its situational toggle');
  const effect=item.magicDamageEffects.find(e=>e.dice===dice);item.conditions[effect.condition]=true;equipmentInvalidate();attack=equipmentAttackRecord(hero,item);
 }
 if(!attack.damage2Enabled||attack.damage2Dice!==dice||attack.damage2Type!==type)throw Error(name+' linked attack damage');
 if(toggle){item.conditions[item.magicDamageEffects[0].condition]=false;equipmentInvalidate();if(equipmentAttackRecord(hero,item).damage2Enabled)throw Error(name+' off toggle');}
}
console.log('PASS four magic weapon linked attacks and situational damage toggles');
`,ctx);
