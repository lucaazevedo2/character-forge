const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('index.html','utf8'),abilities=['str','dex','con','int','wis','cha'],costs={8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9};
const ctx=vm.createContext({ABILITIES:abilities,PB_COST:costs,racialBonus:(c,a)=>c.bonuses?.[a]||0,proficiencyRecords:c=>['fighter','paladin'].includes(c.klass)?[{type:'armor',name:'Heavy armor'}]:[],classContexts:c=>[c],subclassKey:c=>c.subId||c.klass+':srd'});
vm.runInContext(html.slice(html.indexOf('const SCORE_BUILDS='),html.indexOf('function renderScores(el)')),ctx);
for(const hero of [{klass:'fighter',scoreBuild:'dexterity'},{klass:'paladin'},{klass:'cleric',subId:'cleric:life'},{klass:'cleric',subId:'cleric:twilight'},{klass:'artificer',subId:'artificer:armorer',level:3}])for(const bonuses of [{},{dex:2,int:1},Object.fromEntries(abilities.map(a=>[a,1]))]){ctx.hero={...hero,bonuses};const s=vm.runInContext('recommendedPointBuy(hero)',ctx);assert.equal(s.dex,8);assert.equal(Object.values(s).reduce((n,v)=>n+costs[v],0),27)}
ctx.hero={klass:'cleric',subId:'cleric:life',scoreBuild:'medium'};
assert.equal(vm.runInContext('recommendedScoreBuild(hero)[0]',ctx),'medium');
assert(vm.runInContext('recommendedPointBuy(hero).dex',ctx)>8);
ctx.hero.scoreBuild='heavy';assert.equal(vm.runInContext('recommendedScoreBuild(hero)[0]',ctx),'heavy');assert.equal(vm.runInContext('recommendedPointBuy(hero).dex',ctx),8);
console.log('Heavy armor cases and explicit medium/heavy cleric switching passed.');
