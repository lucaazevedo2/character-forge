-- DM player invites and server-verified chat speakers; whisper filtering unchanged.
CREATE OR REPLACE FUNCTION public.forge_party_state(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.forge_parties; dm boolean; members jsonb; fighters jsonb;
begin
 if not public.forge_party_access(p_id) then raise exception 'Party access denied' using errcode='42501'; end if;
 select * into p from public.forge_parties where id=p_id;dm:=coalesce(p.dm_id=auth.uid(),false);
 select coalesce(jsonb_agg(jsonb_build_object(
  'account_name',left(coalesce(au.raw_user_meta_data->>'full_name',au.raw_user_meta_data->>'name','Party member'),80),'user_id',m.user_id,'is_dm',coalesce(m.user_id=p.dm_id,false),'is_organizer',m.user_id=p.owner_id,'is_admin',m.is_admin,'character_id',c.id,'character_revision',c.revision,
  'name',case when c.id is null then case when m.user_id=p.dm_id then 'Dungeon Master' when m.user_id=p.owner_id then 'Party organizer' else 'Choosing a character' end else left(c.name,200) end,
  'level',c.data->'character'->'level','class_name',left(c.data->'_party'->>'class_name',80),'race_name',left(c.data->'_party'->>'race_name',80),
  'hp',public.forge_party_number(coalesce(c.data->'character'->'wildShape'->'hp',c.data->'character'->'hp')),
  'max_hp',greatest(1,public.forge_party_number(coalesce(c.data->'character'->'wildShape'->'maxHP',c.data->'_party'->'max_hp'),1)),
  'temp_hp',public.forge_party_number(c.data->'character'->'tempHp'),
  'conditions',coalesce(c.data->'character'->'conditionTracker'->'active','[]'),
  'exhaustion',public.forge_party_number(c.data->'character'->'conditionTracker'->'exhaustion'),
  'death_failures',public.forge_party_number(c.data->'character'->'deathF'),'dead',(public.forge_party_number(c.data->'character'->'hp')<=0 and public.forge_party_number(c.data->'character'->'deathF')>=3),
 'concentrating',coalesce(c.data->'character'->'conditionTracker'->'concentrating','false'),
  'portrait_path',case when c.data->>'portrait_path' like c.owner_id::text||'/'||c.id::text||'/%' then c.data->>'portrait_path' else null end,'initiative_bonus',public.forge_party_number(c.data->'_party'->'initiative_bonus'),'ac',public.forge_party_number(c.data->'_party'->'ac'),
  'updated_at',c.updated_at
 ) order by m.joined_at),'[]') into members
 from public.forge_party_members m left join auth.users au on au.id=m.user_id left join public.characters c on c.id=m.character_id and c.owner_id=m.user_id and c.deleted_at is null
 where m.party_id=p_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'user_id',b.user_id,'name',b.name,'initiative',b.initiative,
  'hp',case when dm then b.hp else null end,'max_hp',case when dm then b.max_hp else null end,
  'conditions',b.conditions,'hidden',b.hidden) order by b.initiative desc nulls last,b.id),'[]') into fighters
 from public.forge_combatants b where b.party_id=p_id and (dm or not b.hidden);
 return jsonb_build_object('social_ready',true,'is_admin',exists(select 1 from public.forge_party_members a where a.party_id=p.id and a.user_id=auth.uid() and a.is_admin),'id',p.id,'name',p.name,'is_dm',dm,'is_organizer',p.owner_id=auth.uid(),'has_dm',p.dm_id is not null,'dm_user_id',p.dm_id,'dm_notes',case when dm then p.dm_notes else null end,'version',p.version,'session_active',p.session_active,'combat_active',p.combat_active,
  'round',p.round,'turns_running',p.current_id is not null,'current_id',case when exists(select 1 from public.forge_combatants where id=p.current_id and hidden and not dm) then null else p.current_id end,
  'hidden_turn',exists(select 1 from public.forge_combatants where id=p.current_id and hidden and not dm),
  'invite_code',case when dm or p.owner_id=auth.uid() or exists(select 1 from public.forge_party_members a where a.party_id=p.id and a.user_id=auth.uid() and a.is_admin) then p.invite_code else null end,'members',members,'combatants',fighters);
end $function$
;

create or replace function public.forge_party_chat(p_id uuid,p_message jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();target uuid; rows jsonb; who text;
begin
 if not public.forge_party_access(p_id) then raise exception 'Party access denied' using errcode='42501';end if;
 if p_message is not null then
  if octet_length(p_message::text)>12000 then raise exception 'Message too long';end if;
  target:=(p_message->>'recipient_id')::uuid;
  if target is not null and (target=u or not exists(select 1 from public.forge_party_members where party_id=p_id and user_id=target)) then raise exception 'Choose another party member';end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,2));
  if (select count(*) from public.forge_party_messages where sender_id=u and created_at>now()-interval '1 minute')>=60 then raise exception 'Please wait before sending more messages';end if;
  select left(coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name','Party member'),80) into who from auth.users where id=u;
  -- Identity comes from the caller's own membership, never a supplied label or user ID.
  if exists(select 1 from public.forge_parties where id=p_id and dm_id=u) then
   who:='Dungeon Master (GM)';
  elsif coalesce(p_message->>'speaker','character')<>'account' then
   select coalesce(left(c.name,80),who) into who from public.forge_party_members m
    left join public.characters c on c.id=m.character_id and c.owner_id=u and c.deleted_at is null
    where m.party_id=p_id and m.user_id=u;
  end if;
  insert into public.forge_party_messages(party_id,sender_id,recipient_id,nonce,kind,label,body,total,command)
  values(p_id,u,target,(p_message->>'nonce')::uuid,case when p_message->>'kind'='roll' then 'roll' else 'note' end,who||case when p_message->>'kind'='roll' then ' · '||left(coalesce(p_message->>'label','Roll'),37) else '' end,
   left(coalesce(p_message->>'body',''),4000),left(coalesce(p_message->>'total',''),160),left(coalesce(p_message->>'command',''),500)) on conflict(sender_id,nonce) do nothing;
 end if;
 -- DM and organizer privileges never bypass whisper participant filtering.
 select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') into rows from (
  select id,sender_id,recipient_id,kind,label,body,total,command,created_at from public.forge_party_messages
  where party_id=p_id and (recipient_id is null or sender_id=u or recipient_id=u) order by id desc limit 100
 ) x;return rows;
end $$;
revoke all on function public.forge_party_chat(uuid,jsonb) from public,anon;
grant execute on function public.forge_party_chat(uuid,jsonb) to authenticated;

