const vm=require('vm'),fs=require('fs'),assert=require('assert');
let js=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].split('(async function(){\n  const saved=')[0];
const stub=new Proxy(function(){},{get:(t,k)=>k==='style'?{}:k==='querySelectorAll'?()=>[]:k==='querySelector'?()=>stub:k==='classList'?{add(){},remove(){},toggle(){}}:stub,apply:()=>stub,set:()=>true});
const ctx=vm.createContext({console,document:stub,window:stub,localStorage:{getItem:()=>null},location:{hash:''},setTimeout:()=>0,clearTimeout(){},crypto:require('crypto').webcrypto});
vm.runInContext(js,ctx);
for(const file of ['class-choices.js','wild-shape-data.js','wild-shape.js','equipment-model.js','equipment-editor.js'])vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..',file),'utf8'),ctx);

const {parseHTML}=require('linkedom');const {document:doc}=parseHTML('<html><body><section id="scr-sheet"><div data-sheet-panel="equipment"></div></section></body></html>');ctx.document=doc;ctx.testRoot=doc.getElementById('scr-sheet');
vm.runInContext(`
const oldAmmo={...newDraft(),id:'ammo',klass:'fighter',race:'human',background:'soldier',level:5,inventory:Array(20).fill('Crossbow Bolts'),equipped:[]};equipmentEnsure(oldAmmo);if(oldAmmo.equipmentItems.length!==1||oldAmmo.equipmentItems[0].quantity!==20||oldAmmo.inventory.length!==20)throw Error('old ammunition not stacked');
const v1={...migrateEquipment({...newDraft(),id:'v1',klass:'fighter',race:'human',level:5,inventory:Array(20).fill('Crossbow Bolts'),equipped:[]},()=>null)};if(v1.equipmentItems.length!==20)throw Error('fixture');equipmentEnsure(v1);if(v1.equipmentItems.length!==1||v1.equipmentItems[0].quantity!==20)throw Error('existing v1 save not repaired');
const different=equipmentItem('Crossbow Bolts',{},'special');different.notes='Silvered';v1.equipmentItems.push(different);equipmentProject(v1);delete v1.equipmentStackVersion;equipmentEnsure(v1);if(v1.equipmentItems.length!==2)throw Error('distinct metadata merged');
const large={...newDraft(),id:'large',klass:'fighter',race:'human',background:'soldier',level:5,inventory:Array.from({length:100},(_,i)=>'Gear '+i),equipped:[]};equipmentEnsure(large);
let scoreCalls=0;const originalScore=equipmentOriginal.score;equipmentOriginal.score=function(...args){scoreCalls++;return originalScore(...args)};equipmentInvalidate();for(let i=0;i<100;i++)finalScore(large,'str');if(scoreCalls>100)throw Error('stat snapshot recomputed per lookup');equipmentOriginal.score=originalScore;
equipmentEditor(large,testRoot);if(testRoot.querySelectorAll('.eq-item').length!==100)throw Error('row count');if(testRoot.querySelectorAll('.eq-detail input').length!==0)throw Error('collapsed forms built eagerly');
const first=testRoot.querySelector('.eq-item');first.querySelector('.eq-info').onclick();if(!first.querySelector('.eq-detail input'))throw Error('details not built on demand');if(testRoot.querySelectorAll('.eq-detail input').length>20)throw Error('unopened rows built');
console.log('PASS 20-bolt stack for legacy/v1 saves, metadata separation, cached stats and lazy collapsed detail forms');
`,ctx);
