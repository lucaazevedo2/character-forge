-- Character Forge cloud saves v1. Run once in the Supabase SQL editor.
begin;
-- Deletion locks prevent writes/uploads during retryable permanent removal.
create table if not exists public.forge_deleting_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 requested_at timestamptz not null default now()
);
alter table public.forge_deleting_accounts enable row level security;
revoke all on public.forge_deleting_accounts from anon, authenticated;
grant all on public.forge_deleting_accounts to service_role;
-- Security-definer helper exposes only whether the caller's own account is active.
create or replace function public.forge_account_active() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from auth.users where id=auth.uid() and not exists(select 1 from public.forge_deleting_accounts where user_id=auth.uid()));
$$;
revoke all on function public.forge_account_active() from public, anon;
grant execute on function public.forge_account_active() to authenticated;
create table if not exists public.characters (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 local_id text not null check (length(local_id) between 1 and 160),
 name text not null check (length(name) <= 200),
 data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 2097152),
 revision bigint not null default 1 check (revision > 0),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 unique(owner_id, local_id)
);
create index if not exists characters_owner_updated on public.characters(owner_id, updated_at desc);
alter table public.characters enable row level security;
revoke all on public.characters from anon, authenticated;
grant select on public.characters to authenticated;
grant all on public.characters to service_role;
create policy "Read own characters" on public.characters for select to authenticated using ((select auth.uid()) = owner_id and (select public.forge_account_active()));
-- Writes only through the atomic, ownership-checking function below; direct writes
-- are deliberately denied so clients cannot skip revision or size checks.
create or replace function public.save_character(p_id uuid, p_local_id text, p_expected_revision bigint, p_data jsonb, p_deleted boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); current_row public.characters; saved_row public.characters;
begin
 if p_id is null or p_local_id is null or p_expected_revision is null or p_expected_revision < 0 or p_deleted is null then raise exception 'Invalid save request'; end if;
 if u is null or not public.forge_account_active() then raise exception 'Authentication required' using errcode = '42501'; end if;
 -- Serialize inserts as well as updates, including the per-user quota check.
 perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
 select * into current_row from public.characters where owner_id=u and local_id=p_local_id for update;
 if found then
  if current_row.deleted_at < now() - interval '30 days' then return jsonb_build_object('status','missing'); end if;
  if current_row.id <> p_id or current_row.revision <> p_expected_revision then
   return jsonb_build_object('status','conflict','row',to_jsonb(current_row));
  end if;
  if (p_data->>'schema_version') is distinct from '1' or jsonb_typeof(p_data->'character') is distinct from 'object' then raise exception 'Unsupported save format'; end if;
  update public.characters set data=p_data, name=left(coalesce(p_data->'character'->>'name','Unnamed character'),200),
   revision=revision+1, updated_at=now(), deleted_at=case when p_deleted then coalesce(current_row.deleted_at,now()) else null end
   where id=p_id and owner_id=u returning * into saved_row;
 else
  if p_expected_revision <> 0 or p_deleted then return jsonb_build_object('status','missing'); end if;
  if (select count(*) from public.characters where owner_id=u) >= 200 then raise exception 'Account limit reached (200 characters including Trash)'; end if;
  if (p_data->>'schema_version') is distinct from '1' or jsonb_typeof(p_data->'character') is distinct from 'object' then raise exception 'Unsupported save format'; end if;
  insert into public.characters(id,owner_id,local_id,name,data) values(p_id,u,p_local_id,left(coalesce(p_data->'character'->>'name','Unnamed character'),200),p_data) returning * into saved_row;
 end if;
 return jsonb_build_object('status','saved','row',to_jsonb(saved_row));
end $$;
revoke all on function public.save_character(uuid,text,bigint,jsonb,boolean) from public, anon;
grant execute on function public.save_character(uuid,text,bigint,jsonb,boolean) to authenticated;
-- Private portraits. The browser uses authenticated downloads, never public URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('character-portraits','character-portraits',false,524288,array['image/webp','image/png','image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=524288,allowed_mime_types=excluded.allowed_mime_types;
create policy "Read own portraits" on storage.objects for select to authenticated using(bucket_id='character-portraits' and (storage.foldername(name))[1]=(select auth.uid()::text) and (select public.forge_account_active()));
create policy "Upload own portraits" on storage.objects for insert to authenticated with check(bucket_id='character-portraits' and (storage.foldername(name))[1]=(select auth.uid()::text) and (select public.forge_account_active()));
create policy "Delete own portraits" on storage.objects for delete to authenticated using(bucket_id='character-portraits' and (storage.foldername(name))[1]=(select auth.uid()::text) and (select public.forge_account_active()));
commit;
