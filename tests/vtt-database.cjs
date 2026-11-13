const assert=require('node:assert/strict');
module.exports=async db=>{
 const ids={a:'10000000-0000-4000-8000-000000000001',b:'10000000-0000-4000-8000-000000000002',p:'10000000-0000-4000-8000-000000000003',s:'10000000-0000-4000-8000-000000000004',co:'10000000-0000-4000-8000-000000000005',guest:'10000000-0000-4000-8000-000000000006'};
 const c='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002',scene='30000000-0000-4000-8000-000000000001',hiddenScene='30000000-0000-4000-8000-000000000002',token='40000000-0000-4000-8000-000000000001',hidden='40000000-0000-4000-8000-000000000002';
 for(const [name,id] of Object.entries(ids))await db.query('insert into auth.users(id,is_anonymous) values($1,$2)',[id,name==='guest']);
 const as=async u=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u]);await db.exec('set role authenticated')};
 const rpc=async(action,p={})=>(await db.query('select public.forge_vtt_api($1,$2::jsonb) as v',[action,JSON.stringify(p)])).rows[0].v;
 const changes=async rows=>rpc('apply',{campaignId:c,operationId:crypto.randomUUID(),changes:rows});
 const change=(kind,id,data,expected=0,op='upsert')=>({kind,id,data,expected,op});
 await as(ids.a);await rpc('create',{campaignId:c,name:'A game',operationId:crypto.randomUUID()});
 await changes([change('scene',scene,{name:'Shared',width:1600,height:1280,grid:64,published:true}),change('scene',hiddenScene,{name:'Secret prep',published:false}),change('campaign',c,{activeSceneId:scene},1),change('token',token,{sceneId:scene,name:'Hero',x:128,y:128,hp:10,maxHp:10}),change('token',hidden,{sceneId:scene,name:'SECRET',hidden:true})]);
 assert.equal((await db.query('select * from public.forge_vtt_live_events')).rows.length,1);await assert.rejects(()=>db.query('update public.forge_vtt_live_events set sequence=100'),/permission denied/);
 await as(ids.b);assert.equal((await db.query('select * from public.forge_vtt_live_events')).rows.length,0);await rpc('create',{campaignId:other,name:'B game',operationId:crypto.randomUUID()});await assert.rejects(()=>rpc('snapshot',{campaignId:c}),/unavailable/);assert.equal((await db.query('select * from public.forge_vtt_tokens')).rows.length,0);await assert.rejects(()=>changes([change('token',token,{x:256},1)]),/unavailable|Editing not permitted/);
 await db.exec('reset role');for(const [name,role] of [['p','player'],['s','spectator'],['co','dm']])await db.query('insert into public.forge_vtt_campaign_members(campaign_id,user_id,role,display_name) values($1,$2,$3,$4)',[c,ids[name],role,name]);
 await as(ids.a);await changes([change('token',token,{ownerIds:[ids.p]},1)]);
 await as(ids.p);let view=await rpc('snapshot',{campaignId:c});assert.equal(view.scenes.length,1);assert.equal(view.scenes[0].tokens.length,1);assert.equal(view.scenes[0].tokens[0].hp,10);await assert.rejects(()=>db.query('update public.forge_vtt_tokens set x=999 where id=$1',[token]),/permission denied/);

 const liveClient=crypto.randomUUID(),liveRpc=async(action,p={})=>(await db.query('select public.forge_vtt_live($1,$2::jsonb) v',[action,JSON.stringify({campaignId:c,clientId:liveClient,...p})])).rows[0].v;
 const hello=await liveRpc('hello');assert(hello.topic.endsWith(':players'));assert.equal(hello.peers.length,1);
 assert.equal((await db.query('select forge_vtt_private.live_topic_allowed($1) v',[hello.topic])).rows[0].v,true);
 assert.equal((await db.query('select forge_vtt_private.live_topic_allowed($1) v',[hello.topic.replace(':players',':dm')])).rows[0].v,false);
 await liveRpc('pointer',{sceneId:scene,seq:1,cursor:{x:200,y:200},tokens:[{id:token,x:200,y:200,size:1,rotation:0}]});
 await assert.rejects(()=>liveRpc('pointer',{sceneId:scene,seq:2,tokens:[{id:hidden,x:200,y:200,size:1,rotation:0}]}),/denied/);
 await assert.rejects(()=>liveRpc('view',{sceneId:scene,x:200,y:200,zoom:1}),/Only the DM/);
 await assert.rejects(()=>liveRpc('ping',{sceneId:hiddenScene,x:200,y:200}),/Scene unavailable/);
 await as(ids.a);const dmHello=await liveRpc('hello');assert(dmHello.topic.endsWith(':dm'));
 await liveRpc('pointer',{sceneId:scene,seq:3,cursor:{x:300,y:300},tokens:[{id:hidden,x:200,y:200,size:1,rotation:0}]});
 await liveRpc('view',{sceneId:scene,x:200,y:200,zoom:1});
 await db.exec('reset role');assert.equal((await db.query("select count(*) n from realtime.messages where topic like '%:players' and payload->>'kind'='pointer' and payload::text like $1",['%'+hidden+'%'])).rows[0].n,0);
 await db.query("update public.forge_vtt_campaign_members set display_name='Owner' where campaign_id=$1 and user_id=$2",[c,ids.a]);
 await as(ids.p);assert.equal((await db.query('select forge_vtt_private.live_topic_allowed($1) v',[hello.topic])).rows[0].v,false);const rotated=await liveRpc('hello');assert.notEqual(rotated.topic,hello.topic);
 await changes([change('token',token,{x:256},2)]);await assert.rejects(()=>changes([change('token',token,{x:384},2)]),/changed/);await assert.rejects(()=>changes([change('token',token,{hidden:true},3)]),/Protected/);await assert.rejects(()=>changes([change('token',hidden,{x:100},1)]),/permission/);

 const selfToken='40000000-0000-4000-8000-000000000010',newData={sceneId:scene,name:'Imported PC',hp:7,maxHp:22,ownerIds:[ids.p],hidden:false,locked:false,zIndex:0};
 await assert.rejects(()=>changes([change('token',selfToken,{...newData,ownerIds:[ids.a]})]),/own character/);
 await assert.rejects(()=>changes([change('token',selfToken,{...newData,hidden:true})]),/own character/);
 await assert.rejects(()=>changes([change('token',selfToken,{...newData,sceneId:hiddenScene})]),/own character/);
 await changes([change('token',selfToken,newData)]);let ownView=await rpc('snapshot',{campaignId:c});assert(ownView.scenes[0].tokens.find(t=>t.id===selfToken)._canEdit);assert.equal(ownView.scenes[0].tokens.find(t=>t.id===selfToken).hp,7);
 await assert.rejects(()=>changes([change('token',selfToken,{ownerIds:[ids.a]},1)]),/Protected/);
 await assert.rejects(()=>changes([change('token',selfToken,{},1,'delete')]),/permission/);
 await as(ids.a);await changes([change('token',selfToken,{},1,'delete')]);
 await as(ids.s);view=await rpc('snapshot',{campaignId:c});assert.equal(view.scenes[0].tokens[0].hp,null);await assert.rejects(()=>changes([change('token',token,{x:384},3)]),/Editing not permitted/);
 await as(ids.co);await assert.rejects(()=>rpc('role',{campaignId:c,userId:ids.co,role:'dm'}),/Only the owner/);await assert.rejects(()=>rpc('remove',{campaignId:c,userId:ids.a}),/denied/);
 await as(ids.a);let snapshot=await rpc('snapshot',{campaignId:c});assert.equal(snapshot.scenes.length,2);let t=snapshot.scenes.find(s=>s.id===scene).tokens.find(t=>t.id===token);
 const op=crypto.randomUUID(),payload={campaignId:c,operationId:op,changes:[change('token',token,{x:320},t._revision)]};await rpc('apply',payload);await rpc('apply',payload);snapshot=await rpc('snapshot',{campaignId:c});t=snapshot.scenes.find(s=>s.id===scene).tokens.find(t=>t.id===token);assert.equal(t._revision,4);
 // A later conflict rolls back the entire multi-token command, including earlier rows.
 await assert.rejects(()=>changes([change('token',token,{x:400},4),change('token',hidden,{x:200},99)]),/changed/);snapshot=await rpc('snapshot',{campaignId:c});assert.equal(snapshot.scenes.find(s=>s.id===scene).tokens.find(t=>t.id===token).x,320);
 // A role demotion immediately removes token edit authorization.
 await rpc('role',{campaignId:c,userId:ids.p,role:'spectator'});await as(ids.p);await assert.rejects(()=>changes([change('token',token,{x:450},4)]),/Editing not permitted/);assert.equal((await db.query('select * from public.forge_vtt_commands')).rows.length,0);
 await as(ids.guest);await assert.rejects(()=>rpc('list'),/regular account/);assert.equal((await db.query('select * from public.forge_vtt_live_events')).rows.length,0);
 // Invite gateway is service-only, codes are not readable from browser tables.
 await as(ids.p);await assert.rejects(()=>db.query("select public.forge_vtt_invite_gateway($1,'x','list',$2::jsonb)",[ids.p,JSON.stringify({campaignId:c})]),/permission denied/);await assert.rejects(()=>db.query('select * from public.forge_vtt_campaign_invites'),/permission denied/);
 await db.exec('reset role');let inv=(await db.query("select public.forge_vtt_invite_gateway($1,'testip','create',$2::jsonb) v",[ids.a,JSON.stringify({campaignId:c,role:'player'})])).rows[0].v;assert.equal(inv.code.length,6);let joined=(await db.query("select public.forge_vtt_invite_gateway($1,'otherip','redeem',$2::jsonb) v",[ids.b,JSON.stringify({code:inv.code,name:'B'})])).rows[0].v;assert.equal(joined.campaignId,c);
 await db.query("select public.forge_vtt_invite_gateway($1,'testip','revoke',$2::jsonb)",[ids.a,JSON.stringify({campaignId:c,inviteId:inv.id})]);joined=(await db.query("select public.forge_vtt_invite_gateway($1,'otherip','redeem',$2::jsonb) v",[ids.b,JSON.stringify({code:inv.code,name:'B'})])).rows[0].v;assert(joined.error);
 for(let i=0;i<25;i++)joined=(await db.query("select public.forge_vtt_invite_gateway($1,'limitedip','redeem',$2::jsonb) v",[ids.b,JSON.stringify({code:'ZZZZZZ'})])).rows[0].v;assert.match(joined.error,/Too many/);
 await as(ids.a);await rpc('remove',{campaignId:c,userId:ids.b});await as(ids.b);await assert.rejects(()=>rpc('snapshot',{campaignId:c}),/unavailable/);
 await as(ids.a);await changes([change('token',token,{},4,'delete')]);view=await rpc('snapshot',{campaignId:c});assert(!view.scenes.find(s=>s.id===scene).tokens.some(t=>t.id===token));await changes([change('token',token,{sceneId:scene,name:'Hero restored',x:320,y:128,size:1,color:'#abcdef',hp:10,maxHp:10},5)]);view=await rpc('snapshot',{campaignId:c});assert.equal(view.scenes.find(s=>s.id===scene).tokens.find(t=>t.id===token).name,'Hero restored');
 await rpc('delete',{campaignId:c});assert.equal((await rpc('list_trash')).length,1);await as(ids.s);await assert.rejects(()=>rpc('snapshot',{campaignId:c}),/unavailable/);await as(ids.a);await rpc('restore',{campaignId:c});assert.equal((await rpc('list_trash')).length,0);
 console.log('PASS: local PostgreSQL DM/co-DM/player/spectator/outsider RLS, hidden rows and stats, field protection, conflict rollback, idempotency, demotion, invite redemption/revocation/rate limits.');
};
