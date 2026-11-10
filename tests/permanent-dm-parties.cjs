// Run with FORGE_PGLITE_MODULE pointing to an installed @electric-sql/pglite.
const {PGlite}=require(process.env.FORGE_PGLITE_MODULE||'@electric-sql/pglite');
const fs=require('fs'),assert=require('assert');
const uidA='11111111-1111-4111-8111-111111111111',uidB='22222222-2222-4222-8222-222222222222',uidDM='55555555-5555-4555-8555-555555555555',id='33333333-3333-4333-8333-333333333333';
(async()=>{
const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create schema storage;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',is_anonymous boolean default false);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,storage,public to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid,name text,bucket_id text);alter table storage.objects enable row level security;
grant select,insert,delete on storage.objects to authenticated;
create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
insert into auth.users values('${uidA}'),('${uidB}'),('${uidDM}');`);
await db.exec(fs.readFileSync(__dirname+'/../supabase/schema.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/parties.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/separate-dm-join.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/party-social.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/guest-parties.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/party-character-removal.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/party-presence.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/permanent-dm-parties.sql','utf8'));



async function as(uid){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);await db.exec('set role '+(uid?'authenticated':'anon'))}
async function command(action,party=null,args={}){return (await db.query('select public.forge_party_command($1,$2,$3) result',[action,party,JSON.stringify(args)])).rows[0].result}
async function state(party){return (await db.query('select public.forge_party_state($1) result',[party])).rows[0].result}
await as(uidA);
const party=(await command('create',null,{name:'DM-owned campaign',as_dm:true})).id;
let s=await state(party);assert(s.is_dm&&s.is_organizer&&s.has_dm);assert.equal(s.members.length,1);assert.equal(s.members[0].character_id,null);assert(s.invite_code);
await assert.rejects(()=>command('select_character',party,{character_id:id}));
await command('start_session',party,{version:s.version});s=await state(party);assert(s.session_active);
await command('end_session',party,{version:s.version});s=await state(party);assert(s.is_dm&&s.is_organizer);
const code=s.invite_code;
await as(uidB);await assert.rejects(()=>state(party));await command('join',null,{code});
const payload={schema_version:1,character:{name:'Hero',hp:20},_party:{max_hp:20}};
await db.query('select public.save_character($1,$2,0,$3,false)',[id,'local',JSON.stringify(payload)]);
await command('select_character',party,{character_id:id});await command('select_character',party,{character_id:null});s=await state(party);assert(s.members.some(m=>m.user_id===uidB));
await command('select_character',party,{character_id:id});
await db.query('select public.save_character($1,$2,1,$3,true)',[id,'local',JSON.stringify(payload)]);
s=await state(party);assert.equal(s.members.find(m=>m.user_id===uidB).character_id,null);assert(s.members.some(m=>m.user_id===uidB));
// No inactivity expiry: a years-old party remains listed and keeps its roles.
await db.exec('reset role');await db.query("update public.forge_parties set created_at=now()-interval '5 years' where id=$1",[party]);await as(uidA);
assert((await db.query('select public.forge_party_list() as result')).rows[0].result.some(p=>p.id===party&&p.is_dm&&p.is_organizer));
// A player may still create a party without assigning a DM.
const playerParty=(await command('create',null,{name:'No DM needed'})).id;s=await state(playerParty);assert(s.is_organizer&&!s.is_dm&&!s.has_dm);
const ownerChar='44444444-4444-4444-8444-444444444444';await db.query('select public.save_character($1,$2,0,$3,false)',[ownerChar,'owner',JSON.stringify(payload)]);await command('select_character',playerParty,{character_id:ownerChar});
await db.query('select public.save_character($1,$2,1,$3,true)',[ownerChar,'owner',JSON.stringify(payload)]);s=await state(playerParty);assert(s.is_organizer);assert.equal(s.members.length,1);assert.equal(s.members[0].character_id,null);
// Guest creation still fails, and explicit leave/disband still work.
await db.exec('reset role');await db.query('update auth.users set is_anonymous=true where id=$1',[uidDM]);await as(uidDM);await assert.rejects(()=>command('create',null,{name:'Guest campaign',as_dm:true}));
await as(uidB);await command('leave',party);await assert.rejects(()=>state(party));
await as(uidA);s=await state(playerParty);await command('disband',playerParty,{version:s.version});await assert.rejects(()=>state(playerParty));
await db.close();console.log('PASS permanent parties: DM+organizer atomic creation, player invite/join, optional DM, character clearing/deletion, last-member preservation, age, guest and access restrictions, explicit leave/disband');
})().catch(e=>{console.error(e);process.exitCode=1});
