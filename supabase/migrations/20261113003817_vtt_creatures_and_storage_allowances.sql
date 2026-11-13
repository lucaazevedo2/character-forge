BEGIN;
-- Entitlements are server-owned and keyed by immutable account ID, never user_metadata.
CREATE TABLE forge_vtt_private.storage_allowances(user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,limit_bytes bigint NOT NULL CHECK(limit_bytes BETWEEN 524288000 AND 1099511627776));
ALTER TABLE forge_vtt_private.storage_allowances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON forge_vtt_private.storage_allowances FROM PUBLIC,anon,authenticated;
INSERT INTO forge_vtt_private.storage_allowances(user_id,limit_bytes) SELECT id,214748364800 FROM auth.users WHERE lower(email)='lucaazevedo10@gmail.com';
CREATE FUNCTION forge_vtt_private.storage_limit(u uuid,scope text) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT coalesce((SELECT limit_bytes FROM forge_vtt_private.storage_allowances WHERE user_id=u),CASE WHEN scope='campaign' THEN 262144000::bigint ELSE 524288000::bigint END)$$;
REVOKE ALL ON FUNCTION forge_vtt_private.storage_limit(uuid,text) FROM PUBLIC,anon,authenticated;
ALTER TABLE public.forge_vtt_resources DROP CONSTRAINT forge_vtt_resources_kind_check;
ALTER TABLE public.forge_vtt_resources ADD CONSTRAINT forge_vtt_resources_kind_check CHECK(kind IN ('handout','journal','pin','audio','creature'));
CREATE FUNCTION forge_vtt_private.creature_ok(s jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$DECLARE k text;item jsonb;v jsonb;BEGIN
IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR octet_length(s::text)>65536 OR NOT forge_vtt_private.allow_keys(s,ARRAY['name','role','size','type','subtype','alignment','armor','hitDice','saves','skills','vulnerabilities','resistances','immunities','conditionImmunities','senses','languages','challenge','equipment','description','tactics','regionalEffects','source','sourceId','spellAbility','spells','innateSpells','ac','hp','proficiency','initiative','xp','passivePerception','walk','fly','swim','climb','burrow','legendaryBudget','legendaryResistances','lairInitiative','casterLevel','spellDC','spellAttack','strength','dexterity','constitution','intelligence','wisdom','charisma','traits','actions','bonusActions','reactions','legendaryActions','lairActions','mythicActions','slots','hover']) OR NOT s ?& ARRAY['name','role','size','type','subtype','alignment','armor','hitDice','saves','skills','vulnerabilities','resistances','immunities','conditionImmunities','senses','languages','challenge','equipment','description','tactics','regionalEffects','source','sourceId','spellAbility','spells','innateSpells','ac','hp','proficiency','initiative','xp','passivePerception','walk','fly','swim','climb','burrow','legendaryBudget','legendaryResistances','lairInitiative','casterLevel','spellDC','spellAttack','strength','dexterity','constitution','intelligence','wisdom','charisma','traits','actions','bonusActions','reactions','legendaryActions','lairActions','mythicActions','slots','hover'] THEN RETURN false;END IF;
IF jsonb_typeof(s->'name') IS DISTINCT FROM 'string' OR length(s->>'name')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'role') IS DISTINCT FROM 'string' OR length(s->>'role')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'size') IS DISTINCT FROM 'string' OR length(s->>'size')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'type') IS DISTINCT FROM 'string' OR length(s->>'type')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'subtype') IS DISTINCT FROM 'string' OR length(s->>'subtype')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'alignment') IS DISTINCT FROM 'string' OR length(s->>'alignment')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'armor') IS DISTINCT FROM 'string' OR length(s->>'armor')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'hitDice') IS DISTINCT FROM 'string' OR length(s->>'hitDice')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'saves') IS DISTINCT FROM 'string' OR length(s->>'saves')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'skills') IS DISTINCT FROM 'string' OR length(s->>'skills')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'vulnerabilities') IS DISTINCT FROM 'string' OR length(s->>'vulnerabilities')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'resistances') IS DISTINCT FROM 'string' OR length(s->>'resistances')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'immunities') IS DISTINCT FROM 'string' OR length(s->>'immunities')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'conditionImmunities') IS DISTINCT FROM 'string' OR length(s->>'conditionImmunities')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'senses') IS DISTINCT FROM 'string' OR length(s->>'senses')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'languages') IS DISTINCT FROM 'string' OR length(s->>'languages')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'challenge') IS DISTINCT FROM 'string' OR length(s->>'challenge')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'equipment') IS DISTINCT FROM 'string' OR length(s->>'equipment')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'description') IS DISTINCT FROM 'string' OR length(s->>'description')>8000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'tactics') IS DISTINCT FROM 'string' OR length(s->>'tactics')>8000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'regionalEffects') IS DISTINCT FROM 'string' OR length(s->>'regionalEffects')>8000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'source') IS DISTINCT FROM 'string' OR length(s->>'source')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'sourceId') IS DISTINCT FROM 'string' OR length(s->>'sourceId')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'spellAbility') IS DISTINCT FROM 'string' OR length(s->>'spellAbility')>2000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'spells') IS DISTINCT FROM 'string' OR length(s->>'spells')>8000 THEN RETURN false;END IF;
IF jsonb_typeof(s->'innateSpells') IS DISTINCT FROM 'string' OR length(s->>'innateSpells')>8000 THEN RETURN false;END IF;
IF length(trim(s->>'name')) NOT BETWEEN 1 AND 120 OR s->>'role' NOT IN ('Monster','NPC') OR s->>'size' NOT IN ('Tiny','Small','Medium','Large','Huge','Gargantuan') OR jsonb_typeof(s->'hover') IS DISTINCT FROM 'boolean' THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'ac',0,100) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'hp',1,100000) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'proficiency',0,30) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'initiative',-30,50) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'xp',0,10000000) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'passivePerception',0,100) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'walk',0,1000) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'fly',0,1000) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'swim',0,1000) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'climb',0,1000) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'burrow',0,1000) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'legendaryBudget',0,100) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'legendaryResistances',0,100) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'lairInitiative',0,100) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'casterLevel',0,30) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'spellDC',0,100) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'spellAttack',-30,100) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'strength',1,40) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'dexterity',1,40) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'constitution',1,40) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'intelligence',1,40) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'wisdom',1,40) THEN RETURN false;END IF;
IF NOT forge_vtt_private.number_ok(s,'charisma',1,40) THEN RETURN false;END IF;
IF jsonb_typeof(s->'slots') IS DISTINCT FROM 'array' OR jsonb_array_length(s->'slots')<>10 THEN RETURN false;END IF;FOR v IN SELECT value FROM jsonb_array_elements(s->'slots') LOOP IF jsonb_typeof(v)<>'number' OR (v::text)::numeric NOT BETWEEN 0 AND 100 OR trunc((v::text)::numeric)<>(v::text)::numeric THEN RETURN false;END IF;END LOOP;
FOREACH k IN ARRAY ARRAY['traits','actions','bonusActions','reactions','legendaryActions','lairActions','mythicActions'] LOOP IF jsonb_typeof(s->k) IS DISTINCT FROM 'array' OR jsonb_array_length(s->k)>40 THEN RETURN false;END IF;
FOR item IN SELECT value FROM jsonb_array_elements(s->k) LOOP IF NOT forge_vtt_private.allow_keys(item,ARRAY['name','description','attack','damage','damageType','save','range','usage','cost']) OR NOT item ?& ARRAY['name','description','attack','damage','damageType','save','range','usage','cost'] OR EXISTS(SELECT 1 FROM jsonb_each(item) e WHERE jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>CASE WHEN e.key='description' THEN 8000 WHEN e.key='name' THEN 120 ELSE 300 END) OR length(trim(item->>'name'))=0 OR item->>'attack'<>'' AND item->>'attack'!~'^[+-]?[0-9]{1,3}$' OR item->>'damage'<>'' AND item->>'damage'!~'^([0-9]{1,3}d[0-9]{1,4}|[0-9]{1,5})([[:space:]]*[+-][[:space:]]*([0-9]{1,3}d[0-9]{1,4}|[0-9]{1,5}))*$' THEN RETURN false;END IF;END LOOP;END LOOP;RETURN true;EXCEPTION WHEN OTHERS THEN RETURN false;END$$;
REVOKE ALL ON FUNCTION forge_vtt_private.creature_ok(jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION forge_vtt_private.resources_snapshot(c uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT jsonb_build_object('campaignLimit',forge_vtt_private.storage_limit((SELECT owner_id FROM public.forge_vtt_campaigns WHERE id=c),'campaign'),'accountLimit',forge_vtt_private.storage_limit((SELECT owner_id FROM public.forge_vtt_campaigns WHERE id=c),'account'),'serverTime',floor(extract(epoch from clock_timestamp())*1000),'records',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.updated_at DESC) FROM public.forge_vtt_resources r WHERE r.campaign_id=c AND forge_vtt_private.resource_readable(c,r.id)),'[]'::jsonb),'trash',CASE WHEN forge_vtt_private.dm_of(c) THEN coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.forge_vtt_resources r WHERE r.campaign_id=c AND r.deleted_at>now()-interval '30 days'),'[]'::jsonb) ELSE '[]'::jsonb END,'assets',CASE WHEN forge_vtt_private.dm_of(c) THEN coalesce((SELECT jsonb_agg(to_jsonb(a)-'object_path'-'sha256') FROM public.forge_vtt_assets a WHERE a.campaign_id=c),'[]'::jsonb) ELSE '[]'::jsonb END,'preferences',coalesce((SELECT data FROM public.forge_vtt_preferences WHERE user_id=auth.uid()),'{}'::jsonb),'campaignBytes',CASE WHEN forge_vtt_private.dm_of(c) THEN (SELECT coalesce(sum(byte_size),0) FROM public.forge_vtt_assets WHERE campaign_id=c) ELSE 0 END,'accountBytes',CASE WHEN forge_vtt_private.dm_of(c) THEN (SELECT coalesce(sum(a.byte_size),0) FROM public.forge_vtt_assets a JOIN public.forge_vtt_campaigns g ON g.id=a.campaign_id WHERE g.owner_id=(SELECT owner_id FROM public.forge_vtt_campaigns WHERE id=c)) ELSE 0 END)$$;
REVOKE ALL ON FUNCTION forge_vtt_private.resources_snapshot(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.forge_vtt_resources_api(p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE c uuid:=(p_payload->>'campaignId')::uuid;rid uuid:=(p_payload->>'id')::uuid;r public.forge_vtt_resources;data jsonb:=coalesce(p_payload->'payload','{}');k text;asset uuid;item jsonb;owner uuid;bytes bigint;reservation uuid;target uuid;path text;refs uuid[]:='{}';BEGIN
 IF NOT forge_vtt_private.regular_user(auth.uid()) OR NOT forge_vtt_private.member_of(c) OR octet_length(p_payload::text)>80000 THEN RAISE EXCEPTION 'Campaign unavailable' USING ERRCODE='42501';END IF;
 IF p_action='list' THEN RETURN forge_vtt_private.resources_snapshot(c);END IF;
 PERFORM forge_vtt_private.play_limit(c);IF p_action<>'preferences' AND forge_vtt_private.user_role(c,auth.uid())='spectator' THEN RAISE EXCEPTION 'Read-only access' USING ERRCODE='42501';END IF;
 IF p_action='preferences' THEN
 IF NOT forge_vtt_private.allow_keys(data,ARRAY['theme','scale','volume','muted','animations','sound','zoom','snap']) OR data->>'theme' IS NOT NULL AND data->>'theme' NOT IN ('dark','light') OR NOT forge_vtt_private.number_ok(data,'scale',.8,1.4) OR NOT forge_vtt_private.number_ok(data,'volume',0,1) OR NOT forge_vtt_private.number_ok(data,'zoom',.2,2) OR octet_length(data::text)>2048 THEN RAISE EXCEPTION 'Invalid preferences';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(data) v WHERE v.key IN ('muted','animations','sound','snap') AND jsonb_typeof(v.value)<>'boolean') THEN RAISE EXCEPTION 'Invalid preference switch';END IF;
 INSERT INTO public.forge_vtt_preferences(user_id,data) VALUES(auth.uid(),data) ON CONFLICT(user_id) DO UPDATE SET data=EXCLUDED.data;
 ELSIF p_action='journal' THEN
 SELECT * INTO r FROM public.forge_vtt_resources WHERE campaign_id=c AND id=rid FOR UPDATE;
 IF NOT FOUND OR r.deleted_at IS NOT NULL OR r.kind<>'journal' OR r.audience<>'all' OR r.payload->>'shared' IS DISTINCT FROM 'true' OR NOT forge_vtt_private.resource_readable(c,rid) OR length(coalesce(p_payload->>'text',''))>20000 OR r.revision IS DISTINCT FROM (p_payload->>'expected')::bigint THEN RAISE EXCEPTION 'Journal changed or editing unavailable' USING ERRCODE='40001';END IF;
 UPDATE public.forge_vtt_resources SET payload=jsonb_set(payload,'{text}',to_jsonb(coalesce(p_payload->>'text',''))),revision=revision+1,updated_at=now() WHERE campaign_id=c AND id=rid;
 ELSE
 IF NOT forge_vtt_private.dm_of(c) THEN RAISE EXCEPTION 'DM controls required' USING ERRCODE='42501';END IF;
 IF p_action='reserve' THEN
 bytes:=(p_payload->>'bytes')::bigint;IF bytes IS NULL OR bytes NOT BETWEEN 1 AND 20971520 OR p_payload->>'mime' NOT IN ('image/png','image/jpeg','image/webp','audio/mpeg','audio/ogg','audio/wav') THEN RAISE EXCEPTION 'Use PNG/JPEG/WebP or MP3/Ogg/WAV up to 20 MB';END IF;
 SELECT owner_id INTO owner FROM public.forge_vtt_campaigns WHERE id=c;PERFORM pg_advisory_xact_lock(hashtextextended('vtt-storage:'||least(owner::text,auth.uid()::text),0));PERFORM pg_advisory_xact_lock(hashtextextended('vtt-storage:'||greatest(owner::text,auth.uid()::text),0));
 IF (SELECT coalesce(sum(byte_size),0) FROM public.forge_vtt_assets WHERE uploaded_by=auth.uid())+(SELECT coalesce(sum(reserved_bytes),0) FROM forge_vtt_private.upload_reservations WHERE user_id=auth.uid() AND state IN ('reserved','uploaded') AND expires_at>now())+bytes>forge_vtt_private.storage_limit(auth.uid(),'account') THEN RAISE EXCEPTION 'Uploader storage quota reached';END IF;
 IF (SELECT coalesce(sum(byte_size),0) FROM public.forge_vtt_assets WHERE campaign_id=c)+(SELECT coalesce(sum(reserved_bytes),0) FROM forge_vtt_private.upload_reservations WHERE campaign_id=c AND state IN ('reserved','uploaded') AND expires_at>now())+bytes>forge_vtt_private.storage_limit(owner,'campaign') THEN RAISE EXCEPTION 'Campaign storage quota reached';END IF;
 IF (SELECT coalesce(sum(a.byte_size),0) FROM public.forge_vtt_assets a JOIN public.forge_vtt_campaigns g ON g.id=a.campaign_id WHERE g.owner_id=owner)+(SELECT coalesce(sum(q.reserved_bytes),0) FROM forge_vtt_private.upload_reservations q JOIN public.forge_vtt_campaigns g ON g.id=q.campaign_id WHERE g.owner_id=owner AND q.state IN ('reserved','uploaded') AND q.expires_at>now())+bytes>forge_vtt_private.storage_limit(owner,'account') THEN RAISE EXCEPTION 'Account storage quota reached';END IF;
 IF (SELECT count(*) FROM forge_vtt_private.upload_reservations WHERE user_id=auth.uid() AND state='reserved' AND expires_at>now())>=20 THEN RAISE EXCEPTION 'Too many pending uploads';END IF;
 reservation:=gen_random_uuid();target:=gen_random_uuid();path:=c::text||'/'||target::text||'/media';INSERT INTO forge_vtt_private.upload_reservations(id,campaign_id,user_id,asset_id,operation_id,reserved_bytes,object_path,expires_at) VALUES(reservation,c,auth.uid(),target,gen_random_uuid(),bytes,path,now()+interval '15 minutes');RETURN jsonb_build_object('reservationId',reservation,'assetId',target,'path',path);
 ELSIF p_action='asset' THEN
 IF length(coalesce(p_payload->>'label',''))>200 OR length(coalesce(p_payload->>'folder',''))>120 OR jsonb_typeof(coalesce(p_payload->'tags','[]'))<>'array' OR jsonb_array_length(coalesce(p_payload->'tags','[]'))>20 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(p_payload->'tags','[]')) tag WHERE length(tag)>40) THEN RAISE EXCEPTION 'Invalid asset metadata';END IF;
 UPDATE public.forge_vtt_assets SET label=coalesce(p_payload->>'label',''),folder=coalesce(p_payload->>'folder',''),tags=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'tags','[]'))) WHERE campaign_id=c AND id=rid;
 ELSIF p_action='asset_trash' THEN UPDATE public.forge_vtt_assets SET deleted_at=CASE WHEN coalesce((p_payload->>'restore')::boolean,false) THEN NULL ELSE now() END WHERE campaign_id=c AND id=rid AND (deleted_at IS NULL OR deleted_at>now()-interval '30 days');
 ELSIF p_action IN ('trash','restore') THEN
 SELECT * INTO r FROM public.forge_vtt_resources WHERE campaign_id=c AND id=rid FOR UPDATE;IF NOT FOUND OR r.revision IS DISTINCT FROM (p_payload->>'expected')::bigint THEN RAISE EXCEPTION 'Resource changed' USING ERRCODE='40001';END IF;
 IF p_action='restore' AND r.deleted_at<now()-interval '30 days' THEN RAISE EXCEPTION 'Restore period expired';END IF;
 UPDATE public.forge_vtt_resources SET deleted_at=CASE WHEN p_action='restore' THEN NULL ELSE now() END,revision=revision+1,updated_at=now() WHERE campaign_id=c AND id=rid;
 ELSIF p_action='save' THEN
 IF rid IS NULL OR p_payload->>'kind' NOT IN ('handout','journal','pin','audio','creature') OR length(coalesce(p_payload->>'title','')) NOT BETWEEN 1 AND 120 OR coalesce(p_payload->>'audience','dm') NOT IN ('dm','all','selected') OR jsonb_typeof(data)<>'object' OR octet_length(data::text)>65536 OR length(coalesce(data->>'text',''))>20000 OR jsonb_typeof(coalesce(p_payload->'recipients','[]'))<>'array' OR jsonb_array_length(coalesce(p_payload->'recipients','[]'))>30 THEN RAISE EXCEPTION 'Invalid resource';END IF;
 PERFORM 1 FROM public.forge_vtt_campaigns WHERE id=c FOR UPDATE;SELECT * INTO r FROM public.forge_vtt_resources WHERE campaign_id=c AND id=rid FOR UPDATE;
 IF coalesce(r.revision,0) IS DISTINCT FROM (p_payload->>'expected')::bigint OR r.kind IS NOT NULL AND r.kind<>p_payload->>'kind' THEN RAISE EXCEPTION 'Resource changed; reopen before saving' USING ERRCODE='40001';END IF;
 IF r.id IS NULL AND (SELECT count(*) FROM public.forge_vtt_resources WHERE campaign_id=c)>=500 THEN RAISE EXCEPTION 'Resource limit: 500';END IF;
 k:=p_payload->>'kind';IF k IS NULL THEN RAISE EXCEPTION 'Resource kind required';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(p_payload->'recipients','[]')) u WHERE NOT EXISTS(SELECT 1 FROM public.forge_vtt_campaign_members WHERE campaign_id=c AND user_id=u::uuid)) THEN RAISE EXCEPTION 'Recipient is not in this campaign';END IF;
 IF k='creature' THEN IF coalesce(p_payload->>'audience','dm')<>'dm' OR NOT forge_vtt_private.allow_keys(data,ARRAY['statBlock','imageAssetId']) OR NOT forge_vtt_private.creature_ok(data->'statBlock') OR data#>>'{statBlock,name}' IS DISTINCT FROM p_payload->>'title' THEN RAISE EXCEPTION 'Invalid private creature stat block';END IF;IF data->>'imageAssetId' IS NOT NULL THEN refs:=array_append(refs,(data->>'imageAssetId')::uuid);END IF;
 ELSIF k IN ('handout','journal') THEN IF NOT forge_vtt_private.allow_keys(data,ARRAY['text','imageAssetId','shared','tokenIds']) OR jsonb_typeof(coalesce(data->'tokenIds','[]')) IS DISTINCT FROM 'array' OR jsonb_array_length(coalesce(data->'tokenIds','[]'))>50 THEN RAISE EXCEPTION 'Invalid document';END IF;IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(data->'tokenIds','[]')) ti WHERE NOT EXISTS(SELECT 1 FROM public.forge_vtt_entities e WHERE e.campaign_id=c AND e.id=ti::uuid AND e.kind='token' AND e.deleted_at IS NULL)) THEN RAISE EXCEPTION 'Token link unavailable';END IF;IF data->>'imageAssetId' IS NOT NULL THEN refs:=array_append(refs,(data->>'imageAssetId')::uuid);END IF;
 ELSIF k='pin' THEN
 IF NOT forge_vtt_private.allow_keys(data,ARRAY['x','y','sceneId','documentId']) OR NOT data ?& ARRAY['x','y','sceneId'] OR NOT forge_vtt_private.number_ok(data,'x',0,128000) OR NOT forge_vtt_private.number_ok(data,'y',0,128000) OR NOT EXISTS(SELECT 1 FROM public.forge_vtt_scenes WHERE campaign_id=c AND id=(data->>'sceneId')::uuid AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Invalid map pin';END IF;
 IF data->>'documentId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.forge_vtt_resources WHERE campaign_id=c AND id=(data->>'documentId')::uuid AND kind IN ('handout','journal') AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Invalid pin document';END IF;
 ELSIF k='audio' THEN
 IF NOT data ?& ARRAY['tracks','status','position','volume','crossfade'] OR NOT forge_vtt_private.allow_keys(data,ARRAY['tracks','currentId','status','position','startedAt','loop','volume','crossfade','sfx']) OR jsonb_typeof(data->'tracks') IS DISTINCT FROM 'array' OR jsonb_array_length(data->'tracks')>50 OR coalesce(data->>'status','') NOT IN ('playing','paused','stopped') OR NOT forge_vtt_private.number_ok(data,'position',0,604800) OR NOT forge_vtt_private.number_ok(data,'volume',0,1) OR NOT forge_vtt_private.number_ok(data,'crossfade',0,10) THEN RAISE EXCEPTION 'Invalid playlist';END IF;
 IF (SELECT count(DISTINCT v->>'id') FROM jsonb_array_elements(data->'tracks') v)<>jsonb_array_length(data->'tracks') OR data->>'currentId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(data->'tracks') v WHERE v->>'id'=data->>'currentId') THEN RAISE EXCEPTION 'Invalid current track or duplicate tracks';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(data->'tracks') LOOP PERFORM (item->>'id')::uuid;IF NOT forge_vtt_private.allow_keys(item,ARRAY['id','title','url','assetId']) OR length(coalesce(item->>'title','')) NOT BETWEEN 1 AND 120 OR item->>'id' IS NULL OR item->>'url' IS NULL AND item->>'assetId' IS NULL OR item->>'url' IS NOT NULL AND (item->>'url'!~'^https://' OR length(item->>'url')>2000) THEN RAISE EXCEPTION 'Use HTTPS audio or a library file';END IF;IF item->>'assetId' IS NOT NULL THEN refs:=array_append(refs,(item->>'assetId')::uuid);END IF;END LOOP;
 IF data ? 'sfx' AND data->'sfx'<>'null'::jsonb THEN IF NOT forge_vtt_private.allow_keys(data->'sfx',ARRAY['trackId','nonce','at']) OR length(coalesce(data#>>'{sfx,nonce}','')) NOT BETWEEN 1 AND 100 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(data->'tracks') t WHERE t->>'id'=data#>>'{sfx,trackId}') THEN RAISE EXCEPTION 'Invalid sound effect';END IF;data:=jsonb_set(data,'{sfx,at}',to_jsonb(floor(extract(epoch from clock_timestamp())*1000)));END IF;
 data:=data||jsonb_build_object('startedAt',floor(extract(epoch from clock_timestamp())*1000));
 END IF;
 FOREACH asset IN ARRAY refs LOOP IF NOT EXISTS(SELECT 1 FROM public.forge_vtt_assets WHERE id=asset AND campaign_id=c AND deleted_at IS NULL AND (k='audio' AND mime_type LIKE 'audio/%' OR k IN ('handout','journal','creature') AND mime_type LIKE 'image/%')) THEN RAISE EXCEPTION 'Asset unavailable';END IF;END LOOP;
 INSERT INTO public.forge_vtt_resources(campaign_id,id,kind,title,audience,recipients,payload,revision) VALUES(c,rid,k,p_payload->>'title',coalesce(p_payload->>'audience','dm'),ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(p_payload->'recipients','[]'))),data,coalesce(r.revision,0)+1) ON CONFLICT(campaign_id,id) DO UPDATE SET title=EXCLUDED.title,audience=EXCLUDED.audience,recipients=EXCLUDED.recipients,payload=EXCLUDED.payload,revision=EXCLUDED.revision,updated_at=now(),deleted_at=NULL;
 DELETE FROM forge_vtt_private.resource_assets WHERE campaign_id=c AND resource_id=rid;FOREACH asset IN ARRAY refs LOOP INSERT INTO forge_vtt_private.resource_assets VALUES(c,rid,asset) ON CONFLICT DO NOTHING;END LOOP;
 ELSE RAISE EXCEPTION 'Unknown resource action';END IF;END IF;
 PERFORM forge_vtt_private.play_notify(c);RETURN forge_vtt_private.resources_snapshot(c);END$$;
REVOKE ALL ON FUNCTION public.forge_vtt_resources_api(text,jsonb) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.forge_vtt_resources_api(text,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION forge_vtt_private.api(action text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); c uuid; target uuid; r text; op uuid; result jsonb; current_owner uuid; role_name text; reservation uuid; bytes bigint; path text; count_rows integer;
BEGIN
 IF NOT forge_vtt_private.regular_user(u) THEN RAISE EXCEPTION 'Sign in with a regular account' USING ERRCODE='42501'; END IF;
 IF octet_length(p::text)>1100000 OR jsonb_typeof(p)<>'object' THEN RAISE EXCEPTION 'Invalid request'; END IF;
 IF action='list' THEN
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'role',forge_vtt_private.user_role(g.id,u),'ownerId',g.owner_id,'revision',g.revision,'updatedAt',g.updated_at) ORDER BY g.updated_at DESC) FROM public.forge_vtt_campaigns g WHERE forge_vtt_private.member_of(g.id)),'[]'::jsonb);
 END IF;
 c:=(p->>'campaignId')::uuid;
 IF action='create' THEN
  op:=(p->>'operationId')::uuid;
  IF c IS NULL OR op IS NULL OR length(p->>'name') NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid campaign'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('vtt-owner:'||u::text,0));
  IF EXISTS(SELECT 1 FROM public.forge_vtt_campaigns WHERE id=c AND owner_id=u) THEN RETURN forge_vtt_private.snapshot(c); END IF;
  IF (SELECT count(*) FROM public.forge_vtt_campaigns WHERE owner_id=u)>=30 THEN RAISE EXCEPTION 'Campaign limit reached'; END IF;
  INSERT INTO public.forge_vtt_campaigns(id,owner_id,name) VALUES(c,u,p->>'name');
  INSERT INTO public.forge_vtt_campaign_members(campaign_id,user_id,role,display_name) VALUES(c,u,'dm',left(coalesce(nullif(p->>'displayName',''),'Dungeon Master'),80));
  RETURN forge_vtt_private.snapshot(c);
 END IF;
 IF action='list_trash' THEN RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'deletedAt',deleted_at)) FROM public.forge_vtt_campaigns WHERE owner_id=u AND deleted_at>now()-interval '30 days'),'[]'); END IF;
 IF action='restore' THEN UPDATE public.forge_vtt_campaigns SET deleted_at=NULL,revision=revision+1 WHERE id=c AND owner_id=u AND deleted_at>now()-interval '30 days';IF NOT FOUND THEN RAISE EXCEPTION 'Campaign cannot be restored'; END IF;RETURN forge_vtt_private.snapshot(c);END IF;
 r:=forge_vtt_private.user_role(c,u);
 IF r IS NULL THEN RAISE EXCEPTION 'Campaign unavailable' USING ERRCODE='42501'; END IF;
 IF action='snapshot' THEN RETURN forge_vtt_private.snapshot(c); END IF;
 IF action='apply' THEN RETURN forge_vtt_private.apply_changes(c,(p->>'operationId')::uuid,p->'changes'); END IF;
 SELECT owner_id INTO current_owner FROM public.forge_vtt_campaigns WHERE id=c FOR UPDATE;
 IF action IN ('role','remove','transfer','delete','leave') THEN
  target:=(p->>'userId')::uuid;
  IF action='leave' THEN target:=u; END IF;
  IF action='delete' THEN
   IF current_owner<>u THEN RAISE EXCEPTION 'Only the owner can delete this campaign' USING ERRCODE='42501'; END IF;
   UPDATE public.forge_vtt_campaigns SET deleted_at=now(),revision=revision+1 WHERE id=c; RETURN '{"status":"deleted"}';
  END IF;
  IF target IS NULL OR NOT EXISTS(SELECT 1 FROM public.forge_vtt_campaign_members WHERE campaign_id=c AND user_id=target) THEN RAISE EXCEPTION 'Member unavailable'; END IF;
  SELECT role INTO role_name FROM public.forge_vtt_campaign_members WHERE campaign_id=c AND user_id=target;
  IF action='transfer' THEN
   IF current_owner<>u OR NOT forge_vtt_private.regular_user(target) THEN RAISE EXCEPTION 'Ownership transfer denied' USING ERRCODE='42501'; END IF;
   UPDATE public.forge_vtt_campaigns SET owner_id=target,revision=revision+1 WHERE id=c;
   UPDATE public.forge_vtt_campaign_members SET role='dm' WHERE campaign_id=c AND user_id=target;
  ELSIF action='role' THEN
   IF current_owner<>u OR target=current_owner OR p->>'role' NOT IN ('dm','player','spectator') THEN RAISE EXCEPTION 'Only the owner can change roles' USING ERRCODE='42501'; END IF;
   UPDATE public.forge_vtt_campaign_members SET role=p->>'role' WHERE campaign_id=c AND user_id=target;
   IF p->>'role'<>'player' THEN DELETE FROM public.forge_vtt_token_owners WHERE campaign_id=c AND user_id=target; END IF;
  ELSE
   IF target=current_owner OR (target<>u AND (r<>'dm' OR (role_name='dm' AND current_owner<>u))) THEN RAISE EXCEPTION 'Member removal denied' USING ERRCODE='42501'; END IF;
   DELETE FROM public.forge_vtt_campaign_members WHERE campaign_id=c AND user_id=target;
   IF target=u THEN RETURN '{"status":"left"}'; END IF;
  END IF;
  UPDATE public.forge_vtt_campaigns SET revision=revision+1,updated_at=now() WHERE id=c;
  RETURN forge_vtt_private.snapshot(c);
 END IF;
 IF action='reserve_upload' THEN
  IF r='spectator' THEN RAISE EXCEPTION 'Upload denied' USING ERRCODE='42501'; END IF;
  IF r<>'dm' AND NOT forge_vtt_private.controls_token(c,(p->>'tokenId')::uuid) THEN RAISE EXCEPTION 'Upload denied' USING ERRCODE='42501'; END IF;
  bytes:=(p->>'bytes')::bigint; op:=(p->>'operationId')::uuid;
  IF bytes IS NULL OR bytes NOT BETWEEN 1 AND 20971520 OR (r<>'dm' AND bytes>2097152) THEN RAISE EXCEPTION 'Image too large'; END IF;
  IF p->>'mime' NOT IN ('image/png','image/jpeg','image/webp') THEN RAISE EXCEPTION 'Unsupported image'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('vtt-storage:'||current_owner::text,0));
  IF (SELECT coalesce(sum(a.byte_size),0) FROM public.forge_vtt_assets a WHERE a.campaign_id=c)+(SELECT coalesce(sum(reserved_bytes),0) FROM forge_vtt_private.upload_reservations WHERE campaign_id=c AND state IN ('reserved','uploaded'))+bytes>forge_vtt_private.storage_limit(current_owner,'campaign') THEN RAISE EXCEPTION 'Campaign storage quota reached'; END IF;
  IF (SELECT coalesce(sum(a.byte_size),0) FROM public.forge_vtt_assets a JOIN public.forge_vtt_campaigns g ON g.id=a.campaign_id WHERE g.owner_id=current_owner)+(SELECT coalesce(sum(q.reserved_bytes),0) FROM forge_vtt_private.upload_reservations q JOIN public.forge_vtt_campaigns g ON g.id=q.campaign_id WHERE g.owner_id=current_owner AND q.state IN ('reserved','uploaded'))+bytes>forge_vtt_private.storage_limit(current_owner,'account') THEN RAISE EXCEPTION 'Account storage quota reached'; END IF;
  IF (SELECT coalesce(sum(byte_size),0) FROM public.forge_vtt_assets WHERE uploaded_by=u)+(SELECT coalesce(sum(reserved_bytes),0) FROM forge_vtt_private.upload_reservations WHERE user_id=u AND state IN ('reserved','uploaded') AND expires_at>now())+bytes>forge_vtt_private.storage_limit(u,'account') THEN RAISE EXCEPTION 'Uploader storage quota reached';END IF;
  IF (SELECT count(*) FROM forge_vtt_private.upload_reservations WHERE user_id=u AND state IN ('reserved','uploaded'))>=20 THEN RAISE EXCEPTION 'Too many pending uploads'; END IF;
  reservation:=gen_random_uuid(); target:=gen_random_uuid();path:=c::text||'/'||target::text||'/image';
  INSERT INTO forge_vtt_private.upload_reservations(id,campaign_id,user_id,asset_id,operation_id,reserved_bytes,object_path,expires_at) VALUES(reservation,c,u,target,op,bytes,path,now()+interval '15 minutes');
  RETURN jsonb_build_object('reservationId',reservation,'assetId',target,'path',path);
 END IF;
 RAISE EXCEPTION 'Unknown VTT action';
END $$;
COMMIT;
