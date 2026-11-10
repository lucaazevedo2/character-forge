-- Membership belongs to the account, and survives clearing or deleting a character.
-- Keep explicit leave/remove/disband and account deletion behavior unchanged.
create or replace function public.forge_party_character_unselected() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.character_id is not null and new.character_id is null then
  update public.forge_parties set current_id=case when current_id in
   (select id from public.forge_combatants where party_id=new.party_id and user_id=new.user_id)
   then null else current_id end, version=version+1 where id=new.party_id;
  delete from public.forge_combatants where party_id=new.party_id and user_id=new.user_id;
  delete from public.forge_party_presence where party_id=new.party_id and user_id=new.user_id;
 end if;
 return new;
end $$;
revoke all on function public.forge_party_character_unselected() from public,anon,authenticated;

create or replace function public.forge_party_character_buried() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.deleted_at is not null and old.deleted_at is null then
  update public.forge_party_members set character_id=null where character_id=new.id;
 end if;
 return new;
end $$;
revoke all on function public.forge_party_character_buried() from public,anon,authenticated;

-- Extend the existing checked create action, atomically assigning both roles.
do $dm_creation$
declare original text; updated text;
begin
 select pg_get_functiondef('public.forge_party_command(text,uuid,jsonb)'::regprocedure) into original;
 if position('coalesce((p_args->>''as_dm'')::boolean,false)' in original)>0 then return;end if;
 updated:=replace(original,
  $old$insert into public.forge_parties(owner_id,name) values(u,trim(p_args->>'name')) returning id into v_id;$old$,
  $new$insert into public.forge_parties(owner_id,dm_id,name)
   values(u,case when coalesce((p_args->>'as_dm')::boolean,false) then u else null end,trim(p_args->>'name')) returning id into v_id;$new$);
 if original=updated then raise exception 'Party create action changed; review before applying';end if;
 execute updated;
end $dm_creation$;
