alter table public.forge_parties add column dm_speaker_npc uuid references public.forge_party_npcs(id) on delete set null;
create function public.forge_party_speaker(p_id uuid,p_npc uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.forge_parties where id=p_id and dm_id=auth.uid() and public.forge_account_active() for update;
 if not found then raise exception 'Only the assigned DM can change the speaker';end if;
 if p_npc is not null and not exists(select 1 from public.forge_party_npcs where id=p_npc and party_id=p_id) then raise exception 'Choose an NPC from this party';end if;
 update public.forge_parties set dm_speaker_npc=p_npc where id=p_id;
end $$;
revoke all on function public.forge_party_speaker(uuid,uuid) from public,anon;
grant execute on function public.forge_party_speaker(uuid,uuid) to authenticated;
do $$ declare s text;begin
 s:=pg_get_functiondef('public.forge_party_presence(uuid,uuid,text,uuid)'::regprocedure);
 s:=replace(s,$old$'guest_account',coalesce(au.is_anonymous,false),$old$,$new$'speaker_npc_id',case when m.user_id=p.dm_id then p.dm_speaker_npc else null end,
 'speaker_image',case when m.user_id=p.dm_id then (select n.image from public.forge_party_npcs n where n.id=p.dm_speaker_npc and n.party_id=p_id) else null end,
 'guest_account',coalesce(au.is_anonymous,false),$new$);
 if position('speaker_npc_id' in s)=0 then raise exception 'Presence patch failed';end if;execute s;
end $$;
