const vm=require('vm'),fs=require('fs'),assert=require('assert');
let js=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].split('(async function(){\n  const saved=')[0];
const stub=new Proxy(function(){},{get:(t,k)=>k==='style'?{}:k==='querySelectorAll'?()=>[]:k==='querySelector'?()=>stub:k==='classList'?{add(){},remove(){},toggle(){}}:stub,apply:()=>stub,set:()=>true});
const ctx=vm.createContext({console,document:stub,window:stub,localStorage:{getItem:()=>null},location:{hash:''},setTimeout:()=>0,clearTimeout(){},crypto:require('crypto').webcrypto});
vm.runInContext(js,ctx);
const before=vm.runInContext('JSON.stringify({feats:FEATS,features:FEATURES,subFeatures:SUBCLASS_FEATURE_INDEX})',ctx);
for(const file of ['provided-feature-rules-data.js','provided-feature-rules.js'])vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..',file),'utf8'),ctx);
assert.strictEqual(vm.runInContext('JSON.stringify({feats:FEATS,features:FEATURES,subFeatures:SUBCLASS_FEATURE_INDEX})',ctx),before,'summaries and mechanics changed');
vm.runInContext(`
if(Object.keys(PROVIDED_FEATURE_RULES.feats).length!==87)throw Error('missing feat text');
for(const f of FEATS){if(!providedFeatRules(f)||!featPickerPreview(f).includes('Full feat description')||!subclassRulesHelpHTML(f,f.source,'feat').includes(esc(providedFeatRules(f))))throw Error('missing feat reference '+f.id)}
const protector={name:'Ancestral Protectors',desc:['Keep this summary.']};
const p=subclassRulesContent(protector,'https://dnd5e.wikidot.com/barbarian:ancestral-guardian');
if(!p.html.includes('disadvantage')||!p.html.includes('resistance')||p.html.includes('Spirit Shield'))throw Error('feature boundaries');
const elixir=subclassRulesContent({name:'Experimental Elixir'},'https://dnd5e.wikidot.com/artificer:alchemist');
if(!elixir.html.includes('Transformation.')||!elixir.html.includes('two at 6th level'))throw Error('table or scaling lost');
if(!classRulesContent({name:'Brutal Critical (3 dice)'},'https://dnd5e.wikidot.com/barbarian').html.includes('17th level'))throw Error('class alias');
if(!classRulesContent({name:'Eldritch Invocation: Agonizing Blast'},'https://dnd5e.wikidot.com/warlock').html.includes('Charisma modifier'))throw Error('invocation lookup');
if(providedFeatureText({name:'Ancestral Protectors'},'https://example.com/homebrew'))throw Error('custom source collision');
if(providedFeatureText({...protector,characterOverride:true},'https://dnd5e.wikidot.com/barbarian:ancestral-guardian'))throw Error('character override ignored');
if(providedRulesHTML('<script>alert(1)</script>').includes('<script>'))throw Error('unsafe text');
const missing=[];for(const [key,rows] of Object.entries(SUBCLASS_FEATURE_INDEX))for(const f of rows)if(!providedFeatureText(f,'https://dnd5e.wikidot.com/'+key))missing.push(key+' '+f.name);
if(missing.length)throw Error('subclass reference gaps: '+missing.join('; '));
console.log('PASS subclass full rules and boundaries, all 87 feat references, summary/mechanics preservation, aliases, custom isolation and escaping');
`,ctx);
