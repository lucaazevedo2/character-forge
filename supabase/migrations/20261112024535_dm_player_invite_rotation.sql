-- Let the assigned DM replace player invitations without granting member-removal/admin powers.
-- Preserve all existing checked command behavior, including optimistic version guards.
BEGIN;
DO $invite_rotation$
DECLARE original text;updated text;
BEGIN
 SELECT pg_get_functiondef('public.forge_party_command(text,uuid,jsonb)'::regprocedure) INTO original;
 IF position('Only the organizer, a party admin, or the assigned DM can replace invitations' IN original)>0 THEN RETURN;END IF;
 updated:=replace(original,
 $old$elsif p_action in ('rotate_code','remove_member') then$old$,
 $new$elsif p_action='rotate_code' then
   if p.owner_id<>u and p.dm_id is distinct from u and not exists(select 1 from public.forge_party_members where party_id=p_id and user_id=u and is_admin) then
    raise exception 'Only the organizer, a party admin, or the assigned DM can replace invitations' using errcode='42501';
   end if;
  elsif p_action='remove_member' then$new$);
 IF original=updated THEN RAISE EXCEPTION 'Party command permissions changed; review invite rotation before applying';END IF;
 EXECUTE updated;
END $invite_rotation$;
COMMIT;
