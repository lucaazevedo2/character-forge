-- Activate party social features; preserve existing separate DM invitations and guest/portrait behavior.
alter table public.forge_party_members add column is_admin boolean not null default false;

CREATE OR REPLACE FUNCTION public.forge_party_list()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'is_dm',coalesce(p.dm_id=auth.uid(),false),'is_organizer',p.owner_id=auth.uid(),'is_admin',m.is_admin,'has_dm',p.dm_id is not null,'character_id',m.character_id,'session_active',p.session_active) order by p.created_at),'[]')
 from public.forge_parties p join public.forge_party_members m on m.party_id=p.id
 where m.user_id=auth.uid() and public.forge_account_active();
$function$
;

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
  'invite_code',case when p.owner_id=auth.uid() or exists(select 1 from public.forge_party_members a where a.party_id=p.id and a.user_id=auth.uid() and a.is_admin) then p.invite_code else null end,'members',members,'combatants',fighters);
end $function$
;

CREATE OR REPLACE FUNCTION public.forge_party_command(p_action text, p_id uuid DEFAULT NULL::uuid, p_args jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); p public.forge_parties; v_id uuid; char_id uuid; c public.characters; target uuid; idx int; ordered uuid[]; next_id uuid; dat jsonb; hp numeric; cond jsonb; tracker jsonb; limit_row public.forge_party_join_limits;
begin
 if u is null or not public.forge_account_active() then raise exception 'Sign in to use parties' using errcode='42501'; end if;
 if p_args is null or octet_length(p_args::text)>60000 then raise exception 'Invalid request'; end if;
 if p_action='create' then
  if exists(select 1 from auth.users where id=u and is_anonymous) then raise exception 'Sign in with Google to create a party' using errcode='42501';end if;
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
  if not exists(select 1 from public.forge_party_members where party_id=p.id and user_id=u) and (select count(*) from public.forge_party_members where party_id=p.id and user_id is distinct from p.dm_id)>=10 then return jsonb_build_object('error','This party is full (10 players)'); end if;
  insert into public.forge_party_members(party_id,user_id) values(p.id,u) on conflict do nothing;
  return jsonb_build_object('id',p.id);
 end if;
 if not public.forge_party_access(p_id) then raise exception 'Party access denied' using errcode='42501'; end if;
 select * into p from public.forge_parties where id=p_id for update;
 if p_action='select_character' then
 if p.dm_id=u then raise exception 'The DM cannot select a player character';end if;
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
  if p_action in ('disband','assign_dm','set_admin','transfer_owner') then
   if p.owner_id<>u then raise exception 'Only the party organizer can do that' using errcode='42501'; end if;
  elsif p_action in ('rotate_code','remove_member') then
   if p.owner_id<>u and not exists(select 1 from public.forge_party_members where party_id=p_id and user_id=u and is_admin) then raise exception 'Only the organizer or a party admin can do that' using errcode='42501';end if;
  elsif p.dm_id is distinct from u then raise exception 'Only the assigned DM can do that' using errcode='42501'; end if;
  if (p_args->>'version') is null or (p_args->>'version')::bigint<>p.version then return jsonb_build_object('conflict',true); end if;
  case p_action
   when 'set_admin' then
    target:=(p_args->>'user_id')::uuid;
    update public.forge_party_members set is_admin=coalesce((p_args->>'enabled')::boolean,false) where party_id=p_id and user_id=target and user_id<>p.owner_id;
    if not found then raise exception 'Choose another party member';end if;
   when 'transfer_owner' then
    target:=(p_args->>'user_id')::uuid;
    if not exists(select 1 from public.forge_party_members where party_id=p_id and user_id=target) then raise exception 'Choose a party member';end if;
    if exists(select 1 from auth.users where id=target and is_anonymous) then raise exception 'Choose a registered account as organizer';end if;
    update public.forge_parties set owner_id=target,dm_join_code=null where id=p_id;
    update public.forge_party_members set is_admin=true where party_id=p_id and user_id=u;
   when 'assign_dm' then
 if nullif(p_args->>'user_id','') is not null then raise exception 'Invite a separate DM through DM Tools';end if;
    target:=(p_args->>'user_id')::uuid;
    if target is not null and not exists(select 1 from public.forge_party_members where party_id=p_id and user_id=target) then raise exception 'Choose a party member as DM';end if;
    update public.forge_parties set dm_id=target where id=p_id;
   when 'save_dm_notes' then
    if length(coalesce(p_args->>'notes',''))>12000 then raise exception 'Session notes are limited to 12000 characters';end if;
    update public.forge_parties set dm_notes=coalesce(p_args->>'notes','') where id=p_id;
   when 'rotate_code' then update public.forge_parties set invite_code=upper(left(replace(gen_random_uuid()::text,'-',''),16)) where id=p_id;
   when 'remove_member' then
    target:=(p_args->>'user_id')::uuid;if target=u or target=p.owner_id or (exists(select 1 from public.forge_party_members where party_id=p_id and user_id=target and is_admin) and p.owner_id<>u) then raise exception 'Only the organizer can remove admins; the organizer cannot be removed'; end if;
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
end $function$
;

