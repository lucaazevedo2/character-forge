-- Extend the existing versioned party command to the assigned DM.
DO $migration$
DECLARE original text; updated text;
BEGIN
 SELECT pg_get_functiondef('public.forge_party_command(text,uuid,jsonb)'::regprocedure) INTO original;
 IF position('Only the organizer, a party admin, or the assigned DM can remove party members' IN original)>0 THEN RETURN; END IF;
 updated:=replace(original,
 $old$elsif p_action='remove_member' then
   if p.owner_id<>u and not exists(select 1 from public.forge_party_members where party_id=p_id and user_id=u and is_admin) then raise exception 'Only the organizer or a party admin can do that' using errcode='42501';end if;$old$,
 $new$elsif p_action='remove_member' then
   if p.owner_id<>u and p.dm_id is distinct from u and not exists(select 1 from public.forge_party_members where party_id=p_id and user_id=u and is_admin) then
    raise exception 'Only the organizer, a party admin, or the assigned DM can remove party members' using errcode='42501';
   end if;$new$);
 IF updated=original THEN RAISE EXCEPTION 'Party removal permissions changed'; END IF;
 EXECUTE updated;
END $migration$;
