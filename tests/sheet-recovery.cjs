const vm=require('vm'),fs=require('fs'),assert=require('assert');
let js=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].split('(async function(){\n  const saved=')[0];
const stub=new Proxy(function(){},{get:(t,k)=>k==='style'?{}:k==='querySelectorAll'?()=>[]:k==='querySelector'?()=>stub:k==='classList'?{add(){},remove(){},toggle(){}}:stub,apply:()=>stub,set:()=>true});
const ctx=vm.createContext({console,document:stub,window:stub,localStorage:{getItem:()=>null},location:{hash:''},setTimeout:()=>0,clearTimeout(){},crypto:require('crypto').webcrypto});
vm.runInContext(js,ctx);
for(const file of ['class-choices.js','wild-shape-data.js','wild-shape.js','equipment-model.js','equipment-editor.js'])vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..',file),'utf8'),ctx);

const {parseHTML}=require('linkedom');const {document:doc,window:win}=parseHTML('<html><body></body></html>');ctx.document=doc;ctx.window=win;
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../sheet-recovery.js'),'utf8'),ctx);
vm.runInContext(`
const c={...newDraft(),id:'recovery',klass:'fighter',race:'human',background:'soldier',subId:'srd',level:3,inventory:['Rope'],equipped:[],base:{str:14,dex:12,con:14,int:10,wis:10,cha:10},notes:'Original note',xp:900,feats:[],hp:20};
c.acBonus=4;c.manual={acMode:'manual',acValue:29,initiative:2};resetAutomaticAC(c);if(c.acBonus!==0||c.manual.acMode!=='auto'||'acValue' in c.manual||c.manual.initiative!==2)throw Error('AC reset scope');
const baseline=armorClass(c);const sh=equipmentItem('+1 Shield',{},'shield');sh.type='shield';sh.equipped=true;sh.modifiers=[{target:'ac',operation:'add',value:1}];c.equipmentItems.push(sh);equipmentProject(c);c.acBonus=3;equipmentInvalidate();resetAutomaticAC(c);if(armorClass(c)!==baseline+3||!sh.equipped)throw Error('reset discarded item AC');
const before=captureLevelState(c),originalHP=maxHP(c);c.base.str+=2;c.level=4;c.hpRolls={4:6};c.feats.push('alert');c.featChoices={alert:{}};if(maxHP(c)<=originalHP)throw Error('level change used stale stats');if(!recordLevelChange(c,before,'fighter')||!lastLevelUndo(c))throw Error('undo record');
const serialized=JSON.parse(JSON.stringify(c));serialized.inventory.push('New item');serialized.notes='New notes';serialized.xp=4000;if(!applyRecordedLevelUndo(serialized,lastLevelUndo(serialized)))throw Error('undo');if(serialized.level!==3||serialized.base.str!==14||serialized.feats.length||serialized.hpRolls!==undefined||serialized.featChoices!==undefined)throw Error('level choices not restored');if(!serialized.inventory.includes('New item')||serialized.notes!=='New notes'||serialized.xp!==4000)throw Error('unrelated state lost');if(lastLevelUndo(serialized))throw Error('history not consumed');
const failed=captureLevelState(serialized);if(recordLevelChange(serialized,failed,'fighter'))throw Error('canceled level recorded');
const sorcerer={...serialized,klass:'sorcerer',level:2,metamagic:[]},prior=captureLevelState(sorcerer);sorcerer.level=3;sorcerer.metamagic=['quickened','twinned'];recordLevelChange(sorcerer,prior,'sorcerer');applyRecordedLevelUndo(sorcerer,lastLevelUndo(sorcerer));if(sorcerer.metamagic.length)throw Error('metamagic not reversed');
console.log('PASS automatic AC reset preserves item/unrelated bonuses; persisted level undo restores ASI/feat/HP-roll/metamagic changes and preserves inventory/notes/XP; level-aware stat cache');
`,ctx);
