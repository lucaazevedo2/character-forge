/* Party summaries and DM combat. No full-sheet sharing; all writes use checked RPCs. */
(() => {
'use strict';
const escText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CONDITIONS=typeof SHEET_CONDITIONS==='undefined'?[]:SHEET_CONDITIONS;
let accountId=null,selected=null,parties=[],state=null,loading=false,queuedRefresh=false,generation=0,error='',lastList=0,changed='',lastOwnRevision=null;
let ledgerStamp='',dmStamp='';
const portraits=new Map(),portraitLoads=new Set();
function connection(){return window.ForgeCloud?.partyConnection()||{}}
function summary(c){
 const k=classOf(c),r=raceOf(c),rows=[];
 for(const ctx of classContexts(c)){
  const cl=classOf(ctx),level=ctx.level||1,key=subclassKey(ctx),sub=subclassOf(ctx);
  let base=FEATURES.filter(f=>f.class?.index===ctx.klass&&!f.subclass&&!f.parent&&!f.prerequisites?.length&&f.level<=level&&(typeof cfFeatureAllowed!=='function'||cfFeatureAllowed(ctx,f)));
  if(!base.length)base=(cl.features||[]).map(f=>featureRecord(f)).filter(f=>f.level<=level);rows.push(...base);
  if(level>=(sub.level||1)){
   const custom=(CUSTOM.subs||[]).find(x=>x.id===ctx.subId);
   const subs=custom?.features||(ctx.subId==='srd'?FEATURES.filter(f=>f.class?.index===ctx.klass&&f.subclass?.index===SRD_SUBCLASS[ctx.klass]&&!f.parent):SUBCLASS_FEATURE_INDEX[key])||[];
   rows.push(...subs.map(f=>featureRecord(f)).filter(f=>f.level<=level&&(typeof cfFeatureAllowed!=='function'||cfFeatureAllowed(ctx,f))));
  }
 }
 rows.push(...(r?.traits||[]).map(f=>featureRecord(f)).filter(f=>f.level<=totalLevel(c)));
 for(const id of c.feats||[]){const feat=FEATS.find(f=>f.id===id);if(feat)rows.push({name:feat.name,desc:[feat.desc||'']})}
 return {max_hp:maxHP(c),initiative_bonus:initiative(c),class_name:k?.name||'',race_name:r?.name||'',ac:armorClass(c),
  scores:Object.fromEntries(ABILITIES.map(a=>[a,finalScore(c,a)])),
  spells:[...new Set([...(Array.isArray(c.spells)?c.spells:[]),...automaticSpells(c).map(g=>g.spell),...featGrantedSpellIds(c),...catalogCantrips(c),...Object.values(c.arcanum||{}),c.racialCantrip].filter(id=>typeof id==='string'&&id))].slice(0,200).map(id=>{const spell=spellById(id);return {name:spell?.name||String(id),level:spell?.level??0,prepared:spell?readySpell(c,spell):(c.prepared||[]).includes(id)}}),
  features:rows.slice(0,100).map(f=>({name:String(f.name||'Feature').slice(0,120),desc:(Array.isArray(f.desc)?f.desc.join(' '):String(f.desc||'')).slice(0,2000)}))};
}
function activeConditions(member){const list=Array.isArray(member.conditions)?member.conditions:[];return list.filter(x=>typeof x==='string')}
function conditionName(id){return CONDITIONS.find(c=>c[0]===id)?.[1]||id}
function badges(m){return [...activeConditions(m).map(conditionName),...(m.exhaustion>0?['Exhaustion '+m.exhaustion]:[]),...(m.concentrating?['Concentrating']:[])]}
const defaultPortrait='assets/avatars/default-avatar.svg';
const gearIcon='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.5 3-.6 2.2-1.8 1L5 5.6 2.5 9.9l1.6 1.6v2L2.5 15 5 19.4l2.1-.6 1.8 1 .6 2.2h5l.6-2.2 1.8-1 2.1.6 2.5-4.3-1.6-1.6v-2l1.6-1.6L19 5.6l-2.1.6-1.8-1L14.5 3Z"/><circle cx="12" cy="12.5" r="3"/></svg>';
let presenceMembers=new Map(),presenceReadAt=0,presenceUnavailable=false,presenceParty=null,presenceBusy=false,presenceQueued=false;
let presenceTab=null;
function avatarURL(value){try{const u=new URL(value);return u.protocol==='https:'&&/(^|\.)googleusercontent\.com$/.test(u.hostname)?u.href:null}catch{return null}}
function portrait(m){const profile=presenceMembers.get(m.user_id),url=m.is_dm?(!profile?.guest_account&&avatarURL(profile?.account_avatar)):portraits.get(m.portrait_path);return `<span class="party-avatar ${m.is_dm?'party-dm-avatar':''}"><img src="${escText(url||defaultPortrait)}" alt="" width="40" height="40" referrerpolicy="no-referrer" data-party-avatar></span>`}
function bindAvatarFallback(root){root.querySelectorAll('[data-party-avatar]').forEach(img=>img.addEventListener('error',()=>{if(img.getAttribute('src')!==defaultPortrait)img.src=defaultPortrait},{once:true}))}
function activityFor(snapshot=state){if(document.hidden||navigator.onLine===false||!snapshot)return {mode:'away',character_id:null};if(view==='dmtools'&&snapshot.is_dm)return {mode:'dmtools',character_id:null};const ref=window.ForgeCloud.characterRef(draft?.id);if(view==='sheet'&&ref&&snapshot.members.some(m=>m.user_id===accountId&&m.character_id===ref.id))return {mode:'sheet',character_id:ref.id};return {mode:'away',character_id:null}}
function memberOnline(m){if(error||Date.now()-presenceReadAt>45000)return false;const row=presenceMembers.get(m.user_id);return !!(m.is_dm?row?.dm_online:row?.character_online)}
function onlineDot(m){return memberOnline(m)?`<span class="party-online-dot" role="img" aria-label="${m.is_dm?'Active in DM Tools':'Character sheet open'}" title="${m.is_dm?'Active in DM Tools':'Character sheet open'}"></span>`:''}
async function updatePresence(){
 if(presenceUnavailable||!accountId||!selected||!state)return;if(presenceBusy){presenceQueued=true;return}presenceBusy=true;
 const epoch=generation,id=selected,user=accountId;try{
  presenceTab||=crypto.randomUUID();
  if(presenceParty&&presenceParty!==id)await rpc('forge_party_presence',{p_id:presenceParty,p_tab:presenceTab,p_mode:'away'}).catch(()=>{});
  presenceParty=id;const active=activityFor(),result=await rpc('forge_party_presence',{p_id:id,p_tab:presenceTab,p_mode:active.mode,p_character_id:active.character_id});
  if(epoch!==generation||id!==selected||user!==accountId)return;presenceMembers=new Map((result.members||[]).map(m=>[m.user_id,m]));presenceReadAt=Date.now();renderStrip();
 }catch(e){if(epoch!==generation)return;if(/could not find|does not exist|schema cache/i.test(e.message))presenceUnavailable=true;presenceMembers.clear();presenceReadAt=0;renderStrip();}
 finally{presenceBusy=false;if(presenceQueued){presenceQueued=false;updatePresence()}}
}
async function loadPortraits(snapshot){
 const {client}=connection(),epoch=generation;if(!client)return;
 const allowed=new Set(snapshot.members.map(m=>m.portrait_path).filter(Boolean));
 for(const [path,url] of portraits)if(!allowed.has(path)){URL.revokeObjectURL(url);portraits.delete(path)}
 for(const path of allowed){if(portraits.has(path)||portraitLoads.has(path))continue;portraitLoads.add(path);
  try{const {data,error}=await client.storage.from('character-portraits').download(path);if(error)throw error;
   if(epoch!==generation||!data||data.size>524288||!/^image\/(webp|jpeg|png)$/.test(data.type))continue;
   portraits.set(path,URL.createObjectURL(data));renderStrip();changed='';paintHub();
  }catch{/* Initials remain usable while an image cannot be downloaded. */}finally{portraitLoads.delete(path)}
 }
}
function accountChanged(){
 const next=connection().user?.id||null;if(next!==accountId){messages=[];document.getElementById('partyChatDialog')?.close();dmDrafts.clear();ledgerStamp='';dmStamp=''}if(next===accountId){mountNav();return}
 accountId=next;presenceMembers.clear();presenceReadAt=0;presenceUnavailable=false;presenceParty=null;presenceTab=null;generation++;state=null;parties=[];lastOwnRevision=null;changed='';lastList=0;error='';
 for(const url of portraits.values())URL.revokeObjectURL(url);portraits.clear();portraitLoads.clear();
 try{selected=next?localStorage.getItem('forge-active-party:'+next):null}catch{selected=null}
 document.getElementById('partyDialog')?.close();document.getElementById('partyMemberDialog')?.close();document.getElementById('partyCharacterDialog')?.close();
 mountNav();renderStrip();paintLedger();if(view==='dmtools')renderDMTools(byId('scr-step'));if(next)refresh(true);
}
function mountNav(){const nav=document.querySelector('.site-navigation');if(!nav)return;document.getElementById('openParties')?.remove();if(document.getElementById('openDMTools'))return;
 const button=document.createElement('button');button.type='button';button.id='openDMTools';button.dataset.siteView='dmtools';button.textContent='DM Tools';button.onclick=()=>navigateSite('dmtools');nav.append(button);
}
async function rpc(name,args){const {client,user}=connection();if(!client||!user)throw Error('Sign in with Google to use parties.');const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message||'Party request failed.');return data}
async function command(action,args={},id=selected){
 const epoch=generation;const result=await rpc('forge_party_command',{p_action:action,p_id:id,p_args:{...args,...((state?.is_dm||state?.is_organizer||state?.is_admin)?{version:state.version}: {})}});
 if(epoch!==generation)throw Error('Your account changed. Please reopen party settings.');
 if(result?.error)throw Error(result.error);if(result?.conflict){await refresh(true);throw Error('Someone saved a newer change. Review the latest values and try again.');}
 if(result?.id){if(selected!==result.id)generation++;selected=result.id;saveSelection()}if(result?.disbanded||action==='leave'){selected=null;state=null;saveSelection()}
 await refresh(true);return result;
}
function saveSelection(){try{if(selected)localStorage.setItem('forge-active-party:'+accountId,selected);else localStorage.removeItem('forge-active-party:'+accountId)}catch{}}
async function refresh(force=false){
 if(!accountId||document.hidden&&!force)return;if(loading){if(force)queuedRefresh=true;return}loading=true;const epoch=generation;
 try{
  if(force||Date.now()-lastList>30000){const incomingList=await rpc('forge_party_list',{});if(epoch!==generation)return;parties=incomingList;
   if(!Array.isArray(parties))parties=[];lastList=Date.now();if(!parties.some(p=>p.id===selected)){selected=parties[0]?.id||null;saveSelection()}
  }
  if(selected){const incomingState=await rpc('forge_party_state',{p_id:selected});if(epoch!==generation)return;state=incomingState;if(!state.is_dm||!state.session_active)document.getElementById('partyCharacterDialog')?.close();
   const mine=state.members.find(m=>m.user_id===accountId&&m.character_id);
   // A DM edit changes the real cloud character revision. Refresh the owner's sheet
   // through the existing conflict-aware adapter; pending local edits stay protected.
   if(mine&&lastOwnRevision!==mine.character_revision){lastOwnRevision=mine.character_revision;const local=chars.find(c=>window.ForgeCloud.characterRef(c.id)?.id===mine.character_id);const ref=local&&window.ForgeCloud.characterRef(local.id);if(ref?.revision!==mine.character_revision)window.ForgeCloud.refresh()}
   loadPortraits(state);await updatePresence();await refreshMessages();
  }else state=null;
  error='';
 }catch(e){if(epoch!==generation)return;error=navigator.onLine?e.message:'Offline · party updates paused';if(/Party access denied/.test(e.message)){state=null;selected=null;lastList=0;saveSelection();queuedRefresh=true}}
 finally{loading=false;if(epoch===generation){renderStrip();paintHub();paintDM();paintLedger();}if(queuedRefresh){queuedRefresh=false;refresh(true)}}
}
function renderStrip(){
 const head=document.querySelector('#scr-sheet .sheet-head');if(!head)return;
 head.querySelector('.party-strip')?.remove();head.querySelector('.party-dm-dock')?.remove();const strip=document.createElement('section');strip.className='party-strip';strip.setAttribute('aria-label','Live party');
 const sheetRef=window.ForgeCloud.characterRef(draft?.id);
 if(!accountId||!state||!state.members.some(m=>m.user_id===accountId&&m.character_id===sheetRef?.id)){strip.innerHTML=`<button type="button" class="party-empty-button">＋ ${accountId?'Create or join a party':'Play together'}</button>`;strip.querySelector('button').onclick=openHub;head.append(strip);return}
 const ref=window.ForgeCloud.characterRef(draft?.id),current=state.combatants.find(x=>x.id===state.current_id);
 const assignedDM=state.has_dm?state.members.find(m=>m.user_id===state.dm_user_id||m.is_dm):null;
 const players=state.members.filter(m=>m.character_id&&m.character_id!==ref?.id).map(m=>({...m,is_dm:false}));
 const members=[...(assignedDM?[{...assignedDM,is_dm:true,character_id:null}]:[]),...players];
 strip.classList.toggle('party-compact',compactView());
 strip.innerHTML=`<header><span class="party-strip-title">${escText(state.name)}</span><button type="button" data-party-view aria-pressed="${compactView()}">${compactView()?'Full view':'Compact view'}</button>${state.social_ready?'<button type="button" data-party-chat>Party chat</button>':''}<button type="button" class="party-settings-gear" data-open-party aria-label="Party settings for ${escText(state.name)}">${gearIcon}</button><span class="party-live ${error?'paused':''}">${error?'Updates paused':state.combat_active?'Round '+state.round+(state.hidden_turn?' · DM turn':current?' · '+current.name:' · Roll initiative'):state.session_active?'Session live':'Party ready'}</span></header><div class="party-cards">${members.length?members.map(m=>{
  const fighter=!m.is_dm&&state.combatants.find(x=>x.user_id===m.user_id),turn=fighter&&fighter.id===state.current_id,conditions=m.is_dm?[]:badges(m),pct=m.is_dm?100:Math.max(0,Math.min(100,m.hp/m.max_hp*100)),name=m.is_dm?'DM: '+(m.account_name||'Dungeon Master'):m.name;
  return `<div class="party-person ${m.is_dm?'is-dm':''}">${m.is_dm?'':conditionIcons(m)}<button type="button" class="party-mini ${turn?'is-turn':''}" data-member="${escText(m.user_id)}" title="${escText(name+(m.is_dm?'':' · '+m.hp+'/'+m.max_hp+' HP')+(memberOnline(m)?m.is_dm?' · Active in DM Tools':' · Sheet open':''))}"><span class="party-portrait-frame"><span class="party-portrait-wrap">${portrait(m)}${m.is_dm?'':`<i class="party-portrait-hp" style="height:${100-pct}%"></i>`}</span>${onlineDot(m)}</span><span class="party-mini-info"><strong>${escText(name)}</strong>${m.is_dm?'<small class="party-dm-status">'+(memberOnline(m)?'In DM Tools':'Away')+'</small>':`<span class="party-hp-line">${escText(m.hp)}<small> / ${escText(m.max_hp)} HP${m.temp_hp>0?' · +'+escText(m.temp_hp)+' temp':''}</small></span><span class="party-hp-bar"><i style="width:${pct}%" class="${pct<30?'low':''}"></i></span><span class="party-mini-conditions">${conditions.slice(0,2).map(x=>escText(x)).join(' · ')}${conditions.length>2?' +'+(conditions.length-2):''}</span>`}</span>${fighter?.initiative!=null?`<span class="party-init" title="Initiative">${escText(fighter.initiative)}</span>`:''}</button>${state.social_ready?`<button type="button" class="party-person-menu" data-person-menu="${escText(m.user_id)}" aria-label="Actions for ${escText(name)}">⋯</button>`:''}</div>`;
 }).join(''):'<span class="party-no-teammates">Invite your friends to bring the party together.</span>'}</div>`;
 bindAvatarFallback(strip);
 const dmPortrait=strip.querySelector('.party-person.is-dm');
 if(dmPortrait){const dock=document.createElement('aside');dock.className='party-dm-dock party-compact';dock.setAttribute('aria-label','Dungeon Master');dock.append(dmPortrait);bindPeople(dock);dock.querySelector('[data-member]').onclick=()=>memberDialog(assignedDM.user_id);head.append(dock);if(!strip.querySelector('.party-cards').children.length)strip.querySelector('.party-cards').innerHTML='<span class="party-no-teammates">Invite your friends to bring the party together.</span>'}
 strip.querySelector('[data-party-view]').onclick=()=>{localStorage.setItem('forge-party-view',compactView()?'full':'compact');renderStrip()};strip.querySelector('[data-party-chat]')?.addEventListener('click',()=>chatDialog());bindPeople(strip);strip.querySelector('[data-open-party]').onclick=openHub;strip.querySelectorAll('[data-member]').forEach(b=>b.onclick=()=>memberDialog(b.dataset.member));head.append(strip);
}
function dialog(id,title,html){document.getElementById(id)?.close();const box=document.createElement('dialog');box.id=id;box.className='cloud-dialog party-dialog';box.setAttribute('aria-label',title);
 box.innerHTML=`<header class="party-dialog-bar"><div><span class="party-eyebrow">CHARACTER FORGE</span><h2>${escText(title)}</h2></div><button type="button" class="party-close" aria-label="Close ${escText(title)}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>${html}`;
 box.querySelector('.party-close').onclick=()=>box.close();box.addEventListener('close',()=>box.remove());document.body.append(box);box.showModal();return box;
}
function openHub(partyId){
 if(typeof partyId==='string'&&partyId!==selected){generation++;selected=partyId;state=null;changed='';lastOwnRevision=null;saveSelection()}
 if(!accountId){const box=dialog('partyDialog','Play together','<div class="party-dialog-body"><p>Sign in with Google to create a party, join your friends, and share live character status.</p><button type="button" class="btn primary" data-signin>Sign in with Google</button></div>');box.querySelector('[data-signin]').onclick=()=>window.ForgeCloud.signIn();return}
 const box=dialog('partyDialog','Your party',`<div class="party-dialog-body"><div class="party-picker"><label>Party<select data-party-select aria-label="Choose party"></select></label><button type="button" class="btn ghost" data-refresh>Refresh</button></div><p class="party-update-note">Updates every 3 seconds while this page is visible.</p><p class="party-status" role="status" data-party-status></p><div data-party-body></div><details class="party-create-join"><summary>Create or join another party</summary><form data-create><label>Party name<input name="name" maxlength="80" required placeholder="The Sunday adventurers"></label><button class="btn primary" type="submit">Create party</button></form><form data-join><label>Invite code<input name="code" minlength="16" maxlength="40" required autocomplete="off" placeholder="Paste a player or DM invite code"></label><button class="btn ghost" type="submit">Join party</button></form></details></div>`);
 box.querySelector('[data-refresh]').onclick=()=>refresh(true);box.querySelector('[data-party-select]').onchange=async e=>{generation++;selected=e.target.value;state=null;changed='';lastOwnRevision=null;saveSelection();await refresh(true)};
 box.querySelector('[data-create]').onsubmit=e=>{e.preventDefault();run(box,()=>command('create',{name:new FormData(e.target).get('name')},null))};
 box.querySelector('[data-join]').onsubmit=e=>{e.preventDefault();run(box,()=>command('join',{code:new FormData(e.target).get('code')},null))};
 changed='';paintHub(true);refresh(true);
}
async function run(box,fn){const status=box.querySelector('[data-party-status]')||box.querySelector('[data-status]');if(status)status.textContent='Saving…';box.querySelectorAll('button').forEach(b=>b.disabled=true);
 try{await fn();if(status)status.textContent='';}catch(e){if(status)status.textContent=e.message;}finally{box.querySelectorAll('button').forEach(b=>b.disabled=false)}
}
function paintHub(force=false){
 const box=document.getElementById('partyDialog');if(!box?.querySelector('[data-party-body]'))return;
 const status=box.querySelector('[data-party-status]');if(error)status.textContent=error;else if(status.textContent===error)status.textContent='';
 const picker=box.querySelector('[data-party-select]');if(signature(parties)!==picker.dataset.items){picker.innerHTML=parties.length?parties.map(p=>`<option value="${escText(p.id)}">${escText(p.name)}${p.is_organizer?' · Organizer':p.is_dm?' · DM':''}</option>`).join(''):'<option value="">No parties yet</option>';picker.dataset.items=signature(parties)}picker.value=selected||'';
 const serialized=signature({state,characters:chars.map(c=>[c.id,c.name,window.ForgeCloud.characterRef(c.id)])});if(!force&&serialized===changed)return;
 const focused=document.activeElement;if(!force&&focused?.closest('[data-party-body]')&&/INPUT|SELECT|TEXTAREA/.test(focused.tagName))return;
 changed=serialized;const root=box.querySelector('[data-party-body]');
 if(!state){root.innerHTML='<div class="party-welcome"><h3>A place for your whole party.</h3><p>Create a party as its organizer, or join with an invite code. A DM and session are completely optional.</p></div>';box.querySelector('.party-create-join').open=true;return}
 const mine=state.members.find(m=>m.user_id===accountId),options=chars.map(c=>({c,ref:window.ForgeCloud.characterRef(c.id)})).filter(x=>x.ref&&(!x.ref.pending||x.ref.id===mine?.character_id));
 root.innerHTML=`<div class="party-session-heading"><div><h3>${escText(state.name)}</h3><span class="party-session-badge">${state.is_organizer?'Party organizer':state.is_admin?'Party admin':state.is_dm?'Dungeon Master':'Party member'} · ${state.session_active?'Session live':'Party only'}</span></div>${state.is_dm?'<button type="button" class="btn ghost" data-dm-tools>DM Tools ↗</button>':state.is_organizer&&!state.has_dm&&state.social_ready?'<button type="button" class="btn ghost" data-invite-dm>Invite a DM</button>':''}</div>
 ${state.is_organizer||state.is_admin?`<div class="party-invite"><div><small>INVITE CODE</small><code>${escText(state.invite_code)}</code></div><button type="button" class="btn ghost" data-copy>Copy</button><button type="button" class="party-text-button" data-action="rotate_code">Reset code</button></div>`:''}
 <p class="party-sharing-note">Choosing a character shares its portrait, HP, conditions and initiative with this party. If an optional DM session is running, its DM can adjust HP/conditions and inspect a read-only combat/rules overview. Private notes and biography stay private.</p><div class="party-character-choice"><label>Your party character<select data-character ${state.combat_active?'disabled':''}><option value="">Choose a cloud-saved character (optional)</option>${options.map(({c,ref})=>`<option value="${escText(ref.id)}" ${ref.id===mine?.character_id?'selected':''}>${escText(c.name||'Unnamed character')}</option>`).join('')}</select></label><button type="button" class="btn ghost" data-sync-characters>Sync characters</button></div>${state.combat_active?'<p class="hint">Character selection is locked until combat ends.</p>':''}
 <div class="party-roster"><h4>Party members <span>${state.social_ready?state.members.filter(m=>!m.is_dm).length+'/10 players'+(state.has_dm?' + DM':''):state.members.length+'/12 accounts'}</span></h4>${state.members.map(m=>`<div class="party-roster-row"><button type="button" class="party-roster-member" data-member="${escText(m.user_id)}">${portrait(m)}<span><strong>${escText(m.name)}${m.user_id===accountId?' <small>(you)</small>':''}</strong><small>${m.character_id?escText((m.class_name||'Adventurer')+' · '+m.hp+'/'+m.max_hp+' HP'+(m.temp_hp>0?' · +'+m.temp_hp+' temp':'')):m.is_dm?'DM · no character selected':m.is_organizer?'Organizer · no character selected':'Waiting for character selection'}</small><span class="party-roster-conditions">${escText(badges(m).join(' · '))}</span></span></button>${(state.is_organizer||state.is_admin)&&!m.is_organizer&&(!m.is_admin||state.is_organizer)&&m.user_id!==accountId?`<button type="button" class="party-text-button" data-remove-member="${escText(m.user_id)}">Remove</button>`:''}</div>`).join('')}</div>
 ${state.social_ready?'<button type="button" class="btn ghost" data-hub-chat>Party chat & whispers</button>':''}${optionalDMHTML()}${managementHTML()}<div class="party-management"><button type="button" class="party-text-button danger" data-action="${state.is_organizer?'disband':'leave'}">${state.is_organizer?'Disband party':'Leave party'}</button></div>`;
 root.querySelector('[data-hub-chat]')?.addEventListener('click',()=>chatDialog());
 root.querySelector('[data-invite-dm]')?.addEventListener('click',()=>inviteDM(box));
 root.querySelectorAll('[data-admin]').forEach(b=>b.onclick=()=>run(box,()=>command('set_admin',{user_id:b.dataset.admin,enabled:b.dataset.enabled==='true'})));
 root.querySelector('[data-transfer-owner]')?.addEventListener('click',()=>{const user_id=root.querySelector('[data-new-owner]').value;if(user_id&&confirm('Transfer organizer ownership to this member? You will remain a party admin.'))run(box,()=>command('transfer_owner',{user_id}))});
 root.querySelector('[data-dm-tools]')?.addEventListener('click',()=>{box.close();navigateSite('dmtools')});
 root.querySelector('[data-assign-dm]')?.addEventListener('change',e=>{const uid=e.target.value;if(state.session_active&&!confirm('Changing the DM will end the current session/combat and clear private DM notes. Continue?')){e.target.value=state.dm_user_id||'';return}run(box,()=>command('assign_dm',{user_id:uid||null}))});
 root.querySelector('[data-copy]')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(state.invite_code);status.textContent='Invite code copied.'}catch{status.textContent='Copy the invite code shown above.'}});
 root.querySelector('[data-character]').onchange=e=>{const id=e.target.value;run(box,async()=>{if(id){await window.ForgeCloud.preparePartyCharacter();if(window.ForgeCloud.diagnostics().pending)throw Error('Wait for your character to finish syncing, then select it again.')}await command('select_character',{character_id:id||null})})};
 root.querySelector('[data-sync-characters]').onclick=()=>run(box,async()=>{await window.ForgeCloud.preparePartyCharacter();await refresh(true);paintHub(true)});
 root.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{const action=b.dataset.action;if(['disband','leave','end_session','end_combat','rotate_code'].includes(action)&&!confirm(({disband:'Disband this party? Members and combat tracking will be removed. Characters remain in their owners’ accounts.',leave:'Leave this party?',end_session:'End the session and clear current combat?',end_combat:'End combat and clear initiative?',rotate_code:'Replace the invite code? The old code will stop working.'})[action]))return;run(box,()=>command(action))});
 root.querySelectorAll('[data-member]').forEach(b=>b.onclick=()=>memberDialog(b.dataset.member));
 root.querySelectorAll('[data-remove-member]').forEach(b=>b.onclick=()=>{if(confirm('Remove this member from the party?'))run(box,()=>command('remove_member',{user_id:b.dataset.removeMember}))});
 root.querySelector('[data-add-npc]')?.addEventListener('click',()=>npcDialog());
 root.querySelectorAll('[data-npc]').forEach(b=>b.onclick=()=>npcDialog(b.dataset.npc));
 root.querySelector('[data-roll-init]')?.addEventListener('click',()=>rollInitiative());
 root.querySelector('[data-manual-init]')?.addEventListener('submit',e=>{e.preventDefault();run(box,()=>command('initiative',{initiative:Number(new FormData(e.target).get('initiative'))}))});
}
function signature(x){return JSON.stringify(x)}
function combatHTML(){
 if(!state.session_active)return '<div class="party-combat-empty"><h4>Encounter tracker</h4><p>Start an optional session to track initiative and simple monsters here. Your party still works without one.</p></div>';
 if(!state.combat_active)return `<div class="party-combat-empty"><h4>No combat running</h4><p>Party status continues to update outside combat.</p>${state.is_dm?'<button type="button" class="btn primary" data-action="start_combat">Start combat</button>':''}</div>`;
 const mine=state.combatants.find(c=>c.user_id===accountId),current=state.combatants.find(c=>c.id===state.current_id);
 return `<section class="party-combat"><header><div><span class="party-eyebrow">COMBAT · ROUND ${state.round}</span><h4>${state.hidden_turn?'DM turn':current?escText(current.name)+'’s turn':'Roll initiative'}</h4></div>${state.is_dm?`<button type="button" class="btn primary" data-action="next_turn">${state.current_id?'Next turn →':'Begin turns →'}</button>`:''}</header>${mine&&!state.turns_running?`<form class="party-manual-init" data-manual-init><button type="button" class="btn ghost" data-roll-init>Roll my initiative</button><label>Or enter total<input type="number" name="initiative" min="-100" max="200" step="0.01" required value="${mine.initiative??''}" aria-label="My initiative total"></label><button class="btn ghost" type="submit">Set</button></form>`:''}<ol class="party-initiative-order">${state.combatants.map(f=>{const m=state.members.find(x=>x.user_id===f.user_id),isTurn=f.id===state.current_id;return `<li class="${isTurn?'is-turn':''}"><span class="party-order-value">${f.initiative??'—'}</span><button type="button" ${m?`data-member="${escText(m.user_id)}"`:`data-npc="${escText(f.id)}" ${state.is_dm?'':'disabled'}`}>${escText(m?.name||f.name)}${f.hidden?' <small>DM only</small>':''}</button><span class="party-order-hp">${m?escText(m.hp+'/'+m.max_hp+' HP'):state.is_dm?escText(f.hp+'/'+f.max_hp+' HP'):'NPC'}</span>${isTurn?'<span class="party-turn-mark">Turn</span>':''}</li>`}).join('')}</ol>${state.is_dm?'<div class="party-combat-controls"><button type="button" class="btn ghost" data-add-npc>Add monster / NPC</button><button type="button" class="btn ghost" data-action="pause_turns">Pause / edit initiative</button><button type="button" class="party-text-button" data-action="end_combat">End combat</button></div>':''}</section>`;
}
function memberDialog(userId){
 const member=state?.members.find(m=>m.user_id===userId);if(!member)return;
 const fighter=state.combatants.find(f=>f.user_id===userId),canEdit=state.is_dm&&state.session_active&&member.character_id;
 const box=dialog('partyMemberDialog',member.name,`<div class="party-dialog-body"><div class="party-member-profile">${portrait(member)}<div><h3>${escText(member.name)}</h3><p>${member.character_id?escText('Level '+(member.level||1)+' '+(member.race_name||'')+' '+(member.class_name||'')):'No character selected'}</p></div></div>${member.character_id?`<div class="party-member-stats"><strong>${member.hp} / ${member.max_hp} HP</strong><span>+${member.temp_hp} temporary HP</span><span>Initiative: ${fighter?.initiative??'Not rolled'}</span></div><p>${escText(badges(member).join(' · ')||'No conditions marked')}</p>${state.is_dm&&state.session_active?'<button type="button" class="btn ghost" data-view-character>View character · read only</button>':''}`:''}${canEdit?`<form data-vitals><h4>DM controls</h4><p class="hint">Changes update this character’s saved sheet. Pending player edits are protected by revision checks.</p><div class="party-form-grid"><label>Current HP<input name="hp" type="number" min="0" max="${member.max_hp}" value="${member.hp}" required></label><label>Temporary HP<input name="temp_hp" type="number" min="0" max="100000" value="${member.temp_hp}" required></label><label>Exhaustion<input name="exhaustion" type="number" min="0" max="6" value="${member.exhaustion}" required></label></div><fieldset class="party-condition-grid"><legend>Conditions</legend>${CONDITIONS.map(([id,name])=>`<label><input type="checkbox" name="condition" value="${escText(id)}" ${activeConditions(member).includes(id)?'checked':''}>${escText(name)}</label>`).join('')}</fieldset><button class="btn primary" type="submit">Apply HP & conditions</button></form>`:''}${state.is_dm&&fighter&&!state.current_id?`<form data-edit-init class="party-manual-init"><label>Initiative total<input type="number" min="-100" max="200" step="0.01" required name="initiative" value="${fighter.initiative??''}"></label><button class="btn ghost" type="submit">Set initiative</button></form>`:''}<p class="party-status" role="status" data-status></p></div>`);
 box.querySelector('[data-view-character]')?.addEventListener('click',()=>characterDialog(member));
 box.querySelector('[data-vitals]')?.addEventListener('submit',e=>{e.preventDefault();const form=new FormData(e.target);run(box,async()=>{await command('vitals',{character_id:member.character_id,character_revision:member.character_revision,hp:Number(form.get('hp')),temp_hp:Number(form.get('temp_hp')),exhaustion:Number(form.get('exhaustion')),conditions:form.getAll('condition')});box.close()})});
 box.querySelector('[data-edit-init]')?.addEventListener('submit',e=>{e.preventDefault();run(box,async()=>{await command('initiative',{user_id:userId,initiative:Number(new FormData(e.target).get('initiative'))});box.close()})});
}
function npcDialog(id){
 const npc=state?.combatants.find(x=>x.id===id);if(!state?.is_dm)return;
 const box=dialog('partyMemberDialog',npc?'Edit '+npc.name:'Add monster / NPC',`<div class="party-dialog-body"><form data-npc-form><label>Name<input name="name" maxlength="100" required value="${escText(npc?.name||'')}" placeholder="Goblin scout"></label>${npc?`<label>Maximum HP<input name="max_hp" type="number" min="1" max="100000" value="${npc.max_hp}" required></label>`:''}<div class="party-form-grid"><label>${npc?'Current HP':'Maximum HP'}<input name="hp" type="number" min="${npc?0:1}" max="100000" required value="${npc?.hp??10}"></label><label>Initiative<input name="initiative" type="number" min="-100" max="200" step="0.01" required value="${npc?.initiative??10}"></label></div><label class="party-check"><input name="hidden" type="checkbox" ${npc?.hidden?'checked':''}>Hidden from players</label><p class="hint">NPC HP is always hidden from players. A hidden NPC’s name and initiative are hidden too.</p><button class="btn primary" type="submit">${npc?'Save changes':'Add to combat'}</button>${npc?'<button type="button" class="party-text-button danger" data-remove-npc>Remove from combat</button>':''}</form><p class="party-status" role="status" data-status></p></div>`);
 box.querySelector('[data-npc-form]').onsubmit=e=>{e.preventDefault();const form=new FormData(e.target);run(box,async()=>{await command(npc?'edit_npc':'add_npc',{combatant_id:id,name:form.get('name'),hp:Number(form.get('hp')),max_hp:Number(form.get('max_hp')||form.get('hp')),initiative:Number(form.get('initiative')),hidden:form.has('hidden')});box.close()})};
 box.querySelector('[data-remove-npc]')?.addEventListener('click',()=>run(box,async()=>{await command('remove_npc',{combatant_id:id});box.close()}));
}
function rollInitiative(){
 const member=state?.members.find(m=>m.user_id===accountId);const c=chars.find(c=>window.ForgeCloud.characterRef(c.id)?.id===member?.character_id);if(!c)return;
 if(draft?.id===c.id){sheetRoll('Initiative',initiative(c));return}
 const raw=d(20),total=raw+initiative(c);const box=document.getElementById('partyDialog')||document.querySelector('.dm-workspace');run(box,async()=>{await command('initiative',{initiative:total});box.querySelector('[data-party-status]').textContent='Initiative: '+total+' (d20 '+raw+')';});
}
function optionalDMHTML(){
 const dm=state.members.find(m=>m.user_id===state.dm_user_id);
 if(!state.is_organizer)return `<p class="hint">${state.has_dm?'DM: '+escText(dm?.account_name||dm?.name||'Assigned member'):'This party has no DM. HP and condition sharing work without sessions.'}</p>`;
 return `<p class="hint">${state.has_dm?'DM: '+escText(dm?.account_name||dm?.name||'Assigned member'):'No DM assigned'}</p><details class="party-optional-dm"><summary>DM & sessions</summary><p>Use the party on its own, or assign a member as DM for session controls. The organizer handles invites and membership.</p><label>Session DM<select data-assign-dm><option value="">No DM · party only</option>${state.members.map(m=>`<option value="${escText(m.user_id)}" ${m.user_id===state.dm_user_id?'selected':''}>${escText(m.account_name||m.name)}${m.user_id===accountId?' (you)':''}</option>`).join('')}</select></label>${state.has_dm?'<p class="hint">Changing the DM ends any current session and clears its combat tracker and private DM notes.</p>':''}</details>`;
}
function ledgerGroups(list){
 if(!accountId)return null;
 const sort=items=>items.slice().sort((a,b)=>Number(b.favorite===true)-Number(a.favorite===true));
 const groups=parties.map(p=>({id:p.id,name:p.name,characters:sort(list.filter(c=>window.ForgeCloud.characterRef(c.id)?.id===p.character_id))}));
 const unassigned=list.filter(c=>!parties.some(p=>p.character_id&&p.character_id===window.ForgeCloud.characterRef(c.id)?.id));
 if(list.some(c=>c.favorite===true))groups.unshift({id:'favorites',name:'Favorites',characters:list.filter(c=>c.favorite===true)});
 if(unassigned.length)groups.push({id:null,name:'Not in a party',characters:sort(unassigned)});
 return groups;
}
function bindLedger(){
 const root=document.getElementById('scr-home');if(!root)return;
 root.querySelectorAll('[data-party-settings]').forEach(b=>b.onclick=()=>openHub(b.dataset.partySettings||undefined));
 const heading=root.querySelector('.library-heading');if(heading&&!heading.querySelector('[data-organize-parties]')){
  const b=document.createElement('button');b.type='button';b.className='ledger-party-manage';b.dataset.organizeParties='';b.textContent='⚙ Organize parties';b.onclick=()=>openHub();heading.append(b);
 }
}
function paintLedger(){
 if(view!=='home')return;const stamp=signature({accountId,groups:ledgerGroups(chars)?.map(g=>[g.id,g.name,g.characters.map(c=>[c.id,c.favorite])])});
 if(stamp!==ledgerStamp){ledgerStamp=stamp;renderHome()}else bindLedger();
}
const dmDrafts=new Map();
function renderDMTools(root){
 root.innerHTML=`<section class="dm-workspace"><header class="dm-page-heading"><div><span class="party-eyebrow">OPTIONAL SESSION WORKSPACE</span><h2>DM Tools</h2><p>Manage a session when your DM plays here. Parties work independently.</p></div><button type="button" class="btn ghost" data-dm-chat>Party chat & whispers</button><button type="button" class="btn ghost" data-dm-party-settings>Party settings ⚙</button></header><div class="dm-party-toolbar"><label>Party<select data-dm-party aria-label="DM Tools party"></select></label><button type="button" class="btn ghost" data-dm-refresh>Refresh</button><span>Updates every 3 seconds</span></div><p class="party-status" role="status" data-party-status></p><div data-dm-body></div><div class="dm-prep-grid"><section class="dm-notes-card" data-dm-notes hidden><h3>Private session notes</h3><p>Visible only to the assigned DM. Cleared when the DM changes.</p><form data-dm-notes-form><textarea name="notes" maxlength="12000" rows="6" aria-label="Private DM session notes" placeholder="Encounters, reminders, rulings…"></textarea><button type="submit" class="btn ghost">Save notes</button><span data-note-status role="status"></span></form></section><section class="dm-dice-card"><h3>Quick dice</h3><p>Roll locally without changing any character.</p><form data-dm-dice><label>Dice expression<input name="expression" required maxlength="120" value="1d20" aria-label="DM dice expression" placeholder="2d6 + 3"></label><button type="submit" class="btn primary">Roll</button></form><output data-dm-dice-result aria-live="polite"></output></section></div></section>`;
 root.querySelector('[data-dm-chat]').onclick=()=>chatDialog();root.querySelector('[data-dm-chat]').hidden=!state?.social_ready;
 root.querySelector('[data-dm-party-settings]').onclick=()=>openHub();
 root.querySelector('[data-dm-refresh]').onclick=()=>refresh(true);
 root.querySelector('[data-dm-party]').onchange=async e=>{generation++;selected=e.target.value;state=null;dmStamp='';lastOwnRevision=null;saveSelection();await refresh(true)};
 root.querySelector('[data-dm-dice]').onsubmit=e=>{e.preventDefault();const out=root.querySelector('[data-dm-dice-result]');try{const result=forgeDiceExpression(String(new FormData(e.target).get('expression')).replace(/^\/(?:r|roll)\s+/i,''));out.textContent=result.total+' · '+result.detail}catch(err){out.textContent=err.message}};
 root.querySelector('[data-dm-notes-form] textarea').oninput=e=>{if(selected)dmDrafts.set(selected,e.target.value)};
 root.querySelector('[data-dm-notes-form]').onsubmit=e=>{e.preventDefault();const notes=new FormData(e.target).get('notes');run(root,async()=>{await command('save_dm_notes',{notes});dmDrafts.delete(selected);root.querySelector('[data-note-status]').textContent='Notes saved.';paintDM(true)})};
 const diceHelp=forgeDiceHelpHTML();root.querySelector('.dm-dice-card').insertAdjacentHTML('beforeend',diceHelp);
 dmStamp='';paintDM(true);if(accountId)refresh(true);
}
function paintDM(force=false){
 if(view!=='dmtools')return;const root=document.getElementById('scr-step'),body=root?.querySelector('[data-dm-body]');if(!body)return;
 const picker=root.querySelector('[data-dm-party]');const options=signature(parties);
 if(picker.dataset.items!==options){picker.innerHTML=parties.length?parties.map(p=>`<option value="${escText(p.id)}">${escText(p.name)}${p.is_dm?' · DM':p.is_organizer?' · Organizer':''}</option>`).join(''):'<option value="">No party selected</option>';picker.dataset.items=options}picker.value=selected||'';
 root.querySelector('[data-dm-chat]').hidden=!state?.social_ready;const status=root.querySelector('[data-party-status]');if(error)status.textContent=error;
 const notes=root.querySelector('[data-dm-notes]'),textarea=notes.querySelector('textarea');notes.hidden=!state?.is_dm;
 if(state?.is_dm){if(document.activeElement!==textarea)textarea.value=dmDrafts.has(selected)?dmDrafts.get(selected):state.dm_notes||''}else{textarea.value='';if(selected)dmDrafts.delete(selected)}
 const stamp=signature(state);if(!force&&stamp===dmStamp)return;
 if(!force&&document.activeElement?.closest('[data-dm-body]')&&/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))return;
 dmStamp=stamp;
 if(!accountId){body.innerHTML='<div class="dm-session-empty"><h3>Sign in for shared sessions</h3><p>Quick dice works as a guest. Sign in and create or join a party from a character sheet or the ledger to use shared DM controls.</p></div>';return}
 if(!state){body.innerHTML='<div class="dm-session-empty"><h3>No party selected</h3><p>Create or join a party through a character sheet or Organize parties on your ledger. A session and DM are optional.</p></div>';return}
 const dm=state.members.find(m=>m.user_id===state.dm_user_id);
 body.innerHTML=`<div class="dm-session-bar"><div><h3>${escText(state.name)}</h3><span>${state.session_active?'Session live':state.has_dm?'No session running':'Party only · no DM assigned'}</span></div>${state.is_dm?`<button type="button" class="btn ${state.session_active?'ghost':'primary'}" data-dm-action="${state.session_active?'end_session':'start_session'}">${state.session_active?'End session':'Start optional session'}</button>`:!state.has_dm&&state.is_organizer?'<button type="button" class="btn ghost" data-enable-dm>Use DM tools for this party</button>':`<p>${state.has_dm?'DM: '+escText(dm?.account_name||dm?.name||'Assigned member'):'The organizer can assign a DM if desired.'}</p>`}</div>
 ${!state.has_dm?'<p class="dm-optional-message">This party can share HP, portraits and conditions without starting a session. Enabling DM tools is optional.</p>':''}
 <div class="dm-session-grid"><section class="dm-encounter-column">${combatHTML()}</section><section class="dm-pc-column"><header><h3>Player characters</h3><span>${state.members.filter(m=>m.character_id).length}</span></header>${state.members.filter(m=>m.character_id).map(m=>`<article class="dm-pc-card"><button type="button" class="dm-pc-open" data-member="${escText(m.user_id)}">${portrait(m)}<span><strong>${escText(m.name)}</strong><small>${escText('Level '+(m.level||1)+' '+(m.class_name||''))}</small></span><b>${m.hp}<small> / ${m.max_hp} HP</small></b></button><p>${escText(badges(m).join(' · ')||'No conditions')}</p><div class="dm-pc-metrics"><span>AC ${m.ac||'—'}</span><span>Temp HP ${m.temp_hp||0}</span></div>${state.is_dm&&state.session_active?`<button type="button" class="party-text-button" data-inspect="${escText(m.user_id)}">View character ↗</button>`:''}</article>`).join('')||'<p class="hint">Party members can select a character in party settings.</p>'}</section></div>`;
 body.querySelector('[data-enable-dm]')?.addEventListener('click',()=>run(root,()=>command('assign_dm',{user_id:accountId})));
 body.querySelectorAll('[data-dm-action],[data-action]').forEach(b=>b.onclick=()=>{const action=b.dataset.dmAction||b.dataset.action;if(['end_session','end_combat'].includes(action)&&!confirm(action==='end_session'?'End this session and clear its combat?':'End combat and clear initiative?'))return;run(root,()=>command(action))});
 body.querySelectorAll('[data-member]').forEach(b=>b.onclick=()=>memberDialog(b.dataset.member));
 body.querySelectorAll('[data-inspect]').forEach(b=>b.onclick=()=>characterDialog(state.members.find(m=>m.user_id===b.dataset.inspect)));
 body.querySelector('[data-add-npc]')?.addEventListener('click',()=>npcDialog());body.querySelectorAll('[data-npc]').forEach(b=>b.onclick=()=>npcDialog(b.dataset.npc));
 body.querySelector('[data-roll-init]')?.addEventListener('click',()=>rollInitiative());
 body.querySelector('[data-manual-init]')?.addEventListener('submit',e=>{e.preventDefault();run(root,()=>command('initiative',{initiative:Number(new FormData(e.target).get('initiative'))}))});
}
async function characterDialog(member){
 const box=dialog('partyCharacterDialog',member?.name||'Character overview','<div class="party-dialog-body"><p data-inspect-status role="status">Loading character overview…</p><div data-inspect-content></div></div>');
 try{const data=await rpc('forge_party_character',{p_id:selected,p_character_id:member.character_id});if(!box.isConnected)return;
  box.querySelector('[data-inspect-status]').textContent='Read-only session overview · private notes and biography excluded';
  const spells=Array.isArray(data.spells)?data.spells:[],features=Array.isArray(data.features)?data.features:[],equipment=Array.isArray(data.equipment)?data.equipment:[];
  box.querySelector('[data-inspect-content]').innerHTML=`<div class="dm-inspect-heading"><h3>${escText(data.name)}</h3><p>${escText('Level '+(data.level||1)+' '+(data.race_name||'')+' '+(data.class_name||''))}</p></div><div class="dm-overview-metrics"><span>HP <strong>${member.hp}/${member.max_hp}</strong></span><span>AC <strong>${escText(data.ac||'—')}</strong></span><span>Initiative bonus <strong>${escText(data.initiative_bonus??'—')}</strong></span></div><div class="dm-ability-grid">${ABILITIES.map(a=>`<div><small>${a.toUpperCase()}</small><strong>${escText(data.scores?.[a]??'—')}</strong></div>`).join('')}</div><details open><summary>Spells <small>${spells.length}</small></summary>${spells.length?`<ul class="dm-rule-list">${spells.map(s=>`<li><strong>${escText(s.name)}</strong><span>${Number(s.level)===0?'Cantrip':'Level '+escText(s.level)}${s.prepared?' · Ready':''}</span></li>`).join('')}</ul>`:'<p>No spell snapshot yet. Ask the player to Sync characters or save their sheet to refresh the overview.</p>'}</details><details><summary>Features & traits <small>${features.length}</small></summary>${features.map(f=>`<details class="dm-feature-detail"><summary>${escText(f.name)}</summary><p>${escText(f.desc)}</p></details>`).join('')||'<p>No feature snapshot available yet.</p>'}</details><details><summary>Equipment <small>${equipment.length}</small></summary><ul>${equipment.map(item=>`<li>${escText(typeof item==='string'?item:item?.name||'Custom item')}</li>`).join('')}</ul></details>`;
 }catch(e){box.querySelector('[data-inspect-status]').textContent=e.message}
}
const homeBeforePartyGroups=renderHome;renderHome=function(){homeBeforePartyGroups();bindLedger()};
const renderBeforeDMTools=render;render=function(){document.body.classList.toggle('dm-tools-view',view==='dmtools');renderBeforeDMTools();updatePresence()};

