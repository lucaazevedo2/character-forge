/* Additional hosted acceptance checks, called by vtt-live-transport with release:true. */
module.exports=async ({dm,player,outsider,rpc,repository,campaignId,sceneId,visible,cfg,tokens})=>{
 const A=require('node:assert/strict'),C=require('../vtt/core');
 const apply=(client,id,data,expected,operationId=crypto.randomUUID())=>rpc(client,'apply',{campaignId,operationId,changes:[{kind:'token',id,op:'upsert',expected,data}]});
 let s=await rpc(dm,'snapshot',{campaignId}),t=s.scenes[0].tokens.find(x=>x.id===visible);
 const results=await Promise.allSettled([apply(dm,visible,{x:192},t._revision),apply(player,visible,{hp:17},t._revision)]);
 A.equal(results.filter(r=>r.status==='fulfilled').length,1,'one competing stale revision must fail');
 s=await rpc(dm,'snapshot',{campaignId});t=s.scenes[0].tokens.find(x=>x.id===visible);
 const retry=results[0].status==='rejected'?{x:192}:{hp:17};await apply(results[0].status==='rejected'?dm:player,visible,retry,t._revision);
 s=await rpc(dm,'snapshot',{campaignId});t=s.scenes[0].tokens.find(x=>x.id===visible);A.equal(t.hp,17);A.equal(t.x,192);
 const op=crypto.randomUUID();await apply(dm,visible,{name:'Idempotent creature'},t._revision,op);await apply(dm,visible,{name:'Idempotent creature'},t._revision,op);
 console.log('PASS hosted simultaneous edits reject stale writes; explicit retry preserves both fields; duplicate operation is idempotent');
 repository.watch(null);s=await rpc(dm,'snapshot',{campaignId});t=s.scenes[0].tokens.find(x=>x.id===visible);await apply(dm,visible,{hp:16},t._revision);repository.watch(campaignId);await repository.pull(campaignId);A.equal(repository.record(campaignId).model.scenes[0].tokens.find(x=>x.id===visible).hp,16);
 console.log('PASS real repository disconnect/rejoin and missed-commit recovery');
 const resource=async(client,a,p={})=>{const {data,error}=await client.rpc('forge_vtt_resources_api',{p_action:a,p_payload:{campaignId,...p}});if(error)throw error;return data};
 const id=crypto.randomUUID(),trackId=crypto.randomUUID();const wav=Buffer.alloc(16044);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 const headers={Origin:cfg.origin,apikey:cfg.key,Authorization:'Bearer '+tokens[0],'Content-Type':'audio/wav'};
 const response=await fetch(cfg.url+'/functions/v1/vtt-media?campaignId='+campaignId,{method:'POST',headers,body:wav});A.equal(response.status,200);const asset=await response.json();A(asset.assetId);
 const payload={tracks:[{id:trackId,title:'QA WAV',assetId:asset.assetId}],status:'playing',position:2,startedAt:Date.now(),loop:true,volume:.5,crossfade:0};
 await resource(dm,'save',{id,kind:'audio',title:'QA shared audio',audience:'all',expected:0,payload});const list=await resource(player,'list');const row=list.records.find(x=>x.id===id);A.equal(row.payload.status,'playing');A.equal(row.payload.position,2);
 const downloaded=await fetch(cfg.url+'/functions/v1/vtt-media?assetId='+asset.assetId,{headers:{...headers,Authorization:'Bearer '+tokens[1]}});A.equal(downloaded.status,200);A.equal(downloaded.headers.get('cache-control'),'private, no-store, max-age=0');A.deepEqual(Buffer.from(await downloaded.arrayBuffer()),wav);
 await A.rejects(()=>resource(player,'save',{id,kind:'audio',title:'Player override',expected:row.revision,payload}));
 await resource(dm,'trash',{id,expected:row.revision});A(!(await resource(player,'list')).records.some(x=>x.id===id));
 const denied=await fetch(cfg.url+'/functions/v1/vtt-media?assetId='+asset.assetId,{headers:{...headers,Authorization:'Bearer '+tokens[1]}});A.equal(denied.status,403);
 const trash=(await resource(dm,'list')).trash.find(x=>x.id===id);await resource(dm,'restore',{id,expected:trash.revision});A((await resource(player,'list')).records.some(x=>x.id===id));
 console.log('PASS hosted private WAV upload/download, shared playback clock, player control denial, trash access revocation and restoration');
 const restored=C.importBackup(C.exportBackup(await rpc(dm,'snapshot',{campaignId})));A.notEqual(restored.id,campaignId);A.equal(restored.scenes[0].tokens.find(x=>x.name==='Idempotent creature').hp,16);A.throws(()=>C.importBackup({schema_version:999,campaign:restored}));
 console.log('PASS current hosted snapshot backup/restore and unsupported-format rejection');
};
