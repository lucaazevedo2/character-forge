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
await db.exec(fs.readFileSync(__dirname+'/../supabase/guest-parties.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/party-character-removal.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/party-death-portrait.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/party-zero-hp.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/separate-dm-join.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/party-social.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/dm-rolls-chat.sql','utf8'));

async function as(uid){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);await db.exec('set role '+(uid?'authenticated':'anon'))}
async function command(action,party=null,args={}){return (await db.query('select public.forge_party_command($1,$2,$3) result',[action,party,JSON.stringify(args)])).rows[0].result}
async function state(party){return (await db.query('select public.forge_party_state($1) result',[party])).rows[0].result}
const C='44444444-4444-4444-8444-444444444444',D='55555555-5555-4555-8555-555555555555';
await db.exec(`insert into auth.users(id) values('${C}'),('${D}');`);
const act=async(a,args={})=>{const st=await state(party);return command(a,party,{version:st.version,...args})};
await db.exec(fs.readFileSync(__dirname+'/../supabase/npc-chat-bubbles.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/clear-party-chat.sql','utf8'));
await db.exec(fs.readFileSync(__dirname+'/../supabase/party-awards.sql','utf8'));
await as(uidA);const party=(await command('create',null,{name:'Award test'})).id;const code=(await state(party)).invite_code;const dmCode=(await db.query('select public.forge_party_dm_invite($1) result',[party])).rows[0].result.code;
await as(C);await db.query('select public.forge_party_join_dm($1)',[dmCode]);
await as(D);await command('join',null,{code});
const srcId='66666666-6666-4666-8666-666666666666',dstId='77777777-7777-4777-8777-777777777777';
const source={schema_version:1,character:{name:'Giver',gold:100,inventory:['Potion','Potion','Sword'],equipped:[2],equipmentFormatVersion:1,equipmentItems:[{id:'potion',name:'Potion',quantity:2,catalogId:'potion',notes:'kept metadata',carried:true,equipped:false,attuned:false},{id:'sword',name:'Sword',quantity:1,equipped:true}],inventoryItemIds:['potion','potion','sword']}};
const target={schema_version:1,character:{name:'Artus Cimber',gold:0,inventory:[],equipped:[],equipmentFormatVersion:1,equipmentItems:[],inventoryItemIds:[]}};
await as(uidA);await db.query('select public.save_character($1,$2,0,$3,false)',[srcId,'src',JSON.stringify(source)]);await command('select_character',party,{character_id:srcId});
await as(uidB);await command('join',null,{code});await db.query('select public.save_character($1,$2,0,$3,false)',[dstId,'dst',JSON.stringify(target)]);await command('select_character',party,{character_id:dstId});
const nonce=()=>require('crypto').randomUUID();
async function gift(kind,opts={}){const st=await state(party),me=st.members.find(m=>m.user_id===opts.sender),to=st.members.find(m=>m.user_id===uidB);return (await db.query('select public.forge_party_gift($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result',[party,uidB,opts.revision??me?.character_revision??null,opts.targetRevision??to.character_revision,kind,opts.amount??null,opts.index??null,opts.item??null,opts.nonce||nonce(),opts.private??false,opts.equipment?JSON.stringify(opts.equipment):null])).rows[0].result}
const feed=async()=> (await db.query('select public.forge_party_chat($1) result',[party])).rows[0].result;
await as(C);let n=nonce();assert((await gift('gold',{amount:100,nonce:n})).ok);assert((await gift('gold',{amount:100,nonce:n})).duplicate);let rows=await feed();assert.equal(rows.length,1);assert.equal(rows[0].recipient_id,null);assert(rows[0].gift.dm_award);assert.equal(rows[0].gift.target_character_id,dstId);assert(rows[0].body.includes('Artus Cimber 100 gp'));
await as(uidB);let saved=(await db.query('select data from public.characters where id=$1',[dstId])).rows[0].data.character;assert.equal(saved.gold,100);assert.equal((await feed()).length,1);
await as(C);const item={name:'Brooch of Shielding',catalogId:'magic-brooch-of-shielding-uncommon',magicCatalogId:'magic-brooch-of-shielding-uncommon',rarity:'Uncommon',quantity:1,modifiers:[{target:'resistance_force',value:1}],equipped:true,attuned:true};
await gift('item',{item:'Brooch of Shielding',equipment:item,private:true});await as(D);assert.equal((await feed()).length,1,'bystander cannot read private award');await as(uidB);saved=(await db.query('select data from public.characters where id=$1',[dstId])).rows[0].data.character;assert.equal(saved.equipmentItems.length,1);assert.equal(saved.equipmentItems[0].attuned,false);assert.equal(saved.equipmentItems[0].equipped,false);assert.equal(saved.equipmentItems[0].modifiers[0].target,'resistance_force');assert.equal((await feed())[1].gift.rarity,'Uncommon');
await as(uidA);await gift('gold',{sender:uidA,amount:5});let src=(await db.query('select data from public.characters where id=$1',[srcId])).rows[0].data.character;assert.equal(src.gold,95);
await gift('item',{sender:uidA,item:'Potion',index:0,private:true});src=(await db.query('select data from public.characters where id=$1',[srcId])).rows[0].data.character;assert.deepEqual(src.inventory,['Potion','Sword']);assert.deepEqual(src.equipped,[1]);assert.equal(src.equipmentItems[0].quantity,1);
await as(C);assert.equal((await feed()).filter(m=>m.gift?.item_name==='Potion').length,0,'DM cannot read another pair’s private gift');
await as(uidB);saved=(await db.query('select data from public.characters where id=$1',[dstId])).rows[0].data.character;assert.equal(saved.gold,105);const potion=saved.equipmentItems.find(i=>i.name==='Potion');assert.equal(potion.quantity,1);assert.equal(potion.notes,'kept metadata');assert.notEqual(potion.id,'potion');
await as(uidA);await assert.rejects(()=>gift('item',{sender:uidA,item:'Sword',index:1}));await assert.rejects(()=>gift('item',{sender:uidA,item:'Forged loot',equipment:item}));assert((await gift('gold',{sender:uidA,amount:1,revision:1})).conflict);
await as(D);await assert.rejects(()=>gift('gold',{sender:D,amount:1}));
await as(C);for(const amount of [0,-1,0.001,'NaN'])await assert.rejects(()=>gift('gold',{amount}));await assert.rejects(()=>gift('item',{item:'missing catalog',equipment:{name:'test'}}));
await db.query('select public.forge_party_clear_chat($1)',[party]);assert.equal((await feed()).length,0);assert((await gift('gold',{amount:100,nonce:n})).duplicate,'clearing chat keeps duplicate protection');
await db.exec('reset role');await db.exec(fs.readFileSync(__dirname+'/../supabase/dm-vitals-notifications.sql','utf8'));
await as(C);await db.exec('reset role');await db.query("update public.characters set data=jsonb_set(data,'{character}',data->'character'||$2::jsonb)||jsonb_build_object('_party',jsonb_build_object('max_hp',20)),revision=revision+1 where id=$1",[dstId,JSON.stringify({hp:15,tempHp:3,conditionTracker:{active:[],exhaustion:0}})]);await as(C);
async function vitals(args={},n=nonce()){const st=await state(party),m=st.members.find(m=>m.user_id===uidB);return (await db.query('select public.forge_party_vitals($1,$2,$3) result',[party,JSON.stringify({version:st.version,character_id:dstId,character_revision:m.character_revision,...args}),n])).rows[0].result}
n=nonce();assert((await vitals({mode:'damage',amount:5},n)).ok);assert((await vitals({mode:'damage',amount:5},n)).duplicate);let st=await state(party),m=st.members.find(m=>m.user_id===uidB);assert.equal(m.hp,13);assert.equal(m.temp_hp,0);
assert((await vitals({mode:'heal',amount:100})).ok);st=await state(party);assert.equal(st.members.find(m=>m.user_id===uidB).hp,20);
assert((await vitals({hp:0,temp_hp:0,exhaustion:0,conditions:['stunned']})).ok);st=await state(party);m=st.members.find(m=>m.user_id===uidB);assert.equal(m.hp,0);assert(m.conditions.includes('stunned'));
await as(uidB);assert((await feed()).some(m=>m.gift?.kind==='vitals'&&m.gift.notices.some(n=>n.includes('stunned'))));await assert.rejects(()=>vitals({mode:'damage',amount:1}));await as(C);assert((await vitals({mode:'damage',amount:1,character_revision:1})).conflict);await assert.rejects(()=>vitals({mode:'damage',amount:-1}));
console.log('PASS DM vitals: temp HP damage, healing cap, conditions, receipts, duplicates, stale revisions, authorization');
await as(null);await assert.rejects(()=>gift('gold',{amount:1}));
await db.close();console.log('PASS award SQL: DM gold/items without character, public/private filtering, player balance debit, equipment unit/metadata preservation, rarity receipts, stale revisions, nonces after clearing, invalid input and privilege checks');
})().catch(e=>{console.error(e);process.exitCode=1});
