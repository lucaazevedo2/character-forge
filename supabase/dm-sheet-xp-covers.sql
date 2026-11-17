begin;
-- DM inspection, XP awards, and campaign covers. Reuses existing party/membership data.
create schema if not exists forge_dm_private;
revoke all on schema forge_dm_private from public,anon;
grant usage on schema forge_dm_private to authenticated;
create or replace function forge_dm_private.can_view_character(p_id uuid,p_owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.forge_account_active() and
 (auth.uid()=p_owner or exists(
  select 1 from public.forge_party_members m join public.forge_parties p on p.id=m.party_id
  join public.forge_party_members dm on dm.party_id=p.id and dm.user_id=p.dm_id
  join auth.users player on player.id=m.user_id
  where m.character_id=p_id and m.user_id=p_owner and p.dm_id=auth.uid() and not coalesce(player.is_anonymous,false)
 ));
$$;
revoke all on function forge_dm_private.can_view_character(uuid,uuid) from public,anon,authenticated;
grant execute on function forge_dm_private.can_view_character(uuid,uuid) to authenticated;
-- A dedicated non-login view owner gets a SELECT-only RLS policy. Existing clients
-- querying characters still see only their own records (including the stable site).
do $$begin if not exists(select 1 from pg_roles where rolname='forge_sheet_reader') then create role forge_sheet_reader nologin noinherit nobypassrls;end if;end $$;
grant usage on schema public,forge_dm_private to forge_sheet_reader;
grant select on public.characters to forge_sheet_reader;
grant execute on function forge_dm_private.can_view_character(uuid,uuid) to forge_sheet_reader;
create policy "Scoped private sheet reader" on public.characters for select to forge_sheet_reader
 using (deleted_at is null and forge_dm_private.can_view_character(id,owner_id));
create or replace function forge_dm_private.player_name(p_id uuid,p_owner uuid) returns text
language sql stable security definer set search_path='' as $$
 select left(coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name','Player'),80)
 from auth.users where id=p_owner and forge_dm_private.can_view_character(p_id,p_owner);
$$;
revoke all on function forge_dm_private.player_name(uuid,uuid) from public,anon,authenticated;
grant execute on function forge_dm_private.player_name(uuid,uuid) to forge_sheet_reader,authenticated;
create view forge_dm_private.view_characters with (security_barrier=true) as
 select c.id,c.name,c.data,c.revision,c.updated_at,forge_dm_private.player_name(c.id,c.owner_id) as player_name
 from public.characters c where c.deleted_at is null;
grant forge_sheet_reader to current_user;
grant create on schema forge_dm_private to forge_sheet_reader;
alter view forge_dm_private.view_characters owner to forge_sheet_reader;
set local role forge_sheet_reader;
revoke all on forge_dm_private.view_characters from public,anon,authenticated;
grant select on forge_dm_private.view_characters to authenticated;
reset role;
revoke create on schema forge_dm_private from forge_sheet_reader;
revoke forge_sheet_reader from current_user;
-- An invoker RPC deliberately uses the characters RLS policy.
create or replace function public.forge_character_view(p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',c.id,'name',c.name,'data',c.data,'revision',c.revision,'updated_at',c.updated_at,'player_name',c.player_name)
 from forge_dm_private.view_characters c where c.id=p_id;
$$;
revoke all on function public.forge_character_view(uuid) from public,anon;
grant execute on function public.forge_character_view(uuid) to authenticated;

create or replace function public.forge_party_award_xp(p_id uuid,p_nonce uuid,p_characters uuid[],p_entries jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); party public.forge_parties; prior public.forge_party_messages; row public.characters;
 ids uuid[]; entry jsonb; qty numeric; xp numeric; total numeric:=0; n int; idx int:=0; portion bigint; current_xp numeric;
 awards jsonb:='[]'; request jsonb; receipt jsonb; receipt_id bigint; names text; player_name text;
begin
 if u is null or not public.forge_account_active() then raise exception 'Sign in to award XP' using errcode='42501';end if;
 select * into party from public.forge_parties where id=p_id for update;
 if party.id is null or party.dm_id is distinct from u or not public.forge_party_access(p_id) then raise exception 'Only the assigned party DM can award XP' using errcode='42501';end if;
 if p_nonce is null or p_characters is null or cardinality(p_characters) not between 1 and 10 then raise exception 'Select 1–10 cloud characters';end if;
 select array_agg(id order by id) into ids from (select distinct unnest(p_characters) id) q;
 if cardinality(ids)<>cardinality(p_characters) or array_position(ids,null) is not null then raise exception 'Select each character only once';end if;
 if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries) not between 1 and 100 then raise exception 'Add an XP amount or monster';end if;
 for entry in select value from jsonb_array_elements(p_entries) loop
  if jsonb_typeof(entry) is distinct from 'object' or length(trim(coalesce(entry->>'name',''))) not between 1 and 120 then raise exception 'Name every XP entry';end if;
  qty:=(entry->>'quantity')::numeric;xp:=(entry->>'xp')::numeric;
  if qty is null or xp is null or qty='NaN'::numeric or xp='NaN'::numeric or qty<>trunc(qty) or xp<>trunc(xp) or qty not between 1 and 10000 or xp not between 0 and 10000000 then raise exception 'Use whole XP amounts and quantities';end if;
  total:=total+qty*xp;
 end loop;
 if total not between 1 and 1000000000 then raise exception 'Total XP must be 1–1,000,000,000';end if;
 request:=jsonb_build_object('characters',to_jsonb(ids),'entries',p_entries);
 select * into prior from public.forge_party_messages where party_id=p_id and sender_id=u and nonce=p_nonce;
 if prior.id is not null then
  if prior.gift->>'kind' is distinct from 'xp' or prior.gift->'request' is distinct from request then raise exception 'This award identifier was already used';end if;
  return jsonb_build_object('ok',true,'duplicate',true,'message_id',prior.id,'awards',prior.gift->'awards','total',prior.gift->'amount');
 end if;
 if (select count(*) from public.forge_party_messages where party_id=p_id and sender_id=u and gift->>'kind'='xp' and created_at>now()-interval '1 minute')>=30 then raise exception 'Please wait before awarding more XP';end if;
 n:=cardinality(ids);
 if (select count(*) from public.characters c join public.forge_party_members m on m.character_id=c.id and m.user_id=c.owner_id
     join auth.users player on player.id=c.owner_id where m.party_id=p_id and c.id=any(ids) and c.deleted_at is null and c.owner_id<>u and not coalesce(player.is_anonymous,false))<>n then
  raise exception 'A selected character left the party or is not cloud-saved. Refresh the party.';
 end if;
 -- Consistent lock order also matches gifts and shared-fund transfers.
 perform 1 from public.characters where id=any(ids) order by id for update;
 for row in select * from public.characters where id=any(ids) order by id loop
  portion:=floor(total/n)::bigint+case when idx<mod(total,n) then 1 else 0 end;idx:=idx+1;
  if row.deleted_at is not null then raise exception 'A selected character is no longer available';end if;
  current_xp:=coalesce((row.data->'character'->>'xp')::numeric,0);
  if current_xp='NaN'::numeric or current_xp<0 or current_xp<>trunc(current_xp) or current_xp+portion>1000000000 then raise exception 'A character has an invalid or excessive XP total';end if;
  if portion>0 then update public.characters set data=jsonb_set(data,'{character,xp}',to_jsonb(current_xp+portion)),revision=revision+1,updated_at=now() where id=row.id;end if;
  awards:=awards||jsonb_build_array(jsonb_build_object('character_id',row.id,'user_id',row.owner_id,'name',row.name,'amount',portion,'resulting_xp',current_xp+portion));
 end loop;
 select left(coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name','Dungeon Master'),80) into player_name from auth.users where id=u;
 receipt:=jsonb_build_object('kind','xp','dm_award',true,'source_name',player_name,'amount',total,'awards',awards,'entries',p_entries,'request',request);
 insert into public.forge_party_messages(party_id,sender_id,nonce,kind,label,body,gift)
 values(p_id,u,p_nonce,'transfer','XP AWARD',player_name||' awarded '||total::text||' XP, split between '||n::text||' characters.',receipt) returning id into receipt_id;
 return jsonb_build_object('ok',true,'message_id',receipt_id,'awards',awards,'total',total);
end $$;
revoke all on function public.forge_party_award_xp(uuid,uuid,uuid[],jsonb) from public,anon;
grant execute on function public.forge_party_award_xp(uuid,uuid,uuid[],jsonb) to authenticated;

-- A small compressed cover is independent of map snapshots and their save revision.
alter table public.forge_vtt_campaigns add column cover_image text;
alter table public.forge_vtt_campaigns add constraint vtt_cover_image_valid check
 (cover_image is null or (octet_length(cover_image)<=280000 and cover_image ~ '^data:image/webp;base64,[A-Za-z0-9+/=]+$'));
create or replace function public.forge_vtt_set_cover(p_id uuid,p_image text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.forge_account_active() or not exists(select 1 from public.forge_vtt_campaign_members m join public.forge_vtt_campaigns c on c.id=m.campaign_id where m.campaign_id=p_id and m.user_id=auth.uid() and m.role='dm' and c.deleted_at is null) then raise exception 'Only a campaign DM can change its cover' using errcode='42501';end if;
 if p_image is not null and (octet_length(p_image)>280000 or p_image !~ '^data:image/webp;base64,[A-Za-z0-9+/=]+$') then raise exception 'Choose a compressed WebP cover';end if;
 update public.forge_vtt_campaigns set cover_image=p_image where id=p_id;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.forge_vtt_set_cover(uuid,text) from public,anon;
grant execute on function public.forge_vtt_set_cover(uuid,text) to authenticated;

-- Annotate existing roster data; authenticated guest party participation is unchanged.
do $$ declare original text;updated text;begin
 select pg_get_functiondef('public.forge_party_state(uuid)'::regprocedure) into original;
 updated:=replace(original,'''character_revision'',c.revision,','''character_revision'',c.revision,''cloud_saved'',c.id is not null and not coalesce(au.is_anonymous,false),');
 if updated=original then raise exception 'Review party roster projection before adding cloud-saved marker';end if;execute updated;
end $$;

commit;
