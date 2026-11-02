do $$ declare original text;updated text;begin
 select pg_get_functiondef('public.forge_party_state(uuid)'::regprocedure) into original;
 if position($field$'dead'$field$ in original)>0 then return;end if;
 updated:=replace(original,$old$'concentrating',coalesce(c.data$old$,$new$'dead',(public.forge_party_number(c.data->'character'->'hp')<=0 and public.forge_party_number(c.data->'character'->'deathF')>=3),
 'concentrating',coalesce(c.data$new$);
 if updated=original then raise exception 'Party state changed; review death field';end if;
 execute updated;
end $$;
