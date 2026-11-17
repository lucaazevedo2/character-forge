-- Shared party fund. Reuses forge_parties, forge_party_members and characters.
-- No direct balance/stash writes: all mutations pass through the checked atomic RPC.
create or replace function public.forge_fund_total(w jsonb) returns bigint language plpgsql immutable set search_path='' as $$
declare k text; rate bigint; n numeric; result numeric:=0;
begin
 if jsonb_typeof(w) is distinct from 'object' then raise exception 'Invalid coin wallet';end if;
 for k,rate in select * from (values('cp',1::bigint),('sp',10),('ep',50),('gp',100),('pp',1000)) r loop
 n:=coalesce((w->>k)::numeric,0);if n<0 or n<>trunc(n) then raise exception 'Coin amounts must be non-negative whole numbers';end if;result:=result+n*rate;
 end loop;
 if result>9007199254740991 then raise exception 'Coin balance is too large';end if;return result::bigint;
end $$;
create or replace function public.forge_fund_coins(w jsonb, amount bigint, coin text, spend boolean) returns jsonb language plpgsql immutable set search_path='' as $$
declare k text; rate bigint; rates jsonb:='{"cp":1,"sp":10,"ep":50,"gp":100,"pp":1000}'; outw jsonb:='{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'; due bigint; paid bigint; change bigint:=0; used bigint; units text[]:=array['cp','sp','ep','gp','pp'];
begin
 if amount<=0 or amount is null or not rates?coin then raise exception 'Choose a coin and positive whole amount';end if;
 perform public.forge_fund_total(w);
 foreach k in array units loop outw:=jsonb_set(outw,array[k],to_jsonb(coalesce((w->>k)::bigint,0)));end loop;
 if not spend then outw:=jsonb_set(outw,array[coin],to_jsonb((outw->>coin)::bigint+amount));perform public.forge_fund_total(outw);return outw;end if;
 if amount::numeric*(rates->>coin)::bigint>public.forge_fund_total(w) then raise exception 'Not enough funds';end if;
 due:=amount*(rates->>coin)::bigint;units:=array_prepend(coin,array_remove(units,coin));
 foreach k in array units loop exit when due=0;rate:=(rates->>k)::bigint;used:=least((outw->>k)::bigint,ceil(due::numeric/rate)::bigint);outw:=jsonb_set(outw,array[k],to_jsonb((outw->>k)::bigint-used));paid:=used*rate;if paid>=due then change:=paid-due;due:=0;else due:=due-paid;end if;end loop;
 foreach k in array array['gp','sp','cp'] loop rate:=(rates->>k)::bigint;outw:=jsonb_set(outw,array[k],to_jsonb((outw->>k)::bigint+change/rate));change:=change%rate;end loop;return outw;
