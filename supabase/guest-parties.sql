-- Add the guest organizer restriction to the current command without replacing other actions.
do $guest_parties$
declare original text; updated text;
begin
 select pg_get_functiondef('public.forge_party_command(text,uuid,jsonb)'::regprocedure) into original;
 if position('Sign in with Google to create a party' in original)>0 then return;end if;
 updated:=replace(original,$old$if p_action='create' then$old$,$new$if p_action='create' then
  if exists(select 1 from auth.users where id=u and is_anonymous) then raise exception 'Sign in with Google to create a party' using errcode='42501';end if;$new$);
 if updated=original then raise exception 'Party command changed; review the guest organizer check before applying';end if;
 execute updated;
end
$guest_parties$;
