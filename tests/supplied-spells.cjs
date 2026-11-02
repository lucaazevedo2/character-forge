const vm=require('vm'),fs=require('fs'),assert=require('assert');
let js=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].split('(async function(){\n  const saved=')[0];
const stub=new Proxy(function(){},{get:(t,k)=>k==='style'?{}:k==='querySelectorAll'?()=>[]:k==='querySelector'?()=>stub:k==='classList'?{add(){},remove(){},toggle(){}}:stub,apply:()=>stub,set:()=>true});
const ctx=vm.createContext({console,document:stub,window:stub,localStorage:{getItem:()=>null},location:{hash:''},setTimeout:()=>0,clearTimeout(){},crypto:require('crypto').webcrypto});
vm.runInContext(js,ctx);
vm.runInContext(`
if(SPELLS.length!==574||new Set(SPELLS.map(s=>s.index)).size!==574)throw Error('spell identity/count');
for(const s of SPELLS){
 if(!s.desc?.length||s.supplemental||!s.source_book)throw Error('incomplete description '+s.index);
 const detail=explorerSpellDetails(s);
 if(!detail.includes(esc(s.desc[0]))||!detail.includes(esc(s.source_book)))throw Error('missing explorer text '+s.index);
 if(detail.includes('Open the rules source above for the full spell description'))throw Error('stale fallback '+s.index);
}
if(explorerCatalog().some(s=>s.ua)||explorerCatalog().length!==524)throw Error('UA filter changed');
const hero={id:'spell-test',klass:'wizard',subId:'srd',level:5,spells:['booming-blade'],prepared:[],stats:{int:16},feats:[]};
const boom=spellById('booming-blade');
if(!spellDetail(boom,hero).includes('melee weapon worth at least 1 sp'))throw Error('sheet material');
if(!spellDetail(boom,hero).includes('At 5th level'))throw Error('sheet scaling');
if(!spellById('hideous-laughter').desc.length||!spellById('arcane-hand').desc.length)throw Error('legacy IDs');
const unsafe={...boom,name:'test',desc:['<script>alert(1)</script>'],source_book:'<img src=x onerror=alert(1)>'};
if(explorerSpellDetails(unsafe).includes('<script>')||explorerSpellDetails(unsafe).includes('<img src=x'))throw Error('unsafe supplied text');
console.log('PASS all supplied descriptions rendered, material/scaling in character sheet, source books, stable aliases and UA exclusions');
`,ctx);
