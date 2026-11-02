-- Hide cleared history while retaining transfer nonces for duplicate protection.
alter table public.forge_parties add column chat_cleared_id bigint not null default 0;
create function public.forge_party_clear_chat(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.forge_parties where id=p_id and (owner_id=auth.uid() or dm_id=auth.uid()) and public.forge_account_active() for update;
 if not found then raise exception 'Only the DM or organizer can clear chat history' using errcode='42501';end if;
 update public.forge_parties set chat_cleared_id=coalesce((select max(id) from public.forge_party_messages where party_id=p_id),0) where id=p_id;
 delete from public.forge_party_typing where party_id=p_id;
end $$;
revoke all on function public.forge_party_clear_chat(uuid) from public,anon;
grant execute on function public.forge_party_clear_chat(uuid) to authenticated;
do $$ declare s text;begin
 s:=pg_get_functiondef('public.forge_party_chat(uuid,jsonb)'::regprocedure);
 s:=replace(s,'where party_id=p_id and (recipient_id is null or sender_id=u or recipient_id=u)', 'where party_id=p_id and id>(select chat_cleared_id from public.forge_parties where id=p_id) and (recipient_id is null or sender_id=u or recipient_id=u)');
 if position('id>(select chat_cleared_id' in s)=0 then raise exception 'Chat history patch failed';end if;execute s;
end $$;
