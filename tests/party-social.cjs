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
const C='44444444-4444-4444-8444-444444444444',D='55555555-5555-4555-8555-555555555555';
await db.exec(`insert into auth.users(id) values('${C}'),('${D}');`);
const act=async(a,args={})=>{const st=await state(party);return command(a,party,{version:st.version,...args})};
await as(uidA);const party=(await command('create',null,{name:'Social test'})).id;const code=(await state(party)).invite_code;
await act('invite_dm');const dmCode=(await state(party)).dm_invite_code;assert(dmCode&&dmCode!==code);
await as(uidB);await command('join',null,{code});assert.equal((await state(party)).dm_invite_code,null);await assert.rejects(()=>act('invite_dm'));await assert.rejects(()=>act('set_admin',{user_id:uidB,enabled:true}));
await as(C);await command('join',null,{code:dmCode});assert.equal((await state(party)).is_dm,true);await as(D);assert((await command('join',null,{code:dmCode})).error);await command('join',null,{code});
await as(uidA);await act('set_admin',{user_id:uidB,enabled:true});await as(uidB);assert.equal((await state(party)).is_admin,true);await act('rotate_code');await assert.rejects(()=>act('disband'));await assert.rejects(()=>act('transfer_owner',{user_id:uidB}));await assert.rejects(()=>act('remove_member',{user_id:uidA}));
const chat=async(msg=null)=>(await db.query('select public.forge_party_chat($1,$2) result',[party,msg&&JSON.stringify(msg)])).rows[0].result;
const nonce='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';await chat({nonce,recipient_id:D,body:'SECRET'});await chat({nonce,recipient_id:D,body:'SECRET'});assert.equal((await chat()).length,1);
await as(C);assert.equal((await chat()).length,0,'DM cannot see other players whispers');await as(uidA);assert.equal((await chat()).length,0,'organizer cannot see others whispers');await as(D);assert.equal((await chat())[0].body,'SECRET');
await chat({nonce:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',body:'PUBLIC'});await as(C);assert.equal((await chat())[0].body,'PUBLIC');
await assert.rejects(()=>db.query('select * from public.forge_party_messages'));
const aChar='66666666-6666-4666-8666-666666666666',bChar='77777777-7777-4777-8777-777777777777';
async function save(uid,id,gold,inventory,equipped=[]){await as(uid);await db.query('select public.save_character($1,$2,0,$3,false)',[id,id,JSON.stringify({schema_version:1,character:{id,name:id,gold,coins:{cp:0,sp:0,ep:0,pp:0},inventory,equipped}})]);await command('select_character',party,{character_id:id})}
await save(uidB,aChar,10,['Rope','Sword','Shield'],[2]);await save(D,bChar,2,[]);
const give=async(kind,amount=null,index=null,item=null,revisions=null)=>{let st=await state(party),src=st.members.find(m=>m.user_id===uidB),dst=st.members.find(m=>m.user_id===D);return (await db.query('select public.forge_party_give($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[party,D,revisions?.[0]??src.character_revision,revisions?.[1]??dst.character_revision,kind,amount,index,item,require('crypto').randomUUID()])).rows[0].result};
await as(uidB);await assert.rejects(()=>give('gold',11));assert((await give('gold',3.25,null,null,[0,0])).conflict);await give('gold',3.25);await assert.rejects(()=>give('item',null,2,'Shield'));await give('item',null,0,'Rope');await assert.rejects(()=>give('item',null,0,'Rope'));
await db.exec('reset role');const rows=(await db.query('select id,data from public.characters order by id')).rows;assert.equal(rows[0].data.character.gold,6);assert.equal(rows[0].data.character.coins.sp,7);assert.equal(rows[0].data.character.coins.cp,5);assert.deepEqual(rows[0].data.character.inventory,['Sword','Shield']);assert.deepEqual(rows[0].data.character.equipped,[1]);assert.equal(rows[1].data.character.gold,5.25);assert.deepEqual(rows[1].data.character.inventory,['Rope']);
await as(uidA);await act('transfer_owner',{user_id:uidB});assert.equal((await state(party)).is_organizer,false);assert.equal((await state(party)).is_admin,true);await as(uidB);assert.equal((await state(party)).is_organizer,true);
// Fill to 10 players, excluding the DM, and ensure the next player cannot join.
const newCode=(await state(party)).invite_code;for(let i=6;i<=13;i++){const uid=`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;await db.exec('reset role');await db.query('insert into auth.users(id) values($1)',[uid]);await as(uid);const joined=await command('join',null,{code:newCode});if(i<=12)assert(joined.id);else assert.match(joined.error,/10 players/)}
await as(null);await assert.rejects(()=>chat());await db.close();console.log('PASS social SQL: single-use DM invites, admin and ownership boundaries, whisper isolation from DM/organizer, idempotent chat, atomic gold/items, stale revisions, equipped indices, 10-player cap');
})().catch(e=>{console.error(e);process.exitCode=1});
