import {createClient} from 'npm:@supabase/supabase-js@2.76.1';
import {imageInfo} from './image-validation.ts';
const allowed=new Set(['https://lucas-character-forge.lucaazevedo.chatgpt.site', 'https://characterforge5e.com', 'https://lucaazevedo2.github.io',...(Deno.env.get('FORGE_ALLOWED_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean)]);
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'',headers={'Access-Control-Allow-Origin':allowed.has(origin)?origin:'null','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin','Content-Type':'application/json','Cache-Control':'private, no-store, max-age=0'};
 const reply=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers});
 if(!allowed.has(origin))return reply({error:'Origin not allowed'},403);if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(!['GET','POST'].includes(req.method))return reply({error:'GET or POST required'},405);
 let admin:any,path='';
 try{
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');if(!token)return reply({error:'Sign in first'},401);
  admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await admin.auth.getUser(token);if(error||!user||user.is_anonymous)return reply({error:'Sign in with a regular account'},401);
  if(req.method==='GET'){
   const assetId=new URL(req.url).searchParams.get('assetId');if(!assetId||!/^[0-9a-f-]{36}$/i.test(assetId))return reply({error:'Invalid asset'},400);
   const caller=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
   const {data:asset,error:readError}=await caller.from('forge_vtt_assets').select('object_path,mime_type').eq('id',assetId).maybeSingle();
   if(readError||!asset)return reply({error:'Asset unavailable'},403);
   const {data:blob,error:downloadError}=await admin.storage.from('vtt-assets').download(asset.object_path);if(downloadError)return reply({error:'Asset unavailable'},404);
   return new Response(blob,{headers:{...headers,'Content-Type':asset.mime_type,'X-Content-Type-Options':'nosniff','Pragma':'no-cache'}});
  }
  const contentLength=Number(req.headers.get('content-length'));if(contentLength>20980000)return reply({error:'Image exceeds 20 MB'},413);
  // Bounded stream protects against chunked bodies without a Content-Length header.
  const chunks:Uint8Array[]=[];let length=0;const reader=req.body?.getReader();if(!reader)throw Error('No image');for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>20980000){await reader.cancel();return reply({error:'Image exceeds 20 MB'},413)}chunks.push(value)}
  const bytes=new Uint8Array(length);let offset=0;for(const b of chunks){bytes.set(b,offset);offset+=b.length}
  const info=imageInfo(bytes),url=new URL(req.url),campaignId=url.searchParams.get('campaignId'),tokenId=url.searchParams.get('tokenId');
  const caller=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:reserved,error:reservationError}=await caller.rpc('forge_vtt_api',{p_action:'reserve_upload',p_payload:{campaignId,tokenId,bytes:length,mime:info.mime,operationId:crypto.randomUUID()}});if(reservationError)throw Error(reservationError.message);
  path=reserved.path;const {error:uploadError}=await admin.storage.from('vtt-assets').upload(path,bytes,{contentType:info.mime,upsert:false});if(uploadError)throw Error('Image upload failed');
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const {data:assetId,error:finalizeError}=await admin.rpc('forge_vtt_finalize_asset',{p_user:user.id,p_reservation:reserved.reservationId,p_mime:info.mime,p_sha:sha,p_width:info.width,p_height:info.height});if(finalizeError)throw Error('Image finalization failed');
  return reply({assetId,width:info.width,height:info.height,mime:info.mime});
 }catch(error){if(admin&&path)await admin.storage.from('vtt-assets').remove([path]);return reply({error:error instanceof Error?error.message:'Upload failed'},400)}
});
