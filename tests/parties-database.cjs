// Run with FORGE_PGLITE_MODULE pointing to an installed @electric-sql/pglite.
const {PGlite}=require(process.env.FORGE_PGLITE_MODULE||'@electric-sql/pglite');
const fs=require('fs'),assert=require('assert');
const uidA='11111111-1111-4111-8111-111111111111',uidB='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
(async()=>{
const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create schema storage;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,storage,public to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid,name text,bucket_id text);alter table storage.objects enable row level security;
grant select,insert,delete on storage.objects to authenticated;
create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
insert into auth.users values('${uidA}'),('${uidB}');`);
await db.exec(fs.readFileSync(__dirname+'/../supabase/schema.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/parties.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/party-social.sql','utf8'));

async function as(uid){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);await db.exec('set role '+(uid?'authenticated':'anon'))}
async function command(action,party=null,args={}){return (await db.query('select public.forge_party_command($1,$2,$3) result',[action,party,JSON.stringify(args)])).rows[0].result}
async function state(party){return (await db.query('select public.forge_party_state($1) result',[party])).rows[0].result}
await as(uidA);const party=(await command('create',null,{name:'Test party'})).id;let s=await state(party);const code=s.invite_code;assert.equal(s.is_dm,false);assert.equal(s.is_organizer,true);assert.equal(s.has_dm,false);assert.equal(s.members.length,1);await assert.rejects(()=>command('start_session',party,{version:s.version}));await command('assign_dm',party,{version:s.version,user_id:uidA});s=await state(party);assert.equal(s.is_dm,true);
await as(uidB);await assert.rejects(()=>state(party));await assert.rejects(()=>db.query('select * from public.forge_parties'));assert.equal((await command('join',null,{code:'WRONG'})).error,'Invite code not found');
await command('join',null,{code});let player=await state(party);assert.equal(player.invite_code,null);assert.equal(player.is_dm,false);
const payload={schema_version:1,character:{id:'local',name:'Player',hp:20,tempHp:3,notes:'TOP SECRET',level:3,conditionTracker:{active:[],exhaustion:0,concentrating:true,effect:'Bless'}},_party:{max_hp:30,class_name:'Wizard',race_name:'Human'},portrait_path:uidB+'/'+id+'/test.webp'};
await db.query('select public.save_character($1,$2,0,$3,false)',[id,'local',JSON.stringify(payload)]);
await command('select_character',party,{character_id:id});await assert.rejects(()=>command('start_session',party,{version:player.version}));
await as(uidA);s=await state(party);assert(!JSON.stringify(s).includes('TOP SECRET'));assert.equal(s.members.find(m=>m.user_id===uidB).hp,20);
assert.equal((await db.query('select public.forge_party_portrait_allowed($1) allowed',[payload.portrait_path])).rows[0].allowed,true);
await db.exec('reset role');await db.query("update public.characters set data=jsonb_set(data,'{portrait_path}',$1::jsonb) where id=$2",[JSON.stringify(uidA+'/'+id+'/stolen.webp'),id]);await as(uidB);assert.equal((await db.query('select public.forge_party_portrait_allowed($1) allowed',[uidA+'/'+id+'/stolen.webp'])).rows[0].allowed,false,'forged path cannot grant another owner portrait access');await db.exec('reset role');await db.query("update public.characters set data=jsonb_set(data,'{portrait_path}',$1::jsonb) where id=$2",[JSON.stringify(payload.portrait_path),id]);await as(uidA);
await assert.rejects(()=>command('select_character',party,{character_id:id}));
await command('start_session',party,{version:s.version});s=await state(party);await command('start_combat',party,{version:s.version});s=await state(party);
await command('add_npc',party,{version:s.version,name:'Hidden dragon',max_hp:200,initiative:18,hidden:true});s=await state(party);assert.equal(s.combatants.length,2);await command('add_npc',party,{version:s.version,name:'Visible goblin',max_hp:20,initiative:10,hidden:false});s=await state(party);
await as(uidB);player=await state(party);assert.equal(player.combatants.length,2);assert(player.combatants.every(c=>c.hp===null&&c.max_hp===null));assert(player.combatants.some(c=>c.name==='Visible goblin'));await command('initiative',party,{initiative:15});
await as(uidA);s=await state(party);assert.equal((await command('next_turn',party,{version:s.version-1})).conflict,true);await command('next_turn',party,{version:s.version});s=await state(party);assert(s.current_id);
await as(uidB);player=await state(party);assert.equal(player.hidden_turn,true);assert.equal(player.current_id,null);assert.equal(player.turns_running,true);await assert.rejects(()=>command('initiative',party,{initiative:19}));
await as(uidA);s=await state(party);const inspected=(await db.query('select public.forge_party_character($1,$2) result',[party,id])).rows[0].result;assert(!JSON.stringify(inspected).includes('TOP SECRET'));await command('vitals',party,{version:s.version,character_id:id,character_revision:1,hp:10,temp_hp:0,conditions:['stunned'],exhaustion:1});
await as(uidB);const own=(await db.query('select data,revision from public.characters where id=$1',[id])).rows[0];assert.equal(own.data.character.hp,10);assert.equal(own.data.character.conditionTracker.concentrating,false);assert.equal(own.revision,2);
await assert.rejects(()=>command('remove_member',party,{version:s.version,user_id:uidA}));await assert.rejects(()=>db.query('select public.forge_party_character($1,$2)',[party,id]));
await as(uidA);s=await state(party);await command('save_dm_notes',party,{version:s.version,notes:'DM SECRET'});s=await state(party);assert.equal(s.dm_notes,'DM SECRET');await command('assign_dm',party,{version:s.version,user_id:uidB});s=await state(party);assert.equal(s.is_dm,false);assert.equal(s.is_organizer,true);assert.equal(s.session_active,false);assert.equal(s.dm_notes,null);await assert.rejects(()=>command('start_session',party,{version:s.version}));const ownerChar='44444444-4444-4444-8444-444444444444';await db.query('select public.save_character($1,$2,0,$3,false)',[ownerChar,'organizer-character',JSON.stringify({schema_version:1,character:{name:'Organizer hero',hp:20,notes:'ORGANIZER PRIVATE NOTE'},_party:{max_hp:20,scores:{str:16}}})]);await command('select_character',party,{character_id:ownerChar});await as(uidB);s=await state(party);assert.equal(s.is_dm,true);assert.equal(s.is_organizer,false);assert.equal(s.dm_notes,'');await command('start_session',party,{version:s.version});s=await state(party);await command('vitals',party,{version:s.version,character_id:ownerChar,character_revision:1,hp:12,temp_hp:0,conditions:[],exhaustion:0});const overview=(await db.query('select public.forge_party_character($1,$2) result',[party,ownerChar])).rows[0].result;assert(!JSON.stringify(overview).includes('ORGANIZER PRIVATE NOTE'));s=await state(party);await assert.rejects(()=>command('rotate_code',party,{version:s.version}));
await as(uidA);s=await state(party);await command('remove_member',party,{version:s.version,user_id:uidB});
s=await state(party);assert.equal(s.has_dm,false);assert.equal(s.session_active,false);await as(uidB);await assert.rejects(()=>state(party));assert.equal((await db.query('select public.forge_party_portrait_allowed($1) allowed',[payload.portrait_path])).rows[0].allowed,false);
await as(null);await assert.rejects(()=>command('join',null,{code}));
await db.close();console.log('PASS party SQL: create/join, membership isolation, private summary, portrait scope/revocation, DM permissions, initiative/version conflicts, hidden NPCs, vitals synchronization');
})().catch(e=>{console.error(e);process.exitCode=1});
