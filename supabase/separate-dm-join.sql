-- A DM joins with an organizer-issued code and has no character in this party.
alter table public.forge_parties add column dm_join_code text unique;
create function public.forge_party_dm_invite(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.forge_parties;begin
 if not public.forge_account_active() then raise exception 'Sign in first';end if;
 select * into p from public.forge_parties where id=p_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Only the organizer can invite a DM' using errcode='42501';end if;
 if p.dm_id is not null then raise exception 'This party already has a DM';end if;
 if p.dm_join_code is null then update public.forge_parties set dm_join_code=upper(replace(gen_random_uuid()::text,'-','')) where id=p_id returning * into p;end if;
 return jsonb_build_object('code',p.dm_join_code);
end $$;
create function public.forge_party_join_dm(p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();p public.forge_parties;lim public.forge_party_join_limits;begin
 if u is null or not public.forge_account_active() then raise exception 'Sign in first' using errcode='42501';end if;
 insert into public.forge_party_join_limits(user_id,attempts) values(u,1) on conflict(user_id) do update set attempts=case when public.forge_party_join_limits.window_start<now()-interval '1 minute' then 1 else public.forge_party_join_limits.attempts+1 end,window_start=case when public.forge_party_join_limits.window_start<now()-interval '1 minute' then now() else public.forge_party_join_limits.window_start end returning * into lim;
 if lim.attempts>10 then return jsonb_build_object('error','Too many attempts. Wait one minute.');end if;
 select * into p from public.forge_parties where dm_join_code=upper(regexp_replace(p_code,'[^a-zA-Z0-9]','','g')) for update;
 if not found then return jsonb_build_object('error','DM invite code not found. Ask the organizer for a DM code.');end if;
 if p.dm_id is not null then return jsonb_build_object('error','This party already has a DM.');end if;
 if exists(select 1 from public.forge_party_members where party_id=p.id and user_id=u) then return jsonb_build_object('error','You are already a player in this party. Leave it before joining as DM.');end if;
 if (select count(*) from public.forge_party_members where user_id=u)>=20 then return jsonb_build_object('error','Party membership limit reached');end if;
 insert into public.forge_party_members(party_id,user_id,character_id) values(p.id,u,null);
 update public.forge_parties set dm_id=u,dm_join_code=null,version=version+1 where id=p.id;
 return jsonb_build_object('id',p.id);
end $$;
revoke all on function public.forge_party_dm_invite(uuid),public.forge_party_join_dm(text) from public,anon;
grant execute on function public.forge_party_dm_invite(uuid),public.forge_party_join_dm(text) to authenticated;
do $$ declare original text;updated text;begin
 select pg_get_functiondef('public.forge_party_command(text,uuid,jsonb)'::regprocedure) into original;
 updated:=replace(original,$old$if p_action='select_character' then$old$,$new$if p_action='select_character' then
 if p.dm_id=u then raise exception 'The DM cannot select a player character';end if;$new$);
 updated:=replace(updated,$old$when 'assign_dm' then$old$,$new$when 'assign_dm' then
 if nullif(p_args->>'user_id','') is not null then raise exception 'Invite a separate DM through DM Tools';end if;$new$);
 if updated=original then raise exception 'Review current party command before applying';end if;
 execute updated;
end $$;
-- Existing characterless DMs keep their roles. No existing characters are removed.
-- Detach legacy DM party characters without deleting the personal character or membership.
create or replace function public.forge_party_character_unselected() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.character_id is not null and new.character_id is null and not exists(select 1 from public.forge_parties where id=new.party_id and dm_id=new.user_id) then
 perform public.forge_party_remove_character_member(new.party_id,new.user_id);end if;
 return new;
end $$;
update public.forge_parties p set current_id=null where exists(select 1 from public.forge_combatants b where b.id=p.current_id and b.user_id=p.dm_id);
delete from public.forge_combatants b using public.forge_parties p where b.party_id=p.id and b.user_id=p.dm_id;
update public.forge_party_members m set character_id=null from public.forge_parties p where m.party_id=p.id and m.user_id=p.dm_id and m.character_id is not null;
