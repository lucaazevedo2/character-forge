import {createClient} from 'npm:@supabase/supabase-js@2.76.1';
const allowed=new Set(['https://lucas-character-forge.lucaazevedo.chatgpt.site', 'https://characterforge5e.com', 'https://lucaazevedo2.github.io',...(Deno.env.get('FORGE_ALLOWED_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean)]);
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'',headers={'Access-Control-Allow-Origin':allowed.has(origin)?origin:'null','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin','Content-Type':'application/json'};
 const reply=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers});
 if(!allowed.has(origin))return reply({error:'Origin not allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'POST required'},405);
 try{
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /i,'');if(!token)return reply({error:'Sign in first'},401);
  const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,admin=createClient(Deno.env.get('SUPABASE_URL')!,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await admin.auth.getUser(token);if(error||!user||user.is_anonymous)return reply({error:'Sign in with a regular account'},401);
  const reader=req.body?.getReader();if(!reader)return reply({error:'Request body required'},400);const chunks:Uint8Array[]=[];let length=0;for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4096){await reader.cancel();return reply({error:'Request too large'},413)}chunks.push(value)}const bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length}const body=JSON.parse(new TextDecoder().decode(bytes));
  if(!['create','list','redeem','revoke','regenerate'].includes(body.action))return reply({error:'Unknown action'},400);
  // Ingress-derived, never a body-supplied IP; account + global DB limit remain mandatory.
  const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')||req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()||'unknown';
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret+':'+ip)),ipHash=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
  const {data,error:failure}=await admin.rpc('forge_vtt_invite_gateway',{p_user:user.id,p_ip_hash:ipHash,p_action:body.action,p_payload:body.payload||{}});
  if(failure)return reply({error:failure.code==='42501'?'Permission denied':'Invite request failed'},failure.code==='42501'?403:400);
  return reply(data,data?.error?400:200);
 }catch{return reply({error:'Invalid invite request'},400)}
});
