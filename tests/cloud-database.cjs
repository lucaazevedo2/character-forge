// Run with FORGE_PGLITE_MODULE pointing to an installed @electric-sql/pglite.
const {PGlite}=require(process.env.FORGE_PGLITE_MODULE||'@electric-sql/pglite');
const fs=require('fs'),assert=require('assert');
const uidA='11111111-1111-4111-8111-111111111111',uidB='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
(async()=>{
const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;create schema storage;create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,storage,public to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid,name text,bucket_id text);alter table storage.objects enable row level security;
grant select,insert,delete on storage.objects to authenticated;
create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
insert into auth.users values('${uidA}'),('${uidB}');`);
await db.exec(fs.readFileSync(__dirname+'/../supabase/schema.sql','utf8'));
async function as(uid){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);await db.exec('set role '+(uid?'authenticated':'anon'))}
async function save(expected,data={schema_version:1,character:{name:'Hero'}},deleted=false,cloudId=id){return (await db.query('select public.save_character($1,$2,$3,$4,$5) result',[cloudId,'local',expected,JSON.stringify(data),deleted])).rows[0].result}
async function denied(fn){await assert.rejects(fn)}
await as(uidA);let out=await save(0);assert.equal(out.status,'saved');assert.equal(out.row.revision,1);
await denied(()=>save(null));await denied(()=>save(1,{}));await denied(()=>save(1,{schema_version:1,character:{notes:'x'.repeat(2100000)}}));
await denied(()=>db.exec(`update public.characters set revision=100`));await denied(()=>db.exec(`delete from public.characters`));
out=await save(1);assert.equal(out.row.revision,2);out=await save(1);assert.equal(out.status,'conflict');
await as(uidB);assert.equal((await db.query('select * from public.characters')).rows.length,0);await denied(()=>save(0));await denied(()=>db.exec(`insert into storage.objects values(gen_random_uuid(),'${uidA}/${id}/portrait.webp','character-portraits')`));
await as(uidA);await db.exec(`insert into storage.objects values(gen_random_uuid(),'${uidA}/${id}/portrait.webp','character-portraits')`);
await as(uidB);assert.equal((await db.query('select * from storage.objects')).rows.length,0);await db.exec(`delete from storage.objects where name like '${uidA}/%'`);
await as(uidA);assert.equal((await db.query('select * from storage.objects')).rows.length,1);out=await save(2,undefined,true);assert(out.row.deleted_at);
await as(null);await denied(()=>save(0));await denied(()=>db.exec('select * from public.characters'));
await db.exec('reset role');await db.exec(`update public.characters set deleted_at=now()-interval '31 days'`);await as(uidA);assert.equal((await save(3)).status,'missing');
await db.exec('reset role');await db.exec(`insert into public.forge_deleting_accounts(user_id) values('${uidA}')`);await as(uidA);await denied(()=>save(3));assert.equal((await db.query('select * from public.characters')).rows.length,0);await denied(()=>db.exec(`insert into storage.objects values(gen_random_uuid(),'${uidA}/${id}/new.webp','character-portraits')`));
await db.close();console.log('PASS PostgreSQL execution: schema, RLS isolation, private portraits, RPC-only writes, CAS, null-revision rejection, size/schema limits, expiry, deletion locks');
})().catch(e=>{console.error(e);process.exitCode=1});
