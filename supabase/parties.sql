-- Shared parties / live sessions. Raw tables remain server-only.
create table public.forge_parties (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 dm_id uuid references auth.users(id) on delete set null, dm_notes text not null default '' check(length(dm_notes)<=12000),
 name text not null check(length(name) between 1 and 80), invite_code text not null unique default upper(left(replace(gen_random_uuid()::text,'-',''),16)),
 version bigint not null default 1, session_active boolean not null default false, combat_active boolean not null default false,
 round integer not null default 1 check(round>0), current_id uuid, created_at timestamptz not null default now()
);
create table public.forge_party_members (
 party_id uuid not null references public.forge_parties(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 character_id uuid references public.characters(id) on delete set null,
 joined_at timestamptz not null default now(), primary key(party_id,user_id)
);
create index forge_party_members_user on public.forge_party_members(user_id);
create table public.forge_combatants (
 id uuid primary key default gen_random_uuid(), party_id uuid not null references public.forge_parties(id) on delete cascade,
 user_id uuid references auth.users(id) on delete cascade, name text not null check(length(name) between 1 and 100),
 initiative numeric check(initiative between -100 and 200), hp integer check(hp between 0 and 100000), max_hp integer check(max_hp between 1 and 100000),
 conditions jsonb not null default '[]' check(jsonb_typeof(conditions)='array' and octet_length(conditions::text)<=3000),
 hidden boolean not null default false, check(hp is null or max_hp is null or hp<=max_hp), unique(party_id,user_id)
);

-- Changing/removing the DM stops the optional session and clears private prep notes.
create function public.forge_party_dm_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.dm_id is distinct from new.dm_id then
  new.session_active:=false;new.combat_active:=false;new.current_id:=null;new.dm_notes:='';
  delete from public.forge_combatants where party_id=new.id;
 end if;
 return new;
end $$;
revoke all on function public.forge_party_dm_changed() from public,anon,authenticated;
create trigger forge_party_dm_changed before update of dm_id on public.forge_parties for each row execute function public.forge_party_dm_changed();

create table public.forge_party_join_limits(user_id uuid primary key references auth.users(id) on delete cascade,window_start timestamptz not null default now(),attempts int not null default 0);
alter table public.forge_parties enable row level security;
alter table public.forge_party_members enable row level security;
alter table public.forge_combatants enable row level security;
alter table public.forge_party_join_limits enable row level security;
revoke all on public.forge_parties, public.forge_party_members, public.forge_combatants,public.forge_party_join_limits from anon,authenticated;
grant all on public.forge_parties, public.forge_party_members, public.forge_combatants,public.forge_party_join_limits to service_role;

create function public.forge_party_number(v jsonb, fallback numeric default 0) returns numeric language sql immutable set search_path='' as $$
 select case when jsonb_typeof(v)='number' then greatest(-100000,least(100000,(v::text)::numeric)) else fallback end;
$$;
revoke all on function public.forge_party_number(jsonb,numeric) from public,anon,authenticated;

create function public.forge_party_access(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.forge_account_active() and exists(select 1 from public.forge_party_members where party_id=p_id and user_id=auth.uid());
$$;
revoke all on function public.forge_party_access(uuid) from public,anon,authenticated;

create function public.forge_party_list() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'is_dm',coalesce(p.dm_id=auth.uid(),false),'is_organizer',p.owner_id=auth.uid(),'has_dm',p.dm_id is not null,'character_id',m.character_id,'session_active',p.session_active) order by p.created_at),'[]')
 from public.forge_parties p join public.forge_party_members m on m.party_id=p.id
 where m.user_id=auth.uid() and public.forge_account_active();
$$;

