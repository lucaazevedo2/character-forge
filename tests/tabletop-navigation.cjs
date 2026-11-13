const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const nodes=new Map();const node=key=>{if(!nodes.has(key)){const classes=new Set();nodes.set(key,{innerHTML:'',dataset:{},style:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x),contains:x=>classes.has(x)},querySelector:s=>node(key+' '+s),querySelectorAll:()=>[],replaceChildren(){},setAttribute(k,v){this[k]=v},focus(){},setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0}),scrollLeft:100,scrollTop:100})}return nodes.get(key)};
const game={id:'game-a',name:'Test',scenes:[{id:'scene-a',name:'First',width:1600,height:1200,grid:64,snap:true,showGrid:true,tokens:[]},{id:'scene-b',name:'Second',width:1600,height:1200,grid:64,snap:true,showGrid:true,tokens:[]}]};
let savedGames;
const listeners={},location={pathname:'/',search:'',hash:''},root=node('root');
const c=vm.createContext({console,crypto:{randomUUID:()=> 'new-id'},localStorage:{getItem:()=>JSON.stringify([game]),setItem(k,v){savedGames=JSON.parse(v)}},document:{createTextNode:s=>s,body:node('body'),getElementById:()=>null,querySelector:()=>null},location,window:{ForgeVTTGeometry:require('../vtt/geometry'),addEventListener:(k,f)=>listeners[k]=f},history:{pushState(_,__,url){location.pathname=url},replaceState(_,__,url){location.pathname=url}},view:'home',chars:[],draft:null,step:0,activeId:null,editingCreation:false,render(){if(c.view==='tabletop')c.window.ForgeTabletop.render(root);else c.window.ForgeTabletop?.leave()},navigateSite(next){c.view=next;c.render()},MutationObserver:class{},setTimeout,clearTimeout,URL,Blob});
vm.runInContext(fs.readFileSync('tabletop.js','utf8'),c);
const beta=fs.readFileSync('beta-improvements.js','utf8');const start=beta.indexOf('(()=>{\n const nav=');const end=beta.indexOf('\n})();',start)+6;vm.runInContext(beta.slice(start,end),c);
c.navigateSite('tabletop');assert.equal(location.pathname,'/tabletop');
c.window.ForgeTabletop.applyRoute('/tabletop/game-a/scene/scene-b');c.render();assert.equal(location.pathname,'/tabletop/game-a/scene/scene-b');assert(node('body').classList.contains('vtt-page'));
node('root [data-back]').onclick();assert.equal(location.pathname,'/tabletop');assert(!node('body').classList.contains('vtt-page'));assert(!root.classList.contains('vtt-expanded'));
location.pathname='/tabletop/game-a/scene/scene-a';listeners.popstate();assert.equal(c.view,'tabletop');assert(node('body').classList.contains('vtt-page'));
node('root [data-tool="ruler"]'); // Tool controls are not parsed by the lightweight DOM; use a VM source fixture to select ruler.
// Exercise the actual pointer handlers by rendering a ruler-selected module instance.
const source=fs.readFileSync('tabletop.js','utf8').replace("tool='select'","tool='ruler'");location.pathname='/';vm.runInContext(source,c);c.window.ForgeTabletop.applyRoute('/tabletop/game-a/scene/scene-a');c.window.ForgeTabletop.render(root);
const vp=node('root .vtt-viewport'),event=(button,x,y)=>({button,clientX:x,clientY:y,pointerId:1,target:{closest:()=>null},preventDefault(){}});
vp.onpointerdown(event(0,22,22));vp.onpointermove(event(0,145,65));assert.equal(node('root .vtt-measure text').textContent,'15 ft');assert.equal(node('root .vtt-measure line').x1,20.8);vp.onpointerup();
vp.onpointerdown(event(2,200,200));vp.onpointermove(event(2,150,160));assert.equal(vp.scrollLeft,150);assert.equal(vp.scrollTop,140);vp.onpointerup();assert(!vp.classList.contains('is-panning'));
// Group selection should never pan on left-drag, and transformations must survive save.
location.pathname='/';game.scenes[0].tokens=[{id:'a',name:'A',x:128,y:128,size:1,color:'#abcdef',hp:10,maxHp:10,image:''},{id:'b',name:'B',x:128,y:256,size:1,color:'#abcdef',hp:10,maxHp:10,image:''}];
vm.runInContext(fs.readFileSync('tabletop.js','utf8'),c);c.window.ForgeTabletop.applyRoute('/tabletop/game-a/scene/scene-a');c.window.ForgeTabletop.render(root);
const left=vp.scrollLeft,top=vp.scrollTop;vp.onpointerdown(event(0,65,65));vp.onpointermove(event(0,135,215));vp.onpointerup();assert.equal(vp.scrollLeft,left);assert.equal(vp.scrollTop,top);assert(root.querySelector('[data-token-editor]').innerHTML.includes('2 tokens selected'));
const targetEvent=(button,x,y,token,transform)=>({...event(button,x,y),target:{closest(selector){if(selector==='[data-token]'&&token)return {dataset:{token}};if(selector==='[data-transform]'&&transform)return {dataset:{transform}};return null}}});
vp.onpointerdown(targetEvent(0,100,100,'a'));vp.onpointermove(event(0,142,100));vp.onpointerup();let tokens=savedGames[0].scenes[0].tokens;assert.equal(tokens[0].x,192);assert.equal(tokens[1].x,192);assert.equal(tokens[1].y-tokens[0].y,128);
// Left-click leaves only selection handles; stationary right-click opens actions.
vp.onpointerdown(targetEvent(0,142,100,'a'));vp.onpointerup();assert.equal(root.querySelector('.vtt-token-menu').hidden,true);
vp.onpointerdown(targetEvent(2,142,100,'a'));vp.onpointerup();assert.equal(root.querySelector('.vtt-token-menu').hidden,false);assert(root.querySelector('.vtt-selection-layer').innerHTML.includes('data-transform="resize"'));
// Right-drag over a token pans without opening actions or disturbing the group.
vp.onpointerdown(targetEvent(2,142,100,'a'));vp.onpointermove(event(2,120,100));vp.onpointerup();assert.equal(root.querySelector('.vtt-token-menu').hidden,true);assert(root.querySelector('[data-token-editor]').innerHTML.includes('2 tokens selected'));
vp.onpointerdown(targetEvent(2,142,100,'a'));vp.onpointercancel({type:'pointercancel'});assert.equal(root.querySelector('.vtt-token-menu').hidden,true);
// Resize from the shared corner; both token sizes and their spacing scale together.
vp.onpointerdown(targetEvent(0,166.4,208,null,'resize'));vp.onpointermove(event(0,208,332.8));vp.onpointerup();tokens=savedGames[0].scenes[0].tokens;assert.equal(tokens[0].size,2);assert.equal(tokens[1].size,2);assert.equal(tokens[1].y-tokens[0].y,256);
// Rotation uses the shared center and updates both portraits.
vp.onpointerdown(targetEvent(0,166.4,60,null,'rotate'));vp.onpointermove(event(0,350,208));vp.onpointerup();tokens=savedGames[0].scenes[0].tokens;assert.equal(tokens[0].rotation,90);assert.equal(tokens[1].rotation,90);
root.querySelector('[data-undo]').onclick();tokens=savedGames[0].scenes[0].tokens;assert.equal(tokens[0].rotation||0,0);assert.equal(tokens[0].size,2);
// Cell dimensions and cell pixel size remain consistent, including the 150 x 70 example.
root.querySelector('[data-width]').onchange({target:{value:'150'}});root.querySelector('[data-height]').onchange({target:{value:'200'}});root.querySelector('[data-grid]').onchange({target:{value:'70'}});const resized=savedGames[0].scenes[0];assert.equal(resized.width,10500);assert.equal(resized.height,14000);assert.equal(resized.grid,70);
// Browser Back to a regular page must clean up the tabletop shell.
location.pathname='/spells';listeners.popstate();assert.equal(c.view,'explorer');assert(!node('body').classList.contains('vtt-page'));
assert(fs.readFileSync('index.html','utf8').includes('view==="home"||view==="tabletop"'));
console.log('Passed tabletop routes, exit cleanup, ruler, right-pan, marquee selection, group move/resize/rotation, Undo and cell dimensions.');
