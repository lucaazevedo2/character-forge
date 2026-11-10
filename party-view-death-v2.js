/* Party summaries and DM combat. No full-sheet sharing; all writes use checked RPCs. */
(() => {
'use strict';
const escText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CONDITIONS=typeof SHEET_CONDITIONS==='undefined'?[]:SHEET_CONDITIONS;
let accountId=null,selected=null,parties=[],state=null,loading=false,queuedRefresh=false,generation=0,error='',lastList=0,changed='',lastOwnRevision=null;
let ledgerStamp='',dmStamp='',attachingParty=false;
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
function conditionName(id){return CONDITIONS.find(c=>c[0]===id)?.[1]||({bloodied:'Bloodied',dying:'Dying / death saves',concentration:'Concentrating',exhaustion:'Exhaustion'})[id]||id}
function badges(m){return [...(m.dead?['Dead']:[]),...activeConditions(m).map(conditionName),...(m.exhaustion>0?['Exhaustion '+m.exhaustion]:[]),...(m.concentrating?['Concentrating']:[])]}
const defaultPortrait='assets/avatars/default-avatar.svg';
const gearIcon='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.5 3-.6 2.2-1.8 1L5 5.6 2.5 9.9l1.6 1.6v2L2.5 15 5 19.4l2.1-.6 1.8 1 .6 2.2h5l.6-2.2 1.8-1 2.1.6 2.5-4.3-1.6-1.6v-2l1.6-1.6L19 5.6l-2.1.6-1.8-1L14.5 3Z"/><circle cx="12" cy="12.5" r="3"/></svg>';
let presenceMembers=new Map(),presenceReadAt=0,presenceUnavailable=false,presenceParty=null,presenceBusy=false,presenceQueued=false;
let presenceTab=null,presenceClosing=false,presenceToken=null;
function avatarURL(value){try{const u=new URL(value);return u.protocol==='https:'&&/(^|\.)googleusercontent\.com$/.test(u.hostname)?u.href:null}catch{return null}}
function portrait(m,useSpeaker=true){const profile=presenceMembers.get(m.user_id),url=m.is_dm?(useSpeaker&&profile?.speaker_npc_id?(/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(profile.speaker_image||'')?profile.speaker_image:defaultPortrait):(!profile?.guest_account&&avatarURL(profile?.account_avatar))):portraits.get(m.portrait_path);return `<span class="party-avatar ${m.is_dm?'party-dm-avatar':''}"><img src="${escText(url||defaultPortrait)}" alt="" width="40" height="40" referrerpolicy="no-referrer" data-party-avatar></span>`}
function bindAvatarFallback(root){root.querySelectorAll('[data-party-avatar]').forEach(img=>img.addEventListener('error',()=>{if(img.getAttribute('src')!==defaultPortrait)img.src=defaultPortrait},{once:true}))}
function activityFor(snapshot=state){if(navigator.onLine===false||!snapshot)return {mode:'away',character_id:null};const idle=document.hidden||(typeof document.hasFocus==='function'&&!document.hasFocus());if(view==='dmtools'&&snapshot.is_dm)return {mode:idle?'dmtools-idle':'dmtools',character_id:null};const ref=window.ForgeCloud.characterRef(draft?.id);if(view==='sheet'&&ref&&snapshot.members.some(m=>m.user_id===accountId&&m.character_id===ref.id))return {mode:idle?'sheet-idle':'sheet',character_id:ref.id};return {mode:'away',character_id:null}}
function memberOnline(m){if(error||Date.now()-presenceReadAt>45000)return false;const row=presenceMembers.get(m.user_id);return !!(m.is_dm?row?.dm_online:row?.character_online)}
function memberStatus(m){if(memberOnline(m))return 'active';if(error||Date.now()-presenceReadAt>90000)return 'offline';const row=presenceMembers.get(m.user_id);return (m.is_dm?row?.dm_open:row?.character_open)?'idle':'offline'}
function onlineDot(m){const status=memberStatus(m),label=status==='active'?(m.is_dm?'Active in DM Tools':'Character sheet active'):status==='idle'?'Tab open · inactive':'Offline';return `<span class="party-online-dot is-${status}" role="img" aria-label="${label}" title="${label}"></span>`}
let betaPresenceAvailable=null;
async function presenceRPC(args){if(betaPresenceAvailable!==false){try{const data=await rpc('forge_party_presence_beta',args);betaPresenceAvailable=true;return data}catch(e){if(!/could not find|does not exist|schema cache/i.test(e.message))throw e;betaPresenceAvailable=false}}return rpc('forge_party_presence',{...args,p_mode:args.p_mode.endsWith('-idle')?'away':args.p_mode})}
// Cache the current user's token in memory while the page is alive; never wait for auth during unload.
async function cachePresenceToken(){const {client,user}=connection();if(!client?.auth?.getSession||user?.id!==accountId){presenceToken=null;return}const {data}=await client.auth.getSession();if(connection().user?.id===accountId&&data?.session?.user?.id===accountId)presenceToken=data.session.access_token;else presenceToken=null}
function closePresence(){
 if(!presenceParty||!presenceTab)return;
 const args={p_id:presenceParty,p_tab:presenceTab,p_mode:'away'},config=window.FORGE_CLOUD_CONFIG;
 if(presenceToken&&config?.supabaseUrl&&config?.publishableKey){
  const name=betaPresenceAvailable===false?'forge_party_presence':'forge_party_presence_beta';
  fetch(config.supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',keepalive:true,headers:{apikey:config.publishableKey,Authorization:'Bearer '+presenceToken,'Content-Type':'application/json'},body:JSON.stringify(args)}).catch(()=>{});
 }else presenceRPC(args).catch(()=>{});
}
async function updatePresence(){
 if(presenceClosing||presenceUnavailable||!accountId||!selected||!state)return;if(presenceBusy){presenceQueued=true;return}presenceBusy=true;
 const epoch=generation,id=selected,user=accountId;try{
  await cachePresenceToken();if(presenceClosing)return;
  presenceTab||=crypto.randomUUID();
  if(presenceParty&&presenceParty!==id)await presenceRPC({p_id:presenceParty,p_tab:presenceTab,p_mode:'away'}).catch(()=>{});
  presenceParty=id;const active=activityFor(),result=await presenceRPC({p_id:id,p_tab:presenceTab,p_mode:active.mode,p_character_id:active.character_id});
  if(presenceClosing){closePresence();return}if(epoch!==generation||id!==selected||user!==accountId)return;presenceMembers=new Map((result.members||[]).map(m=>[m.user_id,m]));presenceReadAt=Date.now();renderStrip();paintDM();
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
 const next=connection().user?.id||null;if(next!==accountId){giftQueue.length=0;document.getElementById('partyGiftToast')?.remove();if(giftTimer!==null){clearTimeout(giftTimer);giftTimer=null}messages=[];seenParty=null;bubbleMessages.clear();npcs=[];document.getElementById('partyChatDialog')?.close();dmDrafts.clear();ledgerStamp='';dmStamp=''}if(next===accountId){mountNav();return}
 accountId=next;presenceMembers.clear();presenceReadAt=0;presenceUnavailable=false;presenceParty=null;presenceTab=null;presenceToken=null;presenceClosing=false;generation++;state=null;parties=[];lastOwnRevision=null;changed='';lastList=0;error='';
 if(document.getElementById('forgeRollChat')&&draft)forgeRefreshChat(draft);
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
 if(result?.id){if(action==='create'||action==='join')attachingParty=!args.as_dm;if(selected!==result.id){generation++;messages=[];}selected=result.id;saveSelection()}if(result?.disbanded||action==='leave'){selected=null;state=null;saveSelection()}
 if(action==='select_character')attachingParty=false;await refresh(true);return result;
}
function saveSelection(){try{if(selected)localStorage.setItem('forge-active-party:'+accountId,selected);else localStorage.removeItem('forge-active-party:'+accountId)}catch{}}
async function refresh(force=false){
 if(!accountId||document.hidden&&!force)return;if(loading){if(force)queuedRefresh=true;return}loading=true;const epoch=generation;
 try{
  if(force||Date.now()-lastList>30000){const incomingList=await rpc('forge_party_list',{});if(epoch!==generation)return;parties=incomingList;
   if(!Array.isArray(parties))parties=[];lastList=Date.now();if(view==='sheet'&&!attachingParty){const ref=window.ForgeCloud.characterRef(draft?.id),match=parties.find(p=>!p.is_dm&&p.character_id===ref?.id);if(selected!==(match?.id||null)){selected=match?.id||null;state=null;messages=[];saveSelection()}}else if(!attachingParty&&!parties.some(p=>p.id===selected)){selected=parties.find(p=>p.is_dm)?.id||parties[0]?.id||null;saveSelection()}
  }
  if(selected){const incomingState=await rpc('forge_party_state',{p_id:selected});if(epoch!==generation)return;state=incomingState;for(const member of state.members){member.dead=member.dead===true||Number(member.hp)<=0&&Number(member.death_failures)>=3;}if(!state.is_dm||!state.session_active)document.getElementById('partyCharacterDialog')?.close();
   const mine=state.members.find(m=>m.user_id===accountId&&m.character_id);
   // A DM edit changes the real cloud character revision. Refresh the owner's sheet
   // through the existing conflict-aware adapter; pending local edits stay protected.
   if(mine&&lastOwnRevision!==mine.character_revision){lastOwnRevision=mine.character_revision;const local=chars.find(c=>window.ForgeCloud.characterRef(c.id)?.id===mine.character_id);const ref=local&&window.ForgeCloud.characterRef(local.id);if(ref?.revision!==mine.character_revision)window.ForgeCloud.refresh()}
   loadPortraits(state);await updatePresence();await refreshMessages();
  }else state=null;
  error='';
 }catch(e){if(epoch!==generation)return;error=navigator.onLine?e.message:'Offline · party updates paused';if(/Party access denied/.test(e.message)){state=null;selected=null;lastList=0;saveSelection();queuedRefresh=true}}
 finally{loading=false;if(epoch===generation){renderStrip();paintHub();paintDM();paintLedger();if(draft&&document.getElementById('forgeRollChat'))forgeRefreshChat(draft);}if(queuedRefresh){queuedRefresh=false;refresh(true)}}
}
function renderStrip(){
 const head=document.querySelector('#scr-sheet .sheet-head');if(!head)return;
 const stripStamp=signature({state,accountId,character:draft?.id,ref:window.ForgeCloud.characterRef(draft?.id),compact:compactView(),error,presence:[...presenceMembers],portraits:[...portraits.keys()]});if(head.dataset.partyStamp===stripStamp&&head.querySelector('.party-strip')){paintBubbles();return}head.dataset.partyStamp=stripStamp;
 head.querySelector('.party-strip')?.remove();head.querySelector('.party-dm-dock')?.remove();const strip=document.createElement('section');strip.className='party-strip';strip.setAttribute('aria-label','Live party');
 const sheetRef=window.ForgeCloud.characterRef(draft?.id);
 if(!accountId||!state||!state.members.some(m=>m.user_id===accountId&&m.character_id===sheetRef?.id)){strip.innerHTML=`<button type="button" class="party-empty-button">＋ ${accountId?connection().user?.is_anonymous?'Join a party':'Create or join a party':'Play together'}</button>`;strip.querySelector('button').onclick=openHub;head.append(strip);return}
 const ref=window.ForgeCloud.characterRef(draft?.id),current=state.combatants.find(x=>x.id===state.current_id);
 const assignedDM=state.has_dm?state.members.find(m=>m.user_id===state.dm_user_id||m.is_dm):null;
 const players=state.members.filter(m=>!m.is_dm&&m.character_id&&m.character_id!==ref?.id).map(m=>({...m,is_dm:false}));
 const members=[...(assignedDM?[{...assignedDM,is_dm:true,character_id:null}]:[]),...players];
 strip.classList.toggle('party-compact',compactView());
 strip.innerHTML=`<header><span class="party-strip-title">${escText(state.name)}</span><button type="button" data-party-view aria-pressed="${compactView()}">${compactView()?'Full view':'Compact view'}</button>${state.social_ready?'<button type="button" data-party-chat>Party chat</button>':''}<button type="button" class="party-settings-gear" data-open-party aria-label="Party settings for ${escText(state.name)}">${gearIcon}</button><span class="party-live ${error?'paused':''}">${error?'Updates paused':state.combat_active?'Round '+state.round+(state.hidden_turn?' · DM turn':current?' · '+current.name:' · Roll initiative'):state.session_active?'Session live':'Party ready'}</span></header><div class="party-cards">${members.length?members.map(m=>{
  const fighter=!m.is_dm&&state.combatants.find(x=>x.user_id===m.user_id),turn=fighter&&fighter.id===state.current_id,conditions=m.is_dm?[]:badges(m),pct=m.is_dm?100:Math.max(0,Math.min(100,m.hp/m.max_hp*100)),name=m.is_dm?'DM: '+(m.account_name||'Dungeon Master'):m.name;
  return `<div class="party-person ${m.is_dm?'is-dm':''}">${m.is_dm?'':conditionIcons(m)}<button type="button" class="party-mini ${turn?'is-turn':''}" data-member="${escText(m.user_id)}" title="${escText(name+(m.is_dm?'':' · '+m.hp+'/'+m.max_hp+' HP'+(m.dead?' · Dead':''))+(memberOnline(m)?m.is_dm?' · Active in DM Tools':' · Sheet open':''))}"><span class="party-portrait-frame"><span class="party-portrait-wrap ${!m.is_dm&&m.dead?'portrait-is-dead':''}">${m.dead&&!m.is_dm?portrait(m).replace('<img ' ,'<img style="filter:grayscale(1);opacity:.55" '):portrait(m)}${!m.is_dm&&m.dead?'<svg class="party-death-mark" viewBox="0 0 64 64" role="img" aria-label="Dead" style="position:absolute;inset:0;width:100%;height:100%;z-index:4;pointer-events:none"><path d="M14 14 50 50M50 14 14 50" fill="none" stroke="#ff354b" stroke-width="7" stroke-linecap="round"/></svg>':''}${m.is_dm?'':`<i class="party-portrait-hp" style="height:${100-pct}%"></i>`}</span>${onlineDot(m)}</span><span class="party-mini-info"><strong>${escText(name)}</strong>${!m.is_dm&&m.dead?'<small class="party-dead-status">Dead</small>':''}${m.is_dm?'<small class="party-dm-status">'+(memberOnline(m)?'In DM Tools':'Away')+'</small>':`<span class="party-hp-line">${escText(m.hp)}<small> / ${escText(m.max_hp)} HP${m.temp_hp>0?' · +'+escText(m.temp_hp)+' temp':''}</small></span><span class="party-hp-bar"><i style="width:${pct}%" class="${pct<30?'low':''}"></i></span><span class="party-mini-conditions">${conditions.slice(0,2).map(x=>escText(x)).join(' · ')}${conditions.length>2?' +'+(conditions.length-2):''}</span>`}</span>${fighter?.initiative!=null?`<span class="party-init" title="Initiative">${escText(fighter.initiative)}</span>`:''}</button>${state.social_ready?`<button type="button" class="party-person-menu" data-person-menu="${escText(m.user_id)}" aria-label="Actions for ${escText(name)}">⋯</button>`:''}</div>`;
 }).join(''):'<span class="party-no-teammates">Invite your friends to bring the party together.</span>'}</div>`;
 bindAvatarFallback(strip);
 const dmPortrait=strip.querySelector('.party-person.is-dm');
 if(dmPortrait){const dock=document.createElement('aside');dock.className='party-dm-dock party-compact';dock.setAttribute('aria-label','Dungeon Master');dock.append(dmPortrait);bindPeople(dock);dock.querySelector('[data-member]').onclick=()=>memberDialog(assignedDM.user_id);head.append(dock);if(!strip.querySelector('.party-cards').children.length)strip.querySelector('.party-cards').innerHTML='<span class="party-no-teammates">Invite your friends to bring the party together.</span>'}
 strip.querySelector('[data-party-view]').onclick=()=>{localStorage.setItem('forge-party-view',compactView()?'full':'compact');renderStrip()};strip.querySelector('[data-party-chat]')?.addEventListener('click',()=>chatDialog());bindPeople(strip);strip.querySelector('[data-open-party]').onclick=openHub;strip.querySelectorAll('[data-member]').forEach(b=>b.onclick=()=>memberDialog(b.dataset.member));head.append(strip);paintBubbles();
}
function dialog(id,title,html){document.getElementById(id)?.close();const box=document.createElement('dialog');box.id=id;box.className='cloud-dialog party-dialog';box.setAttribute('aria-label',title);
 box.innerHTML=`<header class="party-dialog-bar"><div><span class="party-eyebrow">CHARACTER FORGE</span><h2>${escText(title)}</h2></div><button type="button" class="party-close" aria-label="Close ${escText(title)}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>${html}`;
 box.querySelector('.party-close').onclick=()=>box.close();box.addEventListener('close',()=>box.remove());document.body.append(box);box.showModal();return box;
}
function sheetCharacter(){return view==='sheet'&&draft?.id?chars.find(c=>c.id===draft.id):null}
function openHub(partyId){
 const joiningCharacter=sheetCharacter();attachingParty=false;if(joiningCharacter){const ref=window.ForgeCloud.characterRef(joiningCharacter.id),match=parties.find(p=>!p.is_dm&&p.character_id===ref?.id);if(selected!==(match?.id||null)){generation++;selected=match?.id||null;state=null;messages=[];changed='';}}if(!joiningCharacter&&!(view==='dmtools'&&state))return;
 if(typeof partyId==='string'&&partyId!==selected){generation++;selected=partyId;state=null;changed='';lastOwnRevision=null;saveSelection()}
 if(!accountId){
  const box=dialog('partyDialog','Join a party',`<div class="party-dialog-body"><p>Play together with an invite code. You can join as a guest or sign in with Google.</p><form data-guest-join class="party-guest-form"><label>Display name<input name="name" maxlength="60" required autocomplete="nickname" placeholder="What should the party call you?"></label><label>Invite code<input name="code" minlength="16" maxlength="40" required autocomplete="off" placeholder="Paste your party invite code"></label><label>Character to share<input value="${escText(joiningCharacter.name||'Unnamed character')}" readonly><input type="hidden" name="character" value="${escText(joiningCharacter.id)}"></label><p class="hint">Joining starts a guest session in this browser. Only your selected character is copied for party play; the original and your edits stay saved here. Keep a JSON backup before clearing browser data. A Google account is needed to create a party.</p>${chars.length?'':'<p class="hint">Create or import a character before joining a party.</p>'}<button class="btn primary" type="submit" ${chars.length?'':'disabled'}>Join as guest</button></form><div class="party-guest-google"><span>Already have an account?</span><button type="button" class="btn ghost" data-signin>Sign in with Google</button></div><p class="party-status" data-party-status role="status"></p></div>`);
  box.querySelector('[data-signin]').onclick=()=>window.ForgeCloud.signIn();
  box.querySelector('[data-guest-join]').onsubmit=async e=>{e.preventDefault();const data=new FormData(e.target);box.querySelectorAll('button').forEach(b=>b.disabled=true);box.querySelector('[data-party-status]').textContent='Joining…';try{const cloudId=await window.ForgeCloud.startGuestSession(data.get('name'),data.get('character'));draft=chars.find(c=>c.id===joiningCharacter.id);if(!draft)throw Error('Reopen your saved character sheet before joining.');view='sheet';activeId=draft.id;render();await command('join',{code:data.get('code')},null);if(cloudId)await command('select_character',{character_id:cloudId});openHub()}catch(err){if(accountId)openHub();const current=document.getElementById('partyDialog');if(current?.querySelector('[data-party-status]'))current.querySelector('[data-party-status]').textContent=err.message;box.querySelectorAll('button').forEach(b=>b.disabled=false)}};return;
 }
 const box=dialog('partyDialog','Your party',`<div class="party-dialog-body"><div class="party-picker" hidden><label>Party<select data-party-select aria-label="Choose party"></select></label><button type="button" class="btn ghost" data-refresh>Refresh</button></div><p class="party-update-note">Updates every 3 seconds while this page is visible.</p><p class="party-status" role="status" data-party-status></p><div data-party-body></div><details class="party-create-join"><summary>${connection().user?.is_anonymous?'Join another party':'Create or join another party'}</summary>${connection().user?.is_anonymous?'':`<form data-create><label>Party name<input name="name" maxlength="80" required placeholder="The Sunday adventurers"></label><button class="btn primary" type="submit">Create party</button></form>`}<form data-join><label>Invite code<input name="code" minlength="16" maxlength="40" required autocomplete="off" placeholder="Paste a player or DM invite code"></label><button class="btn ghost" type="submit">Join party</button></form></details></div>`);
 box.querySelector('[data-refresh]').onclick=()=>refresh(true);box.querySelector('[data-party-select]').onchange=async e=>{generation++;selected=e.target.value;state=null;messages=[];changed='';lastOwnRevision=null;saveSelection();await refresh(true)};
 if(box.querySelector('[data-create]'))box.querySelector('[data-create]').onsubmit=e=>{e.preventDefault();run(box,async()=>{const c=sheetCharacter();await window.ForgeCloud.preparePartyCharacter();await command('create',{name:new FormData(e.target).get('name')},null);await command('select_character',{character_id:window.ForgeCloud.characterRef(c.id).id})})};
 box.querySelector('[data-join]').onsubmit=e=>{e.preventDefault();const code=new FormData(e.target).get('code');run(box,async()=>{const character=sheetCharacter();if(!character)throw Error('Open a saved character sheet before joining a party.');await window.ForgeCloud.preparePartyCharacter();const ref=window.ForgeCloud.characterRef(character.id);if(!ref?.id||ref.pending)throw Error('Wait for this character to finish syncing before joining.');await command('join',{code},null);await command('select_character',{character_id:ref.id})})};
 changed='';paintHub(true);refresh(true);
}
async function run(box,fn){const status=box.querySelector('[data-party-status]')||box.querySelector('[data-status]');if(status)status.textContent='Saving…';box.querySelectorAll('button').forEach(b=>b.disabled=true);
 try{await fn();if(status)status.textContent='';}catch(e){if(status)status.textContent=e.message;}finally{box.querySelectorAll('button').forEach(b=>b.disabled=false)}
}
function paintHub(force=false){
 const box=document.getElementById('partyDialog');if(!box?.querySelector('[data-party-body]'))return;
 const status=box.querySelector('[data-party-status]');if(error)status.textContent=error;else if(status.textContent===error)status.textContent='';
 const picker=box.querySelector('[data-party-select]');if(signature(parties)!==picker.dataset.items){picker.innerHTML=parties.length?parties.map(p=>`<option value="${escText(p.id)}">${escText(p.name)}${p.is_organizer?' · Organizer':p.is_dm?' · DM':''}</option>`).join(''):'<option value="">No parties yet</option>';picker.dataset.items=signature(parties)}picker.value=selected||'';
 const serialized=signature({state,presence:[...presenceMembers],characters:chars.map(c=>[c.id,c.name,window.ForgeCloud.characterRef(c.id)])});if(!force&&serialized===changed)return;
 const focused=document.activeElement;if(!force&&focused?.closest('[data-party-body]')&&/INPUT|SELECT|TEXTAREA/.test(focused.tagName))return;
 changed=serialized;const root=box.querySelector('[data-party-body]');
 box.querySelector('.party-create-join')?.toggleAttribute('hidden',!!state);
 if(!state){root.innerHTML='<div class="party-welcome"><h3>A place for your whole party.</h3><p>Create a party as its organizer, or join with an invite code. A DM and session are completely optional.</p></div>';box.querySelector('.party-create-join').open=true;return}
 const mine=state.members.find(m=>m.user_id===accountId),options=chars.map(c=>({c,ref:window.ForgeCloud.characterRef(c.id)})).filter(x=>x.ref&&(!x.ref.pending||x.ref.id===mine?.character_id));
 root.innerHTML=`<div class="party-session-heading"><div><h3>${escText(state.name)}</h3><span class="party-session-badge">${state.is_organizer?(state.is_dm?'DM & organizer':'Party organizer'):state.is_admin?'Party admin':state.is_dm?'Dungeon Master':'Party member'} · ${state.session_active?'Session live':'Party only'}</span></div>${!state.is_dm&&state.is_organizer&&!state.has_dm?'<button type="button" class="btn ghost" data-invite-dm>Invite a DM</button>':''}</div>
 ${state.is_organizer||state.is_admin||state.is_dm?`<div class="party-invite"><div><small>PLAYER INVITE CODE</small><code>${escText(state.invite_code)}</code></div><button type="button" class="btn ghost" data-copy>Copy</button>${state.is_organizer||state.is_admin?'<button type="button" class="party-text-button" data-action="rotate_code">Reset code</button>':''}</div>`:''}
 ${!state.is_dm?`<p class="party-sharing-note">Choosing a character shares its portrait, HP, conditions and initiative with this party. If an optional DM session is running, its DM can adjust HP/conditions and inspect a read-only combat/rules overview. Private notes and biography stay private.</p><div class="party-character-choice"><label>Your party character<select data-character ${state.combat_active?'disabled':''}><option value="">No character selected · stay in party</option>${options.map(({c,ref})=>`<option value="${escText(ref.id)}" ${ref.id===mine?.character_id?'selected':''}>${escText(c.name||'Unnamed character')}</option>`).join('')}</select></label><button type="button" class="btn ghost" data-sync-characters>Sync characters</button></div>${state.combat_active?'<p class="hint">Character selection is locked until combat ends.</p>':''}`:''}
 <div class="party-roster"><h4>Party members <span>${state.social_ready?state.members.filter(m=>!m.is_dm).length+'/10 players'+(state.has_dm?' + DM':''):state.members.length+'/12 accounts'}</span></h4>${state.members.map(m=>`<div class="party-roster-row"><button type="button" class="party-roster-member" data-member="${escText(m.user_id)}">${portrait(m)}<span><strong>${escText(m.name)}${m.user_id===accountId?' <small>(you)</small>':''}</strong><small>${m.character_id?escText((m.class_name||'Adventurer')+' · '+m.hp+'/'+m.max_hp+' HP'+(m.dead?' · Dead':'')+(m.temp_hp>0?' · +'+m.temp_hp+' temp':'')):m.is_dm?'DM · no character selected':m.is_organizer?'Organizer · no character selected':'Waiting for character selection'}</small><span class="party-roster-conditions">${escText(badges(m).join(' · '))}</span></span></button>${(state.is_organizer||state.is_admin)&&!m.is_organizer&&(!m.is_admin||state.is_organizer)&&m.user_id!==accountId?`<button type="button" class="party-text-button" data-remove-member="${escText(m.user_id)}">Remove</button>`:''}</div>`).join('')}</div>
 ${state.social_ready?'<button type="button" class="btn ghost" data-hub-chat>Rolls & chat</button>':''}${optionalDMHTML()}${managementHTML()}<div class="party-management"><button type="button" class="party-text-button danger" data-action="${state.is_organizer?'disband':'leave'}">${state.is_organizer?'Disband party':'Leave party'}</button></div>`;
 root.querySelector('[data-hub-chat]')?.addEventListener('click',()=>chatDialog());
 root.querySelector('[data-remove-dm]')?.addEventListener('click',async()=>{if(await window.forgeConfirm('Remove the DM role? This ends the current session and clears its DM notes.','Remove DM role'))run(box,()=>command('assign_dm',{user_id:null}))});
 root.querySelector('[data-invite-dm]')?.addEventListener('click',()=>showDMInvite(box));
 root.querySelectorAll('[data-admin]').forEach(b=>b.onclick=()=>run(box,()=>command('set_admin',{user_id:b.dataset.admin,enabled:b.dataset.enabled==='true'})));
 root.querySelector('[data-transfer-owner]')?.addEventListener('click',async()=>{const user_id=root.querySelector('[data-new-owner]').value;if(user_id&&await window.forgeConfirm('Transfer organizer ownership to this member? You will remain a party admin.','Transfer ownership'))run(box,()=>command('transfer_owner',{user_id}))});
 root.querySelector('[data-dm-tools]')?.addEventListener('click',()=>{box.close();navigateSite('dmtools')});
 root.querySelector('[data-copy]')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(state.invite_code);status.textContent='Invite code copied.'}catch{status.textContent='Copy the invite code shown above.'}});
 const characterPicker=root.querySelector('[data-character]');if(characterPicker)characterPicker.onchange=e=>{const id=e.target.value;run(box,async()=>{if(id){await window.ForgeCloud.preparePartyCharacter();if(window.ForgeCloud.diagnostics().pending)throw Error('Wait for your character to finish syncing, then select it again.')}await command('select_character',{character_id:id||null})})};
 const syncCharacters=root.querySelector('[data-sync-characters]');if(syncCharacters)syncCharacters.onclick=()=>run(box,async()=>{await window.ForgeCloud.preparePartyCharacter();await refresh(true);paintHub(true)});
 root.querySelectorAll('[data-action]').forEach(b=>b.onclick=async()=>{const action=b.dataset.action;if(['disband','leave','end_session','end_combat','rotate_code'].includes(action)&&!await window.forgeConfirm(({disband:'Disband this party? Members and combat tracking will be removed. Characters remain in their owners’ accounts.',leave:'Leave this party?',end_session:'End the session and clear current combat?',end_combat:'End combat and clear initiative?',rotate_code:'Replace the invite code? The old code will stop working.'})[action]))return;run(box,()=>command(action))});
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
 return `<section class="party-combat"><header><div><span class="party-eyebrow">COMBAT · ROUND ${state.round}</span><h4>${state.hidden_turn?'DM turn':current?escText(current.name)+'’s turn':'Roll initiative'}</h4></div>${state.is_dm?`<button type="button" class="btn primary" data-action="next_turn">${state.current_id?'Next turn →':'Begin turns →'}</button>`:''}</header>${mine&&!state.turns_running?`<form class="party-manual-init" data-manual-init><button type="button" class="btn ghost" data-roll-init>Roll my initiative</button><label>Or enter total<input type="number" name="initiative" min="-100" max="200" step="0.01" required value="${mine.initiative??''}" aria-label="My initiative total"></label><button class="btn ghost" type="submit">Set</button></form>`:''}<ol class="party-initiative-order">${state.combatants.map(f=>{const m=state.members.find(x=>x.user_id===f.user_id),isTurn=f.id===state.current_id;return `<li class="${isTurn?'is-turn':''}"><span class="party-order-value">${f.initiative??'—'}</span><button type="button" ${m?`data-member="${escText(m.user_id)}"`:`data-npc="${escText(f.id)}" ${state.is_dm?'':'disabled'}`}>${escText(m?.name||f.name)}${f.hidden?' <small>DM only</small>':''}</button><span class="party-order-hp">${m?escText(m.hp+'/'+m.max_hp+' HP'+(m.dead?' · Dead':'')):state.is_dm?escText(f.hp+'/'+f.max_hp+' HP'):'NPC'}</span>${isTurn?'<span class="party-turn-mark">Turn</span>':''}</li>`}).join('')}</ol>${state.is_dm?'<div class="party-combat-controls"><button type="button" class="btn ghost" data-add-npc>Add monster / NPC</button><button type="button" class="btn ghost" data-action="pause_turns">Pause / edit initiative</button><button type="button" class="party-text-button" data-action="end_combat">End combat</button></div>':''}</section>`;
}
function memberDialog(userId){
 const member=state?.members.find(m=>m.user_id===userId);if(!member)return;
 const fighter=state.combatants.find(f=>f.user_id===userId),canEdit=state.is_dm&&state.session_active&&member.character_id;
 const box=dialog('partyMemberDialog',member.name,`<div class="party-dialog-body"><div class="party-member-profile">${portrait(member)}<div><h3>${escText(member.name)}</h3><p>${member.character_id?escText('Level '+(member.level||1)+' '+(member.race_name||'')+' '+(member.class_name||'')):'No character selected'}</p></div></div>${member.character_id?`<div class="party-member-stats"><strong>${member.hp} / ${member.max_hp} HP</strong><span>+${member.temp_hp} temporary HP</span><span>Initiative: ${fighter?.initiative??'Not rolled'}</span></div><p>${escText(badges(member).join(' · ')||'No conditions marked')}</p>${state.is_dm&&state.session_active?'<button type="button" class="btn ghost" data-view-character>View character · read only</button>':''}`:''}${canEdit?`<form data-vitals><h4>DM controls</h4><p class="hint">Changes update this character’s saved sheet. Pending player edits are protected by revision checks.</p><div class="party-form-grid"><label>Current HP<input name="hp" type="number" min="0" max="${member.max_hp}" value="${member.hp}" required></label><label>Temporary HP<input name="temp_hp" type="number" min="0" max="100000" value="${member.temp_hp}" required></label><label>Exhaustion<input name="exhaustion" type="number" min="0" max="6" value="${member.exhaustion}" required></label></div><fieldset class="party-condition-grid"><legend>Conditions</legend>${CONDITIONS.map(([id,name])=>`<label><input type="checkbox" name="condition" value="${escText(id)}" ${activeConditions(member).includes(id)?'checked':''}>${escText(name)}</label>`).join('')}</fieldset><button class="btn primary" type="submit">Apply HP & conditions</button></form>`:''}${state.is_dm&&fighter&&!state.current_id?`<form data-edit-init class="party-manual-init"><label>Initiative total<input type="number" min="-100" max="200" step="0.01" required name="initiative" value="${fighter.initiative??''}"></label><button class="btn ghost" type="submit">Set initiative</button></form>`:''}<p class="party-status" role="status" data-status></p></div>`);
 if(state.social_ready&&userId!==accountId){const actions=document.createElement('div');actions.className='toolbar';actions.innerHTML='<button type="button" class="btn ghost" data-member-whisper>Whisper</button>'+(member.character_id&&(state.is_dm||state.members.some(m=>m.user_id===accountId&&m.character_id))?'<button type="button" class="btn ghost" data-member-gold>Give gold</button><button type="button" class="btn ghost" data-member-item>Give item</button>':'');box.querySelector('.party-member-profile').after(actions);actions.querySelector('[data-member-whisper]').onclick=()=>{box.close();chatDialog(userId)};actions.querySelector('[data-member-gold]')?.addEventListener('click',()=>{box.close();giveDialog(userId,'gold')});actions.querySelector('[data-member-item]')?.addEventListener('click',()=>{box.close();giveDialog(userId,'item')})}
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
function optionalDMHTML(){return (state.is_organizer&&state.has_dm?'<button type="button" class="btn ghost" data-remove-dm>Remove DM role</button>':'')+ `<p class="hint">${state.has_dm?'DM: '+escText(state.members.find(m=>m.is_dm)?.account_name||'Assigned DM'):'No DM assigned. Invite a separate DM to join from DM Tools.'}</p>`}

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
 root.querySelectorAll('[data-party-settings],[data-organize-parties]').forEach(b=>b.remove());
 const groups=ledgerGroups(chars)||[];
 root.querySelectorAll('.ledger-party-group').forEach((section,index)=>{
  const group=groups[index],party=parties.find(p=>p.id===group?.id);if(!party)return;
  let button=section.querySelector('[data-remove-party]');if(!button){button=document.createElement('button');button.type='button';button.className='ledger-remove-party';button.dataset.removeParty=party.id;section.querySelector('header').append(button)}
  button.textContent=party.is_organizer?'Disband & remove':'Leave & remove';button.setAttribute('aria-label',button.textContent+' '+party.name);
  button.onclick=()=>removeLedgerParty(party.id,section,button);
 });

}
async function removeLedgerParty(id,section,button){
 if(button.disabled)return;button.disabled=true;const epoch=generation,user=accountId;
 let status=section.querySelector('[data-remove-status]');if(!status){status=document.createElement('p');status.dataset.removeStatus='';status.className='hint';status.setAttribute('role','status');section.append(status)}status.textContent='';
 try{
  const snapshot=await rpc('forge_party_state',{p_id:id});if(user!==accountId||epoch!==generation)throw Error('Your account or party changed. Try again.');
  const organizer=snapshot.is_organizer,action=organizer?'disband':'leave';
  const text=organizer?'Disband “'+snapshot.name+'” and remove it from your home page? This removes the party for everyone. All characters stay saved and appear under “Not in a party” unless they belong to another party.':'Leave “'+snapshot.name+'” and remove it from your home page? Your character stays saved and moves to “Not in a party” unless it belongs to another party. Other members keep the party.';
  if(!await window.forgeConfirm(text,organizer?'Disband & remove party':'Leave & remove party'))return;
  if(user!==accountId||epoch!==generation)throw Error('Your account or party changed. Try again.');
  const result=await rpc('forge_party_command',{p_action:action,p_id:id,p_args:{version:snapshot.version}});
  if(result?.error)throw Error(result.error);if(result?.conflict)throw Error('This party changed. Review it and try again.');
  parties=parties.filter(p=>p.id!==id);if(selected===id){generation++;selected=null;state=null;messages=[];saveSelection()}lastList=0;ledgerStamp='';paintLedger();await refresh(true);
 }catch(e){status.textContent=e.message}finally{button.disabled=false}
}
function paintLedger(){
 if(view!=='home')return;const stamp=signature({accountId,groups:ledgerGroups(chars)?.map(g=>[g.id,g.name,g.characters.map(c=>[c.id,c.favorite])])});
 if(stamp!==ledgerStamp){ledgerStamp=stamp;renderHome()}else bindLedger();
}
async function showDMInvite(box){await run(box,async()=>{const result=await rpc('forge_party_dm_invite',{p_id:selected});const invite=dialog('partyDMInvite','Invite a DM','<div class="party-dialog-body"><p>Share this DM-only code. The DM enters it in DM Tools and joins without a character. This code is consumed when they join.</p><code data-code></code></div>');invite.querySelector('[data-code]').textContent=result.code})}
const dmDrafts=new Map();
function renderDMTools(root){
 root.innerHTML=`<section class="dm-workspace"><header class="dm-page-heading"><div><span class="party-eyebrow">OPTIONAL SESSION WORKSPACE</span><h2>DM Tools</h2><p>Manage a session when your DM plays here. Create a lasting party, invite players, and run sessions. Parties also work without a DM.</p></div><button type="button" class="btn ghost" data-npc-tab>NPCs</button><button type="button" class="btn ghost" data-dm-party-settings>Party settings ⚙</button></header><details class="dm-create-panel" ${parties.some(p=>p.is_dm)?'':'open'}><summary>Create a party as DM</summary><p>You’ll be both the organizer and Dungeon Master. Invite up to 10 players; no character is required for you. Your party stays saved between sessions.</p>${accountId&&!connection().user?.is_anonymous?`<form data-create-dm class="party-guest-form"><label>Party name<input name="name" required maxlength="80" placeholder="The Sunday adventurers"></label><button type="submit" class="btn primary">Create party as DM</button></form>`:'<p class="hint">Sign in with Google to create and keep a party on your account.</p><button type="button" class="btn primary" data-dm-signin>Sign in with Google</button>'}</details><details class="dm-join-panel" ${state?.is_dm?'':'open'}><summary>Join another party as DM</summary><form data-join-dm class="party-guest-form"><h3>Join a party as DM</h3><p class="hint">Ask the organizer for their DM invite code. No character is created or shared.</p>${accountId?'':'<label>Display name<input name="name" required maxlength="60" autocomplete="nickname"></label>'}<label>DM invite code<input name="code" required minlength="16" maxlength="40" autocomplete="off"></label><button type="submit" class="btn primary">Join as DM</button></form></details><div class="dm-party-toolbar"><label>Party<select data-dm-party aria-label="DM Tools party"></select></label><button type="button" class="btn ghost" data-dm-refresh>Refresh</button><span>Updates every 3 seconds</span></div><p class="party-status" role="status" data-party-status></p><div class="dm-workspace-layout"><div class="dm-workspace-main"><div data-dm-body></div><div class="dm-prep-grid"><section class="dm-notes-card" data-dm-notes hidden><h3>Private session notes</h3><p>Visible only to the assigned DM. Cleared when the DM changes.</p><form data-dm-notes-form><textarea name="notes" maxlength="12000" rows="6" aria-label="Private DM session notes" placeholder="Encounters, reminders, rulings…"></textarea><button type="submit" class="btn ghost">Save notes</button><span data-note-status role="status"></span></form></section><section class="dm-dice-card"><h3>Quick dice</h3><p>Roll without changing any character. Optionally share the result with your party.</p><form data-dm-dice><label>Dice expression<input name="expression" required maxlength="120" value="1d20" aria-label="DM dice expression" placeholder="2d6 + 3"></label><button type="submit" class="btn primary">Roll</button></form><label class="party-check" data-dm-share-option hidden><input type="checkbox" data-dm-share>Share quick rolls with party</label><output data-dm-dice-result aria-live="polite"></output></section></div></div><aside class="dm-chat-column" data-dm-chat-panel hidden></aside></div></section>`;
 root.querySelector('[data-dm-signin]')?.addEventListener('click',()=>window.ForgeCloud.signIn());
 root.querySelector('[data-create-dm]')?.addEventListener('submit',async e=>{e.preventDefault();const name=String(new FormData(e.target).get('name')||'').trim();if(!name){root.querySelector('[data-party-status]').textContent='Enter a party name.';return}await run(root,async()=>{await command('create',{name,as_dm:true},null);renderDMTools(root)})});
 root.querySelector('[data-join-dm]').onsubmit=async e=>{e.preventDefault();const data=new FormData(e.target),button=e.target.querySelector('button');button.disabled=true;try{if(!accountId){await window.ForgeCloud.startGuestDM(data.get('name'));view='dmtools';navigateSite('dmtools')}const result=await rpc('forge_party_join_dm',{p_code:data.get('code')});if(result.error)throw Error(result.error);generation++;selected=result.id;state=null;saveSelection();await refresh(true);renderDMTools(byId('scr-step'))}catch(err){const status=byId('scr-step').querySelector('[data-party-status]');if(status)status.textContent=err.message}finally{button.disabled=false}};
 root.querySelector('[data-npc-tab]').onclick=npcManager;
 root.querySelector('[data-dm-party-settings]').onclick=()=>openHub();root.querySelector('[data-dm-party-settings]').hidden=!state;
 root.querySelector('[data-dm-refresh]').onclick=()=>refresh(true);
 root.querySelector('[data-dm-party]').onchange=async e=>{generation++;selected=e.target.value;state=null;messages=[];dmStamp='';lastOwnRevision=null;saveSelection();await refresh(true)};
 root.querySelector('[data-dm-dice]').onsubmit=async e=>{e.preventDefault();const out=root.querySelector('[data-dm-dice-result]');try{const expression=String(new FormData(e.target).get('expression')).replace(/^\/(?:r|roll)\s+/i,''),result=forgeDiceExpression(expression);out.textContent=result.total+' · '+result.detail;if(state?.social_ready&&root.querySelector('[data-dm-share]').checked)await sendMessage({kind:'roll',label:'Quick roll',body:result.detail,total:String(result.total),command:expression})}catch(err){out.textContent=err.message}};
 root.querySelector('[data-dm-notes-form] textarea').oninput=e=>{if(selected)dmDrafts.set(selected,e.target.value)};
 root.querySelector('[data-dm-notes-form]').onsubmit=e=>{e.preventDefault();const notes=new FormData(e.target).get('notes');run(root,async()=>{await command('save_dm_notes',{notes});dmDrafts.delete(selected);root.querySelector('[data-note-status]').textContent='Notes saved.';paintDM(true)})};
 const diceHelp=forgeDiceHelpHTML();root.querySelector('.dm-dice-card').insertAdjacentHTML('beforeend',diceHelp);
 dmStamp='';paintDM(true);if(accountId)refresh(true);
}
function dmCompact(){try{return localStorage.getItem('forge-dm-roster-view')==='compact'}catch{return false}}
function dmRosterHTML(){const members=state.members.filter(m=>m.character_id&&!m.is_dm);return `<section class="dm-pc-column ${dmCompact()?'dm-roster-compact':''}"><header><div><h3>Player characters</h3><span>${members.length} adventurer${members.length===1?'':'s'}</span></div><button type="button" class="btn ghost" data-dm-roster-toggle aria-pressed="${dmCompact()}">${dmCompact()?'Full view':'Compact view'}</button></header><div class="dm-roster">${members.map(m=>{const damage=Math.max(0,Math.min(100,100-Number(m.hp)/Math.max(1,Number(m.max_hp))*100));return `<article class="dm-pc-card ${m.dead?'dm-pc-dead':''}">${conditionIcons(m)}<button type="button" class="dm-pc-open" data-member="${escText(m.user_id)}" aria-label="${escText(m.name+' · '+m.hp+'/'+m.max_hp+' HP'+(m.dead?' · Dead':''))}"><span class="dm-roster-portrait"><span class="party-portrait-wrap ${m.dead?'portrait-is-dead':''}">${portrait(m)}${m.dead?'<svg class="dm-death-cross" viewBox="0 0 64 64" role="img" aria-label="Dead"><path d="M14 14 50 50M50 14 14 50" fill="none" stroke="#ff354b" stroke-width="7" stroke-linecap="round"/></svg>':`<i class="dm-portrait-damage" style="height:${damage}%" aria-hidden="true"></i>`}</span>${onlineDot(m)}</span><span class="dm-roster-identity"><strong>${escText(m.name)}</strong><small class="dm-roster-class">${escText('Level '+(m.level||1)+' '+(m.class_name||''))}</small>${m.dead?'<small class="party-dead-status">Dead</small>':''}</span><b class="dm-roster-hp">${escText(m.hp)}<small> / ${escText(m.max_hp)} HP</small></b></button><p class="dm-roster-conditions">${escText(badges(m).join(' · ')||'No conditions')}</p><div class="dm-pc-metrics"><span>AC ${escText(m.ac||'—')}</span><span>Temp HP ${escText(m.temp_hp||0)}</span></div>${state.is_dm&&state.session_active?`<button type="button" class="party-text-button dm-roster-inspect" data-inspect="${escText(m.user_id)}">View character ↗</button>`:''}</article>`}).join('')||'<p class="hint">Player portraits appear here when characters join.</p>'}</div></section>`}
function paintDM(force=false){
 if(view!=='dmtools')return;const root=document.getElementById('scr-step'),body=root?.querySelector('[data-dm-body]');if(!body)return;
 const picker=root.querySelector('[data-dm-party]');const options=signature(parties);
 if(picker.dataset.items!==options){picker.innerHTML=parties.length?parties.map(p=>`<option value="${escText(p.id)}">${escText(p.name)}${p.is_dm?' · DM':p.is_organizer?' · Organizer':''}</option>`).join(''):'<option value="">No party selected</option>';picker.dataset.items=options}picker.value=selected||'';
 root.querySelector('[data-dm-party-settings]').hidden=!state;root.querySelector('[data-npc-tab]').hidden=!state?.is_dm;root.querySelector('[data-dm-share-option]').hidden=!state?.social_ready;mountDMChat(root);const status=root.querySelector('[data-party-status]');if(error)status.textContent=error;
 const notes=root.querySelector('[data-dm-notes]'),textarea=notes.querySelector('textarea');notes.hidden=!state?.is_dm;
 if(state?.is_dm){if(document.activeElement!==textarea)textarea.value=dmDrafts.has(selected)?dmDrafts.get(selected):state.dm_notes||''}else{textarea.value='';if(selected)dmDrafts.delete(selected)}
 const stamp=signature({state,presence:[...presenceMembers],compact:dmCompact()});if(!force&&stamp===dmStamp)return;
 if(!force&&document.activeElement?.closest('[data-dm-body]')&&/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))return;
 dmStamp=stamp;
 if(!accountId){body.innerHTML='<div class="dm-session-empty"><h3>Join a shared session</h3><p>Use the DM invite form above to join as a guest, or sign in with Google first. Quick dice is available immediately.</p></div>';return}
 if(!state){body.innerHTML='<div class="dm-session-empty"><h3>No party selected</h3><p>Create your own party above, or join another organizer’s party with a DM invite code.</p></div>';return}
 const dm=state.members.find(m=>m.user_id===state.dm_user_id);
 body.innerHTML=`<div class="dm-session-bar"><div><h3>${escText(state.name)}</h3><span>${state.session_active?'Session live':state.has_dm?'No session running':'Party only · no DM assigned'}</span></div>${state.is_dm?`<button type="button" class="btn ${state.session_active?'ghost':'primary'}" data-dm-action="${state.session_active?'end_session':'start_session'}">${state.session_active?'End session':'Start optional session'}</button>`:!state.has_dm&&state.is_organizer?'<p>Invite a DM from Party settings, or keep playing without one.</p>':`<p>${state.has_dm?'DM: '+escText(dm?.account_name||dm?.name||'Assigned member'):'The organizer can invite a separate DM.'}</p>`}</div>
 ${!state.has_dm?'<p class="dm-optional-message">This party can share HP, portraits and conditions without starting a session. Enabling DM tools is optional.</p>':''}
 ${state.is_dm?`<div class="dm-player-invite"><button type="button" class="btn ghost" data-invite-players>Invite players</button><span>Share a player code · ${state.members.filter(m=>!m.is_dm).length}/10 players</span></div>`:''}<div class="dm-session-grid">${dmRosterHTML()}<section class="dm-encounter-column">${combatHTML()}</section></div>`;
 body.querySelector('[data-invite-players]')?.addEventListener('click',()=>playerInviteDialog());
 paintBubbles();body.querySelector('[data-dm-roster-toggle]').onclick=()=>{localStorage.setItem('forge-dm-roster-view',dmCompact()?'full':'compact');paintDM(true)};bindAvatarFallback(body);bindPeople(body);
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

const oldRenderSheet=renderSheet;renderSheet=function(){oldRenderSheet();const ref=window.ForgeCloud.characterRef(draft?.id);const matches=parties.filter(p=>p.character_id===ref?.id);if(!matches.length&&selected&&view==='sheet'){generation++;selected=null;state=null;messages=[];changed='';saveSelection();refresh(true)}if(matches.length&&!matches.some(p=>p.id===selected)){generation++;selected=matches[0].id;state=null;changed='';saveSelection();refresh(true)}renderStrip()};
const oldRecordRoll=forgeRecordRoll;forgeRecordRoll=function(c,label,total,...rest){oldRecordRoll(c,label,total,...rest);shareRoll(c,label,total,...rest);
 if(String(label).toLowerCase()==='initiative'&&state?.combat_active&&!state.turns_running&&connection().user){const mine=state.members.find(m=>m.user_id===accountId);if(window.ForgeCloud.characterRef(c?.id)?.id===mine?.character_id)command('initiative',{initiative:Number(total)}).catch(e=>{error=e.message;renderStrip()})}
};
function managementHTML(){
 if(!state.is_organizer||!state.social_ready)return '';
 const others=state.members.filter(m=>m.user_id!==accountId);
 return `<details><summary>Party admins & ownership</summary><p>Admins can invite players and remove ordinary members. The organizer also manages admins, DM invitations, ownership and disbanding.</p>${others.map(m=>`<p>${escText(m.account_name||m.name)} <button type="button" class="btn ghost" data-admin="${escText(m.user_id)}" data-enabled="${!m.is_admin}">${m.is_admin?'Remove admin':'Make party admin'}</button></p>`).join('')}<label>Transfer organizer ownership<select data-new-owner><option value="">Choose a member</option>${others.map(m=>`<option value="${escText(m.user_id)}">${escText(m.account_name||m.name)}</option>`).join('')}</select></label><button type="button" class="btn ghost" data-transfer-owner>Transfer ownership</button></details>`;
}
function compactView(){try{return localStorage.getItem('forge-party-view')==='compact'}catch{return false}}
function conditionIcons(m){return `<div class="party-condition-icons">${[...activeConditions(m),...(!m.dead&&Number(m.hp)>0&&Number(m.hp)<=Number(m.max_hp)/2?['bloodied']:[]),...(!m.dead&&Number(m.hp)<=0?['dying']:[]),...(m.exhaustion?['exhaustion']:[]),...(m.concentrating?['concentration']:[])].map(id=>`<button type="button" data-condition="${escText(id)}" title="${escText(conditionName(id))}" aria-label="${escText(conditionName(id))} details">${typeof conditionIconHTML==='function'?conditionIconHTML(id):escText(conditionName(id).slice(0,2))}${id==='exhaustion'?'<small>'+m.exhaustion+'</small>':''}</button>`).join('')}</div>`}
function bindPeople(root){
 root.querySelectorAll('[data-condition]').forEach(b=>b.onclick=e=>{e.stopPropagation();sheetConditionHelp(b.dataset.condition)});
 root.querySelectorAll('[data-member]').forEach(b=>b.oncontextmenu=e=>{e.preventDefault();personMenu(b.dataset.member)});
 root.querySelectorAll('[data-person-menu]').forEach(b=>b.onclick=()=>personMenu(b.dataset.personMenu));
}
function personMenu(uid){const m=state?.members.find(x=>x.user_id===uid);if(!m||uid===accountId||!state?.social_ready)return;
 const box=dialog('partyPersonMenu',m.account_name||m.name,`<div class="party-dialog-body"><div class="party-person-identity">${portrait(m,false)}<div><strong>${escText(memberName(m))}</strong><p>${state.is_dm?'Dungeon Master rewards & messages':'Party member actions'}</p></div></div><div class="party-action-grid"><button type="button" data-whisper><span class="party-action-icon" aria-hidden="true">✉</span><span><b>Whisper</b><small>Start a private conversation</small></span></button>${m.character_id?`<button type="button" data-gold><span class="party-action-icon" aria-hidden="true">◉</span><span><b>${state.is_dm?'Award Gold':'Give Gold'}</b><small>${state.is_dm?'Create a campaign gold reward':'Transfer coins from your character'}</small></span></button><button type="button" data-item><span class="party-action-icon" aria-hidden="true">◇</span><span><b>${state.is_dm?'Award Item':'Give Item'}</b><small>${state.is_dm?'Award loot from the item catalog':'Choose something from your inventory'}</small></span></button>`:''}</div></div>`);
 box.querySelector('[data-whisper]').onclick=()=>{box.close();chatDialog(uid)};
 box.querySelector('[data-gold]')?.addEventListener('click',()=>{box.close();giveDialog(uid,'gold')});box.querySelector('[data-item]')?.addEventListener('click',()=>{box.close();giveDialog(uid,'item')});
}
let messages=[];
function chatFor(c){const ref=window.ForgeCloud.characterRef(c?.id);return !!(accountId&&state?.social_ready&&state?.members.some(m=>m.user_id===accountId&&m.character_id===ref?.id))}
async function refreshMessages(){const epoch=generation;if(!selected||!state?.social_ready){messages=[];return}await loadNPCs();const incoming=await rpc('forge_party_chat',{p_id:selected});if(epoch!==generation)return;const old=messages;messages=Array.isArray(incoming)?incoming:[];notifyMessages(old,messages);await pollTyping();paintMessages();if(typeof draft!=='undefined'&&draft&&chatFor(draft))forgeRefreshChat(draft)}
function memberName(m){return m?.is_dm?'DM':m?.character_id?m.name:m?.account_name||m?.name||'Party member'}
function messageHTML(rows){return rows.map(m=>{
 const sender=state?.members.find(x=>x.user_id===m.sender_id),recipient=state?.members.find(x=>x.user_id===m.recipient_id),emote=m.kind!=='roll'&&/^\/(?:me|em)(?:\s|$)/i.test(m.command||'');
 const privateLabel=m.recipient_id?(m.kind==='transfer'?'Private transaction':m.sender_id===accountId?'To '+memberName(recipient):'Whisper to you'):'';
 return `<article class="roll-chat-entry ${m.recipient_id?'roll-chat-whisper':''} ${emote?'roll-chat-emote':''}" data-message-id="${escText(m.id)}"><div class="chat-message-avatar">${m.speaker_image&&/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(m.speaker_image)?`<img class="chat-npc-image" src="${escText(m.speaker_image)}" alt="">`:sender?portrait(sender,false):'<img src="assets/avatars/default-avatar.svg" alt="" width="36" height="36">'}</div><div class="chat-message-content"><header><b>${escText(m.label)}</b><time>${escText(new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}))}</time></header>${privateLabel?`<span class="chat-private-label">${escText(privateLabel)} · Private</span>`:''}${m.kind==='roll'?`<code>${escText(m.command||m.label)}</code><p class="chat-dice-detail">${escText(m.body)}</p><strong class="roll-chat-total">${escText(m.total)}</strong>`:`<p>${m.kind==='transfer'&&m.gift?giftSentenceHTML(m.gift):escText(m.body)}</p>`}</div></article>`;
 }).join('')||'<p class="roll-chat-empty">No messages yet. Say hello or roll <code>/r d20+5</code>.</p>'}
async function sendMessage(data,id=selected){const nonce=crypto.randomUUID();await rpc('forge_party_chat',{p_id:id,p_message:{...data,nonce}});if(id===selected)await refreshMessages()}
function parseChat(value,recipient_id=null){
 let text=String(value).trim();if(!text)return null;
 const whisper=text.match(/^\/w(?:hisper)?\s+(?:"([^"]+)"|(\S+))\s+([\s\S]+)$/i);
 if(/^\/w(?:hisper)?(?:\s|$)/i.test(text)){
  if(!whisper)throw Error('Use /w DM message or /w "Character name" message.');
  const name=(whisper[1]||whisper[2]).toLocaleLowerCase(),matches=(state?.members||[]).filter(m=>m.user_id!==accountId&&((name==='dm'||name==='gm')?m.is_dm:[m.name,m.account_name].some(n=>String(n||'').toLocaleLowerCase()===name)));
  if(matches.length!==1)throw Error(matches.length?'That name matches more than one member. Choose the recipient below.':'Whisper recipient not found in this party.');
  recipient_id=matches[0].user_id;text=whisper[3].trim();
 }
 const roll=text.match(/^\/(?:r|roll)\s+([\s\S]+)$/i);if(roll){const result=forgeDiceExpression(roll[1]);return {recipient_id,kind:'roll',label:'Roll',body:result.detail,total:String(result.total),command:text}}
 const emote=text.match(/^\/(?:me|em)\s+([\s\S]+)$/i);if(emote)return {recipient_id,kind:'note',body:emote[1],command:'/me'};
 if(text.startsWith('/'))throw Error('Unknown command. Use /r, /roll, /w or /me.');
 return {recipient_id,kind:'note',body:text};
}
function chatControlsHTML(){const mine=state.members.find(m=>m.user_id===accountId);return `<div class="chat-compose-options"><label>To<select data-chat-recipient aria-label="Message recipient"><option value="">Everyone</option>${state.members.filter(m=>m.user_id!==accountId).map(m=>`<option value="${escText(m.user_id)}">Whisper · ${escText(memberName(m))}</option>`).join('')}</select></label><label>As<select data-chat-speaker aria-label="Speak as"><option value="character">${escText(memberName(mine))}</option>${!mine?.is_dm&&mine?.character_id?`<option value="account">${escText(mine.account_name||'My account')}</option>`:''}${state.is_dm?npcs.map(n=>`<option value="npc:${escText(n.id)}">${escText(n.name)}</option>`).join(''):''}</select></label></div>`}
function chatPanelHTML(){return `<section class="roll-chat party-roll-chat"><div class="roll-chat-heading"><h3>Rolls &amp; chat</h3><span class="chat-live-badge">Party</span></div><p class="roll-chat-caption"></p><div class="roll-chat-log" data-roll-log role="log" aria-label="Rolls and chat" aria-live="polite" aria-relevant="additions"></div><form class="roll-chat-form"><label>Message or command<textarea rows="2" maxlength="500" placeholder="Message, /r d20+5, /w DM hello, /me waves" autocomplete="off" spellcheck="false" aria-label="Message or command"></textarea></label><div data-chat-options></div><div class="roll-chat-send"><span>Enter to send · Shift+Enter for a new line</span><button type="submit" class="btn primary">Send</button></div><p class="roll-chat-error" role="alert" hidden></p></form>${forgeDiceHelpHTML()}</section>`}
function bindChatPanel(panel){
 if(panel.dataset.chatBound===selected)return;
 const switching=!!panel.dataset.chatBound&&panel.dataset.chatBound!==selected;
 panel.classList.add('party-roll-chat');panel.dataset.chatBound=selected;panel.dataset.chatStamp='';panel.dataset.chatMembers='';
 let controls=panel.querySelector('[data-chat-options]');if(!controls){controls=document.createElement('div');controls.dataset.chatOptions='';panel.querySelector('.roll-chat-send').before(controls)}
 controls.onchange=async e=>{if(!e.target.matches('[data-chat-speaker]')||!state?.is_dm)return;const value=e.target.value,id=selected;try{await rpc('forge_party_speaker',{p_id:id,p_npc:value.startsWith('npc:')?value.slice(4):null});if(id===selected){await updatePresence();changed='';paintHub(true);paintMessages()}}catch(err){const error=panel.querySelector('[role=alert]');error.hidden=false;error.textContent=err.message}};
 const form=panel.querySelector('form'),input=panel.querySelector('textarea'),error=panel.querySelector('[role=alert]');let last='';if(switching)input.value='';
 panel.querySelector('.roll-chat-heading h3').textContent='Rolls & chat';panel.querySelector('[data-clear-rolls]')?.setAttribute('hidden','');panel.querySelector('[data-roll-log]').setAttribute('aria-label','Rolls and chat');
 form.onsubmit=async e=>{e.preventDefault();if(!input.value.trim()||form.dataset.sending)return;const id=selected,epoch=generation,value=input.value,button=form.querySelector('button[type=submit]');
 try{const data=parseChat(value,controls.querySelector('[data-chat-recipient]').value||null);data.speaker=controls.querySelector('[data-chat-speaker]').value;if(data.speaker.startsWith('npc:'))data.npc_id=data.speaker.slice(4);form.dataset.sending='true';button.disabled=true;await sendMessage(data,id);if(epoch===generation&&input.value===value){last=value;input.value='';typingUntil=0;rpc('forge_party_typing',{p_id:id,p_active:false}).catch(()=>{});error.hidden=true;const log=panel.querySelector('[data-roll-log]');log.scrollTop=log.scrollHeight;input.focus({preventScroll:true})}}
 catch(err){if(epoch===generation){error.hidden=false;error.textContent=err.message}}finally{delete form.dataset.sending;button.disabled=false}
 };
 installWhisperSuggestions(input,controls);input.addEventListener('input',()=>{typingUntil=Date.now()+5000;pollTyping(true)});
 input.onkeydown=e=>{if(e.isComposing)return;if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit()}else if(e.key==='ArrowUp'&&!input.value&&last){e.preventDefault();input.value=last}};
}
async function clearPartyChat(panel,button){
 if(!(state?.is_dm||state?.is_organizer)||button.disabled)return;
 const id=selected,epoch=generation;button.disabled=true;
 try{if(!await window.forgeConfirm('Clear all messages, rolls and whispers in this party’s chat for everyone? Characters, NPCs and item/gold transfers are kept. This cannot be undone from the chat.','Clear chat history'))return;
 if(epoch!==generation||id!==selected)throw Error('Your account or party changed. Try again.');
 await rpc('forge_party_clear_chat',{p_id:id});if(epoch!==generation)return;generation++;messages=[];bubbleMessages.clear();typingUsers=[];paintBubbles();paintMessages();if(draft&&chatFor(draft))forgeRefreshChat(draft);await refreshMessages();
 }catch(err){const error=panel.querySelector('[role=alert]');error.hidden=false;error.textContent=err.message}finally{button.disabled=false}
}
function paintChatPanel(panel){
 if(!panel||!state?.social_ready)return;bindChatPanel(panel);
 let clearButton=panel.querySelector('[data-clear-party-chat]');if(!clearButton){clearButton=document.createElement('button');clearButton.type='button';clearButton.className='btn ghost';clearButton.dataset.clearPartyChat='';clearButton.textContent='Clear history';clearButton.setAttribute('aria-label','Clear party chat history');panel.querySelector('.roll-chat-heading').append(clearButton)}clearButton.hidden=!(state.is_dm||state.is_organizer);clearButton.onclick=()=>clearPartyChat(panel,clearButton);
 const controls=panel.querySelector('[data-chat-options]'),members=signature([npcs,state.members.map(m=>[m.user_id,m.name,m.account_name,m.character_id,m.is_dm])]);
 if(panel.dataset.chatMembers!==members){const recipient=controls.querySelector('[data-chat-recipient]')?.value,speaker=controls.querySelector('[data-chat-speaker]')?.value;controls.innerHTML=chatControlsHTML();if(recipient&&state.members.some(m=>m.user_id===recipient))controls.querySelector('[data-chat-recipient]').value=recipient;if(speaker&&[...controls.querySelector('[data-chat-speaker]').options].some(o=>o.value===speaker))controls.querySelector('[data-chat-speaker]').value=speaker;panel.dataset.chatMembers=members}
 if(state.is_dm){const profile=presenceMembers.get(accountId),speakerSelect=controls.querySelector('[data-chat-speaker]');if(profile){const value=profile.speaker_npc_id?'npc:'+profile.speaker_npc_id:'character';if([...speakerSelect.options].some(o=>o.value===value))speakerSelect.value=value}}
 panel.querySelector('.roll-chat-caption').textContent=state.name+' · Public messages and your whispers';
 const stamp=signature(messages);if(stamp===panel.dataset.chatStamp)return;panel.dataset.chatStamp=stamp;
 const log=panel.querySelector('[data-roll-log]'),bottom=log.scrollHeight-log.scrollTop-log.clientHeight<80,first=!log.dataset.loaded;
 log.innerHTML=messageHTML(messages);bindAvatarFallback(log);log.dataset.loaded='true';if(bottom||first)log.scrollTop=log.scrollHeight;
}
function mountDMChat(root){const host=root.querySelector('[data-dm-chat-panel]');if(!host)return;const show=state?.social_ready&&state.is_dm;host.hidden=!show;if(!show){host.replaceChildren();return}if(!host.querySelector('.party-roll-chat'))host.innerHTML=chatPanelHTML();paintChatPanel(host.querySelector('.party-roll-chat'))}
function playerInviteDialog(){if(!state?.is_dm||!state.invite_code)return;const box=dialog('partyPlayerInvite','Invite players',`<div class="party-dialog-body"><p>Share this player code. Players join from their character sheet’s party settings. It grants player access only.</p><code data-player-invite>${escText(state.invite_code)}</code><button type="button" class="btn primary" data-copy-player>Copy player code</button><p class="hint">Up to 10 players, plus the DM.</p><p data-status role="status"></p></div>`);box.querySelector('[data-copy-player]').onclick=async()=>{try{await navigator.clipboard.writeText(state.invite_code);box.querySelector('[data-status]').textContent='Player invite copied.'}catch{box.querySelector('[data-status]').textContent='Select and copy the code above.'}}}
function chatDialog(uid=null){if(!state?.social_ready)return;const box=dialog('partyChatDialog','Rolls & chat',`<div class="party-dialog-body">${chatPanelHTML()}</div>`);box.dataset.party=selected;paintChatPanel(box.querySelector('.party-roll-chat'));if(uid)box.querySelector('[data-chat-recipient]').value=uid;refreshMessages().catch(e=>{const error=box.querySelector('[role=alert]');error.hidden=false;error.textContent=e.message})}
function paintMessages(){const box=document.getElementById('partyChatDialog');if(box){if(box.dataset.party!==selected)box.close();else paintChatPanel(box.querySelector('.party-roll-chat'))}const dm=document.querySelector('[data-dm-chat-panel] .party-roll-chat');if(dm)paintChatPanel(dm)}
function shareRoll(c,label,total,detail,kind='roll',command=''){if(!chatFor(c))return;sendMessage({kind,label,body:String(detail||''),total:String(total??''),command}).catch(e=>{error='Party message was not sent: '+e.message;renderStrip()})}
async function giveDialog(uid,kind){
 const target=state?.members.find(m=>m.user_id===uid),mine=state?.members.find(m=>m.user_id===accountId),dm=!!state?.is_dm,partyId=selected,epoch=generation;
 if(!target?.character_id||target.is_dm)return;
 if(!dm&&!mine?.character_id)return alert('Select your cloud-saved party character first.');
 const local=dm?null:chars.find(c=>window.ForgeCloud.characterRef(c.id)?.id===mine.character_id);if(!dm&&!local)return;
 const c=local&&(draft?.id===local.id?draft:local),nonce=crypto.randomUUID(),verb=dm?'Award':'Give';
 if(c&&typeof equipmentEnsure==='function')equipmentEnsure(c);
 const box=dialog('partyGiveDialog',verb+' '+kind+' to '+target.name,`<div class="party-dialog-body gift-dialog-body"><p class="gift-recipient">${dm?'Campaign reward for':'Gift to'} <strong>${escText(target.name)}</strong></p><form>${kind==='gold'?'<label>Gold pieces<input name="amount" type="number" min="0.01" max="100000" step="0.01" placeholder="100" required></label>':dm?'<label>Search the item catalog<input type="search" data-gift-search placeholder="Brooch of Shielding, longsword…" autocomplete="off"></label><label>Catalog item<select name="catalog" size="6" required data-gift-catalog></select></label><div data-gift-config></div><p data-gift-preview></p>':`<label>Item from your inventory<select name="index" required>${(c.inventory||[]).map((name,i)=>`<option value="${i}" ${(c.equipped||[]).includes(i)?'disabled':''}>${escText(name)}${(c.equipped||[]).includes(i)?' · unequip first':''}</option>`).join('')}</select></label>`}<label class="gift-private-option"><input type="checkbox" name="private"><span><strong>Private transaction</strong><small>Only you and ${escText(target.name)} can see this in chat.</small></span></label><p class="hint">${dm?'Awarded directly to their sheet. No DM character or inventory is needed.':'Moves gold or one item from your saved character to theirs.'} The recipient gets a brief notification on their sheet.</p><button type="submit" class="btn primary">${verb} ${kind==='gold'?'gold':'item'}</button></form><p data-status role="status"></p></div>`);
 let catalog=[];
 if(dm&&kind==='item'){
  catalog=allItems().slice().sort((a,b)=>a.name.localeCompare(b.name));const picker=box.querySelector('[data-gift-catalog]');
  const configure=()=>{const it=catalog.find(x=>x.index===picker.value),host=box.querySelector('[data-gift-config]');if(!it){host.innerHTML='';box.querySelector('[data-gift-preview]').innerHTML='';return}
   const spec=isMagicItem(it)?magicPropertySpec(it):{bases:[],variants:[]};host.innerHTML=(spec.kind?`<label>Base ${escText(spec.kind)}<select name="base" required><option value="">Choose a base item…</option>${spec.bases.map(b=>`<option value="${escText(b.index)}">${escText(b.name)}</option>`).join('')}</select></label>`:'')+(spec.variants.length?`<label>Variant<select name="variant">${spec.variants.map(v=>`<option value="${escText(v[1])}">${escText(v[0])}</option>`).join('')}</select></label>`:'');if(spec.fixed){const base=spec.bases.find(b=>b.name.toLowerCase()===spec.fixed.toLowerCase());if(base)host.querySelector('[name=base]').value=base.index}
   box.querySelector('[data-gift-preview]').innerHTML=`<strong class="${magicRarityClass(it)}">${escText(it.name)}</strong><span class="hint"> · ${escText(isMagicItem(it)?magicRarity(it):'Mundane')}</span>`;
  };
  const search=()=>{const q=box.querySelector('[data-gift-search]').value.trim().toLowerCase(),previous=picker.value,rows=catalog.filter(it=>[it.name,it.displayName,it.rarity].join(' ').toLowerCase().includes(q)).slice(0,150);picker.innerHTML='<option value="">Choose an item…</option>'+rows.map(it=>`<option class="${magicRarityClass(it)}" value="${escText(it.index)}">${escText(it.name)} · ${escText(isMagicItem(it)?magicRarity(it):'Mundane')}</option>`).join('');if(rows.some(it=>it.index===previous))picker.value=previous;configure()};box.querySelector('[data-gift-search]').oninput=search;picker.onchange=configure;search();
 }
 box.querySelector('form').onsubmit=e=>{e.preventDefault();const data=new FormData(e.target);run(box,async()=>{
  let itemName=null,equipment=null;
  if(kind==='item'&&dm){const it=catalog.find(x=>x.index===data.get('catalog'));if(!it)throw Error('Choose an item from the catalog.');const spec=isMagicItem(it)?magicPropertySpec(it):null,base=spec?.bases.find(b=>b.index===data.get('base'));if(spec?.kind&&!base)throw Error('Choose the item’s base equipment.');equipment=isMagicItem(it)?magicPopulateEquipment(it,base,data.get('variant')):equipmentItem(it.name,it);equipment.rarity=isMagicItem(it)?magicRarity(it):'Mundane';itemName=equipment.name;}
  if(!dm){await window.ForgeCloud.preparePartyCharacter();if(window.ForgeCloud.diagnostics().pending)throw Error('Wait for your character to finish syncing and try again.');if(kind==='item')itemName=c.inventory[Number(data.get('index'))];}
  if(epoch!==generation||partyId!==selected)throw Error('Your party changed. Reopen this menu.');await refresh(true);if(epoch!==generation||partyId!==selected)throw Error('Your party changed. Reopen this menu.');
  const from=state.members.find(m=>m.user_id===accountId),to=state.members.find(m=>m.user_id===uid);if(!to?.character_id||to.character_id!==target.character_id)throw Error('The recipient changed characters. Reopen this menu.');
  const result=await rpc('forge_party_gift',{p_id:partyId,p_target:uid,p_revision:dm?null:from.character_revision,p_target_revision:to.character_revision,p_kind:kind,p_amount:kind==='gold'?Number(data.get('amount')):null,p_index:kind==='item'&&!dm?Number(data.get('index')):null,p_item:itemName,p_nonce:nonce,p_private:data.get('private')==='on',p_equipment:equipment});
  if(result.conflict)throw Error('A character changed. Review the latest sheet and try again.');await window.ForgeCloud.refresh();await refresh(true);box.close();
 })};
}
function giftItemClass(g){const it=typeof itemData==='function'&&itemData(g.item_name)||typeof MAGIC_ITEMS!=='undefined'&&MAGIC_ITEMS.find(x=>x.index===g.catalog_id);if(it&&typeof magicRarityClass==='function')return magicRarityClass(it);return 'item-rarity rarity-'+String(g.rarity||'mundane').toLowerCase().replace(/[^a-z]+/g,'-')}
function giftSentenceHTML(g){return `${escText(g.source_name)} ${g.dm_award?'has awarded':'has given'} ${escText(g.target_name)} ${g.kind==='gold'?`<strong class="gift-gold">${escText(Number(g.amount).toLocaleString(undefined,{maximumFractionDigits:2}))} gp</strong>`:`the item <strong class="${giftItemClass(g)}">${escText(g.item_name)}</strong>`}`}
const giftQueue=[];let giftTimer=null;
function showNextGift(){
 if(giftTimer!==null)return;let next;
 while(giftQueue.length){const candidate=giftQueue.shift();if(candidate.account===accountId&&candidate.party===selected&&view==='sheet'&&window.ForgeCloud.characterRef(draft?.id)?.id===candidate.gift.target_character_id){next=candidate;break}}
 if(!next)return;document.getElementById('partyGiftToast')?.remove();const el=document.createElement('div');el.id='partyGiftToast';el.className='party-gift-toast';el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.innerHTML=`<div class="gift-toast-card"><span class="gift-toast-icon" aria-hidden="true">${next.gift.kind==='gold'?'◉':'◇'}</span><small>${next.gift.dm_award?'CAMPAIGN REWARD':'PARTY GIFT'}${next.private?' · PRIVATE':''}</small><p>${giftSentenceHTML(next.gift)}</p></div>`;document.body.append(el);giftTimer=setTimeout(()=>{el.remove();giftTimer=null;showNextGift()},2000);
}
const localChatRefresh=forgeRefreshChat;forgeRefreshChat=function(c){const panel=document.getElementById('forgeRollChat');if(chatFor(c)&&panel){paintChatPanel(panel);return}if(panel?.dataset.chatBound){delete panel.dataset.chatBound;panel.replaceChildren();panel.remove();forgeRenderChat(c);return}localChatRefresh(c)};

