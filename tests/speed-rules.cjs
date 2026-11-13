const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'equipment-editor.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const start=src.indexOf('function sheetMovementSpeed('),end=src.indexOf('function equipmentStats(',start);
assert(start>=0&&end>start,'speed function is present');
assert(html.includes("select('speedMode','Walking speed'"),'Attributes & HP contains automatic/custom speed');
assert(html.includes("num('speedValue','Custom speed (ft)'"),'Attributes & HP contains custom feet input');
assert(html.includes('Custom speed must be a non-negative whole number.'),'invalid manual speed is rejected');
assert(src.includes('movement=sheetMovementSpeed(c,active);values.speed=movement.value'),'speed is wired into equipment-derived sheet');
assert(src.includes("filter(m=>m.target!=='speed')"),'custom total overrides item speed modifiers');
const context={
 manual:c=>c.manual||{},
 classContexts:c=>[c,...(c.multiclass||[])],
 raceOf:c=>({speed:c.racialSpeed??30}),
 featBonus:(c,key)=>key==='speedBonus'?(c.featSpeed||0):0,
};
vm.runInNewContext(src.slice(start,end),context);
const movement=context.sheetMovementSpeed;
const hero=(klass,level,props={})=>({klass,level,...props});
const heavy={type:'armor',armor:{category:'heavy'}},light={type:'armor',armor:{category:'light'}};
assert.equal(movement(hero('barbarian',4)).value,30,'level 4 no Fast Movement');
assert.equal(movement(hero('barbarian',5)).value,40,'level 5 Fast Movement');
assert.equal(movement(hero('barbarian',11,{racialSpeed:35,featSpeed:10})).value,55,'race and feat bonuses stack');
assert.equal(movement(hero('barbarian',5),[heavy]).value,30,'heavy armor suppresses Fast Movement');
assert.equal(movement(hero('barbarian',5),[light]).value,40,'light armor keeps Fast Movement');
assert.equal(movement(hero('fighter',10)).value,30,'other classes unaffected');
assert.equal(movement(hero('fighter',5,{multiclass:[{klass:'barbarian',level:4}]})).value,30,'total character level cannot unlock Fast Movement');
assert.equal(movement(hero('fighter',5,{multiclass:[{klass:'barbarian',level:5}]})).value,40,'5 barbarian levels do unlock Fast Movement');
const custom=hero('barbarian',5,{manual:{speedMode:'manual',speedValue:57}});
assert.equal(movement(custom,[heavy]).value,57,'custom total works even with heavy armor');
assert.equal(movement(custom).manual,true,'manual flag omits item speed modifiers');
custom.manual.speedValue=0;
assert.equal(movement(custom).value,0,'zero is an allowed custom speed');
custom.manual.speedMode='auto';
assert.equal(movement(custom).value,40,'automatic calculation returns when override is removed');
assert.equal(movement(JSON.parse(JSON.stringify({...custom,manual:{speedMode:'manual',speedValue:47}}))).value,47,'manual speed survives JSON roundtrip');
console.log('PASS 13 speed rules, armor conditions, multiclass level, custom total, and persistence checks');