create table public.forge_party_messages(
 id bigint generated always as identity primary key,
 party_id uuid not null references public.forge_parties(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid references auth.users(id) on delete cascade,
 nonce uuid not null, kind text not null check(kind in ('note','roll','transfer')),
 label text not null check(length(label)<=120), body text not null check(length(body)<=4000),
 total text not null default '' check(length(total)<=160), command text not null default '' check(length(command)<=500),
 created_at timestamptz not null default now(),unique(sender_id,nonce)
);
create index forge_party_messages_feed on public.forge_party_messages(party_id,id desc);
alter table public.forge_party_messages enable row level security;
revoke all on public.forge_party_messages from public,anon,authenticated;
grant all on public.forge_party_messages to service_role;
create function public.forge_party_chat(p_id uuid,p_message jsonb default null) returns jsonb
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

-- Both characters are locked in a stable order; revisions prevent spending stale balances.
create function public.forge_party_give(p_id uuid,p_target uuid,p_revision bigint,p_target_revision bigint,p_kind text,p_amount numeric default null,p_index int default null,p_item text default null,p_nonce uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();src public.characters;dst public.characters;sc jsonb;dc jsonb;inv jsonb;equipped jsonb;wallet numeric;amount_cp numeric;remaining numeric;item jsonb;qty int;
begin
 if not public.forge_party_access(p_id) or p_target=u then raise exception 'Choose another party character';end if;
 perform 1 from public.forge_parties where id=p_id for update;
 if p_nonce is null then raise exception 'Transfer identifier required';end if;
 if exists(select 1 from public.forge_party_messages where sender_id=u and nonce=p_nonce and party_id=p_id and kind='transfer') then return jsonb_build_object('ok',true);end if;
 select c.* into src from public.characters c join public.forge_party_members m on m.character_id=c.id and m.user_id=c.owner_id where m.party_id=p_id and m.user_id=u and c.deleted_at is null;
 select c.* into dst from public.characters c join public.forge_party_members m on m.character_id=c.id and m.user_id=c.owner_id where m.party_id=p_id and m.user_id=p_target and c.deleted_at is null;
 if src.id is null or dst.id is null then raise exception 'Both players must select cloud-saved characters';end if;
 perform 1 from public.characters where id in (src.id,dst.id) order by id for update;
 select * into src from public.characters where id=src.id;
 select * into dst from public.characters where id=dst.id;
 if p_revision is null or p_target_revision is null or src.revision<>p_revision or dst.revision<>p_target_revision then return jsonb_build_object('conflict',true);end if;
 sc:=src.data->'character';dc:=dst.data->'character';
 if p_kind='gold' then
  if p_amount is null or p_amount<=0 or p_amount>100000 or p_amount*100<>trunc(p_amount*100) then raise exception 'Enter gold to the nearest copper (0.01 gp)';end if;
  amount_cp:=p_amount*100;
  wallet:=round(coalesce((sc->>'gold')::numeric,0)*100)+coalesce((sc->'coins'->>'cp')::numeric,0)+10*coalesce((sc->'coins'->>'sp')::numeric,0)+50*coalesce((sc->'coins'->>'ep')::numeric,0)+1000*coalesce((sc->'coins'->>'pp')::numeric,0);
  if wallet<amount_cp then raise exception 'Not enough gold';end if;
  remaining:=wallet-amount_cp;
  sc:=sc||jsonb_build_object('gold',floor(remaining/100),'coins',jsonb_build_object('cp',mod(remaining,10),'sp',floor(mod(remaining,100)/10),'ep',0,'pp',0));
  dc:=dc||jsonb_build_object('gold',coalesce((dc->>'gold')::numeric,0)+p_amount);
 elsif p_kind='item' then
  inv:=coalesce(sc->'inventory','[]');qty:=jsonb_array_length(inv);
  if p_index is null or p_index<0 or p_index>=qty then raise exception 'Item no longer available';end if;
  item:=inv->p_index;
  if p_item is null or (item#>>'{}')<>p_item then raise exception 'Inventory changed. Reopen Give Item and try again';end if;
  if jsonb_typeof(item)<>'string' then raise exception 'Unsupported item format';end if;
  if coalesce(sc->'equipped','[]') @> jsonb_build_array(p_index) then raise exception 'Unequip this item before giving it away';end if;
  if jsonb_array_length(coalesce(dc->'inventory','[]'))>=1000 then raise exception 'Recipient inventory is full';end if;
  sc:=jsonb_set(sc,'{inventory}',inv-p_index);
  select coalesce(jsonb_agg(to_jsonb(case when x::int>p_index then x::int-1 else x::int end)),'[]') into equipped from jsonb_array_elements_text(coalesce(sc->'equipped','[]')) x;
  sc:=jsonb_set(sc,'{equipped}',equipped);dc:=jsonb_set(dc,'{inventory}',coalesce(dc->'inventory','[]')||jsonb_build_array(item));
 else raise exception 'Choose Gold or Item';end if;
 update public.characters set data=jsonb_set(data,'{character}',sc),revision=revision+1,updated_at=now() where id=src.id;
 update public.characters set data=jsonb_set(data,'{character}',dc),revision=revision+1,updated_at=now() where id=dst.id;
 insert into public.forge_party_messages(party_id,sender_id,recipient_id,nonce,kind,label,body)
 values(p_id,u,p_target,p_nonce,'transfer','Transfer',src.name||' gave '||case when p_kind='gold' then p_amount::text||' gp' else item#>>'{}' end||' to '||dst.name);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.forge_party_give(uuid,uuid,bigint,bigint,text,numeric,int,text,uuid) from public,anon;
grant execute on function public.forge_party_give(uuid,uuid,bigint,bigint,text,numeric,int,text,uuid) to authenticated;
