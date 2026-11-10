-- Structured receipt data is written only by the checked gift RPC.
alter table public.forge_party_messages add column if not exists gift jsonb;

-- Keep modern equipment and its legacy projection consistent when moving one unit.
create or replace function public.forge_gift_project(c jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare inventory jsonb:='[]'; ids jsonb:='[]'; equipped jsonb:='[]'; e jsonb; n int; i int; section record; assignment record; a jsonb; eid text; idx int;
begin
 if c->>'equipmentFormatVersion' is distinct from '1' or jsonb_typeof(c->'equipmentItems') is distinct from 'array' then return c;end if;
 for e in select value from jsonb_array_elements(c->'equipmentItems') loop
  n:=greatest(0,least(1000,coalesce((e->>'quantity')::int,1)));
  for i in 1..n loop
   if i=1 and coalesce((e->>'equipped')::boolean,false) and (not coalesce((e->>'requiresAttunement')::boolean,false) or coalesce((e->>'attuned')::boolean,false)) then equipped:=equipped||to_jsonb(jsonb_array_length(inventory));end if;
   inventory:=inventory||jsonb_build_array(e->>'name');ids:=ids||jsonb_build_array(e->>'id');
  end loop;
 end loop;
 for section in select * from jsonb_each(coalesce(c->'classChoiceData','{}')) loop
  for assignment in select * from jsonb_each(coalesce(section.value->'assignments','{}')) loop
   a:=assignment.value;eid:=coalesce(a->>'equipmentItemId',c->'inventoryItemIds'->>((a->>'index')::int));
   if eid is not null then
    select ordinality::int-1 into idx from jsonb_array_elements_text(ids) with ordinality where value=eid limit 1;
    a:=a||jsonb_build_object('equipmentItemId',eid,'index',coalesce(idx,-1));if idx is not null then a:=a||jsonb_build_object('name',inventory->idx);end if;
    c:=jsonb_set(c,array['classChoiceData',section.key,'assignments',assignment.key],a);
   end if;
  end loop;
 end loop;
 return c||jsonb_build_object('inventory',inventory,'inventoryItemIds',ids,'equipped',equipped,'equipmentInventorySnapshot',inventory,'equipmentEquippedSnapshot',equipped);
end $$;
revoke all on function public.forge_gift_project(jsonb) from public,anon,authenticated;

create or replace function public.forge_party_gift(p_id uuid,p_target uuid,p_revision bigint,p_target_revision bigint,p_kind text,p_amount numeric default null,p_index int default null,p_item text default null,p_nonce uuid default null,p_private boolean default false,p_equipment jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); party public.forge_parties; src public.characters; dst public.characters; sc jsonb; dc jsonb; inv jsonb; equipment jsonb; item jsonb; entry jsonb; wallet numeric; remaining numeric; eqid text; source_name text; item_name text; is_dm boolean; receipt jsonb; body text; receipt_id bigint; target_index int;
begin
 if u is null or not public.forge_party_access(p_id) or p_target is null or p_target=u then raise exception 'Choose another party character' using errcode='42501';end if;
 select * into party from public.forge_parties where id=p_id for update;
 is_dm:=coalesce(party.dm_id=u,false);
 if p_nonce is null then raise exception 'Gift identifier required';end if;
 if exists(select 1 from public.forge_party_messages where sender_id=u and nonce=p_nonce and party_id=p_id and kind='transfer') then return jsonb_build_object('ok',true,'duplicate',true);end if;
 if (select count(*) from public.forge_party_messages where sender_id=u and kind='transfer' and created_at>now()-interval '1 minute')>=30 then raise exception 'Please wait before giving more gifts';end if;
 select c.* into dst from public.characters c join public.forge_party_members m on m.character_id=c.id and m.user_id=c.owner_id where m.party_id=p_id and m.user_id=p_target and m.user_id is distinct from party.dm_id and c.deleted_at is null;
 if dst.id is null then raise exception 'The recipient must select a cloud-saved player character';end if;
 if not is_dm then
  if p_equipment is not null then raise exception 'Only the assigned DM can award new items' using errcode='42501';end if;
  select c.* into src from public.characters c join public.forge_party_members m on m.character_id=c.id and m.user_id=c.owner_id where m.party_id=p_id and m.user_id=u and c.deleted_at is null;
  if src.id is null then raise exception 'Select your cloud-saved party character first';end if;
 end if;
 perform 1 from public.characters where id in (src.id,dst.id) order by id for update;
 select * into dst from public.characters where id=dst.id;
 if not is_dm then select * into src from public.characters where id=src.id;end if;
 if p_target_revision is null or dst.revision<>p_target_revision or (not is_dm and (p_revision is null or src.revision<>p_revision)) then return jsonb_build_object('conflict',true);end if;
 dc:=dst.data->'character';sc:=src.data->'character';
 if is_dm then select 'DM '||left(coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name','Dungeon Master'),80) into source_name from auth.users where id=u;else source_name:=src.name;end if;
 if p_kind='gold' then
  if p_amount is null or p_amount='NaN'::numeric or p_amount<=0 or p_amount>100000 or p_amount*100<>trunc(p_amount*100) then raise exception 'Enter 0.01–100000 gp to the nearest copper';end if;
  if not is_dm then
   wallet:=round(coalesce((sc->>'gold')::numeric,0)*100)+coalesce((sc->'coins'->>'cp')::numeric,0)+10*coalesce((sc->'coins'->>'sp')::numeric,0)+50*coalesce((sc->'coins'->>'ep')::numeric,0)+1000*coalesce((sc->'coins'->>'pp')::numeric,0);
   if wallet<p_amount*100 then raise exception 'Not enough gold';end if;
   remaining:=wallet-p_amount*100;sc:=sc||jsonb_build_object('gold',floor(remaining/100),'coins',jsonb_build_object('cp',mod(remaining,10),'sp',floor(mod(remaining,100)/10),'ep',0,'pp',0));
  end if;
  dc:=dc||jsonb_build_object('gold',coalesce((dc->>'gold')::numeric,0)+p_amount);
 elsif p_kind='item' then
  if jsonb_array_length(coalesce(dc->'inventory','[]'))>=1000 then raise exception 'Recipient inventory is full';end if;
  if is_dm then
   if p_item is null or length(trim(p_item)) not between 1 and 200 or jsonb_typeof(p_equipment) is distinct from 'object' or octet_length(p_equipment::text)>30000 or nullif(p_equipment->>'catalogId','') is null and nullif(p_equipment->>'magicCatalogId','') is null then raise exception 'Choose an item from the catalog';end if;
   item:=p_equipment;item_name:=trim(p_item);
  else
   inv:=coalesce(sc->'inventory','[]');
   if p_index is null or p_index<0 or p_index>=jsonb_array_length(inv) or inv->>p_index is distinct from p_item then raise exception 'Inventory changed. Reopen Give Item and try again';end if;
   if coalesce(sc->'equipped','[]') @> jsonb_build_array(p_index) then raise exception 'Unequip this item before giving it away';end if;
   item_name:=inv->>p_index;
   if sc->>'equipmentFormatVersion'='1' and jsonb_typeof(sc->'equipmentItems')='array' then
    eqid:=sc->'inventoryItemIds'->>p_index;
    select value into item from jsonb_array_elements(sc->'equipmentItems') where value->>'id'=eqid;
    if item is null or coalesce((item->>'quantity')::int,0)<1 then raise exception 'Inventory changed. Reopen Give Item';end if;
    if coalesce((item->>'equipped')::boolean,false) or coalesce((item->>'attuned')::boolean,false) then raise exception 'Unequip and unattune this item before giving it away';end if;
    if exists(select 1 from jsonb_each(coalesce(sc->'classChoiceData','{}')) sections cross join lateral jsonb_each(coalesce(sections.value->'assignments','{}')) a where coalesce(a.value->>'equipmentItemId',sc->'inventoryItemIds'->>((a.value->>'index')::int))=eqid) then raise exception 'Remove this item’s infusion or class assignment before giving it away';end if;
    select coalesce(jsonb_agg(case when value->>'id'=eqid then jsonb_set(value,'{quantity}',to_jsonb((value->>'quantity')::int-1)) else value end),'[]') into equipment from jsonb_array_elements(sc->'equipmentItems');
    sc:=public.forge_gift_project(jsonb_set(sc,'{equipmentItems}',equipment));
   else
    item:=null;sc:=jsonb_set(sc,'{inventory}',inv-p_index);
    select coalesce(jsonb_agg(to_jsonb(case when x::int>p_index then x::int-1 else x::int end)),'[]') into equipment from jsonb_array_elements_text(coalesce(sc->'equipped','[]')) x;sc:=jsonb_set(sc,'{equipped}',equipment);
   end if;
  end if;
  if item is not null then
   item:=item||jsonb_build_object('id',gen_random_uuid()::text,'name',item_name,'quantity',1,'equipped',false,'attuned',false,'carried',true);
   if dc->>'equipmentFormatVersion'='1' then
    dc:=public.forge_gift_project(jsonb_set(dc,'{equipmentItems}',coalesce(dc->'equipmentItems','[]')||jsonb_build_array(item)));
   else dc:=jsonb_set(dc,'{inventory}',coalesce(dc->'inventory','[]')||jsonb_build_array(item_name));end if;
  else dc:=jsonb_set(dc,'{inventory}',coalesce(dc->'inventory','[]')||jsonb_build_array(item_name));end if;
 else raise exception 'Choose Gold or Item';end if;
 if not is_dm then update public.characters set data=jsonb_set(data,'{character}',sc),revision=revision+1,updated_at=now() where id=src.id;end if;
 update public.characters set data=jsonb_set(data,'{character}',dc),revision=revision+1,updated_at=now() where id=dst.id;
 receipt:=jsonb_build_object('target_user_id',p_target,'target_character_id',dst.id,'target_name',dst.name,'source_name',source_name,'dm_award',is_dm,'kind',p_kind,'amount',p_amount,'item_name',item_name,'catalog_id',coalesce(item->>'magicCatalogId',item->>'catalogId'),'rarity',coalesce(item->>'rarity','Mundane'));
 body:=source_name||case when is_dm then ' has awarded ' else ' has given ' end||dst.name||case when p_kind='gold' then ' '||p_amount::text||' gp' else ' the item '||item_name end;
 insert into public.forge_party_messages(party_id,sender_id,recipient_id,nonce,kind,label,body,gift)
 values(p_id,u,case when p_private then p_target else null end,p_nonce,'transfer',case when is_dm then 'DM reward' else 'Gift' end,body,receipt) returning id into receipt_id;
 return jsonb_build_object('ok',true,'message_id',receipt_id);
end $$;
revoke all on function public.forge_party_gift(uuid,uuid,bigint,bigint,text,numeric,int,text,uuid,boolean,jsonb) from public,anon;
grant execute on function public.forge_party_gift(uuid,uuid,bigint,bigint,text,numeric,int,text,uuid,boolean,jsonb) to authenticated;

-- Keep old clients working with their original private-transfer behavior.
create or replace function public.forge_party_give(p_id uuid,p_target uuid,p_revision bigint,p_target_revision bigint,p_kind text,p_amount numeric default null,p_index int default null,p_item text default null,p_nonce uuid default null) returns jsonb
language sql security invoker set search_path='' as $$
 select public.forge_party_gift(p_id,p_target,p_revision,p_target_revision,p_kind,p_amount,p_index,p_item,p_nonce,true,null);
$$;
-- Preserve the existing sender/recipient privacy filter, clear-chat boundary and NPC support.
do $$ declare original text;updated text;begin
 select pg_get_functiondef('public.forge_party_chat(uuid,jsonb)'::regprocedure) into original;
 if position('created_at,speaker_image,gift' in original)>0 then return;end if;
 updated:=replace(original,'created_at,speaker_image from public.forge_party_messages','created_at,speaker_image,gift from public.forge_party_messages');
 if updated=original then raise exception 'Chat function changed; review gift receipt projection';end if;execute updated;
end $$;
