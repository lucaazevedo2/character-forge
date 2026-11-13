import {createClient} from 'npm:@supabase/supabase-js@2.76.1';
import {removeFolder} from '../_shared/storage.ts';
const origins=[...new Set(['https://lucas-character-forge.lucaazevedo.chatgpt.site','https://characterforge5e.com','https://lucaazevedo2.github.io',...(Deno.env.get('FORGE_ALLOWED_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean)])];
Deno.serve(async request=>{
 const origin=request.headers.get('origin')||'';
 const headers={'Access-Control-Allow-Origin':origins.includes(origin)?origin:'null','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Content-Type':'application/json'};
 if(!origins.includes(origin))return new Response(JSON.stringify({error:'Origin not allowed'}),{status:403,headers});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return new Response('{}',{status:405,headers});
 try{
  const token=(request.headers.get('authorization')||'').replace(/^Bearer /i,'');if(!token)return new Response('{}',{status:401,headers});
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await admin.auth.getUser(token);if(error||!user)return new Response('{}',{status:401,headers});
  const body=await request.json();if(body.confirmation!=='DELETE')return new Response('{}',{status:400,headers});
  // Lock writes first; users can still authenticate to retry incomplete deletion.
  const locked=await admin.from('forge_deleting_accounts').upsert({user_id:user.id});if(locked.error)throw locked.error;
  // Campaign prefixes can include maps uploaded by other members; delete only campaigns this account owns.
  const {data:campaigns,error:campaignError}=await admin.from('forge_vtt_campaigns').select('id').eq('owner_id',user.id);if(campaignError)throw campaignError;
  for(const campaign of campaigns||[])await removeFolder(admin,campaign.id,'vtt-assets');
  const removedCampaigns=await admin.from('forge_vtt_campaigns').delete().eq('owner_id',user.id);if(removedCampaigns.error)throw removedCampaigns.error;
  await removeFolder(admin,user.id);
  const deleted=await admin.auth.admin.deleteUser(user.id);if(deleted.error)throw deleted.error;
  return new Response(JSON.stringify({deleted:true}),{headers});
 }catch{
  return new Response(JSON.stringify({error:'Deletion failed. Retry this request to complete removal.'}),{status:500,headers});
 }
});
