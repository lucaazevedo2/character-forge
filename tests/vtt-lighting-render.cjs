const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createCanvas}=require('@napi-rs/canvas');
const G=require('../vtt/vision-geometry.js');
const scene={id:'room',width:960,height:800,grid:64,settings:{lighting:'dark'},tokens:[{id:'hero',x:168,y:168,size:1,ownerIds:['player'],details:{vision:{enabled:true,range:60,darkvision:60}}}],environment:{config:{mode:'dynamic',covered:true,memory:true,dmOpacity:.6},fogOps:[],walls:[{id:'wall',type:'wall',points:[{x:300,y:0},{x:300,y:600}]}],lights:[]}};
const q={scene,game:{id:'game'},dm:true,selection:new Set(),zoom:1};
let reducedMotion=true,invalidations=0,timerCalls=[];
const win={ForgeVTTVisionGeometry:G,ForgeTabletop:{state:()=>q,redraw(){}},ForgeVTTStage:{invalidate(){invalidations++}},devicePixelRatio:1,matchMedia:()=>({matches:reducedMotion}),ForgeCloud:{partyConnection:()=>({user:{id:'player'}})}};
const box=vm.createContext({window:win,document:{createElement:()=>createCanvas(1,1)},OffscreenCanvas:function(w,h){return createCanvas(w,h)},performance,console,setTimeout:(fn,delay)=>{timerCalls.push({fn,delay});return timerCalls.length},clearTimeout:()=>{}});
vm.runInContext(fs.readFileSync('vtt/vision.js','utf8'),box);const V=win.ForgeVTTVision;V.togglePreview();
const canvas=createCanvas(960,800),ctx=canvas.getContext('2d'),b={x:0,y:0,w:960,h:800};
function render(extra){ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#56789a';ctx.fillRect(0,0,960,800);V.captureMap(ctx);extra?.(ctx);V.paint(ctx,q,b)}
const pixel=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data).slice(0,3),unknown=[7,9,16];
render();assert.deepEqual(pixel(450,200),unknown,'Darkvision must not seep behind a wall');assert(pixel(200,200)[0]>30);
// Moving an origin exercises the cache and reused canvas path state.
for(let i=0;i<5;i++){scene.tokens[0].x=168+i*5;render();assert.deepEqual(pixel(450,200),unknown)}
scene.tokens[0].details.vision={enabled:true,range:60};scene.environment.lights=[{x:450,y:200,bright:20,dim:40,color:'#ffaa33',intensity:1}];render();assert.deepEqual(pixel(450,200),unknown,'A torch behind a wall cannot reveal that side through token LOS');assert.deepEqual(pixel(200,200),unknown,'Light must also respect wall occlusion');
scene.environment.lights[0].x=200;render();assert(pixel(200,200)[0]>30);assert.deepEqual(pixel(450,200),unknown);
scene.environment.walls[0].type='door';scene.environment.walls[0].state='open';render();assert(pixel(450,200)[0]>30,'Opening a door invalidates visibility');scene.environment.walls[0].state='closed';render();assert.deepEqual(pixel(450,200),unknown);
scene.environment.walls[0].type='window';render();assert(pixel(450,200)[0]>30,'Windows transmit sight/light');scene.environment.walls[0].type='invisible';render();assert(pixel(450,200)[0]>30);
scene.environment.walls[0].type='wall';scene.environment.lights=[];scene.tokens[0].details.vision={enabled:true,range:60,darkvision:60};render();const gray=pixel(200,200);assert(Math.max(...gray)-Math.min(...gray)<=2,'Darkvision is grayscale');
scene.tokens[0].details.vision.enabled=false;render();assert.deepEqual(pixel(200,200),unknown,'No vision yields no revealed terrain');
scene.tokens[0].details.vision.enabled=true;scene.environment.config.mode='manual';scene.environment.fogOps=[{type:'rect',x:0,y:0,w:300,h:300,reveal:true}];render();assert(pixel(200,200)[0]>30);assert.deepEqual(pixel(450,200),unknown);scene.environment.fogOps.push({type:'brush',points:[{x:200,y:200}],radius:40,reveal:false});render();assert.deepEqual(pixel(200,200),unknown);
console.log('PASS real Canvas rendering: repeated masks/cache, wall occlusion for light and vision, open/closed doors, windows, movement barriers, grayscale darkvision, no vision, manual reveal/hide.');

scene.environment.config.mode='dynamic';scene.environment.lights=[{x:200,y:200,bright:20,dim:40,color:'#ffaa33',intensity:1,animation:'flicker'}];reducedMotion=false;timerCalls=[];render();assert(timerCalls.some(t=>t.delay===70));timerCalls.find(t=>t.delay===70).fn();assert.equal(invalidations,1);reducedMotion=true;timerCalls=[];render();assert.equal(timerCalls.length,0);console.log('PASS: animated lighting schedules subsequent frames and reduced-motion mode suppresses animation.');