end $$;
create table public.party_fund (
 party_id uuid primary key references public.forge_parties(id) on delete cascade,
 coins jsonb not null default '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}' check(public.forge_fund_total(coins)>=0),
 version bigint not null default 0, updated_at timestamptz not null default now()
);
create table public.party_stash_items (
 id uuid primary key default gen_random_uuid(),party_id uuid not null references public.forge_parties(id) on delete cascade,
 item jsonb not null check(jsonb_typeof(item)='object' and octet_length(item::text)<=60000),
 quantity integer not null check(quantity>0 and quantity<=10000), added_by uuid not null,
 added_by_name text not null, character_name text not null, version bigint not null default 0,created_at timestamptz not null default now()
);
create index party_stash_party on public.party_stash_items(party_id,created_at);
create table public.party_transactions (
 id uuid primary key default gen_random_uuid(),party_id uuid not null references public.forge_parties(id) on delete cascade,
 user_id uuid not null,character_id uuid, user_name text not null,character_name text not null,
 kind text not null check(kind in ('deposit','withdraw','item_added','item_taken','dm_adjust','dm_item_edit','dm_item_remove')),
 details jsonb not null, note text not null default '' check(length(note)<=300),
 nonce uuid not null, request jsonb not null, undo_of uuid unique references public.party_transactions(id),created_at timestamptz not null default now(),
 unique(party_id,user_id,nonce)
);
create index party_transactions_party on public.party_transactions(party_id,created_at desc,id);
alter table public.party_fund enable row level security;
alter table public.party_stash_items enable row level security;
alter table public.party_transactions enable row level security;
revoke all on public.party_fund,public.party_stash_items,public.party_transactions from public,anon,authenticated;
grant select on public.party_fund,public.party_stash_items,public.party_transactions to authenticated;
create policy fund_members_read on public.party_fund for select to authenticated using(public.forge_party_access(party_id));
create policy stash_members_read on public.party_stash_items for select to authenticated using(public.forge_party_access(party_id));
create policy transactions_members_read on public.party_transactions for select to authenticated using(public.forge_party_access(party_id));
-- Keep the canonical equipment array and its legacy projections consistent, including class assignments.
create or replace function public.forge_fund_project(ch jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare i jsonb; n int; idx int:=0; inv jsonb:='[]'; ids jsonb:='[]'; eq jsonb:='[]'; entry record; assignment record; a jsonb; oldids jsonb:=coalesce(ch->'inventoryItemIds','[]'); itemid text; atindex int; attuned int:=0; maxattuned int:=3; lev int:=0;
begin
 if ch->>'klass'='artificer' then lev:=coalesce((ch->>'level')::int,0);end if;
 for i in select value from jsonb_array_elements(coalesce(ch->'multiclass','[]')) loop if i->>'klass'='artificer' then lev:=lev+coalesce((i->>'level')::int,0);end if;end loop;
 maxattuned:=case when lev>=18 then 6 when lev>=14 then 5 when lev>=10 then 4 else 3 end;
 for i in select value from jsonb_array_elements(coalesce(ch->'equipmentItems','[]')) loop
 if coalesce((i->>'requiresAttunement')::boolean,false) and coalesce((i->>'attuned')::boolean,false) then attuned:=attuned+1;end if;
 n:=coalesce((i->>'quantity')::int,0);if n<0 or n>10000 or idx+n>10000 then raise exception 'Equipment quantity limit reached';end if;
 if n>0 then
 if coalesce((i->>'equipped')::boolean,false) and (not coalesce((i->>'requiresAttunement')::boolean,false) or coalesce((i->>'attuned')::boolean,false) and attuned<=maxattuned) then eq:=eq||to_jsonb(idx);end if;
 for j in 1..n loop inv:=inv||jsonb_build_array(i->>'name');ids:=ids||jsonb_build_array(i->>'id');end loop;idx:=idx+n;
 end if;end loop;
 for entry in select * from jsonb_each(coalesce(ch->'classChoiceData','{}')) loop
 for assignment in select * from jsonb_each(coalesce(entry.value->'assignments','{}')) loop
 a:=assignment.value;itemid:=coalesce(a->>'equipmentItemId',oldids->>(a->>'index')::int);
 if itemid is not null then select ordinality::int-1 into atindex from jsonb_array_elements_text(ids) with ordinality where value=itemid limit 1;
 a:=a||jsonb_build_object('equipmentItemId',itemid,'index',coalesce(atindex,-1));if atindex is not null then a:=a||jsonb_build_object('name',inv->>atindex);end if;
 ch:=jsonb_set(ch,array['classChoiceData',entry.key,'assignments',assignment.key],a);end if;
 end loop;end loop;
 return ch||jsonb_build_object('inventory',inv,'inventoryItemIds',ids,'equipped',eq,'equipmentInventorySnapshot',inv,'equipmentEquippedSnapshot',eq,'equipmentAttunementLimitSnapshot',maxattuned);
end $$;
-- Member-only snapshot; history is paged so long-running campaigns stay inexpensive.
create or replace function public.forge_party_fund_state(p_id uuid,p_before uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare outv jsonb;
begin
 if auth.uid() is null or not public.forge_party_access(p_id) then raise exception 'Party access denied' using errcode='42501';end if;
 select jsonb_build_object('party_id',p.id,'name',p.name,'is_dm',p.dm_id=auth.uid(),'coins',coalesce(f.coins,'{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}'::jsonb),'version',coalesce(f.version,0),
 'stash',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at,s.id) from public.party_stash_items s where s.party_id=p.id),'[]'),
 'history',coalesce((select jsonb_agg(to_jsonb(t)-'request' order by t.created_at desc,t.id desc) from (select * from public.party_transactions where party_id=p.id and (p_before is null or (created_at,id)<(select created_at,id from public.party_transactions where id=p_before and party_id=p_id)) order by created_at desc,id limit 100) t),'[]')) into outv
 from public.forge_parties p left join public.party_fund f on f.party_id=p.id where p.id=p_id;return outv;
