create or replace function public.forge_zero_hp_conditions() returns trigger language plpgsql security definer set search_path='' as $$
declare tracker jsonb; active jsonb; added jsonb; id text;
begin
 tracker:=coalesce(new.data->'character'->'conditionTracker','{"active":[],"exhaustion":0,"concentrating":false,"effect":""}');
 active:=case when jsonb_typeof(tracker->'active')='array' then tracker->'active' else '[]'::jsonb end;
 added:=case when jsonb_typeof(tracker->'zeroHPAdded')='array' then tracker->'zeroHPAdded' else '[]'::jsonb end;
 if public.forge_party_number(new.data->'character'->'hp')<=0 then
  foreach id in array array['incapacitated','prone'] loop
   if not active ? id then active:=active||to_jsonb(id);added:=added||to_jsonb(id);end if;
  end loop;
  tracker:=tracker||jsonb_build_object('active',active,'zeroHPAdded',added,'concentrating',false,'effect','');
 elsif tracker ? 'zeroHPAdded' then
  if added ? 'incapacitated' then active:=active-'incapacitated';end if;
  tracker:=(tracker-'zeroHPAdded')||jsonb_build_object('active',active);
 end if;
 new.data:=jsonb_set(new.data,'{character,conditionTracker}',tracker);
 return new;
end $$;
revoke all on function public.forge_zero_hp_conditions() from public,anon,authenticated;
create trigger forge_zero_hp_conditions before insert or update of data on public.characters for each row execute function public.forge_zero_hp_conditions();
update public.characters set data=data,revision=revision+1,updated_at=now() where deleted_at is null and public.forge_party_number(data->'character'->'hp')<=0;
do $$ declare definition text;begin
 select pg_get_functiondef('public.forge_party_state(uuid)'::regprocedure) into definition;
 definition:=replace(definition,$old$'dead',($old$,$new$'death_failures',public.forge_party_number(c.data->'character'->'deathF'),'dead',($new$);
 execute definition;
end $$;
