/* Same-origin TV popout: only player-rendered pixels and nonprivate camera coordinates. */
(()=>{'use strict';const C=window.ForgeVTTPresentationCore,api=()=>window.ForgeTabletop;let child=null,target=null,timer=null,view=null,channel='',lastScene='',lastFrame=0;const pings=[];
function ping(p){const q=api().state();if(q?.scene&&p.sceneId===q.scene.id&&Number.isFinite(p.x)&&Number.isFinite(p.y)){if(!pings.some(x=>x.sceneId===p.sceneId&&x.x===p.x&&x.y===p.y&&Date.now()-x.at<100))pings.push({...p,at:Date.now()});window.ForgeVTTStage?.invalidate();}}
function paintOverlays(ctx,s,q){const now=Date.now();for(let i=pings.length-1;i>=0;i--){const p=pings[i];if(now-p.at>2200){pings.splice(i,1);continue;}if(p.sceneId!==s.id)continue;ctx.save();ctx.strokeStyle='#dfc173';ctx.lineWidth=3/q.zoom;ctx.globalAlpha=1-(now-p.at)/2200;ctx.beginPath();ctx.arc(p.x,p.y,(12+(now-p.at)/45)/q.zoom,0,Math.PI*2);ctx.stroke();ctx.restore();}if(pings.length&&!q.presenter)window.ForgeVTTStage?.invalidate();}
function camera(q,w,h){const vp=q.root.querySelector('.vtt-viewport');if(lastScene!==q.scene.id){view=null;lastScene=q.scene.id;}const z=view?.zoom||Math.min(w/vp.clientWidth,h/vp.clientHeight)*q.zoom;return {zoom:z,x:view?.x??vp.scrollLeft/q.zoom-(w/z-vp.clientWidth/q.zoom)/2,y:view?.y??vp.scrollTop/q.zoom-(h/z-vp.clientHeight/q.zoom)/2};}
function stop(){clearInterval(timer);timer=null;target?.remove();target=null;view=null;}
function send(m){if(child&&!child.closed)child.postMessage({...m,channel},location.origin);}
function combat(s){const c=window.ForgeVTTPlay?.presenterCombat();if(!c?.activeTokenId)return null;const ids=new Set(s.tokens.map(t=>t.id));return {...c,entries:c.entries.filter(e=>ids.has(e.tokenId))};}
function frame(){
 if(!child||child.closed){stop();return;}const q=api().state();if(!q?.game||!q.dm||!q.scene){send({type:'pause'});return;}if(!child.ForgeTVPresenter||Date.now()-lastFrame<45)return;lastFrame=Date.now();
 try{
  const w=Math.max(320,Math.min(2560,child.innerWidth||1280)),h=Math.max(200,Math.min(1440,child.innerHeight||720)),cam=camera(q,w,h),s=C.project(q.scene),vp={clientWidth:w,clientHeight:h,scrollLeft:cam.x*cam.zoom,scrollTop:cam.y*cam.zoom};
  if(!target){target=document.createElement('canvas');target.hidden=true;document.body.append(target);}
  const state={...q,scene:s,dm:false,presenter:true,root:{querySelector:()=>vp},zoom:cam.zoom,selection:new Set([...q.selection].filter(id=>s.tokens.some(t=>t.id===id))),previews:q.previews};
  window.ForgeVTTStage.renderPresenter(target,state);
  child.ForgeTVPresenter.frame(target,{channel,camera:cam,grid:s.grid,sceneId:s.id,combat:combat(s),settings:{offsetX:s.settings?.offsetX||0,offsetY:s.settings?.offsetY||0,gridType:s.settings?.gridType||'square'}});
 }catch(e){send({type:'pause',message:'Presenter is reconnecting…'});}
}
function open(){if(child&&!child.closed){child.focus();return;}channel=crypto.randomUUID();child=window.open(new URL('vtt/presenter.html#'+channel,document.baseURI),'forge-presenter','popup,width=1280,height=720');if(!child){api().notify('Allow popups for this site, then click TV presenter again.');return;}lastScene='';timer=setInterval(frame,50);api().notify('Move the presenter window to your TV. Click Pan in that window to resume following the main map after exploring.');}
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==child||e.data?.channel!==channel)return;const q=api().state(),m=e.data;if(!q?.dm||!q.scene)return;if(m.type==='ready'){frame();return;}if(m.type==='follow'){view=null;return;}if(m.type==='camera'&&[m.x,m.y,m.zoom].every(Number.isFinite)){view={x:Math.max(-q.scene.width,Math.min(q.scene.width,m.x)),y:Math.max(-q.scene.height,Math.min(q.scene.height,m.y)),zoom:Math.max(.05,Math.min(4,m.zoom))};return;}if(m.sceneId!==q.scene.id)return;
 if(m.type==='measure'&&[m.x,m.y,m.x2,m.y2].every(v=>Number.isFinite(v)&&v>=-128000&&v<=128000)){const p={clientId:'tv-presenter',sceneId:q.scene.id,x:m.x,y:m.y,x2:m.x2,y2:m.y2,shape:'ruler',points:Array.isArray(m.points)?m.points.slice(0,2048).filter(v=>Number.isFinite(v.x)&&Number.isFinite(v.y)):[],color:'#d9c36d',width:5};window.ForgeVTTStage.receiveMeasure(p);if(q.game._cloud)window.ForgeVTTCloud.roomSend('measure',p).catch(()=>{});}
 else if(m.type==='ping'&&Number.isFinite(m.x)&&Number.isFinite(m.y)){const p={sceneId:q.scene.id,x:Math.max(0,Math.min(q.scene.width,m.x)),y:Math.max(0,Math.min(q.scene.height,m.y))};ping(p);if(q.game._cloud)window.ForgeVTTCloud.roomSend('ping',p).catch(()=>{});}
});
function mount(root){window.ForgeVTTCampaignCharacters?.mount();const q=api().state();if(!q.dm)return;const menu=root.querySelector('.vtt-more-menu');if(menu&&!menu.querySelector('[data-presenter]')){const b=document.createElement('button');b.type='button';b.className='btn ghost';b.dataset.presenter='';b.textContent='TV presenter ↗';b.onclick=open;menu.append(b);}}
setInterval(()=>{const q=api().state();if(q?.dm&&C.syncBloodied(q.scene))api().saveCloud();},750);
window.addEventListener('pagehide',()=>{send({type:'pause',message:'Main tabletop closed. Reopen TV presenter from the tabletop.'});stop();});
window.ForgeVTTPresentation={mount,open,ping,paintOverlays};
})();