let npcs=[],npcParty=null,typingUntil=0,lastTyping=0,typingUsers=[],bubbleMessages=new Map(),seenParty=null,seenIds=new Set();
const messageSound=new Audio('assets/message-notification.mp3');let soundReady=false;
document.addEventListener('pointerdown',()=>{soundReady=true},{once:true});
async function loadNPCs(){if(!selected)return;const id=selected;const rows=await rpc('forge_party_npcs',{p_id:id});if(id===selected){npcs=rows||[];npcParty=id}}
function npcManager(){if(!state?.is_dm)return;const id=selected,box=dialog('partyNPCs','NPCs',`<div class="party-dialog-body"><p>Create a speaker for this party. Choose them in the chat’s As menu.</p><form data-npc-form><label>Name<input name="name" required maxlength="80"></label><label>Portrait<input name="image" type="file" accept="image/png,image/jpeg,image/webp"></label><button type="submit" class="btn primary">Add NPC</button></form><p data-status role="status"></p><div data-npc-list></div></div>`);
 const paint=()=>{box.querySelector('[data-npc-list]').innerHTML=npcs.map(n=>`<div class="npc-speaker-row">${n.image?`<img src="${escText(n.image)}" alt="">`:''}<strong>${escText(n.name)}</strong><button type="button" data-delete-npc="${escText(n.id)}">Remove</button></div>`).join('');box.querySelectorAll('[data-delete-npc]').forEach(b=>b.onclick=()=>run(box,async()=>{npcs=await rpc('forge_party_npcs',{p_id:id,p_data:{action:'delete',id:b.dataset.deleteNpc}});paint();paintMessages()}))};
 box.querySelector('form').onsubmit=e=>{e.preventDefault();run(box,async()=>{const file=box.querySelector('[type=file]').files[0];let image='';if(file){if(file.size>10000000)throw Error('Choose an image smaller than 10 MB.');const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');canvas.width=canvas.height=160;canvas.getContext('2d').drawImage(bitmap,0,0,160,160);bitmap.close();image=canvas.toDataURL('image/webp',.75)}npcs=await rpc('forge_party_npcs',{p_id:id,p_data:{name:box.querySelector('[name=name]').value,image}});box.querySelector('form').reset();paint();paintMessages()})};loadNPCs().then(paint).catch(e=>box.querySelector('[data-status]').textContent=e.message);
}
function installWhisperSuggestions(input,controls){const popup=document.createElement('div');popup.className='whisper-suggestions';popup.hidden=true;input.after(popup);let index=0;
 const fill=name=>{input.value='/w "'+name+'" ';popup.hidden=true;input.focus()};
 input.addEventListener('input',()=>{const m=input.value.match(/^\/w\s+([^"\n]*)$/i);popup.hidden=!m;if(!m)return;const q=m[1].toLowerCase();const people=state.members.filter(m=>m.user_id!==accountId&&[memberName(m),m.account_name,m.is_dm?'DM':''].some(n=>String(n||'').toLowerCase().includes(q)));popup.innerHTML=people.map(m=>`<button type="button" data-whisper-name="${escText(memberName(m))}">${escText(memberName(m))}</button>`).join('');popup.hidden=!people.length;index=0;popup.querySelectorAll('button').forEach(b=>b.onmousedown=e=>{e.preventDefault();fill(b.dataset.whisperName)})});
 input.addEventListener('keydown',e=>{if(popup.hidden)return;const buttons=[...popup.querySelectorAll('button')];if(e.key==='Escape'){popup.hidden=true;e.preventDefault();e.stopImmediatePropagation()}else if(['ArrowDown','ArrowUp','Enter','Tab'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();if(e.key==='Enter'||e.key==='Tab')fill(buttons[index].dataset.whisperName);else{index=(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons.forEach((b,i)=>b.classList.toggle('active',i===index))}}},true);
}
async function pollTyping(active=false){if(!state?.social_ready||!selected)return;if(active&&Date.now()-lastTyping<1800)return;lastTyping=Date.now();const id=selected,panel=document.activeElement?.closest('.party-roll-chat'),recipient=panel?.querySelector('[data-chat-recipient]')?.value||null;const val=panel?.querySelector('textarea')?.value||'';if(/^\/w\s/i.test(val))return;try{const rows=await rpc('forge_party_typing',{p_id:id,p_active:typingUntil>Date.now(),p_recipient:recipient});if(id===selected){typingUsers=rows||[];paintBubbles()}}catch{}}

const bubbleNodes=new Map();let bubbleTimer=null;
function notifyMessages(old,rows){
 if(seenParty!==selected){seenParty=selected;seenIds=new Set(rows.map(m=>m.id));bubbleMessages.clear();typingUsers=[];paintBubbles();return}
 if(old.length&&!rows.length){bubbleMessages.clear();typingUsers=[]}let sound=false;for(const m of rows){if(seenIds.has(m.id))continue;seenIds.add(m.id);if(m.kind==='transfer'&&m.gift?.target_user_id===accountId){giftQueue.push({gift:m.gift,private:!!m.recipient_id,account:accountId,party:selected});showNextGift()}bubbleMessages.set(m.sender_id,{text:m.kind==='roll'?m.label+': '+m.total:m.body,until:Date.now()+6500});if(m.sender_id!==accountId)sound=true}
 if(sound&&soundReady){messageSound.currentTime=0;messageSound.play().catch(()=>{})}paintBubbles();
}
function paintBubbles(){
 const now=Date.now(),wanted=new Set();let nextExpiry=Infinity;
 if(bubbleTimer!==null){clearTimeout(bubbleTimer);bubbleTimer=null}
 if(state)for(const m of state.members){
  const msg=bubbleMessages.get(m.user_id),typing=typingUsers.some(t=>t.user_id===m.user_id),text=msg?.until>now?msg.text:null;
  if(text)nextExpiry=Math.min(nextExpiry,msg.until);if(!text&&!typing)continue;
  document.querySelectorAll(`[data-member="${m.user_id}"]`).forEach(anchor=>{
   if(anchor.closest('dialog'))return;
   const key=selected+':'+(anchor.closest('.dm-pc-card')?'dm':'sheet')+':'+m.user_id;wanted.add(key);
   let bubble=bubbleNodes.get(key);
   if(!bubble){bubble=document.createElement('button');bubble.type='button';bubble.className='party-speech-bubble bubble-enter';bubbleNodes.set(key,bubble);setTimeout(()=>bubble.classList.remove('bubble-enter'),280);bubble.onclick=e=>{e.stopPropagation();chatDialog()}}
   if(bubble.fadeTimer){clearTimeout(bubble.fadeTimer);bubble.fadeTimer=null}bubble.classList.remove('bubble-out');
   const content=text?'message:'+text:'typing';if(bubble.dataset.content!==content){bubble.dataset.content=content;bubble.setAttribute('aria-label',text?'Open chat: '+text:'Typing… Open chat');bubble.innerHTML=text?escText(text.length>85?text.slice(0,82)+'…':text):'<i></i><i></i><i></i>'}
   if(bubble.parentElement!==anchor.parentElement)anchor.parentElement.append(bubble);
  });
 }
 for(const [key,bubble] of bubbleNodes){if(wanted.has(key)||bubble.fadeTimer)continue;bubble.classList.add('bubble-out');bubble.fadeTimer=setTimeout(()=>{bubble.remove();bubbleNodes.delete(key)},250)}
 if(Number.isFinite(nextExpiry))bubbleTimer=setTimeout(paintBubbles,Math.max(20,nextExpiry-now+10));
}

window.ForgeParty={record:shareRoll,chatFor:chatFor,summary,accountChanged,open:openHub,refresh,ledgerGroups,renderDMTools};
window.addEventListener('pagehide',()=>{presenceClosing=true;presenceQueued=false;closePresence()});window.addEventListener('online',()=>refresh(true));window.addEventListener('focus',()=>updatePresence());window.addEventListener('blur',()=>updatePresence());window.addEventListener('pageshow',()=>{presenceClosing=false;updatePresence()});setInterval(()=>{if(accountId&&selected)updatePresence()},20000);document.addEventListener('visibilitychange',()=>{updatePresence();if(!document.hidden)refresh(true)});
setInterval(()=>{accountChanged();if(accountId&&!document.hidden&&(selected||document.getElementById('partyDialog')))refresh()},3000);
})();
