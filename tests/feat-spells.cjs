const vm=require('vm'),fs=require('fs'),assert=require('assert');
let js=fs.readFileSync(require('path').join(__dirname,'../dist/index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1].split('(async function(){\n  const saved=')[0];
const stub=new Proxy(function(){},{get:(t,k)=>k==='style'?{}:k==='querySelectorAll'?()=>[]:k==='querySelector'?()=>stub:k==='classList'?{add(){},remove(){},toggle(){}}:stub,apply:()=>stub,set:()=>true});
const ctx=vm.createContext({console,document:stub,window:stub,localStorage:{getItem:()=>null},location:{hash:''},setTimeout:()=>0,clearTimeout(){},crypto:require('crypto').webcrypto});
vm.runInContext(js,ctx);
vm.runInContext(`
const testChar={id:'test',klass:'fighter',subId:'srd',level:5,race:'human',feats:['telepathic','fey-teleportation'],featChoices:{telepathic:{ability:'wis'},'fey-teleportation':{ability:'int'}},spells:[],prepared:[],stats:{str:10,dex:10,con:10,int:14,wis:14,cha:10},base:{str:10,dex:10,con:10,int:14,wis:14,cha:10}};
if(!caster(testChar)?.featOnly)throw Error('noncaster spell access');

const tg=featSpellGrants(testChar).find(g=>g.feat==='telepathic'),fg=featSpellGrants(testChar).find(g=>g.feat==='fey-teleportation');
if(!spellWorkspaceIds(testChar).includes('detect-thoughts'))throw Error('missing feat spell');
trackedResourceState(testChar,tg).current=0;trackedResourceState(testChar,fg).current=0;
resetTrackedResources(testChar,'short');
if(featSpellAvailable(testChar,tg)||!featSpellAvailable(testChar,fg))throw Error('short rest reset');
resetTrackedResources(testChar,'long');if(!featSpellAvailable(testChar,tg))throw Error('long rest reset');
if(!spellDetail(spellById('detect-thoughts'),testChar).includes('No spell components'))throw Error('components');
const rows=classAdvancementRows({klass:'artificer',level:5});if(rows.length!==20||rows[4].slots[1]!==2||rows[19].features[0]!=='Soul of Artifice')throw Error('artificer progression');
for(const k of CLASSES){const r=classAdvancementRows({klass:k.id,level:5});if(r.length!==20)throw Error('class advancement rows')}
const sv={...testChar,feats:['svirfneblin-magic'],featChoices:{}};const nd=featSpellGrants(sv).find(g=>g.spell==='nondetection');if(!nd.atWill||!nd.components.includes('No material'))throw Error('Svirfneblin rules');
const duplicate={...testChar,feats:['fey-teleportation','fey-touched'],featChoices:{'fey-touched':{ability:'int',spells:['bless']}}};if(featSpellGrants(duplicate).filter(g=>g.spell==='misty-step').length!==2)throw Error('independent feat pools');
const rage=FEATURES.find(f=>f.index==='rage');const rageHelp=classRulesContent({...rage,desc:['short summary']},'https://dnd5e.wikidot.com/barbarian');if(!rageHelp.label.includes('Full SRD')||!rageHelp.html.includes(esc(rage.desc[0])))throw Error('full class rules lookup');const fallback=classRulesContent({name:'Unknown Feature',desc:['Summary']},'https://dnd5e.wikidot.com/artificer');if(!fallback.html.includes('not available'))throw Error('class summary fallback');
const infuse=FEATURES.find(f=>f.class?.index==='artificer'&&f.name==='Infuse Item');if(infuse.level!==2||!infuse.rulesText.at(-1).includes('harmlessly'))throw Error('Infuse Item rules');if(FEATURES.filter(f=>f.class?.index==='artificer'&&f.level<=1).some(f=>f.name==='Infuse Item'))throw Error('early infusion unlock');if(!classRulesContent(infuse,infuse.source).html.includes('Infusions Known'))throw Error('infusion help');if(!FEATURES.some(f=>f.class?.index==='artificer'&&f.name==='Flash of Genius'&&f.level===7))throw Error('artificer progression');
for(const f of FEATURES.filter(f=>f.class?.index==='artificer')){if(!f.rulesMarkdown||!f.rulesText?.length)throw Error('missing supplied Artificer rules: '+f.name)};const casting=FEATURES.find(f=>f.class?.index==='artificer'&&f.name==='Spellcasting');const castingHelp=classRulesContent(casting,casting.source);if(!castingHelp.html.includes('<h5>Tools Required</h5>')||!castingHelp.html.includes('Spell save DC'))throw Error('spellcasting formatting');const spec=FEATURES.find(f=>f.class?.index==='artificer'&&f.name==='Artificer Specialist');if(!classRulesContent(spec,spec.source).html.includes('<table>'))throw Error('specialist table');if(featureRulesMarkdown('<script>alert(1)</script>').includes('<script>'))throw Error('unsafe markdown');
console.log('PASS supplied descriptions and formatting, artificer progression, class rules and feat inclusion, noncaster access, rest boundaries, components, advancement');
`,ctx);