const oldRenderSheet=renderSheet;renderSheet=function(){oldRenderSheet();const ref=window.ForgeCloud.characterRef(draft?.id);const matches=parties.filter(p=>p.character_id===ref?.id);if(matches.length&&!matches.some(p=>p.id===selected)){generation++;selected=matches[0].id;state=null;changed='';saveSelection();refresh(true)}renderStrip()};
const oldRecordRoll=forgeRecordRoll;forgeRecordRoll=function(c,label,total,...rest){oldRecordRoll(c,label,total,...rest);shareRoll(c,label,total,...rest);
 if(String(label).toLowerCase()==='initiative'&&state?.combat_active&&!state.turns_running&&connection().user){const mine=state.members.find(m=>m.user_id===accountId);if(window.ForgeCloud.characterRef(c?.id)?.id===mine?.character_id)command('initiative',{initiative:Number(total)}).catch(e=>{error=e.message;renderStrip()})}
};
function managementHTML(){
 if(!state.is_organizer||!state.social_ready)return '';
 const others=state.members.filter(m=>m.user_id!==accountId);
 return `<details><summary>Party admins & ownership</summary><p>Admins can invite players and remove ordinary members. The organizer also manages admins, DM invitations, ownership and disbanding.</p>${others.map(m=>`<p>${escText(m.account_name||m.name)} <button type="button" class="btn ghost" data-admin="${escText(m.user_id)}" data-enabled="${!m.is_admin}">${m.is_admin?'Remove admin':'Make party admin'}</button></p>`).join('')}<label>Transfer organizer ownership<select data-new-owner><option value="">Choose a member</option>${others.map(m=>`<option value="${escText(m.user_id)}">${escText(m.account_name||m.name)}</option>`).join('')}</select></label><button type="button" class="btn ghost" data-transfer-owner>Transfer ownership</button></details>`;
}
async function inviteDM(box){await run(box,async()=>{await command('invite_dm');const code=state.dm_invite_code;const info=dialog('partyDMInvite','Invite a DM',`<div class="party-dialog-body"><p>Share this single-use DM code. Joining with it assigns that account as DM.</p><code>${escText(code)}</code><button class="btn ghost" data-copy-dm>Copy DM code</button><p class="hint">Generate a new code to invalidate this one. Player invitations never grant DM access.</p></div>`);info.querySelector('[data-copy-dm]').onclick=async e=>{try{await navigator.clipboard.writeText(code);e.target.textContent='Copied'}catch{e.target.textContent='Select and copy the code above'}}})}
function compactView(){try{return localStorage.getItem('forge-party-view')==='compact'}catch{return false}}
function conditionIcons(m){return `<div class="party-condition-icons">${[...activeConditions(m),...(m.exhaustion?['exhaustion']:[]),...(m.concentrating?['concentration']:[])].map(id=>`<button type="button" data-condition="${escText(id)}" title="${escText(conditionName(id))}" aria-label="${escText(conditionName(id))} details">${escText(id==='exhaustion'?'E'+m.exhaustion:id==='concentration'?'◎':conditionName(id).slice(0,2))}</button>`).join('')}</div>`}
function bindPeople(root){
 root.querySelectorAll('[data-condition]').forEach(b=>b.onclick=e=>{e.stopPropagation();sheetConditionHelp(b.dataset.condition)});
 root.querySelectorAll('[data-member]').forEach(b=>b.oncontextmenu=e=>{e.preventDefault();personMenu(b.dataset.member)});
 root.querySelectorAll('[data-person-menu]').forEach(b=>b.onclick=()=>personMenu(b.dataset.personMenu));
}
function personMenu(uid){const m=state?.members.find(x=>x.user_id===uid);if(!m||uid===accountId||!state?.social_ready)return;
 const box=dialog('partyPersonMenu',m.account_name||m.name,`<div class="party-dialog-body"><button class="btn ghost" data-whisper>Whisper</button>${m.character_id?'<fieldset><legend>Give</legend><button class="btn ghost" data-gold>Gold</button><button class="btn ghost" data-item>Item</button></fieldset>':''}</div>`);
 box.querySelector('[data-whisper]').onclick=()=>{box.close();chatDialog(uid)};
 box.querySelector('[data-gold]')?.addEventListener('click',()=>{box.close();giveDialog(uid,'gold')});box.querySelector('[data-item]')?.addEventListener('click',()=>{box.close();giveDialog(uid,'item')});
}
let messages=[],messageStamp='';
function chatFor(c){const ref=window.ForgeCloud.characterRef(c?.id);return !!(accountId&&state?.social_ready&&state?.members.some(m=>m.user_id===accountId&&m.character_id===ref?.id))}
async function refreshMessages(){const epoch=generation;if(!selected||!state?.social_ready){messages=[];return}const incoming=await rpc('forge_party_chat',{p_id:selected});if(epoch!==generation)return;messages=Array.isArray(incoming)?incoming:[];paintMessages();if(typeof draft!=='undefined'&&draft&&chatFor(draft))forgeRefreshChat(draft)}
function messageHTML(rows){return rows.map(m=>`<article class="roll-chat-entry"><header><b>${escText(m.label)}${m.recipient_id?' · Private':''}</b><time>${escText(new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}</time></header>${m.command?`<code>${escText(m.command)}</code>`:''}${m.kind==='roll'?`<strong class="roll-chat-total">${escText(m.total)}</strong>`:''}<p>${escText(m.body)}</p></article>`).join('')||'<p class="hint">No messages yet.</p>'}
async function sendMessage(data,id=selected){const nonce=crypto.randomUUID();await rpc('forge_party_chat',{p_id:id,p_message:{...data,nonce}});if(id===selected)await refreshMessages()}
function chatDialog(uid=null){if(!state?.social_ready)return;const target=state.members.find(m=>m.user_id===uid);const box=dialog('partyChatDialog',uid?'Whisper to '+(target?.account_name||target?.name):state.name+' · Party chat',`<div class="party-dialog-body"><label>Conversation<select data-conversation><option value="">Public party chat</option>${state.members.filter(m=>m.user_id!==accountId).map(m=>`<option value="${escText(m.user_id)}" ${uid===m.user_id?'selected':''}>Private · ${escText(m.account_name||m.name)}</option>`).join('')}</select></label><p class="hint">Whispers are visible only to the sender and recipient, including when another member is the DM.</p><div class="roll-chat-log" role="log" data-messages></div><form data-chat-send><label>Message or /r dice<textarea name="message" maxlength="500" required rows="2"></textarea></label><button class="btn primary" type="submit">Send</button></form><p data-status role="status"></p></div>`);
 box.dataset.party=selected;box.querySelector('[data-conversation]').onchange=()=>paintMessages(true);box.querySelector('form').onsubmit=e=>{e.preventDefault();const input=box.querySelector('textarea'),value=input.value.trim(),recipient_id=box.querySelector('select').value||null;if(!value)return;run(box,async()=>{const cmd=value.match(/^\/(?:r|roll)\s+([\s\S]+)$/i);if(cmd){const roll=forgeDiceExpression(cmd[1]);await sendMessage({recipient_id,kind:'roll',label:'Roll',body:roll.detail,total:String(roll.total),command:value})}else await sendMessage({recipient_id,body:value});input.value=''})};paintMessages(true);refreshMessages().catch(e=>box.querySelector('[data-status]').textContent=e.message);
}
function paintMessages(force=false){const box=document.getElementById('partyChatDialog');if(!box)return;if(box.dataset.party!==selected){box.close();return}const target=box.querySelector('[data-conversation]').value,rows=messages.filter(m=>target?m.recipient_id&&(m.sender_id===target||m.recipient_id===target):!m.recipient_id),stamp=signature(rows);if(!force&&stamp===messageStamp)return;messageStamp=stamp;const log=box.querySelector('[data-messages]'),bottom=log.scrollHeight-log.scrollTop-log.clientHeight<80;log.innerHTML=messageHTML(rows);if(bottom||force)log.scrollTop=log.scrollHeight}
function shareRoll(c,label,total,detail,kind='roll',command=''){if(!chatFor(c))return;sendMessage({kind,label,body:String(detail||''),total:String(total??''),command}).catch(e=>{error='Party message was not sent: '+e.message;renderStrip()})}
async function giveDialog(uid,kind){const target=state?.members.find(m=>m.user_id===uid),mine=state?.members.find(m=>m.user_id===accountId);if(!mine?.character_id)return alert('Select your cloud-saved party character first.');const local=chars.find(c=>window.ForgeCloud.characterRef(c.id)?.id===mine.character_id);if(!local)return;
 const c=draft?.id===local.id?draft:local,transferNonce=crypto.randomUUID();const box=dialog('partyGiveDialog','Give '+kind+' to '+target.name,`<div class="party-dialog-body"><form>${kind==='gold'?'<label>Gold pieces<input name="amount" type="number" min="0.01" max="100000" step="0.01" required></label>':`<label>Item<select name="index" required>${(c.inventory||[]).map((name,i)=>`<option value="${i}">${escText(name)}${(c.equipped||[]).includes(i)?' · unequip first':''}</option>`).join('')}</select></label>`}<p>Transfers move the gold or one item from your saved character to theirs.</p><button type="submit" class="btn primary">Give ${kind}</button></form><p data-status role="status"></p></div>`);
 box.querySelector('form').onsubmit=e=>{e.preventDefault();const data=new FormData(e.target);run(box,async()=>{await window.ForgeCloud.preparePartyCharacter();if(window.ForgeCloud.diagnostics().pending)throw Error('Wait for your character to finish syncing and try again.');await refresh(true);const from=state.members.find(m=>m.user_id===accountId),to=state.members.find(m=>m.user_id===uid);const result=await rpc('forge_party_give',{p_id:selected,p_target:uid,p_revision:from.character_revision,p_target_revision:to.character_revision,p_kind:kind,p_amount:kind==='gold'?Number(data.get('amount')):null,p_index:kind==='item'?Number(data.get('index')):null,p_item:kind==='item'?c.inventory[Number(data.get('index'))]:null,p_nonce:transferNonce});if(result.conflict)throw Error('A character changed. Review the latest sheet and try again.');await window.ForgeCloud.refresh();await refresh(true);box.close()})};
}
const localChatRefresh=forgeRefreshChat;forgeRefreshChat=function(c){localChatRefresh(c);if(!chatFor(c))return;const panel=document.getElementById('forgeRollChat');if(!panel)return;panel.querySelector('.roll-chat-caption').textContent='Public party chat · '+state.name;panel.querySelector('[data-roll-log]').innerHTML=messageHTML(messages.filter(m=>!m.recipient_id));panel.querySelector('[data-clear-rolls]').hidden=true;};
window.ForgeParty={record:shareRoll,chatFor:chatFor,summary,accountChanged,open:openHub,refresh,ledgerGroups,renderDMTools};
window.addEventListener('pagehide',()=>{if(presenceParty&&presenceTab)rpc('forge_party_presence',{p_id:presenceParty,p_tab:presenceTab,p_mode:'away'}).catch(()=>{})});window.addEventListener('online',()=>refresh(true));document.addEventListener('visibilitychange',()=>{updatePresence();if(!document.hidden)refresh(true)});
setInterval(()=>{accountChanged();if(accountId&&!document.hidden&&(selected||document.getElementById('partyDialog')))refresh()},3000);
})();
