const fs=require('node:fs'),vm=require('node:vm'),A=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module');
(async()=>{
 const {mediaInfo}=await import('../supabase/functions/vtt-media/media-validation.ts');
 let handler,uploaded=null,finalized=null,removed=0;const state={allowed:true,user:{id:'qa-user'}};
 const assetId='11111111-1111-4111-8111-111111111111';
 const client={auth:{getUser:async()=>({data:{user:state.user}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:state.allowed?{object_path:'qa/media',mime_type:'audio/wav'}:null})})})}),rpc:async(name,args)=>{
   if(name==='forge_vtt_resources_api')return state.allowed?{data:{path:'qa/media',reservationId:'reservation'}}:{error:{message:'DM controls required'}};
   finalized=args;return {data:assetId};
 },storage:{from:()=>({upload:async(path,bytes)=>{uploaded=new Uint8Array(bytes);return {}},download:async()=>({data:new Blob([uploaded])}),remove:async()=>{removed++;return {}}})}};
 const source=fs.readFileSync('supabase/functions/vtt-media/index.ts','utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(stripTypeScriptTypes(source),{URL,Request,Response,Uint8Array,crypto,console,mediaInfo,createClient:()=>client,Deno:{env:{get:()=>''},serve:fn=>handler=fn}});
 const request=(method='POST',body,headers={})=>handler(new Request('https://qa.invalid/vtt-media?assetId='+assetId+'&campaignId=qa',{method,headers:{origin:'https://lucas-character-forge.lucaazevedo.chatgpt.site',authorization:'Bearer qa',...headers},...(body?{body}:{})}));
 A.equal((await request('OPTIONS')).status,204);A.equal((await request('POST',null,{origin:'https://evil.invalid'})).status,403);A.equal((await request('GET',null,{authorization:''})).status,401);
 const wav=new Uint8Array(44);wav.set(Buffer.from('RIFF'));wav.set(Buffer.from('WAVE'),8);
 let r=await request('POST',wav);A.equal(r.status,200);A.equal((await r.json()).assetId,assetId);A.deepEqual(uploaded,wav);A.equal(finalized.p_mime,'audio/wav');A.equal(finalized.p_width,null);A.equal(finalized.p_sha.length,64);
 r=await request('GET');A.equal(r.status,200);A.equal(r.headers.get('cache-control'),'private, no-store, max-age=0');A.equal(r.headers.get('content-type'),'audio/wav');A.deepEqual(new Uint8Array(await r.arrayBuffer()),wav);
 state.allowed=false;A.equal((await request('GET')).status,403);A.equal((await request('POST',wav)).status,400);
 state.allowed=true;A.equal((await request('POST',Buffer.from('<svg><script>attack</script></svg>'))).status,400);A.equal((await request('POST',null,{'content-length':'20980001'})).status,413);
 state.user=null;A.equal((await request('GET')).status,401);A.equal(removed,0);
 console.log('PASS media gateway: raw upload bytes, audio detection/finalization, authorized no-store download, revoked access, role/origin/auth gates, malformed/oversized bodies.');
})().catch(e=>{console.error(e);process.exitCode=1});
