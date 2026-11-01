-- Run after schema.sql. Secrets stay inside Vault; none are returned to clients.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ begin
 if not exists(select 1 from vault.secrets where name='forge_maintenance_token') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'forge_maintenance_token','Character Forge Trash maintenance');
 end if;
end $$;
create or replace function public.forge_maintenance_allowed(p_token text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from vault.decrypted_secrets where name='forge_maintenance_token' and decrypted_secret=p_token and length(p_token)=64);
$$;
revoke all on function public.forge_maintenance_allowed(text) from public, anon, authenticated;
grant execute on function public.forge_maintenance_allowed(text) to service_role;
select cron.schedule('character-forge-purge-trash','17 8 * * *',$job$
 select net.http_post(
  url := 'https://vrjwaejlqupmkqrhmzra.supabase.co/functions/v1/purge-trash',
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='forge_maintenance_token')),
  body := '{}'::jsonb,
  timeout_milliseconds := 60000
 );
$job$);
