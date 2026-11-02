// Run with FORGE_PGLITE_MODULE pointing to an installed @electric-sql/pglite.
const {PGlite}=require(process.env.FORGE_PGLITE_MODULE||'@electric-sql/pglite');
const fs=require('fs'),assert=require('assert');
const uidA='11111111-1111-4111-8111-111111111111',uidB='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
(async()=>{
const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create schema storage;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}',is_anonymous boolean default false);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,storage,public to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid,name text,bucket_id text);alter table storage.objects enable row level security;
grant select,insert,delete on storage.objects to authenticated;
create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
insert into auth.users values('${uidA}'),('${uidB}');`);
await db.exec(fs.readFileSync(__dirname+'/../supabase/schema.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/parties.sql','utf8'));
await db.exec('alter table auth.users add column if not exists is_anonymous boolean default false');
await db.exec(fs.readFileSync(__dirname+'/../supabase/guest-parties.sql','utf8'));

await db.exec(fs.readFileSync(__dirname+'/../supabase/party-character-removal.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/party-death-portrait.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/party-zero-hp.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/separate-dm-join.sql','utf8'));
async function as(uid){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);await db.exec('set role '+(uid?'authenticated':'anon'))}
async function command(action,party=null,args={}){return (await db.query('select public.forge_party_command($1,$2,$3) result',[action,party,JSON.stringify(args)])).rows[0].result}
async function state(party){return (await db.query('select public.forge_party_state($1) result',[party])).rows[0].result}

await as(uidA);const party=(await command('create',null,{name:'Guest party'})).id;const code=(await state(party)).invite_code;
await db.exec('reset role');await db.query('update auth.users set is_anonymous=true where id=$1',[uidB]);await as(uidB);
await assert.rejects(()=>command('create',null,{name:'Not allowed'}));assert((await command('join',null,{code:'BAD'})).error);assert((await command('join',null,{code})).id);let st=await state(party);assert.equal(st.members.length,2);assert.equal(st.is_dm,false);assert.equal(st.is_organizer,false);await assert.rejects(()=>command('assign_dm',party,{version:st.version,user_id:uidB}));await assert.rejects(()=>command('start_session',party,{version:st.version}));
await db.query('select public.save_character($1,$2,0,$3,false)',[id,'guest-char',JSON.stringify({schema_version:1,character:{id:'guest-char',name:'Guest hero',notes:'PRIVATE'},_party:{max_hp:10}})]);await command('select_character',party,{character_id:id});await as(uidA);st=await state(party);assert.equal(st.members.find(m=>m.user_id===uidB).name,'Guest hero');assert(!JSON.stringify(st).includes('PRIVATE'));assert(st.members.find(m=>m.user_id===uidB).conditions.includes('incapacitated'));assert(st.members.find(m=>m.user_id===uidB).conditions.includes('prone'));await as(uidB);await db.query('select public.save_character($1,$2,1,$3,true)',[id,'guest-char',JSON.stringify({schema_version:1,character:{id:'guest-char',name:'Guest hero'}})]);await assert.rejects(()=>state(party));await as(uidA);await assert.rejects(async()=>command('assign_dm',party,{version:(await state(party)).version,user_id:uidA}));const dmCode=(await db.query('select public.forge_party_dm_invite($1) result',[party])).rows[0].result.code;
await as(uidB);assert((await db.query('select public.forge_party_join_dm($1) result',[code])).rows[0].result.error);await assert.rejects(()=>db.query('select public.forge_party_dm_invite($1)',[party]));const joined=(await db.query('select public.forge_party_join_dm($1) result',[dmCode])).rows[0].result;assert.equal(joined.id,party);st=await state(party);assert(st.is_dm);assert.equal(st.members.find(m=>m.user_id===uidB).character_id,null);await assert.rejects(()=>command('select_character',party,{character_id:id}));await command('start_session',party,{version:st.version});await command('leave',party);assert((await db.query('select public.forge_party_join_dm($1) result',[dmCode])).rows[0].result.error,'DM code consumed');
await as(null);await assert.rejects(()=>command('join',null,{code}));await db.close();console.log('PASS guest party SQL: registered organizer, guest invite/character, denied DM/organizer escalation, private notes, revocation and unauthenticated isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
