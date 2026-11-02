-- Removing a selected character removes membership; restoring never rejoins.
create or replace function public.forge_party_remove_character_member(p_party uuid,p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.forge_parties; successor uuid;
begin
 select * into p from public.forge_parties where id=p_party for update;
 if not found then return;end if;
 if p.owner_id=p_user then
  select user_id into successor from public.forge_party_members where party_id=p_party and user_id<>p_user order by joined_at,user_id limit 1;
  if successor is null then delete from public.forge_parties where id=p_party;return;end if;
  update public.forge_parties set owner_id=successor where id=p_party;
 end if;
 update public.forge_parties set dm_id=case when dm_id=p_user then null else dm_id end,
 current_id=case when current_id in(select id from public.forge_combatants where party_id=p_party and user_id=p_user) then null else current_id end,
 version=version+1 where id=p_party;
 delete from public.forge_combatants where party_id=p_party and user_id=p_user;
 delete from public.forge_party_members where party_id=p_party and user_id=p_user;
end $$;
revoke all on function public.forge_party_remove_character_member(uuid,uuid) from public,anon,authenticated;
create or replace function public.forge_party_character_buried() returns trigger
language plpgsql security definer set search_path='' as $$
declare m record;
begin
 if new.deleted_at is not null and old.deleted_at is null then
  for m in select party_id,user_id from public.forge_party_members where character_id=new.id loop
   perform public.forge_party_remove_character_member(m.party_id,m.user_id);
  end loop;
 end if;
 return new;
end $$;
revoke all on function public.forge_party_character_buried() from public,anon,authenticated;
create trigger forge_party_character_buried after update of deleted_at on public.characters for each row execute function public.forge_party_character_buried();
create or replace function public.forge_party_character_unselected() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.character_id is not null and new.character_id is null then perform public.forge_party_remove_character_member(new.party_id,new.user_id);end if;
 return new;
end $$;
revoke all on function public.forge_party_character_unselected() from public,anon,authenticated;
create trigger forge_party_character_unselected after update of character_id on public.forge_party_members for each row execute function public.forge_party_character_unselected();
-- Repair only memberships referencing already buried characters.
do $$ declare m record;begin
 for m in select pm.party_id,pm.user_id from public.forge_party_members pm join public.characters c on c.id=pm.character_id where c.deleted_at is not null loop
 perform public.forge_party_remove_character_member(m.party_id,m.user_id);end loop;
end $$;
