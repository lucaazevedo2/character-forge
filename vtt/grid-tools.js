/* Automatic map-grid calibration uses the existing scene, offsets, undo and saves. */
(()=>{'use strict';const api=()=>window.ForgeTabletop,roots=new WeakSet();
function fitScene(s,{width,height,spacing,offsetX,offsetY}){
 const grid=Math.max(16,Math.min(256,Math.round(spacing))),scale=grid/spacing,w=Math.round(width*scale),h=Math.round(height*scale),rx=w/s.width,ry=h/s.height;
 const point=p=>{p.x*=rx;p.y*=ry;};
 for(const t of s.tokens||[])point(t);
 const shape=d=>{for(const k of ['x','w'])if(typeof d[k]==='number')d[k]*=rx;for(const k of ['y','h'])if(typeof d[k]==='number')d[k]*=ry;for(const p of d.points||[])point(p);if(typeof d.radius==='number')d.radius*=Math.min(rx,ry);};
 for(const d of s.drawings||[])shape(d);
 if(s.environment){for(const wall of s.environment.walls||[])for(const p of wall.points||[])point(p);for(const l of s.environment.lights||[])point(l);for(const f of s.environment.fogOps||[])shape(f);}
 s.width=w;s.height=h;s.grid=grid;s.settings={...s.settings,gridType:'square',offsetX:offsetX*scale,offsetY:offsetY*scale};s.snap=true;s.showGrid=true;
}
async function offer(){
 const q=api().state();if(!q.dm||!q.scene?.map)return;const source=q.scene.map,id=q.scene.id,gameId=q.game.id;
 const d=document.createElement('dialog');d.className='vtt-sheet-dialog vtt-grid-detect';d.setAttribute('aria-label','Detect map grid');
 d.innerHTML='<header><h2>Detect map grid</h2><button type="button" data-close aria-label="Close grid detection">×</button></header><main><p data-detect-status role="status">Analyzing the map’s repeating grid lines…</p><canvas aria-label="Detected grid alignment preview"></canvas><p class="hint">Automatic detection supports straight square grids. Check the purple overlay against the printed lines. You can still calibrate manually with two points in Grid & scene options.</p><div class="vtt-grid-detect-actions"><button type="button" data-cancel>Cancel</button><button type="button" data-apply disabled>Apply detected grid</button></div></main>';
 document.body.append(d);d.showModal();d.querySelector('[data-close]').onclick=d.querySelector('[data-cancel]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
 const status=d.querySelector('[data-detect-status]'),canvas=d.querySelector('canvas');
 try{
 const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('The map image could not load. Retry after restoring the image.'));i.src=source;});if(!d.isConnected)return;
 const ratio=Math.min(1,2048/Math.max(image.naturalWidth,image.naturalHeight)),work=document.createElement('canvas');work.width=Math.round(image.naturalWidth*ratio);work.height=Math.round(image.naturalHeight*ratio);const context=work.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,work.width,work.height);
 await new Promise(resolve=>requestAnimationFrame(resolve));if(!d.isConnected)return;
 const result=window.ForgeVTTGridDetection.analyze(context.getImageData(0,0,work.width,work.height).data,work.width,work.height,{min:Math.max(4,16*ratio),max:Math.min(512,512*ratio)});
 canvas.width=Math.min(760,work.width);canvas.height=Math.max(1,Math.round(work.height*canvas.width/work.width));const ctx=canvas.getContext('2d');ctx.drawImage(work,0,0,canvas.width,canvas.height);
 if(!result){status.textContent='No reliable square grid found. The map and grid have not changed. Use the manual two-point calibration for faint, angled, hexagonal or irregular grids.';return;}
 const spacing=result.spacing/ratio,offsetX=result.offsetX/ratio,offsetY=result.offsetY/ratio,preview=canvas.width/work.width;
 ctx.strokeStyle='#b49bff';ctx.lineWidth=1;ctx.beginPath();for(let x=result.offsetX*preview;x<canvas.width;x+=result.spacing*preview){ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);}for(let y=result.offsetY*preview;y<canvas.height;y+=result.spacing*preview){ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);}ctx.stroke();
 status.textContent=`Detected ${spacing.toFixed(1)} image pixels per cell · ${(image.naturalWidth/spacing).toFixed(1)} × ${(image.naturalHeight/spacing).toFixed(1)} cells · ${result.confidence>.65?'strong':'estimated'} match. Border offset: ${offsetX.toFixed(1)}, ${offsetY.toFixed(1)} px. Confirm the preview before applying.`;
 const apply=d.querySelector('[data-apply]');apply.disabled=false;apply.onclick=()=>{const now=api().state();if(!now.dm||now.game.id!==gameId||now.scene.id!==id||now.scene.map!==source){status.textContent='The map or scene changed. Close this preview and detect again.';apply.disabled=true;return;}api().change(()=>fitScene(now.scene,{width:image.naturalWidth,height:image.naturalHeight,spacing,offsetX,offsetY}));d.close();api().notify('Map grid matched. Use Undo to restore the previous alignment.');};
 }catch(e){if(d.isConnected)status.textContent=e.name==='SecurityError'?'This image cannot be analyzed locally. Import the map image file and retry.':e.message;}
}
function mount(root){
 const q=api().state();if(q.dm){const map=root.querySelector('[data-map]');if(map&&!root.querySelector('[data-detect-grid]')){const b=document.createElement('button');b.type='button';b.className='btn ghost';b.dataset.detectGrid='';b.textContent='Detect grid from map';b.disabled=!q.scene.map;b.onclick=offer;map.closest('label').after(b);}}
 if(roots.has(root))return;roots.add(root);root.addEventListener('pointerdown',e=>{if(e.button!==0||!e.shiftKey)return;const q=api().state(),id=e.target.closest('[data-token]')?.dataset.token,t=q.scene?.tokens.find(t=>t.id===id);if(!t||window.ForgeVTTStage&&!window.ForgeVTTStage.selectable(t))return;let link;try{link=JSON.parse(t.details?.notes||'{}');}catch{return;}if(!link.srdMonster&&!(link.creatureResource&&q.dm))return;e.preventDefault();e.stopImmediatePropagation();window.ForgeVTTSheets?.open(t);},{capture:true});
}
window.ForgeVTTGridTools={mount,offer,fitScene};
})();
