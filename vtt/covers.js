/* One cover editor for local and cloud campaigns; cloud access stays permission-checked. */
(() => {
'use strict';
const cache=new Map();let activeUser=null;
const safe=v=>typeof v==='string'&&v.length<=280000&&/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(v);
const connection=()=>window.ForgeCloud?.partyConnection()||{};
function account(){const id=connection().user?.id||null;if(id!==activeUser){cache.clear();activeUser=id}return id}
async function prepare(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10000000)throw Error('Choose a PNG, JPEG, or WebP image smaller than 10 MB.');
 const bitmap=await createImageBitmap(file);
 try{const canvas=document.createElement('canvas');canvas.width=960;canvas.height=480;const ctx=canvas.getContext('2d'),scale=Math.max(960/bitmap.width,480/bitmap.height),w=bitmap.width*scale,h=bitmap.height*scale;ctx.drawImage(bitmap,(960-w)/2,(480-h)/2,w,h);for(const q of [.85,.7,.5,.3]){const data=canvas.toDataURL('image/webp',q);if(safe(data))return data}throw Error('Image is too detailed. Choose a smaller image.')}finally{bitmap.close()}
}
async function readCloud(id,{refresh=false}={}){
 const uid=account(),conn=connection();if(uid&&!refresh&&cache.has(id))return cache.get(id);if(!uid)throw Error('Sign in to load campaign covers.');
 const {data,error}=await conn.client.from('forge_vtt_campaigns').select('cover_image').eq('id',id).single();
 if(error)throw error;if(account()!==uid)throw Error('Your account changed. Reopen the cover editor.');
 const image=safe(data.cover_image)?data.cover_image:null;cache.set(id,image);return image;
}
async function saveCloud(id,image){
 const uid=account();if(!uid)throw Error('Sign in to save a cloud cover.');
 const {error}=await connection().client.rpc('forge_vtt_set_cover',{p_id:id,p_image:image});if(error)throw error;
 if(account()!==uid)throw Error('Your account changed. Reopen the campaign.');cache.set(id,image);
}
function draw(card,image,local=false){
 if(local){const cover=card.querySelector('.vtt-cover');if(cover){const g=window.ForgeTabletop.localGames().find(g=>g.id===card.querySelector('[data-open]')?.dataset.open);cover.replaceChildren();const src=image||g?.scenes[0]?.map;if(src){const img=document.createElement('img');img.alt='';img.src=src;cover.append(img)}else{const span=document.createElement('span');span.textContent='⌖';cover.append(span)}}return}
 let img=card.querySelector('.vtt-cloud-cover');if(!image){img?.remove();return}if(!img){img=document.createElement('img');img.className='vtt-cloud-cover';img.alt='';card.prepend(img)}img.src=image;
}
async function editor(row,card,{local=false}={}){
 const uid=account();let image=local?row.coverImage||null:cache.get(row.id)||null,busy=false,preparing=false,sequence=0;
 const d=document.createElement('dialog');d.className='settings-dialog vtt-cloud-dialog';d.setAttribute('aria-label','Campaign cover image');
 d.innerHTML='<div class="settings-bar"><h2>Campaign cover</h2><button type="button" class="btn ghost" data-close>Close</button></div><div class="settings-body"><p>'+(local?'Saved with this local campaign and its backups.':'Visible to campaign members. Only a campaign DM can change it.')+'</p><img class="vtt-cover-preview" alt="Campaign cover preview"><label>Cover image<input type="file" accept="image/png,image/jpeg,image/webp" data-file></label><div class="toolbar"><button type="button" class="btn primary" data-save>Save cover</button><button type="button" class="btn ghost" data-remove>Remove cover</button></div><p role="status" data-status></p></div>';
 document.body.append(d);d.showModal();const preview=d.querySelector('img'),status=d.querySelector('[data-status]');
 const paint=()=>{preview.hidden=!image;if(image)preview.src=image;else preview.removeAttribute('src')};paint();
 const controls=()=>d.querySelectorAll('button,input').forEach(n=>n.disabled=busy||preparing);
 d.querySelector('[data-close]').onclick=()=>{if(!busy&&!preparing)d.close()};d.addEventListener('cancel',e=>{if(busy||preparing)e.preventDefault()});d.addEventListener('close',()=>d.remove());
 if(!local){preparing=true;controls();try{image=await readCloud(row.id,{refresh:true});paint()}catch(e){status.textContent=e.message;d.querySelector('[data-save]').disabled=true;d.querySelector('[data-remove]').disabled=true;d.querySelector('[data-close]').disabled=false;return}finally{preparing=false}controls()}
 d.querySelector('[data-file]').onchange=async e=>{if(!e.target.files[0])return;const seq=++sequence;preparing=true;controls();status.textContent='Preparing image…';try{const prepared=await prepare(e.target.files[0]);if(seq!==sequence||!d.isConnected)return;image=prepared;paint();status.textContent='Ready to save.'}catch(e){status.textContent=e.message}finally{if(seq===sequence){preparing=false;controls()}}};
 const save=async value=>{if(busy||preparing)return;if(!local&&account()!==uid){status.textContent='Your account changed. Reopen the editor.';return}busy=true;controls();try{if(local)await window.ForgeTabletop.setLocalCover(row.id,value);else await saveCloud(row.id,value);if(card?.isConnected)draw(card,value,local);d.close()}catch(e){status.textContent=e.message||'Could not save cover.'}finally{busy=false;controls()}};
 d.querySelector('[data-save]').onclick=()=>save(image);d.querySelector('[data-remove]').onclick=()=>save(null);
}
function localGallery(el,games){for(const g of games){const card=el.querySelector('[data-open="'+g.id+'"]')?.closest('article');if(!card||card.querySelector('[data-edit-cover]'))continue;const b=document.createElement('button');b.type='button';b.className='btn ghost vtt-cover-edit';b.dataset.editCover='';b.textContent='Cover image';b.onclick=()=>editor(g,card,{local:true});card.querySelector('[data-open]').parentElement.append(b)}}
async function paint(panel){
 const uid=account(),conn=connection();if(!uid)return;const rows=window.ForgeVTTCloud.rows();
 for(const row of rows){const card=panel.querySelector('[data-cloud-open="'+row.id+'"]')?.closest('article');if(!card)continue;draw(card,cache.get(row.id));if(row.role==='dm'&&!card.querySelector('[data-edit-cover]')){const b=document.createElement('button');b.type='button';b.className='btn ghost vtt-cover-edit';b.dataset.editCover='';b.textContent='Cover image';b.onclick=()=>editor(row,card);card.lastElementChild.append(b)}}
 if(!rows.length)return;
 const {data,error}=await conn.client.from('forge_vtt_campaigns').select('id,cover_image').in('id',rows.map(r=>r.id));if(error||uid!==account()||!panel.isConnected)return;
 for(const row of data||[]){cache.set(row.id,safe(row.cover_image)?row.cover_image:null);const card=panel.querySelector('[data-cloud-open="'+row.id+'"]')?.closest('article');if(card)draw(card,cache.get(row.id))}
}
function map(el,game){if(game._cloud&&game._cloud.role!=='dm')return;const menu=el.querySelector('.vtt-more-menu');if(!menu||menu.querySelector('[data-edit-cover]'))return;const b=document.createElement('button');b.type='button';b.className='btn ghost';b.dataset.editCover='';b.textContent='Campaign cover';b.onclick=()=>editor(game,null,{local:!game._cloud});menu.append(b)}
window.ForgeVTTCovers={paint,prepare,localGallery,map,readCloud,saveCloud};
})();
