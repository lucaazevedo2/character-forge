import {createClient} from 'npm:@supabase/supabase-js@2.76.1';
import {removeFolder} from '../_shared/storage.ts';
Deno.serve(async request=>{
 if(request.method!=='POST')return new Response('{}',{status:405});
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /i,'');
 if(!token||token.length!==64)return new Response('{}',{status:401});
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 try{
  const {data:allowed,error:authError}=await admin.rpc('forge_maintenance_allowed',{p_token:token});
  if(authError||!allowed)return new Response('{}',{status:401});
  // Claim expired rows atomically: restore/save rejects these once recovery expires.
  const cutoff=new Date(Date.now()-30*86400000).toISOString();
  const {data,error}=await admin.from('characters').select('id,owner_id,revision').lt('deleted_at',cutoff).limit(100);if(error)throw error;
  let count=0;for(const row of data||[]){await removeFolder(admin,row.owner_id+'/'+row.id);const result=await admin.from('characters').delete().eq('id',row.id).eq('revision',row.revision).lt('deleted_at',cutoff);if(result.error)throw result.error;count++}
  return Response.json({purged:count});
 }catch{return Response.json({error:'Maintenance failed; retry safely.'},{status:500})}
});
