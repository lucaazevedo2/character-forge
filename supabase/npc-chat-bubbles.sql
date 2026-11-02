create table public.forge_party_npcs(id uuid primary key default gen_random_uuid(),party_id uuid not null references public.forge_parties(id) on delete cascade,name text not null check(length(name) between 1 and 80),image text not null default '' check(length(image)<=150000));
alter table public.forge_party_npcs enable row level security;
revoke all on public.forge_party_npcs from public,anon,authenticated;
alter table public.forge_party_messages add column speaker_image text not null default '';
create function public.forge_party_npcs(p_id uuid,p_data jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.forge_party_access(p_id) then raise exception 'Party access denied';end if;
 if p_data is not null then
 if not exists(select 1 from public.forge_parties where id=p_id and dm_id=auth.uid()) then raise exception 'Only the DM can edit NPCs';end if;
 if p_data->>'action'='delete' then delete from public.forge_party_npcs where party_id=p_id and id=(p_data->>'id')::uuid;
 else
 if coalesce(p_data->>'image','')<>'' and p_data->>'image' !~ '^data:image/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$' then raise exception 'Invalid NPC portrait';end if;
 if (select count(*) from public.forge_party_npcs where party_id=p_id)>=40 then raise exception 'Up to 40 NPCs per party';end if;
 insert into public.forge_party_npcs(party_id,name,image) values(p_id,trim(p_data->>'name'),coalesce(p_data->>'image',''));
 end if;end if;
 return coalesce((select jsonb_agg(to_jsonb(n)) from public.forge_party_npcs n where party_id=p_id),'[]');
end $$;
create table public.forge_party_typing(party_id uuid references public.forge_parties(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,recipient_id uuid,seen_at timestamptz not null default now(),primary key(party_id,user_id));
alter table public.forge_party_typing enable row level security;
revoke all on public.forge_party_typing from public,anon,authenticated;
create function public.forge_party_typing(p_id uuid,p_active boolean default false,p_recipient uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.forge_party_access(p_id) then raise exception 'Party access denied';end if;
 if p_recipient is not null and not exists(select 1 from public.forge_party_members where party_id=p_id and user_id=p_recipient) then raise exception 'Invalid recipient';end if;
 if p_active then insert into public.forge_party_typing(party_id,user_id,recipient_id) values(p_id,auth.uid(),p_recipient) on conflict(party_id,user_id) do update set seen_at=now(),recipient_id=excluded.recipient_id;
 else delete from public.forge_party_typing where party_id=p_id and user_id=auth.uid();end if;
 return coalesce((select jsonb_agg(jsonb_build_object('user_id',user_id)) from public.forge_party_typing where party_id=p_id and user_id<>auth.uid() and seen_at>now()-interval '6 seconds' and (recipient_id is null or recipient_id=auth.uid())),'[]');
end $$;
revoke all on function public.forge_party_npcs(uuid,jsonb),public.forge_party_typing(uuid,boolean,uuid) from public,anon;
grant execute on function public.forge_party_npcs(uuid,jsonb),public.forge_party_typing(uuid,boolean,uuid) to authenticated;
do $$ declare s text;begin
 s:=pg_get_functiondef('public.forge_party_chat(uuid,jsonb)'::regprocedure);
 s:=replace(s,'who text;','who text; npc public.forge_party_npcs;');
 s:=replace(s,'  insert into public.forge_party_messages(party_id,sender_id,recipient_id,nonce,kind,label,body,total,command)', $x$
 if nullif(p_message->>'npc_id','') is not null then
 if not exists(select 1 from public.forge_parties where id=p_id and dm_id=u) then raise exception 'Only the DM can speak as an NPC';end if;
 select * into npc from public.forge_party_npcs where party_id=p_id and id=(p_message->>'npc_id')::uuid;
 if not found then raise exception 'NPC not found';end if;who:=npc.name;
 end if;
 insert into public.forge_party_messages(party_id,sender_id,recipient_id,nonce,kind,label,body,total,command,speaker_image)$x$);
 s:=replace(s,$q$left(coalesce(p_message->>'command',''),500)) on conflict$q$, $q$left(coalesce(p_message->>'command',''),500),coalesce(npc.image,'')) on conflict$q$);
 s:=replace(s,'select id,sender_id,recipient_id,kind,label,body,total,command,created_at','select id,sender_id,recipient_id,kind,label,body,total,command,created_at,speaker_image');
 execute s;
end $$;
