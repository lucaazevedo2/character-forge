/* DM workspace: explicit sidebar views and direct editing of lighting objects. */
(() => {
'use strict';
const G=window.ForgeVTTVisionGeometry,C=window.ForgeVTTCore;
const api=()=>window.ForgeTabletop,state=()=>api()?.state(),stage=()=>window.ForgeVTTStage;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const presets={Torch:[20,40],Lantern:[30,60],Candle:[5,10],Light:[20,40],Daylight:[60,120]};
const kinds={wall:'Wall',door:'Door',secret:'Secret door',window:'Window',oneWay:'One-way wall',invisible:'Movement barrier'};
let tab='scene',section='walls',shape='line',wallType='wall',preset='Torch',fogShape='brush',reveal=true,brush=64;
let collapsed=false;
let key='',selected=new Set(),drag=null,points=[],hover=null,erase=false,scrolls={},activeRoot=null;
const env=s=>s.environment||{config:G.config(s),fogOps:[],walls:[],lights:[]};
const current=()=>env(state().scene);
const id=(kind,item)=>kind+':'+item.id;
const objects=()=>[...current().walls.map((item,index)=>({kind:'wall',item,index,id:id('wall',item)})),...current().lights.map((item,index)=>({kind:'light',item,index,id:id('light',item)}))];
const chosen=()=>objects().filter(o=>selected.has(o.id));
const lighting=()=>state()?.dm&&stage()?.activeLayer==='lighting';
const paint=()=>stage()?.invalidate();
function change(fn){api().change(()=>{const s=state().scene;s.environment=env(s);fn(s.environment)})}
function open(next='lighting'){
 tab=next;const a=state();if(!a?.dm)return;collapsed=false;api().showInspector();showView(next);
}
function showView(next){
 tab=next;const root=state()?.root;if(!root)return;const old=root.querySelector('[data-sidebar-view]:not([hidden])');if(old)scrolls[old.dataset.sidebarView]=old.scrollTop;
 for(const n of root.querySelectorAll('[data-sidebar-view]'))n.hidden=n.dataset.sidebarView!==next;
 for(const n of root.querySelectorAll('[data-sidebar-tab]')){const yes=n.dataset.sidebarTab===next;n.setAttribute('aria-selected',String(yes));n.tabIndex=yes?0:-1}
 const pane=root.querySelector('[data-sidebar-view="'+next+'"]');if(pane)pane.scrollTop=scrolls[next]||0;
}
function tokenSelected(){if(!lighting()&&!window.ForgeVTTVision?.previewing){tab='tokens';showView(tab)}}
function layerChanged(next){selected.clear();drag=null;points=[];erase=false;tab=next==='lighting'?'lighting':next==='tokens'?'tokens':tab;paint()}
function activate(tool){
 points=[];drag=null;erase=tool==='erase';tab='lighting';
 if(stage().activeLayer!=='lighting'){stage().setLayer('lighting')}
 api().setTool(tool==='erase'?'lighting-erase':tool);open();if(window.matchMedia('(max-width:700px)').matches)state().root.querySelector('.vtt-workspace').classList.remove('inspector-open');
}
function cancel(){points=[];drag=null;erase=false;api().interaction(false);api().setTool('select');paint()}
function deleteSelection(){
 if(!lighting()||!selected.size)return;
 const ids=new Set(selected);selected.clear();change(e=>{e.walls=e.walls.filter(w=>!ids.has(id('wall',w)));e.lights=e.lights.filter(l=>!ids.has(id('light',l)))})
}
function setSelection(ids,add=false){if(!add)selected.clear();for(const k of ids)selected.has(k)&&add?selected.delete(k):selected.add(k);refreshSelection();if(selected.size){scrolls.lighting=0;const pane=state().root.querySelector('[data-sidebar-view=lighting]');if(pane)pane.scrollTop=0}paint()}
function refreshSelection(){
 const a=state();if(!a?.root)return;
 const content=a.root.querySelector('[data-lighting-selection]');if(content){selectionForm(content);const fold=a.root.querySelector('.vtt-create-fold');if(fold)fold.open=!selected.size;}
 for(const b of a.root.querySelectorAll('[data-lighting-object]'))b.setAttribute('aria-pressed',String(selected.has(b.dataset.lightingObject)));
 targets(a.root);
}
function label(o){return o.kind==='light'?'Light '+(o.index+1):kinds[o.item.type]+' '+(o.index+1)}
function field(text,key,value,min=0,max=1000){return `<label>${text}<input type="number" name="${key}" min="${min}" max="${max}" step="any" value="${Number(value)||0}"></label>`}
function selectionForm(el){
 const items=chosen();
 if(!items.length){el.innerHTML='<div class="vtt-editor-empty"><strong>Select a wall or light</strong><p>Click one on the map, drag a selection box, or choose one below. Shift-click adds to a selection.</p></div>';return}
 el.innerHTML=`<div class="vtt-editor-selection-title"><strong>${items.length===1?escape(label(items[0])):items.length+' objects selected'}</strong><button class="btn ghost" data-lighting-clear aria-label="Clear lighting selection">×</button></div>`;
 el.querySelector('[data-lighting-clear]').onclick=()=>setSelection([]);
 if(items.length===1){const {item,kind}=items[0],form=document.createElement('form');form.className='vtt-lighting-properties';
 if(kind==='light'){
 form.innerHTML=`<div class="vtt-pair">${field('X (px)','x',item.x,0,128000)}${field('Y (px)','y',item.y,0,128000)}</div><div class="vtt-pair">${field('Bright radius','bright',item.bright)}${field('Total radius','dim',item.dim)}</div><div class="vtt-pair"><label>Color<input name="color" type="color" value="${escape(item.color||'#fff0c2')}"></label><label>Intensity<input name="intensity" type="number" min="0" max="1" step=".05" value="${item.intensity??1}"></label></div><label>Animation<select name="animation">${['none','flicker','pulse'].map(v=>`<option ${v===item.animation?'selected':''}>${v}</option>`).join('')}</select></label><label class="vtt-check"><input type="checkbox" name="hidden" ${item.hidden?'checked':''}> DM-only light</label>`;
 }else{
 const flags=G.flags({...item,state:'closed'});
 form.innerHTML=`${['door','secret'].includes(item.type)?`<label>Door state<select name="state">${['closed','open','locked'].map(v=>`<option ${item.state===v?'selected':''}>${v}</option>`).join('')}</select></label>`:''}<fieldset><legend>Blocks</legend>${['Movement','Sight','Light'].map(v=>`<label class="vtt-check"><input type="checkbox" name="block${v}" ${flags[v.toLowerCase()]?'checked':''}> ${v}</label>`).join('')}</fieldset><p class="vtt-editor-note">Drag the wall to move it. Drag a square handle to adjust a corner.${item.type==='oneWay'?' The left side of each directed segment blocks sight.':''}</p>`;
 }
 form.insertAdjacentHTML('beforeend','<button class="btn primary" type="submit">Save changes</button>');
 form.onsubmit=event=>{event.preventDefault();if(!form.reportValidity())return;const f=form.elements;
 if(kind==='light')change(()=>Object.assign(item,{x:Math.min(state().scene.width,+f.x.value),y:Math.min(state().scene.height,+f.y.value),bright:+f.bright.value,dim:Math.max(+f.bright.value,+f.dim.value),color:f.color.value,intensity:+f.intensity.value,animation:f.animation.value,hidden:f.hidden.checked}));
 else change(()=>Object.assign(item,{...(f.state?{state:f.state.value}:{}),...Object.fromEntries(['Movement','Sight','Light'].map(v=>['block'+v,f['block'+v].checked]))}));};
 el.append(form);
 }
 const del=document.createElement('button');del.type='button';del.className='btn vtt-danger';del.textContent=items.length===1?'Delete '+(items[0].kind==='wall'?'wall':'light'):'Delete selected objects';del.onclick=deleteSelection;el.append(del);
}
function list(container){
 container.innerHTML=`<details class="vtt-editor-objects"><summary>Scene objects <span>${objects().length}</span></summary><div class="vtt-editor-object-list">${objects().map(o=>`<button class="vtt-editor-object" type="button" data-lighting-object="${escape(o.id)}" aria-pressed="${selected.has(o.id)}"><span class="vtt-object-glyph">${o.kind==='light'?'☼':'╱'}</span><span>${escape(label(o))}<small>${o.kind==='light'?o.item.bright+' / '+o.item.dim+' '+escape(state().scene.settings?.units||'ft'):o.item.state||'Blocks sight & movement'}</small></span></button>`).join('')||'<p class="vtt-editor-note">No lighting objects yet.</p>'}</div></details>`;
 container.querySelectorAll('[data-lighting-object]').forEach(b=>b.onclick=e=>{if(stage().activeLayer!=='lighting'){const wanted=b.dataset.lightingObject;stage().setLayer('lighting');setSelection([wanted],e.shiftKey)}else setSelection([b.dataset.lightingObject],e.shiftKey)})
}
function lightingPanel(root,view){
 const a=state(),s=a.scene,c=G.config(s);view.innerHTML=`<div class="vtt-editor-intro"><span class="vtt-editor-eyebrow">SCENE VISIBILITY</span><h3>Fog & lighting</h3><label>Mode<select data-fog-mode><option value="off">Off · entire map visible</option><option value="manual">Manual fog</option><option value="dynamic">Dynamic vision</option></select></label></div><div class="vtt-editor-preview"><span data-preview-label>${window.ForgeVTTVision.previewing?'Player preview':'DM overview'}</span><button class="btn ghost" data-vision-preview>${window.ForgeVTTVision.previewing?'Exit preview':'Preview vision'}</button></div><p class="vtt-editor-note">${window.ForgeVTTVision.previewing?'Selected tokens define the preview. With none selected, all assigned player tokens are used.':'DM overview keeps hidden areas dimly visible. Preview shows what token vision actually reveals.'}</p><div data-lighting-selection></div><details class="vtt-create-fold" ${selected.size?'':'open'}><summary>Add walls & lights</summary><div data-lighting-tools></div></details><div data-lighting-list></div><details class="vtt-editor-options"><summary>Visibility options</summary><div><label class="vtt-check"><input type="checkbox" data-vision-memory ${c.memory?'checked':''}> Remember explored map</label><label class="vtt-check"><input type="checkbox" data-vision-hint ${c.hint?'checked':''}> Faint map hint in unexplored areas</label><label class="vtt-check"><input type="checkbox" data-vision-collision ${c.collision?'checked':''}> Walls block player movement</label><label>DM fog opacity<input type="range" data-dm-opacity min="0" max="1" step=".05" value="${c.dmOpacity}"></label><button class="btn ghost" data-memory-reset>Reset explored map</button></div></details>`;
 view.querySelector('[data-fog-mode]').value=c.mode;
 const setting=(k,v)=>change(e=>e.config={...G.config(s),[k]:v});
 view.querySelector('[data-fog-mode]').onchange=e=>{cancelDraft();setting('mode',e.target.value)};
 for(const [attr,k]of [['vision-memory','memory'],['vision-hint','hint'],['vision-collision','collision']])view.querySelector('[data-'+attr+']').onchange=e=>setting(k,e.target.checked);
 view.querySelector('[data-dm-opacity]').onchange=e=>setting('dmOpacity',+e.target.value);
 view.querySelector('[data-memory-reset]').onclick=()=>{if(confirm('Clear everyone’s explored-map memory for this scene?'))change(e=>{e.config.memoryEpoch=crypto.randomUUID();e._explored=[]})};
 view.querySelector('[data-vision-preview]').onclick=()=>{window.ForgeVTTVision.togglePreview();lightingPanel(root,view)};
 const tools=view.querySelector('[data-lighting-tools]');
 if(c.mode==='manual'){
 tools.innerHTML=`<section class="vtt-editor-section"><h4>Reveal or cover terrain</h4><div class="vtt-pair"><label>Shape<select data-fog-shape>${[['brush','Brush'],['rect','Rectangle'],['polygon','Polygon']].map(([v,t])=>`<option value="${v}" ${fogShape===v?'selected':''}>${t}</option>`).join('')}</select></label>${field('Brush radius (px)','brush',brush,1,4096)}</div><div class="vtt-editor-actions"><button class="btn primary" data-fog-reveal>Reveal area</button><button class="btn ghost" data-fog-hide>Hide area</button></div><div class="vtt-editor-actions"><button class="btn ghost" data-fog-all="reveal">Reveal all</button><button class="btn ghost" data-fog-all="cover">Cover all</button></div></section>`;
 tools.querySelector('[data-fog-shape]').onchange=e=>fogShape=e.target.value;tools.querySelector('[name=brush]').onchange=e=>brush=Math.max(1,Math.min(4096,+e.target.value||64));
 for(const [attr,value]of [['fog-reveal',true],['fog-hide',false]])tools.querySelector('[data-'+attr+']').onclick=()=>{reveal=value;activate('fog')};
 tools.querySelectorAll('[data-fog-all]').forEach(b=>b.onclick=()=>change(e=>{e.config={...G.config(s),covered:b.dataset.fogAll==='cover'};e.fogOps=[]}));
 }else{
 tools.innerHTML=`<div class="vtt-editor-segments" role="group" aria-label="Lighting tools"><button class="btn ${section==='walls'?'chosen':'ghost'}" data-lighting-section="walls">Walls & doors</button><button class="btn ${section==='lights'?'chosen':'ghost'}" data-lighting-section="lights">Lights</button></div><section class="vtt-editor-section">${section==='walls'?`<div class="vtt-pair"><label>Type<select data-wall-type>${Object.entries(kinds).map(([v,t])=>`<option value="${v}" ${wallType===v?'selected':''}>${t}</option>`).join('')}</select></label><label>Shape<select data-wall-shape><option value="line" ${shape==='line'?'selected':''}>Line</option><option value="polygon" ${shape==='polygon'?'selected':''}>Polygon</option></select></label></div><button class="btn primary" data-wall-draw>Draw wall</button>`:`<label>Preset<select data-map-preset>${Object.entries(presets).map(([v,p])=>`<option value="${v}" ${preset===v?'selected':''}>${v} · ${p[0]} / ${p[1]}</option>`).join('')}</select></label><button class="btn primary" data-light-place>Place light</button><label>Ambient light<select data-vision-ambient>${['bright','dim','dark'].map(v=>`<option ${v===(s.settings?.lighting||'bright')?'selected':''}>${v}</option>`).join('')}</select></label>`}<div class="vtt-editor-actions"><button class="btn ghost" data-lighting-select>Select objects</button><button class="btn ghost" data-lighting-erase>Erase objects</button></div>${c.mode==='off'?'<p class="vtt-editor-note">You can prepare walls and lights now. Enable Dynamic vision to use them.</p>':''}</section>`;
 tools.querySelectorAll('[data-lighting-section]').forEach(b=>b.onclick=()=>{section=b.dataset.lightingSection;lightingPanel(root,view)});
 tools.querySelector('[data-wall-type]')?.addEventListener('change',e=>wallType=e.target.value);tools.querySelector('[data-wall-shape]')?.addEventListener('change',e=>shape=e.target.value);tools.querySelector('[data-map-preset]')?.addEventListener('change',e=>preset=e.target.value);
 tools.querySelector('[data-wall-draw]')?.addEventListener('click',()=>activate('wall'));tools.querySelector('[data-light-place]')?.addEventListener('click',()=>activate('light'));tools.querySelector('[data-lighting-select]').onclick=()=>activate('select');tools.querySelector('[data-lighting-erase]').onclick=()=>activate('erase');
 tools.querySelector('[data-vision-ambient]')?.addEventListener('change',e=>{const value=e.target.value;api().change(()=>s.settings={...s.settings,lighting:value,ambient:value==='dark'?0:value==='dim'?.3:1})});
 }
 selectionForm(view.querySelector('[data-lighting-selection]'));list(view.querySelector('[data-lighting-list]'));
}
function mountSidebar(root){
 const a=state();if(!a.dm)return;const aside=root.querySelector('.vtt-inspector'),setup=aside.querySelector('.vtt-setup-fold'),tokens=aside.querySelector('.vtt-token-fold'),layers=aside.querySelector('.vtt-stage-options'),close=aside.querySelector('.vtt-inspector-close');
 const header=document.createElement('div');header.className='vtt-sidebar-header';header.innerHTML='<div><span class="vtt-editor-eyebrow">DM WORKSPACE</span><strong>Scene controls</strong></div>';
 if(close){close.onclick=()=>{collapsed=true;const workspace=root.querySelector('.vtt-workspace');workspace.classList.remove('inspector-open');workspace.classList.add('inspector-collapsed')};close.textContent='×';close.setAttribute('aria-label','Close scene controls');header.append(close)}
 const tabs=document.createElement('div');tabs.className='vtt-sidebar-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Scene controls');tabs.innerHTML=['scene','tokens','lighting','layers'].map(v=>`<button type="button" role="tab" id="vtt-tab-${v}" data-sidebar-tab="${v}" aria-controls="vtt-view-${v}" aria-selected="${tab===v}">${v[0].toUpperCase()+v.slice(1)}</button>`).join('');
 const body=document.createElement('div');body.className='vtt-sidebar-body';
 for(const name of ['scene','tokens','lighting','layers']){const view=document.createElement('section');view.id='vtt-view-'+name;view.dataset.sidebarView=name;view.className='vtt-sidebar-scroll';view.setAttribute('role','tabpanel');view.setAttribute('aria-labelledby','vtt-tab-'+name);view.addEventListener('scroll',()=>scrolls[name]=view.scrollTop,{passive:true});body.append(view);const n={scene:setup,tokens,layers}[name];if(n){n.open=true;n.classList.add('vtt-sidebar-flat');view.append(n)}if(name==='lighting')lightingPanel(root,view);if(name==='scene')view.insertAdjacentHTML('afterbegin','<div class="vtt-editor-intro"><span class="vtt-editor-eyebrow">MAP & GRID</span><h3>Scene setup</h3><p class="vtt-editor-note">Map artwork, dimensions, grid and atmosphere.</p></div>');if(name==='tokens')view.insertAdjacentHTML('afterbegin','<div class="vtt-editor-intro"><span class="vtt-editor-eyebrow">CHARACTERS & CREATURES</span><h3>Tokens</h3></div>');if(name==='layers'){view.insertAdjacentHTML('afterbegin','<div class="vtt-editor-intro"><h3>Visibility & locks</h3><p class="vtt-editor-note">Show or lock map objects, tokens and drawings. Lighting objects are DM-only editing guides.</p></div>');const fold=view.querySelector('.vtt-layer-fold');if(fold)fold.open=true;}}
 root.querySelector('.vtt-workspace').classList.toggle('inspector-collapsed',collapsed);aside.replaceChildren(header,tabs,body);aside.classList.add('vtt-organized-inspector');
 tabs.querySelectorAll('[data-sidebar-tab]').forEach((b,i,buttons)=>{b.onclick=()=>showView(b.dataset.sidebarTab);b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].click();buttons[next].focus()}});
 showView(tab);const toggle=document.createElement('button');toggle.className='btn ghost vtt-controls-toggle';toggle.textContent='Controls';toggle.onclick=()=>open(tab);root.querySelector('.vtt-stage-tools').append(toggle);
 // Existing More actions keep their behavior but now switch the matching workspace view.
 root.querySelectorAll('.vtt-more-menu button').forEach(b=>{if(b.textContent==='Setup & tokens'){b.textContent='Scene setup';b.onclick=()=>{root.querySelector('.vtt-more').open=false;open('scene')}}});
 const more=root.querySelector('.vtt-more-menu');if(more){const b=document.createElement('button');b.className='btn ghost';b.textContent='Fog & lighting';b.onclick=()=>{root.querySelector('.vtt-more').open=false;open()};more.append(b)}
}
function point(event){const a=state(),r=a.root.querySelector('.vtt-world').getBoundingClientRect();return {x:Math.max(0,Math.min(a.scene.width,(event.clientX-r.left)/a.zoom)),y:Math.max(0,Math.min(a.scene.height,(event.clientY-r.top)/a.zoom))}}
function hitTest(p){
 const tolerance=10/state().zoom,all=objects();
 for(const o of [...all].reverse()){if(o.kind==='light'&&Math.hypot(o.item.x-p.x,o.item.y-p.y)<tolerance*1.5)return {...o,vertex:null};if(o.kind==='wall'){if(selected.has(o.id)){const vertex=o.item.points.findIndex(a=>Math.hypot(a.x-p.x,a.y-p.y)<tolerance);if(vertex>=0)return {...o,vertex}}const ps=o.item.points;for(let i=1;i<ps.length+(o.item.closed?1:0);i++)if(G.distanceSegment(p,ps[i-1],ps[i%ps.length])<=tolerance)return {...o,vertex:null}}}return null;
}
function intersects(o,box){
 const inBox=p=>p.x>=box.x&&p.x<=box.x+box.w&&p.y>=box.y&&p.y<=box.y+box.h;
 if(o.kind==='light')return inBox(o.item);
 const ps=o.item.points;if(ps.some(inBox))return true;const edges=[{x:box.x,y:box.y},{x:box.x+box.w,y:box.y},{x:box.x+box.w,y:box.y+box.h},{x:box.x,y:box.y+box.h}];
 for(let i=1;i<ps.length+(o.item.closed?1:0);i++)for(let j=0;j<4;j++)if(G.hit(ps[i-1],ps[i%ps.length],edges[j],edges[(j+1)%4])!==null)return true;return false;
}
function drawObject(cx,o,z){
 const isSelected=selected.has(o.id),item=drag?.draft?.get(o.id)||o.item;cx.save();cx.strokeStyle=isSelected?'#fff0a8':item.type==='secret'?'#ef94c7':item.state==='open'?'#86d8ae':item.type==='window'?'#7dcfff':'#a79aff';cx.lineWidth=(isSelected?4:2)/z;cx.setLineDash(item.type==='invisible'?[6/z,5/z]:[]);
 if(o.kind==='wall'){cx.beginPath();item.points.forEach((p,i)=>i?cx.lineTo(p.x,p.y):cx.moveTo(p.x,p.y));if(item.closed)cx.closePath();cx.stroke();if(isSelected)for(const p of item.points){cx.fillStyle='#242338';cx.fillRect(p.x-5/z,p.y-5/z,10/z,10/z);cx.strokeRect(p.x-5/z,p.y-5/z,10/z,10/z)}}
 else{cx.fillStyle=item.color||'#fff0c2';cx.beginPath();cx.arc(item.x,item.y,7/z,0,Math.PI*2);cx.fill();if(isSelected){cx.beginPath();cx.arc(item.x,item.y,13/z,0,Math.PI*2);cx.stroke();cx.globalAlpha=.3;cx.lineWidth=1/z;cx.beginPath();cx.arc(item.x,item.y,item.dim*G.scale(state().scene),0,Math.PI*2);cx.stroke()}}
 cx.restore();
}
function editorPaint(cx,a){
 if(a.dm&&lighting()&&!window.ForgeVTTVision.previewing)for(const o of objects())drawObject(cx,o,a.zoom);
 const ps=points.length?[...points,...(hover?[hover]:[])]:drag?.drawing;
 if(ps?.length){cx.save();cx.strokeStyle=reveal?'#80d8aa':'#ffa5b7';cx.lineWidth=2/a.zoom;cx.setLineDash([6/a.zoom,4/a.zoom]);cx.beginPath();ps.forEach((p,i)=>i?cx.lineTo(p.x,p.y):cx.moveTo(p.x,p.y));cx.stroke();cx.restore()}
 if(drag?.box){const b=drag.box;cx.save();cx.fillStyle='#b4a7ff25';cx.strokeStyle='#baa9ff';cx.lineWidth=1/a.zoom;cx.fillRect(b.x,b.y,b.w,b.h);cx.strokeRect(b.x,b.y,b.w,b.h);cx.restore()}
}
function targets(root){
 const world=root.querySelector('.vtt-world');world.querySelector('.vtt-lighting-targets')?.remove();if(!lighting()||window.ForgeVTTVision.previewing)return;
 const el=document.createElement('div');el.className='vtt-lighting-targets';
 for(const o of objects()){const item=o.item,p=o.kind==='light'?item:{x:(item.points[0].x+item.points[1].x)/2,y:(item.points[0].y+item.points[1].y)/2},b=document.createElement('button');b.className='vtt-lighting-target';b.dataset.lightingTarget=o.id;b.setAttribute('aria-label',label(o));b.setAttribute('aria-pressed',String(selected.has(o.id)));b.style.left=p.x*state().zoom+'px';b.style.top=p.y*state().zoom+'px';b.textContent=o.kind==='light'?'☼':'╱';b.title=label(o);b.onclick=e=>{if(e.detail===0)setSelection([o.id],e.shiftKey)};el.append(b)}world.append(el);
}
function toolbar(root){
 root.querySelector('.vtt-vision-tool-status')?.remove();const a=state();if(!a.dm||!lighting()&&!['fog','wall','light'].includes(a.tool))return;
 const isPolygon=a.tool==='wall'&&shape==='polygon'||a.tool==='fog'&&fogShape==='polygon';const n=document.createElement('div');n.className='vtt-vision-tool-status';n.innerHTML=`<span>${escape(a.tool==='fog'?(reveal?'Reveal':'Hide')+' · '+fogShape:a.tool==='wall'?'Draw '+kinds[wallType]+' · '+shape:a.tool==='light'?'Place '+preset:erase?'Erase · click a wall or light':'Lighting · select, move or delete objects')}</span>${isPolygon?'<button class="btn ghost" data-finish-polygon>Finish</button>':''}<button class="btn ghost" data-lighting-done>${a.tool==='select'?'Token layer':'Done'}</button>`;
 n.querySelector('[data-finish-polygon]')?.addEventListener('click',finishPolygon);n.querySelector('[data-lighting-done]').onclick=()=>{if(a.tool==='select')stage().setLayer('tokens');else cancel()};root.querySelector('.vtt-center').append(n);
}
function cancelDraft(){drag=null;points=[];hover=null;api().interaction(false);paint()}
function addFog(op){if(current().fogOps.length>=500){api().notify('Fog history is full. Reveal all or Cover all to reset it.');return}change(e=>e.fogOps.push(op))}
function addWall(ps,closed=false){if(ps.length<2||Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y)<1)return;if(current().walls.length>=500||current().walls.reduce((n,w)=>n+w.points.length,0)+ps.length>2000){api().notify('Wall limit reached. Delete unused walls first.');return}const w={id:crypto.randomUUID(),type:wallType,state:'closed',points:ps,closed};selected=new Set([id('wall',w)]);change(e=>e.walls.push(w))}
function finishPolygon(){const a=state(),min=a.tool==='wall'?3:3;if(points.length<min){api().notify('Add at least three corners.');return}const ps=points.slice();points=[];hover=null;if(a.tool==='wall')addWall(ps,true);else addFog({type:'polygon',points:ps,reveal});cancel()}
function mount(root){
 const a=state();activeRoot=root;
 const next=a.game.id+':'+a.scene.id;if(key!==next){key=next;selected.clear();cancelDraft();scrolls={};tab='scene'}
 for(const k of [...selected])if(!objects().some(o=>o.id===k))selected.delete(k);
 mountSidebar(root);targets(root);toolbar(root);
 const vp=root.querySelector('.vtt-viewport');
 vp.addEventListener('pointerdown',event=>{
 if(!state().dm||event.altKey||stage()?.space||!lighting()&&!['fog','wall','light'].includes(state().tool))return;
 const a=state(),p=point(event),hit=hitTest(p);
 if(event.button===2){if(hit){event.preventDefault();event.stopImmediatePropagation();setSelection([hit.id],event.shiftKey);open()}return}
 if(event.button!==0||!['select','lighting-erase','fog','wall','light'].includes(a.tool)||window.ForgeVTTVision.previewing)return;
 event.preventDefault();event.stopImmediatePropagation();vp.focus({preventScroll:true});
 if(a.tool==='light'){if(current().lights.length>=100){api().notify('Map light limit is 100.');return}const [bright,dim]=presets[preset],l={id:crypto.randomUUID(),...p,bright,dim,color:'#fff0c2',intensity:1,animation:'none',hidden:false};selected=new Set([id('light',l)]);change(e=>e.lights.push(l));return}
 if(a.tool==='wall'&&shape==='polygon'||a.tool==='fog'&&fogShape==='polygon'){if(points.length<128){const last=points.at(-1);if(!last||Math.hypot(last.x-p.x,last.y-p.y)>2)points.push(p)}hover=p;paint();return}
 if(a.tool==='wall'||a.tool==='fog'){drag={type:a.tool,a:p,points:[p],drawing:[p,p]};vp.setPointerCapture(event.pointerId);api().interaction(true);return}
 if(erase||a.tool==='lighting-erase'){if(hit){setSelection([hit.id]);deleteSelection()}return}
 if(hit){const already=selected.has(hit.id);if(!already||event.shiftKey)setSelection([hit.id],event.shiftKey);if(!selected.has(hit.id))return;drag={type:'objects',a:p,vertex:already&&selected.size===1?hit.vertex:null,hit:hit.id,original:new Map(chosen().map(o=>[o.id,C.clone(o.item)])),draft:new Map(),moved:false}}
 else{if(!event.shiftKey)selected.clear();drag={type:'box',a:p,base:new Set(selected),box:{x:p.x,y:p.y,w:0,h:0}};refreshSelection()}
 vp.setPointerCapture(event.pointerId);api().interaction(true);paint();
 },{capture:true});
 vp.addEventListener('pointermove',event=>{
 if(!drag){if(points.length){hover=point(event);paint()}return}event.preventDefault();event.stopImmediatePropagation();const p=point(event);
 if(drag.type==='objects'){
 let dx=p.x-drag.a.x,dy=p.y-drag.a.y;const s=state().scene;drag.moved=drag.moved||Math.hypot(dx,dy)*state().zoom>3;
 if(drag.vertex!==null){const original=drag.original.get(drag.hit),draft=C.clone(original);draft.points[drag.vertex]=p;drag.draft.set(drag.hit,draft)}
 else{const positions=[...drag.original.values()].flatMap(o=>o.points||[o]);dx=Math.max(-Math.min(...positions.map(p=>p.x)),Math.min(s.width-Math.max(...positions.map(p=>p.x)),dx));dy=Math.max(-Math.min(...positions.map(p=>p.y)),Math.min(s.height-Math.max(...positions.map(p=>p.y)),dy));for(const [k,original]of drag.original){const draft=C.clone(original);if(draft.points)draft.points=draft.points.map(p=>({x:p.x+dx,y:p.y+dy}));else{draft.x+=dx;draft.y+=dy}drag.draft.set(k,draft)}}
 }else if(drag.type==='box'){
 drag.box={x:Math.min(drag.a.x,p.x),y:Math.min(drag.a.y,p.y),w:Math.abs(p.x-drag.a.x),h:Math.abs(p.y-drag.a.y)};selected=new Set(drag.base);for(const o of objects())if(intersects(o,drag.box))selected.add(o.id);
 }else{if(drag.type==='fog'&&fogShape==='brush'&&drag.points.length<128&&Math.hypot(p.x-drag.points.at(-1).x,p.y-drag.points.at(-1).y)>3)drag.points.push(p);drag.drawing=drag.type==='fog'&&fogShape==='brush'?drag.points:[drag.a,p];if(drag.type==='fog'&&fogShape==='rect')drag.box={x:Math.min(drag.a.x,p.x),y:Math.min(drag.a.y,p.y),w:Math.abs(p.x-drag.a.x),h:Math.abs(p.y-drag.a.y)}}paint();
 },{capture:true});
 const end=event=>{
 if(!drag)return;event.stopImmediatePropagation();const d=drag;drag=null;api().interaction(false);
 if(event.type==='pointercancel'){if(d.base)selected=d.base;refreshSelection();paint();return}
 if(d.type==='objects'&&d.moved){change(()=>{for(const o of objects()){const value=d.draft.get(o.id);if(value)Object.assign(o.item,value)}})}
 else if(d.type==='wall')addWall([d.a,point(event)]);
 else if(d.type==='fog')addFog(fogShape==='rect'?{type:'rect',reveal,...(d.box||{x:d.a.x,y:d.a.y,w:0,h:0})}:{type:'brush',reveal,points:d.points,radius:brush});
 else{refreshSelection();if(d.type==='objects'&&!d.moved&&window.matchMedia('(max-width:700px)').matches)open()}paint();
 };
 vp.addEventListener('pointerup',end,{capture:true});vp.addEventListener('pointercancel',end,{capture:true});
 vp.addEventListener('dblclick',event=>{if(points.length){event.preventDefault();event.stopImmediatePropagation();finishPolygon()}},{capture:true});
}
document.addEventListener('keydown',event=>{
 const a=state();if(!a?.dm||!a.root?.isConnected||event.target.closest('input,select,textarea,[contenteditable=true]')||document.querySelector('dialog[open]'))return;
 if(event.key==='Escape'&&(drag||points.length)){event.preventDefault();event.stopImmediatePropagation();cancel();return}
 if(!lighting())return;
 if(['Delete','Backspace'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();deleteSelection()}
 else if(event.key==='Escape'){selected.clear();refreshSelection();paint()}
 else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)&&selected.size){event.preventDefault();event.stopImmediatePropagation();const dx=event.key==='ArrowLeft'?-a.scene.grid:event.key==='ArrowRight'?a.scene.grid:0,dy=event.key==='ArrowUp'?-a.scene.grid:event.key==='ArrowDown'?a.scene.grid:0;const ps=chosen().flatMap(o=>o.item.points||[o.item]);if(ps.some(p=>p.x+dx<0||p.y+dy<0||p.x+dx>a.scene.width||p.y+dy>a.scene.height))return;change(()=>{for(const o of chosen())if(o.kind==='wall')o.item.points=o.item.points.map(p=>({x:p.x+dx,y:p.y+dy}));else{o.item.x+=dx;o.item.y+=dy}})}
},{capture:true});
window.ForgeVTTLightingEditor={mount,paint:editorPaint,open,cancel,layerChanged,tokenSelected,redraw:()=>{if(activeRoot)targets(activeRoot)},hitTest,intersects};
})();
