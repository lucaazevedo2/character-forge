const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto').webcrypto;
const source=fs.readFileSync(__dirname+'/../cloud-saves.js','utf8');
function storage(){const obj={};Object.defineProperties(obj,{getItem:{value:k=>obj[k]??null},setItem:{value:(k,v)=>{obj[k]=String(v)}},removeItem:{value:k=>{delete obj[k]}}});return obj}
function makeBackend(){return {rows:new Map(),fail:false,hold:null,calls:0}}
function harness(db,uid,local=storage(),tabId){
 const ctx={console,crypto,Uint8Array,TextEncoder,Blob,fetch,FileReader:class{},navigator:{onLine:true},location:{origin:'https://forge.test'},localStorage:local,sessionStorage:storage(),timers:[],events:{},document:{getElementById:()=>null},confirm:()=>true};
 if(tabId)ctx.sessionStorage.setItem('forge-cloud-tab',tabId);
 ctx.window=ctx;ctx.addEventListener=(type,fn)=>ctx.events[type]=fn;ctx.setTimeout=fn=>{ctx.timers.push(fn);return ctx.timers.length};ctx.clearTimeout=()=>{};
 ctx.chars=[];ctx.CUSTOM={races:[],classes:[],subs:[],bgs:[],spells:[],items:[]};ctx.draft=null;ctx.view='home';ctx.activeId=null;ctx.editingCreation=false;ctx.editSnapshot=null;ctx.render=()=>{};ctx.renderHome=()=>{};ctx.applyCustom=()=>{};ctx.validCharacterAvatar=()=>false;ctx.downloadJSON=()=>{};
 ctx.storeSet=async(k,v)=>local.setItem(ctx.ForgeCloud?.storageKey(k)||k,JSON.stringify(v));
 const client={auth:{getSession:async()=>({data:{session:uid?{user:{id:uid,email:uid+'@test'}}:null}}),onAuthStateChange:fn=>{ctx.authEvent=fn},signOut:async()=>({})},
 from:()=>({select:()=>({order:async()=>db.fail?{error:{}}:{data:[...db.rows.values()].filter(r=>r.owner_id===uid).map(r=>structuredClone(r))}})}),
 rpc:async(name,p)=>{db.calls++;if(db.hold)await db.hold;if(db.fail)return {error:{code:'NETWORK'}};let row=[...db.rows.values()].find(r=>r.owner_id===uid&&r.local_id===p.p_local_id);
 if(row&&(row.id!==p.p_id||row.revision!==p.p_expected_revision))return {data:{status:'conflict',row:structuredClone(row)}};
 if(!row&&(p.p_expected_revision!==0||p.p_deleted))return {data:{status:'missing'}};
 if(db.rows.has(p.p_id)&&db.rows.get(p.p_id).owner_id!==uid)return {error:{code:'23505'}};
 row={id:p.p_id,owner_id:uid,local_id:p.p_local_id,revision:(row?.revision||0)+1,data:structuredClone(p.p_data),updated_at:new Date().toISOString(),deleted_at:p.p_deleted?new Date().toISOString():null};db.rows.set(row.id,row);return {data:{status:'saved',row:structuredClone(row)}};
 },storage:{from:()=>({upload:async()=>({}),download:async()=>({error:{}})})}};
 ctx.supabase={createClient:()=>client};ctx.FORGE_CLOUD_CONFIG={enabled:true,supabaseUrl:'https://example.supabase.co',publishableKey:'public-test'};
 vm.createContext(ctx);vm.runInContext(source,ctx);return ctx;
}
const hero=(name='Hero')=>({id:'local-one',name,base:{str:10},notes:'',schema_version:1});
(async()=>{
 const db=makeBackend(),local=storage();local.setItem('forge-chars',JSON.stringify([hero('Guest')]));
 const a=harness(db,'account-a',local);await a.ForgeCloud.initialize();
 assert.equal(a.chars.length,0,'sign-in must not auto-upload guests');assert.equal(db.rows.size,0);assert.equal(JSON.parse(local.getItem('forge-chars'))[0].name,'Guest');
 a.chars=[hero('Cloud hero')];await a.storeSet('forge-chars',a.chars);assert(a.ForgeCloud.diagnostics().pending);await a.ForgeCloud.sync();assert.equal(db.rows.size,1);assert(!a.ForgeCloud.diagnostics().pending);
 const b=harness(db,'account-b',local);await b.ForgeCloud.initialize();assert.equal(b.chars.length,0,'second account isolated');assert.notEqual(a.ForgeCloud.storageKey('forge-chars'),b.ForgeCloud.storageKey('forge-chars'));
 const second=harness(db,'account-a',local);await second.ForgeCloud.initialize();assert.equal(second.chars[0].name,'Cloud hero');
 a.chars[0].name='First tab';await a.storeSet('forge-chars',a.chars);await a.ForgeCloud.sync();
 second.chars[0].name='Second tab';await second.storeSet('forge-chars',second.chars);await second.ForgeCloud.sync();assert.equal(second.ForgeCloud.diagnostics().conflicts,1);assert.equal([...db.rows.values()][0].data.character.name,'First tab','stale writer must not overwrite');
 db.fail=true;a.chars[0].notes='Offline edit';await a.storeSet('forge-chars',a.chars);await a.ForgeCloud.sync();assert(a.ForgeCloud.diagnostics().pending);
 const tabId=a.sessionStorage.getItem('forge-cloud-tab'),reloaded=harness(db,'account-a',local,tabId);await reloaded.ForgeCloud.initialize();assert.equal(reloaded.chars[0].notes,'Offline edit','pending edits survive reload');assert(reloaded.ForgeCloud.diagnostics().pending);
 db.fail=false;await reloaded.ForgeCloud.sync();assert(!reloaded.ForgeCloud.diagnostics().pending);assert.equal([...db.rows.values()][0].data.character.notes,'Offline edit');
 reloaded.chars=[];await reloaded.storeSet('forge-chars',[]);await reloaded.ForgeCloud.sync();assert([...db.rows.values()][0].deleted_at,'delete uses trash');
 const third=harness(db,'account-a');await third.ForgeCloud.initialize();assert.equal(third.chars.length,0,'trash does not appear in active list');
 // Newer local edits arriving during a request must stay queued, not be marked saved.
 const raceDB=makeBackend(),race=harness(raceDB,'race');await race.ForgeCloud.initialize();race.chars=[hero()];await race.storeSet('forge-chars',race.chars);let release;raceDB.hold=new Promise(r=>release=r);const syncing=race.ForgeCloud.sync();await Promise.resolve();race.chars[0].notes='Edited during request';await race.storeSet('forge-chars',race.chars);release();await syncing;assert(race.ForgeCloud.diagnostics().pending);raceDB.hold=null;await race.ForgeCloud.sync();assert.equal([...raceDB.rows.values()][0].data.character.notes,'Edited during request');
 // A same-local-ID import from another device is a conflict, never another row.
 const duplicate=harness(raceDB,'race');await duplicate.ForgeCloud.initialize();duplicate.chars=[hero('Imported again')];await duplicate.storeSet('forge-chars',duplicate.chars);await duplicate.ForgeCloud.sync();assert.equal(raceDB.rows.size,1);
 // Auth sign-out hides account data and returns to guest data.
 a.authEvent('SIGNED_OUT',null);await a.timers.pop()();assert.equal(a.ForgeCloud.diagnostics().signedIn,false);assert.equal(a.chars[0].name,'Guest');
 console.log('PASS cloud saves: guest isolation, account isolation, successful writes, conflicts, offline reload/retry, soft deletes, in-flight edits, duplicate IDs, session sign-out');
})().catch(e=>{console.error(e);process.exitCode=1});
