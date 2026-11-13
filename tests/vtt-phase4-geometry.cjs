const assert=require('node:assert/strict'),G=require('../vtt/vision-geometry.js'),C=require('../vtt/core.js');
const wall={id:'a',type:'wall',points:[{x:100,y:0},{x:100,y:300}]},hero={id:'h',x:0,y:64,size:1,meta:{},details:{vision:{range:60}}},s={id:'s',name:'Room',width:640,height:640,grid:64,snap:true,showGrid:true,map:'',tokens:[hero],environment:{config:{...G.config({}),mode:'dynamic'},fogOps:[],walls:[wall],lights:[]}};
assert(G.visible(s,{x:80,y:96},[hero]));assert(!G.visible(s,{x:150,y:96},[hero]));
for(const [type,sight,move]of [['window',true,true],['invisible',true,true],['wall',false,true]]){s.environment.walls=[{...wall,type}];assert.equal(G.visible(s,{x:150,y:96},[hero]),sight,type);assert.equal(G.blocked({x:32,y:96},{x:150,y:96},G.segments(s,'movement')),move)}
s.environment.walls=[{...wall,type:'door',state:'open'}];assert(G.visible(s,{x:150,y:96},[hero]));s.environment.walls[0].state='locked';assert(!G.visible(s,{x:150,y:96},[hero]));
s.environment.walls=[];s.settings={lighting:'dark'};assert(!G.visible(s,{x:80,y:96},[hero]));hero.details.vision.darkvision=60;assert(G.visible(s,{x:80,y:96},[hero]));assert(!G.visible(s,{x:80,y:96},[hero],true));hero.details.vision.blindsight=10;assert(G.visible(s,{x:80,y:96},[hero],true));hero.details.vision={range:60};s.environment.lights=[{x:80,y:96,bright:5,dim:10}];assert(G.visible(s,{x:80,y:96},[hero]));s.environment.lights[0].hidden=true;assert(!G.visible(s,{x:80,y:96},[hero]));
s.environment.config.mode='manual';s.environment.fogOps=[{type:'rect',reveal:true,x:0,y:0,w:200,h:200},{type:'brush',reveal:false,points:[{x:80,y:96}],radius:20}];assert(G.manual(s,{x:40,y:40}));assert(!G.manual(s,{x:80,y:96}));assert(!G.manual(s,{x:400,y:400}));
s.environment.fogOps.push({type:'polygon',reveal:true,points:[{x:60,y:60},{x:120,y:60},{x:120,y:120},{x:60,y:120}]});assert(G.manual(s,{x:80,y:96}));
const poly=G.polygon({x:32,y:96},200,[{a:{x:100,y:-1000},b:{x:100,y:1000}}]);assert(poly.every(p=>p.x<=100.001));
const game={id:'g',name:'Test',scenes:[s]},next=C.clone(game);next.scenes[0].environment.config.hint=true;const diff=C.diff(game,next);assert.equal(diff.length,1);assert.equal(diff[0].kind,'environment');assert.equal(C.merge(game,diff).scenes[0].environment.config.hint,true);next.scenes[0].environment._explored=[1,2];assert.deepEqual(C.diff(game,next),diff);const remote=C.clone(game);remote.scenes[0].environment.config.hint=true;assert.equal(C.rebase(game,next,remote).conflicts.length,0);const deleted=C.clone(game);deleted.scenes=[];assert(!C.diff(game,deleted).some(x=>x.kind==='environment'));
const many=Array.from({length:500},(_,i)=>({a:{x:i%25*64,y:Math.floor(i/25)*64},b:{x:i%25*64+32,y:Math.floor(i/25)*64+32}}));const start=performance.now();for(let i=0;i<10;i++)G.polygon({x:400+i,y:400},450,many);console.log('PASS: fog operations, walls, doors, senses, light, polygon clipping, environment commands; 500-wall polygon average '+((performance.now()-start)/10).toFixed(1)+'ms');

const noEnvironment=C.clone(game);delete noEnvironment.scenes[0].environment;const undo=C.diff(game,noEnvironment);assert.equal(undo[0].op,'upsert');assert.equal(undo[0].data.environment.config.mode,'off');

const componentCopy=C.clone(next);componentCopy.scenes[0].environment._tokenLights=[{x:1,y:1,bright:1,dim:2}];assert.deepEqual(C.diff(game,componentCopy),diff);

// Regression: negative endpoint angles previously made the polygon wind across itself.
// Check the actual filled polygon over a dense grid, not only its ray endpoints.
let sampled=0;
for(const [origin,radius,segs] of [
 [{x:200,y:200},500,[{a:{x:300,y:80},b:{x:300,y:350}}]],
 [{x:200,y:200},500,[{a:{x:300,y:0},b:{x:300,y:600}}]],
 [{x:450,y:200},600,[{a:{x:300,y:0},b:{x:300,y:600}}]],
 [{x:250,y:250},600,[{a:{x:300,y:0},b:{x:300,y:600}},{a:{x:300,y:600},b:{x:30,y:600}}]],
 [{x:64,y:64},900,[{a:{x:128,y:128},b:{x:512,y:512}},{a:{x:512,y:512},b:{x:650,y:128}}]],
 [{x:250,y:250},600,[{a:{x:300,y:0},b:{x:300,y:600},oneWay:true}]],
]){
 const polygon=G.polygon(origin,radius,segs);
 for(let y=2.31;y<800;y+=7)for(let x=1.17;x<800;x+=7){const point={x,y};sampled++;assert(!(G.inside(point,polygon)&&G.blocked(origin,point,segs)),`Visibility seep at ${x},${y}`)}
}
console.log('PASS: '+sampled+' filled-polygon samples remain behind their nearest wall, including angle-wrap, corners, diagonal walls and one-way walls.');
