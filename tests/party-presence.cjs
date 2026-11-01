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
await db.exec('alter table auth.users add column is_anonymous boolean default false');
await db.exec(fs.readFileSync(__dirname+'/../supabase/party-presence.sql','utf8'));

async function as(uid){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);await db.exec('set role '+(uid?'authenticated':'anon'))}
async function command(action,party=null,args={}){return (await db.query('select public.forge_party_command($1,$2,$3) result',[action,party,JSON.stringify(args)])).rows[0].result}
async function state(party){return (await db.query('select public.forge_party_state($1) result',[party])).rows[0].result}

const tabA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',tabB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',tabC='cccccccc-cccc-4ccc-8ccc-cccccccccccc',charA='66666666-6666-4666-8666-666666666666',charB='77777777-7777-4777-8777-777777777777';
const presence=async(mode='away',character=null,tab=tabA,pid=party)=>(await db.query('select public.forge_party_presence($1,$2,$3,$4) result',[pid,tab,mode,character])).rows[0].result.members;
await as(uidA);const party=(await command('create',null,{name:'Presence test'})).id;let st=await state(party);const code=st.invite_code;await command('assign_dm',party,{version:st.version,user_id:uidA});
await as(uidB);await command('join',null,{code});
for(const [uid,id] of [[uidA,charA],[uidB,charB]]){await as(uid);await db.query('select public.save_character($1,$2,0,$3,false)',[id,id,JSON.stringify({schema_version:1,character:{id,name:'Hero'}})]);await command('select_character',party,{character_id:id})}
await db.exec('reset role');await db.query("update auth.users set raw_user_meta_data=$1 where id=$2",[JSON.stringify({avatar_url:'https://lh3.googleusercontent.com/avatar'}),uidA]);
await as(uidA);let rows=await presence();assert(!rows.some(m=>m.dm_online||m.character_online),'login without an active page stays offline');assert.equal(rows.find(m=>m.user_id===uidA).account_avatar,'https://lh3.googleusercontent.com/avatar');
rows=await presence('dmtools');assert(rows.find(m=>m.user_id===uidA).dm_online);assert(!rows.find(m=>m.user_id===uidA).character_online);
rows=await presence('sheet',charA,tabC);assert(rows.find(m=>m.user_id===uidA).dm_online);assert(rows.find(m=>m.user_id===uidA).character_online);rows=await presence('away');assert(!rows.find(m=>m.user_id===uidA).dm_online);assert(rows.find(m=>m.user_id===uidA).character_online,'closing one tab preserves other active tabs');
await as(uidB);await assert.rejects(()=>presence('dmtools'));await assert.rejects(()=>presence('sheet',charA));await assert.rejects(()=>presence('sheet',null));rows=await presence('sheet',charB,tabB);assert(rows.find(m=>m.user_id===uidB).character_online);
await assert.rejects(()=>db.query('select * from public.forge_party_presence'));await assert.rejects(()=>presence('away',null,tabA,'99999999-9999-4999-8999-999999999999'));
await db.exec('reset role');await db.exec("update public.forge_party_presence set seen_at=now()-interval '46 seconds'");await as(uidB);rows=await presence('away',null,tabB);assert(!rows.some(m=>m.dm_online||m.character_online),'stale dots expire after 45 seconds');
await db.exec('reset role');await db.query('update auth.users set is_anonymous=true where id=$1',[uidA]);await as(uidB);rows=await presence();assert.equal(rows.find(m=>m.user_id===uidA).account_avatar,null,'guest DM never exposes an account avatar');
await as(null);await assert.rejects(()=>presence());await db.close();console.log('PASS presence SQL: page-specific activity, DM role checks, assigned-sheet checks, member isolation, multi-tab independence, timeout and guest avatars');
})().catch(e=>{console.error(e);process.exitCode=1});
