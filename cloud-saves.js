/* Character Forge optional Supabase adapter. Guest storage stays independent. */
(() => {
'use strict';
const cfg=window.FORGE_CLOUD_CONFIG||{}, bucket='character-portraits';
const copy=x=>JSON.parse(JSON.stringify(x)), signature=x=>JSON.stringify(x);
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let client=null,user=null,records={},timer=null,busy=false,epoch=0,ready=false,message='',lastRefresh=0,blocked=false;
function uuid(){if(crypto.randomUUID)return crypto.randomUUID();return "10000000-1000-4000-8000-100000000000".replace(/[018]/g,c=>(Number(c)^crypto.getRandomValues(new Uint8Array(1))[0]&15>>Number(c)/4).toString(16))}
let tab;
try{tab=sessionStorage.getItem('forge-cloud-tab')||uuid();sessionStorage.setItem('forge-cloud-tab',tab)}catch{tab=uuid()}
const prefix=uid=>'forge-account:'+uid+':';
const stateKey=()=>prefix(user.id)+tab+':state';
const cacheKey=()=>prefix(user.id)+'latest';
const key=k=>user&&['forge-chars','forge-custom','forge-recovery-v1'].includes(k)?prefix(user.id)+tab+':'+k:k;
const read=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k))??fallback}catch{return fallback}};
function write(k,v){localStorage.setItem(k,JSON.stringify(v))}
function pending(){return Object.values(records).some(r=>r.dirty)}
function report(text){message=text;paint()}
function persist(){if(!user)return;const bundle={records,chars:read(key('forge-chars'),[]),custom:read(key('forge-custom'),{})};write(stateKey(),bundle);write(cacheKey(),bundle)}
function library(){return typeof CUSTOM==='object'?copy(CUSTOM):{}}
function envelope(c){if(typeof sheetConditionState==='function')sheetConditionState(c);return {schema_version:1,character:copy({...c,schema_version:1}),homebrew:library(),_party:window.ForgeParty?.summary(c)||{}}}
function isGuest(){return user?.is_anonymous===true}
function mirrorGuest(list){
 if(!isGuest())return;
 const linkedKey=prefix(user.id)+'guest-linked',linked=new Set([...read(linkedKey,[]),...list.map(c=>c.id)]),originals=read('forge-chars',null)||read('toa-chars',[])||[];
 write('forge-chars',[...originals.filter(c=>!linked.has(c.id)),...copy(list)]);write(linkedKey,list.map(c=>c.id));
 const originalLibrary=read('forge-custom',{}),current=library();for(const [kind,items] of Object.entries(current))if(Array.isArray(items)){originalLibrary[kind]||=[];for(const item of items){const id=item.id||item.index,idx=originalLibrary[kind].findIndex(x=>(x.id||x.index)===id);if(idx<0)originalLibrary[kind].push(item);else originalLibrary[kind][idx]=item}}write('forge-custom',originalLibrary);
}
async function startGuestDM(name){
 if(!client)throw Error('Guest parties are unavailable.');
 name=String(name||'').trim();if(!name||name.length>60)throw Error('Enter a display name of 1–60 characters.');
 if(!user){const {data,error}=await client.auth.signInAnonymously({options:{data:{full_name:name}}});if(error)throw error;await switchUser(data.user)}
}
async function startGuestSession(name,characterId=null){
 if(!client)throw Error('Guest parties are unavailable. Try again when connected.');
 if(user&&!isGuest())throw Error('You are already signed in. Join using your current account.');
 name=String(name||'').trim();if(!name||name.length>60)throw Error('Enter a display name of 1–60 characters.');
 const guests=copy(chars),selected=characterId?guests.find(c=>c.id===characterId):null,guestLibrary=library();
 if(!selected)throw Error('Choose a character from this browser before joining a party.');
 if(!user){const {data,error}=await client.auth.signInAnonymously({options:{data:{full_name:name}}});if(error)throw Error(/anonymous|disabled/i.test(error.message||'')?'Guest joining is not enabled yet. Please try again shortly.':error.message||'Guest session could not start.');if(!data?.user)throw Error('Guest session could not start.');await switchUser(data.user)}
 if(selected&&!chars.some(c=>c.id===selected.id)){CUSTOM=mergeLibraries([{data:{homebrew:guestLibrary}}]);write(key('forge-custom'),CUSTOM);applyCustom();chars.push(selected);await storeSet('forge-chars',chars)}
 await sync();if(pending())throw Error('Your character is saved here. Reconnect and sync it before joining.');
 return selected?records[selected.id]?.id:null;
}
function capture(list){
 if(!user||blocked)return;
 const current=new Set(list.map(c=>c.id));
 for(const c of list){
  const data=envelope(c);let r=records[c.id];
  if(!r)r=records[c.id]={id:uuid(),revision:0,data,dirty:true,deleted:false};
  if(signature(r.data)!==signature(data)||r.deleted){r.data=data;r.deleted=false;r.dirty=true}
 }
 for(const [id,r] of Object.entries(records))if(!current.has(id)&&!r.deleted){r.deleted=true;r.dirty=true}
 try{mirrorGuest(list);persist()}catch{report('Browser storage is full. Export your characters before closing.')}queue()
}
function queue(delay=2000){clearTimeout(timer);if(user&&!blocked)timer=setTimeout(()=>sync(),delay);paint()}
function setWorkspace(list,custom){
 chars=list;if(custom){CUSTOM=custom;write(key('forge-custom'),custom);applyCustom()}
 write(key('forge-chars'),chars);
 if(draft){draft=chars.find(c=>c.id===draft.id)||null;if(!draft){view='home';activeId=null;editingCreation=false;editSnapshot=null}}
 render();
}
function mergeLibraries(rows){
 const result=library();
 for(const row of rows){const lib=row.data?.homebrew||{};for(const [kind,items] of Object.entries(lib))if(Array.isArray(items)){
  result[kind]||=[];
  for(const item of items){const id=item.id||item.index;if(!result[kind].some(x=>(x.id||x.index)===id))result[kind].push(item)}
 }}return result;
}
async function portraitOut(data,cloudId){
 const out=copy(data),avatar=out.character.avatar;delete out.character.avatar;
 if(!avatar)return out;
 if(!validCharacterAvatar(avatar))throw Error('Invalid portrait. Replace or remove it before syncing.');
 const response=await fetch(avatar),blob=await response.blob();if(blob.size>524288)throw Error('Portrait is too large. Upload it again to resize it.');
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));
 const hash=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 const ext=blob.type==='image/png'?'png':blob.type==='image/jpeg'?'jpg':'webp';
 const path=user.id+'/'+cloudId+'/'+hash+'.'+ext;
 const {error}=await client.storage.from(bucket).upload(path,blob,{contentType:blob.type,upsert:false});
 if(error&&String(error.statusCode)!=='409'&&!/already exists|duplicate/i.test(error.message||''))throw error;
 out.portrait_path=path;return out;
}
async function portraitIn(row){
 const data=copy(row.data);
 if(data.schema_version!==1||!data.character)throw Error('This save needs a newer Character Forge version.');
 const c=data.character;
 if(data.portrait_path){
  if(!data.portrait_path.startsWith(user.id+'/'+row.id+'/'))throw Error('Invalid portrait location.');
  const {data:blob,error}=await client.storage.from(bucket).download(data.portrait_path);if(error)throw error;
  c.avatar=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
  if(!validCharacterAvatar(c.avatar))throw Error('Unsupported portrait format.');
 }
 c.id=row.local_id;return {...data,character:c};
}
function currentList(){return Object.values(records).filter(r=>!r.deleted).map(r=>copy(r.data.character))}
async function refresh(){
 if(!user||busy||blocked||editingCreation)return;busy=true;const generation=epoch;
 try{
  const {data:rows,error}=await client.from('characters').select('id,local_id,name,data,revision,updated_at,deleted_at').order('updated_at',{ascending:false});if(error)throw error;
  const remoteIds=new Set();
  for(const row of rows){
   if(generation!==epoch)return;remoteIds.add(row.local_id);const local=records[row.local_id];
   if(local?.dirty){if(local.revision!==Number(row.revision))local.conflict=row;continue}
   if(local&&local.revision===Number(row.revision))continue;
   const data=await portraitIn(row);if(generation!==epoch)return;
   records[row.local_id]={id:row.id,revision:Number(row.revision),data,dirty:false,deleted:!!row.deleted_at,deleted_at:row.deleted_at,updated_at:row.updated_at};
  }
  // A server-side purge must not silently recreate a character from stale cache.
  for(const [id,r] of Object.entries(records))if(!remoteIds.has(id)&&r.revision>0){if(r.dirty)r.conflict={missing:true};else delete records[id]}
  if(generation!==epoch)return;
  // Do not replace an in-progress creation edit; it will save against its old revision.
  if(!editingCreation)setWorkspace(currentList(),mergeLibraries(rows));
  persist();lastRefresh=Date.now();message='';
 }catch(error){if(generation===epoch)message='Cloud unavailable. Local edits are safe; retry when connected.'}
 finally{busy=false;paint();if(generation!==epoch&&user)setTimeout(()=>refresh(),0)}
}
async function sync(){
 if(!user||busy||blocked)return;if(!navigator.onLine){report('Offline · edits saved on this device');return}
 busy=true;const generation=epoch;
 try{
  for(const [localId,r] of Object.entries(records)){
   if(!r.dirty||r.conflict)continue;
   const sent=copy(r.data),deleting=r.deleted,expected=r.revision;
   const payload=await portraitOut(sent,r.id);if(generation!==epoch)return;
   const {data,error}=await client.rpc('save_character',{p_id:r.id,p_local_id:localId,p_expected_revision:expected,p_data:payload,p_deleted:deleting});
   if(error)throw error;if(generation!==epoch)return;
   if(data.status==='conflict'){r.conflict=data.row;message='Another device changed a character. Review the conflict.'}
   else if(data.status==='missing'){r.conflict={missing:true};message='A cloud character was permanently removed. Save your edits as a copy.'}
   else if(data.status==='saved'){
    r.id=data.row.id;r.revision=Number(data.row.revision);r.updated_at=data.row.updated_at;r.deleted_at=data.row.deleted_at;
    r.dirty=signature(r.data)!==signature(sent)||r.deleted!==deleting;
    if(deleting)window.ForgeParty?.refresh(true);
   }else throw Error('Unexpected cloud response');
   persist();
  }
  if(!Object.values(records).some(r=>r.conflict))message='';
 }catch(error){if(generation===epoch){message=(error.status===401||error.code==='PGRST301')?'Sign in again to sync. Your edits are saved locally.':'Cloud save failed. Edits remain on this device. Retry or export a backup.';console.warn('Character Forge cloud save failed',error.code||error.status||'network')}}
 finally{busy=false;paint();if(generation!==epoch&&user)setTimeout(()=>refresh(),0);if(user&&pending()&&!message&&!Object.values(records).some(r=>r.conflict))queue()}
}
async function switchUser(next){
 if(next?.id===user?.id)return;
 epoch++;clearTimeout(timer);
 user=next||null;records={};blocked=false;message='';
 if(user){
  const saved=read(stateKey(),null)||read(cacheKey(),null);
  if(saved){records=saved.records||{};write(key('forge-chars'),saved.chars||[]);write(key('forge-custom'),saved.custom||{})}
  else{write(key('forge-chars'),[]);write(key('forge-custom'),{})}
 }
 {
  draft=null;view='home';activeId=null;editingCreation=false;editSnapshot=null;
  const custom=read(key('forge-custom'),{});CUSTOM={races:[],classes:[],subs:[],bgs:[],spells:[],items:[],...custom};applyCustom();
  chars=read(key('forge-chars'),[])||[];if(ready)render();
 }
 paint();window.ForgeParty?.accountChanged();if(user){await refresh();if(pending())queue(100)}
}
async function initialize(){
 if(!cfg.enabled||!cfg.supabaseUrl||!cfg.publishableKey){message='Cloud saves are being connected. Your characters still save in this browser.';return}
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.supabaseUrl))throw Error('Invalid Supabase configuration');
 client=window.supabase.createClient(cfg.supabaseUrl,cfg.publishableKey,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true,storageKey:'forge-auth'}});
 client.auth.onAuthStateChange((event,session)=>{setTimeout(()=>switchUser(session?.user||null),0)});
 const {data,error}=await client.auth.getSession();if(error)message='Sign-in could not be restored. Continue as a guest or try again.';
 await switchUser(data?.session?.user||null);
}
function mount(){ready=true;paint();window.ForgeParty?.accountChanged()}
const googleMark=`<svg class="google-mark" viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.87 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;
function cloudStatus(){return message||(isGuest()?'Guest party session · this browser':null)||(busy?'Syncing…':pending()?'Saved on this device · cloud changes pending':user?'Saved to cloud':'Guest · saved in this browser')}
function profileName(){return String(user?.user_metadata?.full_name||user?.user_metadata?.name||user?.email?.split('@')[0]||'Adventurer')}
function profileAvatar(){
 if(isGuest())return null;
 const value=user?.user_metadata?.avatar_url||user?.user_metadata?.picture;
 try{const url=new URL(value);return url.protocol==='https:'&&/(^|\.)googleusercontent\.com$/.test(url.hostname)?url.href:null}catch{return null}
}
function profileHTML(){const photo=profileAvatar();const initials=profileName().trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();return `<span class="cloud-profile-initials" aria-hidden="true">${escape(initials)}</span>${photo?`<img src="${escape(photo)}" alt="" referrerpolicy="no-referrer" class="cloud-profile-image">`:''}`}
function bindProfileImages(root){root.querySelectorAll('.cloud-profile-image').forEach(img=>{img.onerror=()=>img.remove()})}
function paint(){
 if(!ready||!document.querySelector('header.masthead'))return;
 let panel=document.getElementById('forgeAccount');
 if(!panel){panel=document.createElement('div');panel.id='forgeAccount';panel.className='forge-account';panel.setAttribute('aria-label','Account');document.querySelector('header.masthead').append(panel)}
 const conflicts=Object.values(records).filter(r=>r.conflict).length;
 panel.innerHTML=user?`<button type="button" class="cloud-account-button cloud-avatar-trigger" data-cloud="account" aria-label="Open account menu for ${escape(profileName())}${conflicts?' · conflicts need review':''}" aria-haspopup="dialog" title="${escape(profileName()+' · '+cloudStatus())}">${profileHTML()}<span class="cloud-account-dot ${conflicts||message?'needs-attention':''}" aria-hidden="true"></span></button>`:`<button type="button" class="google-signin-button" data-cloud="login" title="${client?'Sign in with Google':'Google sign-in setup is in progress'}" aria-label="Sign in with Google">${googleMark}<span>Sign in with Google</span></button>`;
 bindProfileImages(panel);
 panel.querySelectorAll('[data-cloud]').forEach(b=>b.onclick=()=>act(b.dataset.cloud));
 document.getElementById('forgeCloudStatus')?.remove();
}
function account(){
 const conflicts=Object.values(records).filter(r=>r.conflict).length;
 const paths={import:'M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5',sync:'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1',trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',export:'M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5',signout:'M9 4H4v16h5m5-12 4 4-4 4m-6-4h13',conflicts:'m12 3 10 18H2L12 3zm0 6v5m0 3v1'};
 const row=(action,title,desc)=>`<button type="button" class="cloud-menu-row" data-cloud="${action}"><span class="cloud-menu-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[action]}"></path></svg></span><span class="cloud-menu-copy"><strong>${title}</strong><small>${desc}</small></span><span class="cloud-menu-arrow" aria-hidden="true">›</span></button>`;
 const box=dialog('Your account',`<div class="cloud-profile-header"><div class="cloud-profile-large">${profileHTML()}</div><div><h3>${escape(profileName())}</h3><p class="cloud-profile-email">${escape(isGuest()?'Guest · this browser only':user.email||'Signed in with Google')}</p><span class="cloud-sync-pill" role="status"><i aria-hidden="true"></i>${escape(cloudStatus())}</span></div></div><div class="cloud-menu-list">${conflicts?row('conflicts','Review changes',`${conflicts} character${conflicts===1?'':'s'} need your attention`):''}${row('import','Import guest characters','Bring characters from this browser into your account')}${row('sync','Sync now','Check for the latest changes across your devices')}${row('trash','Trash','Restore recently deleted characters')}${row('export','Export all characters','Download a JSON backup of your collection')}</div><div class="cloud-menu-footer">${isGuest()?'<p class="hint">Your guest identity belongs to this browser. Export a backup before clearing browser data. Signing in with Google opens a separate account; you can import the character copies kept here and rejoin your party.</p>'+row('login','Sign in with Google','Open your Google account workspace'):''}${row('signout',isGuest()?'End guest session':'Sign out','Return to your local characters')}${isGuest()?'':'<button type="button" class="cloud-delete-link" data-cloud="delete">Delete account</button>'}</div>`);
 box.classList.add('cloud-account-dialog');bindProfileImages(box);
 box.querySelectorAll('[data-cloud]').forEach(b=>b.onclick=()=>{const action=b.dataset.cloud;box.close();act(action)});
}

function dialog(title,html){
 document.getElementById('cloudDialog')?.remove();const box=document.createElement('dialog');box.id='cloudDialog';box.className='settings-dialog cloud-dialog';box.setAttribute('aria-label',title);
 box.innerHTML=`<div class="settings-bar"><h2>${escape(title)}</h2><button class="btn ghost cloud-dialog-close" data-close aria-label="Close account dialog"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div class="settings-body">${html}<p data-status role="status"></p></div>`;
 document.body.append(box);box.querySelector('[data-close]').onclick=()=>box.close();box.addEventListener('close',()=>box.remove());box.showModal();return box;
}
function exportAll(){downloadJSON({schema_version:1,exported_at:new Date().toISOString(),characters:chars.map(c=>({...copy(c),schema_version:1})),homebrew:library()},'character-forge-all-characters.json')}
function guestImport(){
 const guests=read('forge-chars',null)||read('toa-chars',[])||[],guestLibrary=read('forge-custom',{});
 const box=dialog('Import guest characters',`<p>Choose characters from this browser to add to your account. Nothing is uploaded until you choose Import. Guest originals stay on this device.</p>${guests.length?guests.map((c,i)=>`<label class="cloud-check"><input type="checkbox" value="${i}" ${records[c.id]?'disabled':''}> <span>${escape(c.name||'Unnamed character')}${records[c.id]?' · already imported':''}</span></label>`).join(''):'<p>No guest characters were found in this browser.</p>'}<button class="btn primary" data-import>Import selected</button>`);
 box.querySelector('[data-import]').onclick=()=>{
  const selected=[...box.querySelectorAll('input:checked')].map(el=>guests[+el.value]);
  const merged=mergeLibraries([{data:{homebrew:guestLibrary}}]);CUSTOM=merged;write(key('forge-custom'),merged);applyCustom();
  for(const c of selected)if(!records[c.id])chars.push(copy(c));
  storeSet('forge-chars',chars);box.close();render();
 };
}
function trash(){
 const list=Object.entries(records).filter(([,r])=>r.deleted);
 const box=dialog('Trash',`<p>Deleted cloud characters can be restored for 30 days after deletion syncs. Local recovery snapshots are managed separately.</p>${list.length?list.map(([id,r])=>`<div class="cloud-trash-row"><span>${escape(r.data.character.name||'Unnamed character')}<small>${r.deleted_at?'Deleted '+escape(new Date(r.deleted_at).toLocaleDateString()):'Deletion waiting to sync'}</small></span><button class="btn ghost" data-restore="${escape(id)}">Restore</button></div>`).join(''):'<p>Your Trash is empty.</p>'}`);
 box.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>{const r=records[b.dataset.restore];if(r.deleted_at&&Date.now()-Date.parse(r.deleted_at)>30*86400000){box.querySelector('[data-status]').textContent='This character’s recovery period has expired.';return}r.deleted=false;r.dirty=true;setWorkspace(currentList());persist();queue();box.close()});
}
function conflicts(){
 const list=Object.entries(records).filter(([,r])=>r.conflict);
 const box=dialog('Resolve cloud changes',list.length?'<p>Another tab or device saved changes first. Both versions are kept until you choose. “Keep mine” replaces the cloud version only if it has not changed again.</p>'+list.map(([id,r])=>`<div class="cloud-conflict"><h3>${escape(r.data.character.name||'Unnamed character')}</h3><p>Mine: ${r.deleted?'in Trash':'active'} · cloud: ${r.conflict.missing?'permanently removed':r.conflict.deleted_at?'in Trash':'revision '+r.conflict.revision}</p><div class="cloud-actions">${r.conflict.missing?'':`<button class="btn ghost" data-choice="mine" data-id="${escape(id)}">Keep mine</button>`}<button class="btn ghost" data-choice="theirs" data-id="${escape(id)}">${r.conflict.missing?'Discard local changes':'Keep theirs'}</button><button class="btn primary" data-choice="copy" data-id="${escape(id)}">Save mine as a copy</button><button class="btn ghost" data-choice="export" data-id="${escape(id)}">Export mine</button></div></div>`).join(''):'<p>No unresolved conflicts.</p>');
 box.querySelectorAll('[data-choice]').forEach(b=>b.onclick=async()=>{
  const r=records[b.dataset.id],remote=r.conflict;try{
   if(b.dataset.choice==='export'){downloadJSON(r.data.character,'character-local-backup.json');return}
   if(b.dataset.choice==='copy'){const c=copy(r.data.character);c.id='c'+uuid();c.name=(c.name||'Character')+' (copy)';records[c.id]={id:uuid(),revision:0,data:{...copy(r.data),character:c},dirty:true,deleted:false}}
   if(b.dataset.choice==='mine'){r.id=remote.id;r.revision=Number(remote.revision);r.conflict=null;r.dirty=true}
   else if(remote.missing)delete records[b.dataset.id];
   else{const data=await portraitIn(remote);records[b.dataset.id]={id:remote.id,revision:Number(remote.revision),data,dirty:false,deleted:!!remote.deleted_at,deleted_at:remote.deleted_at}}
   setWorkspace(currentList());persist();message='';queue();box.close();conflicts();
  }catch{box.querySelector('[data-status]').textContent='Could not load the cloud version. Your local version is unchanged; try again.'}
 });
}
async function signout(){
 if(pending()&&!confirm('Some edits have not synced. Signing out clears this account’s cached characters from this device. Cancel to sync or export them first. Sign out anyway?'))return;
 if(isGuest())mirrorGuest(chars);
 const uid=user.id;const {error}=await client.auth.signOut({scope:'local'});if(error){report('Could not sign out. Try again.');return}
 for(const k of Object.keys(localStorage))if(k.startsWith(prefix(uid)))localStorage.removeItem(k);
 await switchUser(null);
}
async function deleteAccount(){
 const box=dialog('Permanently delete account','<p>This permanently deletes your cloud characters, portraits, Trash and account. Guest characters remain. Export a backup first if you want to keep your characters.</p><button class="btn ghost" data-export>Export all characters</button><label>Type DELETE to confirm<input data-confirm autocomplete="off"></label><button class="btn danger" data-delete>Delete my account permanently</button>');
 box.querySelector('[data-export]').onclick=exportAll;
 box.querySelector('[data-delete]').onclick=async()=>{
  if(box.querySelector('[data-confirm]').value!=='DELETE'){box.querySelector('[data-status]').textContent='Type DELETE to confirm.';return}
  const button=box.querySelector('[data-delete]');button.disabled=true;blocked=true;clearTimeout(timer);box.querySelector('[data-status]').textContent='Deleting account…';
  try{
   if(busy)throw Error('A cloud operation is still finishing. Please retry.');
   const {data,error}=await client.functions.invoke('delete-account',{body:{confirmation:'DELETE'}});if(error||!data?.deleted)throw error||Error('Deletion failed');
   const uid=user.id;for(const k of Object.keys(localStorage))if(k.startsWith(prefix(uid)))localStorage.removeItem(k);
   await client.auth.signOut({scope:'local'});await switchUser(null);box.close();
  }catch{blocked=false;button.disabled=false;box.querySelector('[data-status]').textContent='Account deletion did not finish. Try again; contact support if it continues.'}
 };
}
async function act(action){try{
 if(action==='login'){if(isGuest()){capture(chars);await sync();mirrorGuest(chars)}if(!client){dialog('Sign in with Google','<p>Google sign-in is being connected. You can keep creating and saving characters as a guest in this browser.</p><p>Your existing characters will stay here. Once sign-in is ready, you can choose which ones to import into your account.</p>');return}const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+'/',queryParams:{prompt:'select_account'}}});if(error)throw error}
 if(action==='account')account();if(action==='import')guestImport();if(action==='trash')trash();if(action==='conflicts')conflicts();if(action==='export')exportAll();if(action==='signout')await signout();if(action==='delete')await deleteAccount();
 if(action==='sync'){message='';await sync();await refresh()}
 }catch{report('That action could not finish. Your local characters are safe. Please try again.')}
}
const originalStore=storeSet;
storeSet=async function(k,v){await originalStore(k,v);if(k==='forge-chars')capture(v);if(k==='forge-custom'&&user)capture(chars)};
const originalHome=renderHome;renderHome=function(){originalHome();paint()};
window.addEventListener('online',()=>queue(100));
window.addEventListener('focus',()=>{if(user){if(pending())queue(100);else if(Date.now()-lastRefresh>15000)refresh()}});
window.addEventListener('beforeunload',e=>{if(user&&pending()){e.preventDefault();e.returnValue=''}});
window.ForgeCloud={storageKey:key,initialize,mount,capture,sync,refresh,exportAll,
 partyConnection:()=>({client,user}),startGuestSession,startGuestDM,

 characterRef:id=>records[id]?{id:records[id].id,revision:records[id].revision,pending:!!records[id].dirty}:null,
 preparePartyCharacter:async()=>{capture(chars);await sync()},
 signIn:()=>act('login'),
 // Narrow diagnostics for regression tests; contains no session credentials.
 diagnostics:()=>({signedIn:!!user&&!isGuest(),guest:isGuest(),pending:pending(),conflicts:Object.values(records).filter(r=>r.conflict).length})};
})();
