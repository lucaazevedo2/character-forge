-- DM combat changes use the existing checked vitals command and receipt delivery.
create or replace function public.forge_party_vitals(p_id uuid,p_args jsonb,p_nonce uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); p public.forge_parties; c public.characters; before_state jsonb; after_state jsonb; result jsonb; amount numeric; hp numeric; temp numeric; maximum numeric; mode text:=coalesce(p_args->>'mode','set'); receipt jsonb; notices jsonb:='[]'; x text; source_name text;
begin
 if u is null or not public.forge_account_active() or not public.forge_party_access(p_id) then raise exception 'Party access denied' using errcode='42501';end if;
 select * into p from public.forge_parties where id=p_id for update;
 if p.dm_id is distinct from u then raise exception 'Only the assigned DM can edit vitals' using errcode='42501';end if;
 if p_nonce is null then raise exception 'Change identifier required';end if;
 if exists(select 1 from public.forge_party_messages where party_id=p_id and sender_id=u and nonce=p_nonce) then return jsonb_build_object('ok',true,'duplicate',true);end if;
 select ch.* into c from public.characters ch join public.forge_party_members m on m.character_id=ch.id and m.user_id=ch.owner_id where m.party_id=p_id and ch.id=(p_args->>'character_id')::uuid and m.user_id is distinct from p.dm_id and ch.deleted_at is null for update of ch;
 if c.id is null then raise exception 'Party character not found';end if;
 before_state:=c.data->'character';hp:=public.forge_party_number(coalesce(before_state->'wildShape'->'hp',before_state->'hp'));temp:=public.forge_party_number(before_state->'tempHp');maximum:=greatest(1,public.forge_party_number(coalesce(before_state->'wildShape'->'maxHP',c.data->'_party'->'max_hp'),100000));
 if mode in ('damage','heal') then
  amount:=(p_args->>'amount')::numeric;
  if amount is null or amount='NaN'::numeric or amount<1 or amount>100000 or trunc(amount)<>amount then raise exception 'Enter a whole HP amount from 1 to 100000';end if;
  if mode='damage' then hp:=greatest(0,hp-greatest(0,amount-temp));temp:=greatest(0,temp-amount);else hp:=least(maximum,hp+amount);end if;
  p_args:=p_args||jsonb_build_object('hp',hp,'temp_hp',temp,'conditions',coalesce(before_state->'conditionTracker'->'active','[]'),'exhaustion',coalesce(before_state->'conditionTracker'->'exhaustion','0'));
 elsif mode<>'set' then raise exception 'Unknown HP action';end if;
 result:=public.forge_party_command('vitals',p_id,p_args);if coalesce((result->>'conflict')::boolean,false) then return result;end if;
 select data->'character' into after_state from public.characters where id=c.id;
 if mode='damage' then notices:=notices||jsonb_build_array('You took '||amount::text||' damage.');
 elsif mode='heal' then notices:=notices||jsonb_build_array('You were healed '||(hp-public.forge_party_number(coalesce(before_state->'wildShape'->'hp',before_state->'hp')))::text||' HP.');
 elsif hp is distinct from public.forge_party_number(p_args->'hp') then notices:=notices||jsonb_build_array('Your HP was set to '||(p_args->>'hp')||'.');end if;
 for x in select jsonb_array_elements_text(coalesce(after_state->'conditionTracker'->'active','[]')) except select jsonb_array_elements_text(coalesce(before_state->'conditionTracker'->'active','[]')) loop notices:=notices||jsonb_build_array('You received the '||x||' condition.');end loop;
 for x in select jsonb_array_elements_text(coalesce(before_state->'conditionTracker'->'active','[]')) except select jsonb_array_elements_text(coalesce(after_state->'conditionTracker'->'active','[]')) loop notices:=notices||jsonb_build_array('Your '||x||' condition was removed.');end loop;
 if jsonb_array_length(notices)=0 then notices:=jsonb_build_array('Your HP and conditions were updated.');end if;
 select 'DM '||left(coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name','Dungeon Master'),80) into source_name from auth.users where id=u;
 receipt:=jsonb_build_object('kind','vitals','mode',mode,'target_user_id',c.owner_id,'target_character_id',c.id,'target_name',c.name,'source_name',source_name,'notices',notices);
 insert into public.forge_party_messages(party_id,sender_id,recipient_id,nonce,kind,label,body,gift) values(p_id,u,case when coalesce((p_args->>'private')::boolean,false) then c.owner_id else null end,p_nonce,'transfer','DM combat',source_name||' updated '||c.name||': '||(select string_agg(value,' ') from jsonb_array_elements_text(notices)),receipt);
 return result;
end $$;
revoke all on function public.forge_party_vitals(uuid,jsonb,uuid) from public,anon;
grant execute on function public.forge_party_vitals(uuid,jsonb,uuid) to authenticated;

-- Vitals are available outside initiative/session tracking; all DM and revision checks remain.
do $$ declare original text; updated text; begin
 select pg_get_functiondef('public.forge_party_command(text,uuid,jsonb)'::regprocedure) into original;
 updated:=replace(original,$old$    if not p.session_active then raise exception 'Start a session to manage character vitals'; end if;$old$,'');
 execute updated;
end $$;