end $$;
create or replace function public.forge_party_fund_action(p_id uuid,p_nonce uuid,p_action text,p_character uuid default null,p_revision bigint default null,p_args jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); p public.forge_parties; c public.characters; f public.party_fund; s public.party_stash_items; prior public.party_transactions; tx public.party_transactions;
 ch jsonb; wallet jsonb; newwallet jsonb; item jsonb; items jsonb; clean jsonb; qty int; amount bigint; coin text; note text:=coalesce(p_args->>'note',''); username text; charname text:='DM'; kind text; details jsonb; stashid uuid; newitemid text; result jsonb; req jsonb:=jsonb_build_object('action',p_action,'character',p_character,'revision',p_revision,'args',p_args); needschar boolean; itemindex int; quantity int;
begin
 if u is null or not public.forge_account_active() then raise exception 'Sign in to use the party fund' using errcode='42501';end if;
 if p_nonce is null or p_args is null or jsonb_typeof(p_args)<>'object' or octet_length(p_args::text)>65000 or length(note)>300 then raise exception 'Invalid fund request';end if;
 -- The party lock serializes membership changes and every fund action, in one consistent lock order.
 select * into p from public.forge_parties where id=p_id for update;
 if not found or not exists(select 1 from public.forge_party_members where party_id=p_id and user_id=u) then raise exception 'Party access denied' using errcode='42501';end if;
 select * into prior from public.party_transactions where party_id=p_id and user_id=u and nonce=p_nonce;
 if found then if prior.request<>req then raise exception 'Request ID already used';end if;select * into c from public.characters where id=prior.character_id and owner_id=u;return jsonb_build_object('ok',true,'duplicate',true,'transaction_id',prior.id,'character',case when c.id is not null then jsonb_build_object('id',c.id,'local_id',c.local_id,'revision',c.revision,'data',c.data) else null end);end if;
 insert into public.party_fund(party_id) values(p_id) on conflict do nothing;select * into f from public.party_fund where party_id=p_id for update;
 needschar:=p_action in ('deposit','withdraw','item_add','item_take','undo_item');
 if needschar then
 if not exists(select 1 from public.forge_party_members where party_id=p_id and user_id=u and character_id=p_character) then raise exception 'Select your party character first';end if;
 select * into c from public.characters where id=p_character and owner_id=u and deleted_at is null for update;
 if not found then raise exception 'Character unavailable';end if;
 if p_revision is null or p_revision<>c.revision then return jsonb_build_object('conflict',true);end if;
 ch:=c.data->'character';charname:=c.name;
 end if;
 select left(coalesce(raw_user_meta_data->>'full_name',raw_user_meta_data->>'name','Party member'),80) into username from auth.users where id=u;
 username:=coalesce(username,'Party member');
 if p_action in ('deposit','withdraw','dm_adjust') then
 coin:=p_args->>'coin';if (p_args->>'amount')::numeric<>trunc((p_args->>'amount')::numeric) then raise exception 'Enter a whole amount';end if;amount:=(p_args->>'amount')::bigint;
 if amount is null or amount<=0 or amount>9007199254740 then raise exception 'Enter a positive whole amount';end if;
 if p_action='dm_adjust' then
 if p.dm_id is distinct from u then raise exception 'Only the DM can adjust the fund' using errcode='42501';end if;
 if p_args->>'mode' not in ('add','spend') or p_args->>'mode' is null then raise exception 'Choose Add or Spend';end if;
 f.coins:=public.forge_fund_coins(f.coins,amount,coin,p_args->>'mode'='spend');
 else
 -- Match shopWallet's legacy fractional-GP conversion exactly.
 wallet:=coalesce(ch->'coins','{}')||jsonb_build_object('gp',trunc(greatest(0,coalesce((ch->>'gold')::numeric,0))),
 'sp',coalesce((ch->'coins'->>'sp')::bigint,0)+floor((round(greatest(0,coalesce((ch->>'gold')::numeric,0))*100)-trunc(greatest(0,coalesce((ch->>'gold')::numeric,0)))*100)/10),
 'cp',coalesce((ch->'coins'->>'cp')::bigint,0)+mod(round(greatest(0,coalesce((ch->>'gold')::numeric,0))*100)-trunc(greatest(0,coalesce((ch->>'gold')::numeric,0)))*100,10));
 if p_action='deposit' then newwallet:=public.forge_fund_coins(wallet,amount,coin,true);f.coins:=public.forge_fund_coins(f.coins,amount,coin,false);
 else f.coins:=public.forge_fund_coins(f.coins,amount,coin,true);newwallet:=public.forge_fund_coins(wallet,amount,coin,false);end if;
 ch:=ch||jsonb_build_object('gold',(newwallet->>'gp')::bigint,'coins',newwallet-'gp');
 end if;
 kind:=p_action;details:=jsonb_build_object('amount',amount,'coin',coin,'mode',p_args->>'mode','coins',f.coins,'totalCopper',public.forge_fund_total(f.coins));
 elsif p_action='item_add' then
 if (p_args->>'quantity')::numeric<>trunc((p_args->>'quantity')::numeric) then raise exception 'Choose a whole quantity';end if;qty:=(p_args->>'quantity')::int;
 select value,ordinality::int-1 into item,itemindex from jsonb_array_elements(ch->'equipmentItems') with ordinality where value->>'id'=p_args->>'item_id';
 if item is null or qty is null or qty<1 or qty>coalesce((item->>'quantity')::int,0) then raise exception 'Item quantity unavailable';end if;
 if (select count(*) from public.party_stash_items where party_id=p_id)>=1000 then raise exception 'Party stash is full';end if;
 clean:=item||jsonb_build_object('equipped',false,'attuned',false,'quantity',qty);
 insert into public.party_stash_items(party_id,item,quantity,added_by,added_by_name,character_name) values(p_id,clean,qty,u,username,charname) returning id into stashid;
 quantity:=(item->>'quantity')::int-qty;
 if quantity=0 then items:=(ch->'equipmentItems')-itemindex;else items:=jsonb_set(ch->'equipmentItems',array[itemindex::text],item||jsonb_build_object('quantity',quantity));end if;
 ch:=public.forge_fund_project(ch||jsonb_build_object('equipmentItems',items));kind:='item_added';details:=jsonb_build_object('stash_id',stashid,'quantity',qty,'name',item->>'name','item',clean,'stash_version',0);
 elsif p_action in ('item_take','undo_item','dm_item_edit','dm_item_remove') then
 if p_action in ('dm_item_edit','dm_item_remove') and p.dm_id is distinct from u then raise exception 'Only the DM can edit shared items' using errcode='42501';end if;
 if p_action='undo_item' then
 select * into prior from public.party_transactions where id=(p_args->>'transaction_id')::uuid and party_id=p_id and user_id=u and character_id=p_character and party_transactions.kind='item_added';
 if not found or exists(select 1 from public.party_transactions where undo_of=prior.id) then raise exception 'This transfer cannot be undone';end if;
 stashid:=(prior.details->>'stash_id')::uuid;qty:=(prior.details->>'quantity')::int;
 else stashid:=(p_args->>'stash_id')::uuid;if (p_args->>'quantity')::numeric<>trunc((p_args->>'quantity')::numeric) then raise exception 'Choose a whole quantity';end if;qty:=(p_args->>'quantity')::int;end if;
 select * into s from public.party_stash_items where id=stashid and party_id=p_id for update;
 if not found then raise exception 'This shared item is no longer available';end if;
 if p_action in ('dm_item_edit','dm_item_remove') and (p_args->>'stash_version' is null or (p_args->>'stash_version')::bigint<>s.version) then raise exception 'The shared item changed. Refresh and try again';end if;
 if p_action='undo_item' and s.version<>(prior.details->>'stash_version')::bigint then raise exception 'The item changed or was taken. Undo unavailable';end if;
 if p_action in ('item_take','undo_item') then
 if qty is null or qty<1 or qty>s.quantity then raise exception 'Item quantity unavailable';end if;
 newitemid:='eq-'||gen_random_uuid()::text;clean:=s.item||jsonb_build_object('id',newitemid,'quantity',qty,'equipped',false,'attuned',false);
 ch:=public.forge_fund_project(ch||jsonb_build_object('equipmentItems',coalesce(ch->'equipmentItems','[]')||jsonb_build_array(clean)));
 if qty=s.quantity then delete from public.party_stash_items where id=s.id;else update public.party_stash_items set quantity=s.quantity-qty,item=jsonb_set(s.item,'{quantity}',to_jsonb(s.quantity-qty)),version=s.version+1 where id=s.id;end if;
 kind:='item_taken';details:=jsonb_build_object('stash_id',s.id,'quantity',qty,'name',s.item->>'name','item',clean);
 elsif p_action='dm_item_remove' then
 delete from public.party_stash_items where id=s.id;kind:='dm_item_remove';details:=jsonb_build_object('stash_id',s.id,'quantity',s.quantity,'name',s.item->>'name','item',s.item);
 else
 if qty is null or qty<1 or qty>10000 or length(trim(p_args->>'name')) not between 1 and 120 or (p_args->>'weight')::numeric<0 or (p_args->>'weight')::numeric>100000 then raise exception 'Enter a valid name, quantity and weight';end if;
 clean:=s.item||jsonb_build_object('name',trim(p_args->>'name'),'quantity',qty,'weight',(p_args->>'weight')::numeric,'equipped',false,'attuned',false);
 if p_args->>'name' is null or p_args->>'weight' is null then raise exception 'Name and weight required';end if;
 update public.party_stash_items set item=clean,quantity=qty,version=version+1 where id=s.id;kind:='dm_item_edit';details:=jsonb_build_object('stash_id',s.id,'name',clean->>'name','quantity',qty,'before',s.item,'item',clean);
 end if;
 else raise exception 'Unknown fund action';end if;
 if needschar then update public.characters set data=jsonb_set(data,'{character}',ch),revision=revision+1,updated_at=now() where id=c.id returning * into c;end if;
 update public.party_fund set coins=f.coins,version=version+1,updated_at=now() where party_id=p_id;
 insert into public.party_transactions(party_id,user_id,character_id,user_name,character_name,kind,details,note,nonce,request,undo_of)
 values(p_id,u,case when needschar then c.id else null end,username,charname,kind,details,note,p_nonce,req,case when p_action='undo_item' then prior.id else null end) returning * into tx;
 return jsonb_build_object('ok',true,'transaction_id',tx.id,'character',case when needschar then jsonb_build_object('id',c.id,'local_id',c.local_id,'revision',c.revision,'data',c.data) else null end);
end $$;
revoke all on function public.forge_fund_total(jsonb),public.forge_fund_coins(jsonb,bigint,text,boolean),public.forge_fund_project(jsonb) from public,anon,authenticated;
revoke all on function public.forge_party_fund_state(uuid,uuid),public.forge_party_fund_action(uuid,uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.forge_party_fund_state(uuid,uuid),public.forge_party_fund_action(uuid,uuid,text,uuid,bigint,jsonb) to authenticated;
-- Constraint evaluation needs the harmless, immutable total calculator, not balance mutation privileges.
grant execute on function public.forge_fund_total(jsonb) to authenticated;
do $$ begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.party_transactions;end if;end $$;
