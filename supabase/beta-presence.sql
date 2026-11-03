create table public.forge_party_presence_beta_tabs (
 party_id uuid not null references public.forge_parties(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 tab_id uuid not null,
 mode text not null check(mode in ('sheet','dmtools','sheet-idle','dmtools-idle')),
 character_id uuid, seen_at timestamptz not null default now(),
 primary key(party_id,user_id,tab_id),
 foreign key(party_id,user_id) references public.forge_party_members(party_id,user_id) on delete cascade
);
alter table public.forge_party_presence_beta_tabs enable row level security;
revoke all on public.forge_party_presence_beta_tabs from public,anon,authenticated;
grant all on public.forge_party_presence_beta_tabs to service_role;
CREATE OR REPLACE FUNCTION public.forge_party_presence_beta(p_id uuid, p_tab uuid, p_mode text DEFAULT 'away'::text, p_character_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid();p public.forge_parties;mine public.forge_party_members;rows jsonb;
begin
 if not public.forge_party_access(p_id) then raise exception 'Party access denied' using errcode='42501';end if;
 if p_tab is null or p_mode is null or p_mode not in ('away','sheet','dmtools','sheet-idle','dmtools-idle') then raise exception 'Invalid activity';end if;
 select * into p from public.forge_parties where id=p_id;
 select * into mine from public.forge_party_members where party_id=p_id and user_id=u;
 if p_mode in ('dmtools','dmtools-idle') and p.dm_id is distinct from u then raise exception 'Only the assigned DM can report DM Tools activity' using errcode='42501';end if;
 if p_mode in ('sheet','sheet-idle') and (p_character_id is null or mine.character_id is distinct from p_character_id or not exists(select 1 from public.characters where id=p_character_id and owner_id=u and deleted_at is null)) then raise exception 'Open your assigned party character' using errcode='42501';end if;
 -- Expired rows are transient and have no history value. Bound stored tabs per member.
 delete from public.forge_party_presence_beta_tabs where party_id=p_id and seen_at<now()-interval '2 minutes';
 if p_mode='away' then
  delete from public.forge_party_presence_beta_tabs where party_id=p_id and user_id=u and tab_id=p_tab;
 else
  if not exists(select 1 from public.forge_party_presence_beta_tabs where party_id=p_id and user_id=u and tab_id=p_tab) and (select count(*) from public.forge_party_presence_beta_tabs where party_id=p_id and user_id=u)>=20 then raise exception 'Too many active tabs';end if;
  insert into public.forge_party_presence_beta_tabs(party_id,user_id,tab_id,mode,character_id) values(p_id,u,p_tab,p_mode,case when p_mode in ('sheet','sheet-idle') then p_character_id else null end)
  on conflict(party_id,user_id,tab_id) do update set mode=excluded.mode,character_id=excluded.character_id,seen_at=now()
   where public.forge_party_presence_beta_tabs.mode is distinct from excluded.mode or public.forge_party_presence_beta_tabs.character_id is distinct from excluded.character_id or public.forge_party_presence_beta_tabs.seen_at<now()-interval '10 seconds';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,
  'account_avatar',case when not coalesce(au.is_anonymous,false) then left(coalesce(au.raw_user_meta_data->>'avatar_url',au.raw_user_meta_data->>'picture'),2048) else null end,
  'speaker_npc_id',case when m.user_id=p.dm_id then p.dm_speaker_npc else null end,
 'speaker_image',case when m.user_id=p.dm_id then (select n.image from public.forge_party_npcs n where n.id=p.dm_speaker_npc and n.party_id=p_id) else null end,
 'guest_account',coalesce(au.is_anonymous,false),
  'dm_open',coalesce(m.user_id=p.dm_id,false) and exists(select 1 from public.forge_party_presence_beta_tabs a where a.party_id=p_id and a.user_id=m.user_id and a.mode in ('dmtools','dmtools-idle') and a.seen_at>now()-interval '90 seconds'),
  'character_open',m.character_id is not null and exists(select 1 from public.forge_party_presence_beta_tabs a where a.party_id=p_id and a.user_id=m.user_id and a.mode in ('sheet','sheet-idle') and a.character_id=m.character_id and a.seen_at>now()-interval '90 seconds'),
  'dm_online',coalesce(m.user_id=p.dm_id,false) and exists(select 1 from public.forge_party_presence_beta_tabs a where a.party_id=p_id and a.user_id=m.user_id and a.mode='dmtools' and a.seen_at>now()-interval '45 seconds'),
  'character_online',m.character_id is not null and exists(select 1 from public.forge_party_presence_beta_tabs a where a.party_id=p_id and a.user_id=m.user_id and a.mode='sheet' and a.character_id=m.character_id and a.seen_at>now()-interval '45 seconds')
 )),'[]') into rows from public.forge_party_members m left join auth.users au on au.id=m.user_id where m.party_id=p_id;
 return jsonb_build_object('members',rows);
end $function$
;
revoke all on function public.forge_party_presence_beta(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.forge_party_presence_beta(uuid,uuid,text,uuid) to authenticated;