create function public.forge_party_state(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.forge_parties; dm boolean; members jsonb; fighters jsonb;
begin
 if not public.forge_party_access(p_id) then raise exception 'Party access denied' using errcode='42501'; end if;
 select * into p from public.forge_parties where id=p_id;dm:=coalesce(p.dm_id=auth.uid(),false);
 select coalesce(jsonb_agg(jsonb_build_object(
  'account_name',left(coalesce(au.raw_user_meta_data->>'full_name',au.raw_user_meta_data->>'name','Party member'),80),'user_id',m.user_id,'is_dm',coalesce(m.user_id=p.dm_id,false),'is_organizer',m.user_id=p.owner_id,'character_id',c.id,'character_revision',c.revision,
  'name',case when c.id is null then case when m.user_id=p.dm_id then 'Dungeon Master' when m.user_id=p.owner_id then 'Party organizer' else 'Choosing a character' end else left(c.name,200) end,
  'level',c.data->'character'->'level','class_name',left(c.data->'_party'->>'class_name',80),'race_name',left(c.data->'_party'->>'race_name',80),
  'hp',public.forge_party_number(coalesce(c.data->'character'->'wildShape'->'hp',c.data->'character'->'hp')),
  'max_hp',greatest(1,public.forge_party_number(coalesce(c.data->'character'->'wildShape'->'maxHP',c.data->'_party'->'max_hp'),1)),
  'temp_hp',public.forge_party_number(c.data->'character'->'tempHp'),
  'conditions',coalesce(c.data->'character'->'conditionTracker'->'active','[]'),
  'exhaustion',public.forge_party_number(c.data->'character'->'conditionTracker'->'exhaustion'),
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
 return jsonb_build_object('id',p.id,'name',p.name,'is_dm',dm,'is_organizer',p.owner_id=auth.uid(),'has_dm',p.dm_id is not null,'dm_user_id',p.dm_id,'dm_notes',case when dm then p.dm_notes else null end,'version',p.version,'session_active',p.session_active,'combat_active',p.combat_active,
  'round',p.round,'turns_running',p.current_id is not null,'current_id',case when exists(select 1 from public.forge_combatants where id=p.current_id and hidden and not dm) then null else p.current_id end,
  'hidden_turn',exists(select 1 from public.forge_combatants where id=p.current_id and hidden and not dm),
  'invite_code',case when p.owner_id=auth.uid() then p.invite_code else null end,'members',members,'combatants',fighters);
end $$;

create function public.forge_party_command(p_action text,p_id uuid default null,p_args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); p public.forge_parties; v_id uuid; char_id uuid; c public.characters; target uuid; idx int; ordered uuid[]; next_id uuid; dat jsonb; hp numeric; cond jsonb; tracker jsonb; limit_row public.forge_party_join_limits;
begin
 if u is null or not public.forge_account_active() then raise exception 'Sign in to use parties' using errcode='42501'; end if;
 if p_args is null or octet_length(p_args::text)>60000 then raise exception 'Invalid request'; end if;
 if p_action='create' then
  perform pg_advisory_xact_lock(hashtextextended(u::text,1));
  if (select count(*) from public.forge_parties where owner_id=u)>=5 then raise exception 'You can create up to five parties'; end if;
  insert into public.forge_parties(owner_id,name) values(u,trim(p_args->>'name')) returning id into v_id;
  insert into public.forge_party_members(party_id,user_id) values(v_id,u);
  return jsonb_build_object('id',v_id);
 elsif p_action='join' then
  insert into public.forge_party_join_limits(user_id,attempts) values(u,1) on conflict(user_id) do update set
   attempts=case when public.forge_party_join_limits.window_start<now()-interval '1 minute' then 1 else public.forge_party_join_limits.attempts+1 end,
   window_start=case when public.forge_party_join_limits.window_start<now()-interval '1 minute' then now() else public.forge_party_join_limits.window_start end returning * into limit_row;
  if limit_row.attempts>10 then return jsonb_build_object('error','Too many join attempts. Wait one minute.'); end if;
  select * into p from public.forge_parties where invite_code=upper(regexp_replace(p_args->>'code','[^a-zA-Z0-9]','','g')) for update;
  if not found then return jsonb_build_object('error','Invite code not found'); end if;
  if (select count(*) from public.forge_party_members where user_id=u)>=20 then return jsonb_build_object('error','Party membership limit reached'); end if;
  if (select count(*) from public.forge_party_members where party_id=p.id)>=12 then return jsonb_build_object('error','This party is full (12 accounts)'); end if;
  insert into public.forge_party_members(party_id,user_id) values(p.id,u) on conflict do nothing;
  return jsonb_build_object('id',p.id);
 end if;
 if not public.forge_party_access(p_id) then raise exception 'Party access denied' using errcode='42501'; end if;
 select * into p from public.forge_parties where id=p_id for update;
 if p_action='select_character' then
  if p.combat_active then raise exception 'Finish combat before changing party characters'; end if;
  char_id:=(p_args->>'character_id')::uuid;
  if char_id is not null and not exists(select 1 from public.characters where id=char_id and owner_id=u and deleted_at is null) then raise exception 'Choose your own cloud-saved character'; end if;
  update public.forge_party_members set character_id=char_id where party_id=p_id and user_id=u;
 elsif p_action='leave' then
  if p.owner_id=u then raise exception 'The organizer must disband the party instead'; end if;
  if p.dm_id=u then update public.forge_parties set dm_id=null where id=p_id;end if;
  delete from public.forge_combatants where party_id=p_id and user_id=u;
  delete from public.forge_party_members where party_id=p_id and user_id=u;
 elsif p_action='initiative' then
  if not p.combat_active then raise exception 'The DM has not started combat'; end if;
  if p.current_id is not null then raise exception 'Initiative is locked while turns are running. Ask the DM to pause turns.'; end if;
  target:=coalesce((p_args->>'user_id')::uuid,u);
  if target<>u and p.dm_id is distinct from u then raise exception 'Only the DM can change another initiative'; end if;
  update public.forge_combatants set initiative=(p_args->>'initiative')::numeric where party_id=p_id and user_id=target;
  if not found then raise exception 'Choose a party character before starting combat'; end if;
 else
  if p_action in ('rotate_code','remove_member','disband','assign_dm') then
   if p.owner_id<>u then raise exception 'Only the party organizer can do that' using errcode='42501'; end if;
  elsif p.dm_id is distinct from u then raise exception 'Only the assigned DM can do that' using errcode='42501'; end if;
  if (p_args->>'version') is null or (p_args->>'version')::bigint<>p.version then return jsonb_build_object('conflict',true); end if;
  case p_action
   when 'assign_dm' then
    target:=(p_args->>'user_id')::uuid;
    if target is not null and not exists(select 1 from public.forge_party_members where party_id=p_id and user_id=target) then raise exception 'Choose a party member as DM';end if;
    update public.forge_parties set dm_id=target where id=p_id;
   when 'save_dm_notes' then
    if length(coalesce(p_args->>'notes',''))>12000 then raise exception 'Session notes are limited to 12000 characters';end if;
    update public.forge_parties set dm_notes=coalesce(p_args->>'notes','') where id=p_id;
   when 'rotate_code' then update public.forge_parties set invite_code=upper(left(replace(gen_random_uuid()::text,'-',''),16)) where id=p_id;
   when 'remove_member' then
    target:=(p_args->>'user_id')::uuid;if target=u then raise exception 'The organizer cannot remove themselves'; end if;
    if p.dm_id=target then update public.forge_parties set dm_id=null where id=p_id;end if;
    delete from public.forge_party_members where party_id=p_id and user_id=target;delete from public.forge_combatants where party_id=p_id and user_id=target;
   when 'disband' then delete from public.forge_parties where id=p_id;return jsonb_build_object('disbanded',true);
   when 'start_session' then update public.forge_parties set session_active=true where id=p_id;
   when 'end_session' then update public.forge_parties set session_active=false,combat_active=false,current_id=null where id=p_id;delete from public.forge_combatants where party_id=p_id;
   when 'start_combat' then
    if not p.session_active or p.combat_active then raise exception 'Start a session first, or end the current combat'; end if;
    delete from public.forge_combatants where party_id=p_id;
    insert into public.forge_combatants(party_id,user_id,name) select p_id,m.user_id,left(ch.name,100) from public.forge_party_members m join public.characters ch on ch.id=m.character_id and ch.deleted_at is null where m.party_id=p_id;
    update public.forge_parties set combat_active=true,round=1,current_id=null where id=p_id;
   when 'end_combat' then update public.forge_parties set combat_active=false,current_id=null where id=p_id;delete from public.forge_combatants where party_id=p_id;
   when 'pause_turns' then update public.forge_parties set current_id=null where id=p_id;
   when 'next_turn' then
    if not p.combat_active then raise exception 'No combat is running'; end if;
    select array_agg(id order by initiative desc nulls last,id) into ordered from public.forge_combatants where party_id=p_id and initiative is not null;
    if cardinality(ordered) is null then raise exception 'Enter initiative first'; end if;
    idx:=coalesce(array_position(ordered,p.current_id),0)+1;
    if idx>cardinality(ordered) then idx:=1;update public.forge_parties set round=round+1 where id=p_id;end if;
    update public.forge_parties set current_id=ordered[idx] where id=p_id;
   when 'add_npc' then
    if not p.combat_active then raise exception 'Start combat first'; end if;
    if (select count(*) from public.forge_combatants where party_id=p_id)>=40 then raise exception 'Combatant limit reached'; end if;
    insert into public.forge_combatants(party_id,name,initiative,hp,max_hp,hidden) values(p_id,trim(p_args->>'name'),(p_args->>'initiative')::numeric,(p_args->>'max_hp')::int,(p_args->>'max_hp')::int,coalesce((p_args->>'hidden')::boolean,false));
   when 'edit_npc' then
    update public.forge_combatants set name=coalesce(nullif(trim(p_args->>'name'),''),name),max_hp=coalesce((p_args->>'max_hp')::int,max_hp),hp=(p_args->>'hp')::int,initiative=(p_args->>'initiative')::numeric,hidden=coalesce((p_args->>'hidden')::boolean,false) where party_id=p_id and id=(p_args->>'combatant_id')::uuid and user_id is null;
    if not found then raise exception 'NPC not found'; end if;
   when 'remove_npc' then delete from public.forge_combatants where party_id=p_id and id=(p_args->>'combatant_id')::uuid and user_id is null;
   when 'vitals' then
    if not p.session_active then raise exception 'Start a session to manage character vitals'; end if;
    select ch.* into c from public.characters ch join public.forge_party_members m on m.character_id=ch.id and m.user_id=ch.owner_id where m.party_id=p_id and ch.id=(p_args->>'character_id')::uuid and ch.deleted_at is null for update of ch;
    if not found then raise exception 'Party character not found'; end if;
    if (p_args->>'character_revision') is null or c.revision<>(p_args->>'character_revision')::bigint then return jsonb_build_object('conflict',true); end if;
    dat:=c.data;hp:=public.forge_party_number(p_args->'hp');
    if hp<0 or hp>greatest(1,public.forge_party_number(coalesce(dat->'character'->'wildShape'->'maxHP',dat->'_party'->'max_hp'),100000)) then raise exception 'HP is outside this character’s range'; end if;
    if jsonb_typeof(dat->'character'->'wildShape')='object' then dat:=jsonb_set(dat,'{character,wildShape,hp}',to_jsonb(hp));else dat:=jsonb_set(dat,'{character,hp}',to_jsonb(hp));end if;
    dat:=jsonb_set(dat,'{character,tempHp}',to_jsonb(greatest(0,public.forge_party_number(p_args->'temp_hp'))));
    cond:=coalesce(p_args->'conditions','[]');if jsonb_typeof(cond)<>'array' or jsonb_array_length(cond)>15 then raise exception 'Invalid conditions'; end if;
    if exists(select 1 from jsonb_array_elements_text(cond) x where x not in ('blinded','charmed','deafened','frightened','grappled','incapacitated','invisible','paralyzed','petrified','poisoned','prone','restrained','stunned','unconscious')) then raise exception 'Unknown condition'; end if;
    tracker:=coalesce(dat->'character'->'conditionTracker','{"concentrating":false,"effect":""}');tracker:=jsonb_set(tracker,'{active}',cond);
    tracker:=jsonb_set(tracker,'{exhaustion}',to_jsonb(greatest(0,least(6,public.forge_party_number(p_args->'exhaustion')))));
    if cond ?| array['incapacitated','paralyzed','petrified','stunned','unconscious'] or public.forge_party_number(p_args->'exhaustion')>=6 then tracker:=tracker||'{"concentrating":false,"effect":""}';end if;
    dat:=jsonb_set(dat,'{character,conditionTracker}',tracker);
    if hp>0 and jsonb_typeof(dat->'character'->'wildShape') is distinct from 'object' then dat:=jsonb_set(jsonb_set(dat,'{character,deathS}','0'),'{character,deathF}','0');end if;
    update public.characters set data=dat,revision=revision+1,updated_at=now() where id=c.id;
   else raise exception 'Unknown party action';
  end case;
 end if;
 -- Keep the turn cursor valid when combatants or members leave.
 update public.forge_parties set version=version+1,current_id=case when exists(select 1 from public.forge_combatants where id=public.forge_parties.current_id and party_id=p_id) then current_id else null end where id=p_id;
 return jsonb_build_object('ok',true);
end $$;

-- Party members may download only the currently selected characters' portraits.
create function public.forge_party_portrait_allowed(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select public.forge_account_active() and exists(
  select 1 from public.characters c join public.forge_party_members member on member.character_id=c.id and member.user_id=c.owner_id
  join public.forge_party_members viewer on viewer.party_id=member.party_id and viewer.user_id=auth.uid()
  where c.data->>'portrait_path'=p_path and p_path like c.owner_id::text||'/'||c.id::text||'/%' and c.deleted_at is null
 );
$$;
create policy "Party selected portraits" on storage.objects for select to authenticated using(bucket_id='character-portraits' and public.forge_party_portrait_allowed(name));
revoke all on function public.forge_party_portrait_allowed(text) from public,anon;
grant execute on function public.forge_party_portrait_allowed(text) to authenticated;
revoke all on function public.forge_party_list(),public.forge_party_state(uuid),public.forge_party_command(text,uuid,jsonb) from public,anon;
grant execute on function public.forge_party_list(),public.forge_party_state(uuid),public.forge_party_command(text,uuid,jsonb) to authenticated;

-- Read-only rules/combat overview, only for the assigned DM during a live session.
-- Fields are allowlisted. Notes, biography, email and full character JSON never leave.
create function public.forge_party_character(p_id uuid,p_character_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.characters;p public.forge_parties;
begin
 if not public.forge_party_access(p_id) then raise exception 'Party access denied' using errcode='42501';end if;
 select * into p from public.forge_parties where id=p_id;
 if p.dm_id is distinct from auth.uid() or not p.session_active then raise exception 'Only the active session DM can inspect characters' using errcode='42501';end if;
 select ch.* into c from public.characters ch join public.forge_party_members m on m.character_id=ch.id and m.user_id=ch.owner_id where m.party_id=p_id and ch.id=p_character_id and ch.deleted_at is null;
 if not found then raise exception 'Party character not found';end if;
 return jsonb_build_object('name',c.name,'level',c.data->'character'->'level','class_name',c.data->'_party'->'class_name','race_name',c.data->'_party'->'race_name',
  'scores',c.data->'_party'->'scores','ac',c.data->'_party'->'ac','initiative_bonus',c.data->'_party'->'initiative_bonus',
  'spells',c.data->'_party'->'spells','features',c.data->'_party'->'features','equipment',c.data->'character'->'inventory');
end $$;
revoke all on function public.forge_party_character(uuid,uuid) from public,anon;
grant execute on function public.forge_party_character(uuid,uuid) to authenticated;
