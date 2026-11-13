BEGIN;
ALTER TABLE public.forge_vtt_scenes ADD COLUMN settings jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(settings)='object' AND octet_length(settings::text)<=32768);
CREATE TABLE public.forge_vtt_token_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND octet_length(data::text)<=2097152),updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.forge_vtt_token_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forge_vtt_token_templates FROM anon,authenticated;GRANT SELECT,INSERT,UPDATE,DELETE ON public.forge_vtt_token_templates TO authenticated;
CREATE INDEX forge_vtt_templates_owner ON public.forge_vtt_token_templates(owner_id,updated_at DESC);
CREATE FUNCTION forge_vtt_private.template_owner(o uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT o=auth.uid() AND forge_vtt_private.regular_user(auth.uid()) $$;
REVOKE ALL ON FUNCTION forge_vtt_private.template_owner(uuid) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION forge_vtt_private.template_owner(uuid) TO authenticated;
CREATE POLICY vtt_template_owner ON public.forge_vtt_token_templates TO authenticated USING(forge_vtt_private.template_owner(owner_id)) WITH CHECK(forge_vtt_private.template_owner(owner_id));
CREATE FUNCTION forge_vtt_private.limit_templates() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN PERFORM pg_advisory_xact_lock(hashtextextended('vtt-template:'||NEW.owner_id::text,0));IF (SELECT count(*) FROM public.forge_vtt_token_templates WHERE owner_id=NEW.owner_id)>=50 THEN RAISE EXCEPTION 'Template library limit is 50';END IF;RETURN NEW;END $$;
REVOKE ALL ON FUNCTION forge_vtt_private.limit_templates() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER vtt_template_limit BEFORE INSERT ON public.forge_vtt_token_templates FOR EACH ROW EXECUTE FUNCTION forge_vtt_private.limit_templates();
CREATE FUNCTION forge_vtt_private.phase3_settings_ok(d jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text;v jsonb;BEGIN
 IF NOT forge_vtt_private.allow_keys(d,ARRAY['gridType','offsetX','offsetY','color','opacity','thickness','distance','units','diagonal','halfSnap','background','lighting','ambient','weather','folder','layers','playerDrawing','movementTracker','sortOrder']) THEN RETURN false;END IF;
 IF d?'gridType' AND d->>'gridType' NOT IN ('square','hex-flat','hex-pointy','none') OR d?'diagonal' AND d->>'diagonal' NOT IN ('5e','alternating','euclidean') OR d?'weather' AND d->>'weather' NOT IN ('none','rain','snow','fog','embers') OR d?'lighting' AND d->>'lighting' NOT IN ('bright','dim','dark') THEN RETURN false;END IF;
 IF NOT forge_vtt_private.number_ok(d,'offsetX',-128000,128000) OR NOT forge_vtt_private.number_ok(d,'offsetY',-128000,128000) OR NOT forge_vtt_private.number_ok(d,'opacity',0,1) OR NOT forge_vtt_private.number_ok(d,'thickness',.1,10) OR NOT forge_vtt_private.number_ok(d,'distance',.1,1000) OR NOT forge_vtt_private.number_ok(d,'ambient',0,1) OR NOT forge_vtt_private.number_ok(d,'sortOrder',-100000,100000) THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['color','background'] LOOP IF d?k AND (d->>k)!~'^#[0-9a-fA-F]{6}$' THEN RETURN false;END IF;END LOOP;
 FOREACH k IN ARRAY ARRAY['halfSnap','playerDrawing','movementTracker'] LOOP IF d?k AND jsonb_typeof(d->k)<>'boolean' THEN RETURN false;END IF;END LOOP;
 IF length(coalesce(d->>'units','ft'))>20 OR length(coalesce(d->>'folder',''))>120 THEN RETURN false;END IF;
 IF d?'layers' THEN IF NOT forge_vtt_private.allow_keys(d->'layers',ARRAY['map','objects','tokens','gm','drawing']) THEN RETURN false;END IF;FOR k,v IN SELECT * FROM jsonb_each(d->'layers') LOOP IF NOT forge_vtt_private.allow_keys(v,ARRAY['visible','locked']) OR v?'visible' AND jsonb_typeof(v->'visible')<>'boolean' OR v?'locked' AND jsonb_typeof(v->'locked')<>'boolean' THEN RETURN false;END IF;END LOOP;END IF;
 RETURN true;END $$;
CREATE FUNCTION forge_vtt_private.phase3_meta_ok(d jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ BEGIN
 IF NOT forge_vtt_private.allow_keys(d,ARRAY['layer','height','shape','conditions','elevation','group','initiativeRoll','inCombat']) OR octet_length(d::text)>8192 THEN RETURN false;END IF;
 IF d?'layer' AND d->>'layer' NOT IN ('objects','tokens','gm') OR d?'shape' AND d->>'shape' NOT IN ('circle','square') OR NOT forge_vtt_private.number_ok(d,'height',.25,20) OR NOT forge_vtt_private.number_ok(d,'elevation',-100000,100000) OR NOT forge_vtt_private.number_ok(d,'initiativeRoll',-1000,1000) THEN RETURN false;END IF;
 IF d?'conditions' AND (jsonb_typeof(d->'conditions')<>'array' OR jsonb_array_length(d->'conditions')>64 OR EXISTS(SELECT 1 FROM jsonb_array_elements(d->'conditions') x WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}')>60)) THEN RETURN false;END IF;IF length(coalesce(d->>'group',''))>80 OR d?'inCombat' AND jsonb_typeof(d->'inCombat')<>'boolean' THEN RETURN false;END IF;RETURN true;END $$;
CREATE FUNCTION forge_vtt_private.phase3_details_ok(d jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ DECLARE b jsonb;BEGIN
 IF NOT forge_vtt_private.allow_keys(d,ARRAY['ac','speed','initiative','tempHp','notes','stats','bars','hpVisible','characterId']) OR octet_length(d::text)>32768 OR length(coalesce(d->>'notes',''))>12000 OR length(coalesce(d->>'characterId',''))>128 THEN RETURN false;END IF;
 IF NOT forge_vtt_private.number_ok(d,'ac',0,1000) OR NOT forge_vtt_private.number_ok(d,'speed',0,10000) OR NOT forge_vtt_private.number_ok(d,'initiative',-1000,1000) OR NOT forge_vtt_private.number_ok(d,'tempHp',0,100000) OR d?'hpVisible' AND jsonb_typeof(d->'hpVisible')<>'boolean' THEN RETURN false;END IF;
 IF d?'stats' AND (jsonb_typeof(d->'stats')<>'object' OR octet_length((d->'stats')::text)>8192) THEN RETURN false;END IF;
 IF d?'bars' THEN IF jsonb_typeof(d->'bars')<>'array' OR jsonb_array_length(d->'bars')>2 THEN RETURN false;END IF;FOR b IN SELECT value FROM jsonb_array_elements(d->'bars') LOOP IF NOT forge_vtt_private.allow_keys(b,ARRAY['name','value','max','color','showPlayers']) OR length(coalesce(b->>'name',''))>40 OR NOT forge_vtt_private.number_ok(b,'value',0,100000) OR NOT forge_vtt_private.number_ok(b,'max',1,100000) OR b?'showPlayers' AND jsonb_typeof(b->'showPlayers')<>'boolean' OR coalesce(b->>'color','#b4a7ff')!~'^#[0-9a-fA-F]{6}$' THEN RETURN false;END IF;END LOOP;END IF;RETURN true;END $$;
REVOKE ALL ON FUNCTION forge_vtt_private.phase3_settings_ok(jsonb),forge_vtt_private.phase3_meta_ok(jsonb),forge_vtt_private.phase3_details_ok(jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION forge_vtt_private.entity_readable(c uuid,e uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT forge_vtt_private.member_of(c) AND EXISTS(
  SELECT 1 FROM public.forge_vtt_entities x WHERE x.campaign_id=c AND x.id=e
   AND x.deleted_at IS NULL AND (x.scene_id IS NULL OR forge_vtt_private.scene_readable(c,x.scene_id))
   AND (forge_vtt_private.dm_of(c) OR (x.visibility='campaign' AND x.layer<>'gm' AND coalesce((SELECT (sc.settings#>>ARRAY['layers',x.layer,'visible'])::boolean FROM public.forge_vtt_scenes sc WHERE sc.id=x.scene_id),true))));
$$;
CREATE OR REPLACE FUNCTION forge_vtt_private.snapshot(c uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.forge_vtt_campaigns; role_name text; result jsonb; sc jsonb; tok jsonb; new_scenes jsonb:='[]';new_tokens jsonb; settings jsonb; secret jsonb; pub jsonb; stats jsonb; can_control boolean;
BEGIN
 role_name:=forge_vtt_private.user_role(c,auth.uid());
 IF role_name IS NULL THEN RAISE EXCEPTION 'Campaign unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM public.forge_vtt_campaigns WHERE id=c;
 SELECT jsonb_build_object('id',g.id,'name',g.name,'activeSceneId',g.active_scene_id,
  '_cloud',jsonb_build_object('id',g.id,'role',role_name,'ownerId',g.owner_id,'revision',g.revision),
  'members',coalesce((SELECT jsonb_agg(jsonb_build_object('userId',m.user_id,'name',m.display_name,'role',m.role) ORDER BY m.joined_at) FROM public.forge_vtt_campaign_members m WHERE m.campaign_id=c),'[]'::jsonb),
  'scenes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'width',s.width_cells*s.cell_px,'height',s.height_cells*s.cell_px,'grid',s.cell_px,
   'showGrid',s.show_grid,'snap',s.snap,'published',s.published,'_revision',s.revision,'_mapAssetId',s.player_map_asset_id,'map','',
   'tokens',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'x',t.x,'y',t.y,'size',t.width_cells,'rotation',t.rotation,'color',t.border_color,
    'image','','_imageAssetId',t.portrait_asset_id,'hp',CASE WHEN role_name='dm' OR forge_vtt_private.controls_token(c,t.id) THEN (p.data->>'hp')::integer ELSE NULL END,
    'maxHp',CASE WHEN role_name='dm' OR forge_vtt_private.controls_token(c,t.id) THEN (p.data->>'maxHp')::integer ELSE NULL END,
    'hidden',e.visibility='dm','locked',t.locked,'_revision',e.revision,'_canEdit',role_name='dm' OR (NOT t.locked AND forge_vtt_private.controls_token(c,t.id)),
    'ownerIds',coalesce((SELECT jsonb_agg(o.user_id) FROM public.forge_vtt_token_owners o WHERE o.campaign_id=c AND o.token_id=t.id),'[]'::jsonb)) ORDER BY t.z_index,t.id)
    FROM public.forge_vtt_tokens t JOIN public.forge_vtt_entities e ON e.campaign_id=t.campaign_id AND e.id=t.id
    LEFT JOIN public.forge_vtt_private_data p ON p.campaign_id=t.campaign_id AND p.entity_id=t.id AND p.scope='controller'
    WHERE t.campaign_id=c AND e.scene_id=s.id AND forge_vtt_private.entity_readable(c,t.id)),'[]'::jsonb)) ORDER BY s.sort_order,s.id)
   FROM public.forge_vtt_scenes s WHERE s.campaign_id=c AND forge_vtt_private.scene_readable(c,s.id)),'[]'::jsonb)) INTO result;

 FOR sc IN SELECT value FROM jsonb_array_elements(result->'scenes') LOOP
  SELECT s.settings INTO settings FROM public.forge_vtt_scenes s WHERE s.id=(sc->>'id')::uuid;
  SELECT p.data INTO secret FROM public.forge_vtt_private_data p WHERE p.campaign_id=c AND p.scene_id=(sc->>'id')::uuid AND p.entity_id IS NULL AND p.scope='dm' LIMIT 1;
  sc:=sc||jsonb_build_object('settings',settings,'drawings',coalesce((SELECT jsonb_agg(e.public_data||jsonb_build_object('id',e.id,'hidden',e.visibility='dm','ownerId',e.created_by,'_revision',e.revision)) FROM public.forge_vtt_entities e WHERE e.campaign_id=c AND e.scene_id=(sc->>'id')::uuid AND e.kind='drawing' AND forge_vtt_private.entity_readable(c,e.id)),'[]'::jsonb));
  IF role_name='dm' THEN sc:=sc||jsonb_build_object('notes',coalesce(secret->>'notes',''),'_dmMapAssetId',secret->'dmMapAssetId','dmMap','');ELSIF NOT coalesce((settings#>>'{layers,map,visible}')::boolean,true) THEN sc:=sc||jsonb_build_object('_mapAssetId',NULL);END IF;
  new_tokens:='[]';FOR tok IN SELECT value FROM jsonb_array_elements(sc->'tokens') LOOP
   SELECT e.public_data||jsonb_build_object('layer',e.layer,'height',t.height_cells,'shape',t.shape),p.data INTO pub,stats FROM public.forge_vtt_entities e JOIN public.forge_vtt_tokens t ON t.id=e.id LEFT JOIN public.forge_vtt_private_data p ON p.entity_id=e.id AND p.scope='controller' WHERE e.id=(tok->>'id')::uuid;
   can_control:=role_name='dm' OR forge_vtt_private.controls_token(c,(tok->>'id')::uuid);
   tok:=tok||jsonb_build_object('meta',coalesce(pub,'{}'));
   IF can_control THEN tok:=tok||jsonb_build_object('details',coalesce(stats->'details','{}'));
   ELSE tok:=tok||jsonb_build_object('details',jsonb_build_object('hpVisible',coalesce((stats->'details'->>'hpVisible')::boolean,false),'bars',coalesce((SELECT jsonb_agg(b) FROM jsonb_array_elements(coalesce(stats->'details'->'bars','[]')) b WHERE coalesce((b->>'showPlayers')::boolean,false)),'[]')));
    IF coalesce((stats->'details'->>'hpVisible')::boolean,false) THEN tok:=tok||jsonb_build_object('hp',stats->'hp','maxHp',stats->'maxHp');END IF;
   END IF;new_tokens:=new_tokens||jsonb_build_array(tok);
  END LOOP;sc:=sc||jsonb_build_object('tokens',new_tokens);new_scenes:=new_scenes||jsonb_build_array(sc);
 END LOOP;result:=result||jsonb_build_object('scenes',new_scenes);
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION forge_vtt_private.apply_changes(c uuid,op uuid,changes jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); r text; g public.forge_vtt_campaigns; ch jsonb; d jsonb; kind text; target uuid; expected bigint; actual bigint;
 s public.forge_vtt_scenes; e public.forge_vtt_entities; t public.forge_vtt_tokens; stats jsonb; before_state jsonb; member_id uuid; asset uuid; n integer; rev bigint; z integer;
BEGIN
 r:=forge_vtt_private.user_role(c,u); IF r IS NULL OR r='spectator' THEN RAISE EXCEPTION 'Editing not permitted' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM public.forge_vtt_campaigns WHERE id=c FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.forge_vtt_commands WHERE campaign_id=c AND operation_id=op) THEN RETURN jsonb_build_object('status','saved','game',forge_vtt_private.snapshot(c)); END IF;
 IF jsonb_typeof(changes)<>'array' OR jsonb_array_length(changes) NOT BETWEEN 1 AND 500 OR octet_length(changes::text)>1048576 THEN RAISE EXCEPTION 'Invalid change batch'; END IF;
 before_state:=forge_vtt_private.snapshot(c);
 FOR ch IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF NOT forge_vtt_private.allow_keys(ch,ARRAY['kind','id','op','expected','data']) THEN RAISE EXCEPTION 'Invalid command'; END IF;
  kind:=ch->>'kind'; target:=(ch->>'id')::uuid; expected:=(ch->>'expected')::bigint; d:=coalesce(ch->'data','{}'::jsonb);
  IF expected IS NULL OR expected<0 OR target IS NULL OR ch->>'op' NOT IN ('upsert','delete') OR jsonb_typeof(d)<>'object' THEN RAISE EXCEPTION 'Invalid command'; END IF;
  IF kind='campaign' THEN
   IF r<>'dm' OR target<>c OR ch->>'op'<>'upsert' OR NOT forge_vtt_private.allow_keys(d,ARRAY['name','activeSceneId']) THEN RAISE EXCEPTION 'Campaign permission denied' USING ERRCODE='42501'; END IF;
   IF expected<>g.revision THEN RAISE EXCEPTION 'Campaign changed; review local edits' USING ERRCODE='40001'; END IF;
   IF d ? 'name' THEN IF jsonb_typeof(d->'name')<>'string' OR length(d->>'name') NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid campaign name'; END IF; UPDATE public.forge_vtt_campaigns SET name=d->>'name' WHERE id=c; END IF;
   IF d ? 'activeSceneId' THEN asset:=(d->>'activeSceneId')::uuid; IF asset IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.forge_vtt_scenes WHERE id=asset AND campaign_id=c AND deleted_at IS NULL AND published) THEN RAISE EXCEPTION 'Publish the scene before activating it'; END IF; UPDATE public.forge_vtt_campaigns SET active_scene_id=asset WHERE id=c; END IF;
  ELSIF kind='scene' THEN
   IF r<>'dm' THEN RAISE EXCEPTION 'DM permission required' USING ERRCODE='42501'; END IF;
   SELECT * INTO s FROM public.forge_vtt_scenes WHERE id=target AND campaign_id=c FOR UPDATE;
   actual:=CASE WHEN FOUND THEN s.revision ELSE 0 END;
   IF actual<>expected OR (actual>0 AND s.deleted_at IS NOT NULL AND ch->>'op'<>'upsert') THEN RAISE EXCEPTION 'Scene changed; review local edits' USING ERRCODE='40001'; END IF;
   IF ch->>'op'='delete' THEN
    IF g.active_scene_id=target THEN UPDATE public.forge_vtt_campaigns SET active_scene_id=NULL WHERE id=c; END IF;
    UPDATE public.forge_vtt_scenes SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE id=target AND campaign_id=c;
   ELSE
    IF NOT forge_vtt_private.allow_keys(d,ARRAY['name','width','height','grid','snap','showGrid','published','mapAssetId','dmMapAssetId','notes','settings']) THEN RAISE EXCEPTION 'Invalid scene fields'; END IF;
    IF NOT forge_vtt_private.number_ok(d,'width',16,128000) OR NOT forge_vtt_private.number_ok(d,'height',16,128000) OR NOT forge_vtt_private.number_ok(d,'grid',16,256) THEN RAISE EXCEPTION 'Invalid scene dimensions'; END IF;
    IF d ? 'name' AND (jsonb_typeof(d->'name')<>'string' OR length(d->>'name') NOT BETWEEN 1 AND 120) THEN RAISE EXCEPTION 'Invalid scene name'; END IF;
    FOREACH kind IN ARRAY ARRAY['snap','showGrid','published'] LOOP IF d ? kind AND jsonb_typeof(d->kind)<>'boolean' THEN RAISE EXCEPTION 'Invalid scene setting'; END IF; END LOOP;
    IF d?'settings' AND NOT forge_vtt_private.phase3_settings_ok(d->'settings') OR length(coalesce(d->>'notes',''))>12000 THEN RAISE EXCEPTION 'Invalid scene settings';END IF;
    asset:=(d->>'mapAssetId')::uuid;
    IF asset IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.forge_vtt_assets WHERE id=asset AND campaign_id=c AND deleted_at IS NULL AND mime_type LIKE 'image/%') THEN RAISE EXCEPTION 'Invalid map asset'; END IF;
    IF actual=0 AND (SELECT count(*) FROM public.forge_vtt_scenes WHERE campaign_id=c AND deleted_at IS NULL)>=100 THEN RAISE EXCEPTION 'Scene limit reached'; END IF;
    IF actual=0 THEN INSERT INTO public.forge_vtt_scenes(id,campaign_id,name) VALUES(target,c,coalesce(d->>'name','New scene')); END IF;
    UPDATE public.forge_vtt_scenes SET name=coalesce(d->>'name',name),
     width_cells=coalesce((d->>'width')::numeric,width_cells*cell_px)/coalesce((d->>'grid')::integer,cell_px),
     height_cells=coalesce((d->>'height')::numeric,height_cells*cell_px)/coalesce((d->>'grid')::integer,cell_px),
     cell_px=coalesce((d->>'grid')::integer,cell_px),snap=coalesce((d->>'snap')::boolean,snap),show_grid=coalesce((d->>'showGrid')::boolean,show_grid),published=coalesce((d->>'published')::boolean,published),
     player_map_asset_id=CASE WHEN d ? 'mapAssetId' THEN asset ELSE player_map_asset_id END,deleted_at=NULL,revision=actual+1,updated_at=now() WHERE id=target AND campaign_id=c;

    IF d?'settings' THEN UPDATE public.forge_vtt_scenes SET settings=d->'settings',sort_order=coalesce((d->'settings'->>'sortOrder')::integer,sort_order) WHERE id=target;END IF;
    IF d?'notes' OR d?'dmMapAssetId' THEN
     asset:=(d->>'dmMapAssetId')::uuid;IF asset IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.forge_vtt_assets WHERE id=asset AND campaign_id=c AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Invalid DM map';END IF;
     SELECT data INTO stats FROM public.forge_vtt_private_data WHERE campaign_id=c AND scene_id=target AND entity_id IS NULL AND scope='dm' LIMIT 1;
     stats:=coalesce(stats,'{}');IF d?'notes' THEN stats:=stats||jsonb_build_object('notes',d->'notes');END IF;IF d?'dmMapAssetId' THEN stats:=stats||jsonb_build_object('dmMapAssetId',d->'dmMapAssetId');END IF;
     DELETE FROM public.forge_vtt_private_data WHERE campaign_id=c AND scene_id=target AND entity_id IS NULL AND scope='dm';INSERT INTO public.forge_vtt_private_data(campaign_id,scene_id,scope,data) VALUES(c,target,'dm',stats);
    END IF;
    DELETE FROM public.forge_vtt_asset_uses WHERE campaign_id=c AND scene_id=target;
    INSERT INTO public.forge_vtt_asset_uses(campaign_id,asset_id,scene_id,audience) SELECT c,player_map_asset_id,target,'campaign' FROM public.forge_vtt_scenes WHERE id=target AND player_map_asset_id IS NOT NULL;
    INSERT INTO public.forge_vtt_asset_uses(campaign_id,asset_id,scene_id,audience) SELECT c,(data->>'dmMapAssetId')::uuid,target,'dm' FROM public.forge_vtt_private_data WHERE campaign_id=c AND scene_id=target AND entity_id IS NULL AND data->>'dmMapAssetId' IS NOT NULL;
   END IF;
  ELSIF kind='token' THEN
   SELECT * INTO e FROM public.forge_vtt_entities WHERE id=target AND campaign_id=c FOR UPDATE;
   actual:=CASE WHEN FOUND THEN e.revision ELSE 0 END;
   IF actual>0 AND e.kind<>'token' THEN RAISE EXCEPTION 'Entity type mismatch';END IF;
   IF actual<>expected OR (actual>0 AND e.deleted_at IS NOT NULL AND (ch->>'op'<>'upsert' OR r<>'dm')) THEN RAISE EXCEPTION 'Token changed; review local edits' USING ERRCODE='40001'; END IF;
   SELECT * INTO t FROM public.forge_vtt_tokens WHERE id=target AND campaign_id=c;
   IF r<>'dm' AND actual>0 AND (ch->>'op'='delete' OR t.locked OR NOT forge_vtt_private.controls_token(c,target)) THEN RAISE EXCEPTION 'Token permission denied' USING ERRCODE='42501'; END IF;
   IF ch->>'op'='delete' THEN UPDATE public.forge_vtt_entities SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE id=target AND campaign_id=c;
   ELSE
    IF NOT forge_vtt_private.allow_keys(d,CASE WHEN r='dm' OR actual=0 THEN ARRAY['sceneId','name','x','y','size','rotation','color','hp','maxHp','imageAssetId','ownerIds','hidden','locked','zIndex','meta','details'] ELSE ARRAY['name','x','y','size','rotation','color','hp','maxHp','imageAssetId','meta','details'] END) THEN RAISE EXCEPTION 'Protected token fields' USING ERRCODE='42501'; END IF;
    IF d?'meta' AND NOT forge_vtt_private.phase3_meta_ok(d->'meta') OR d?'details' AND NOT forge_vtt_private.phase3_details_ok(d->'details') THEN RAISE EXCEPTION 'Invalid token properties';END IF;
    IF r<>'dm' AND d?'meta' AND (d->'meta'->>'layer' IS DISTINCT FROM 'tokens' OR coalesce(d->'meta'->>'group','')<>coalesce(e.public_data->>'group','')) THEN RAISE EXCEPTION 'Protected token layer' USING ERRCODE='42501';END IF;
    IF NOT forge_vtt_private.number_ok(d,'x',0,128000) OR NOT forge_vtt_private.number_ok(d,'y',0,128000) OR NOT forge_vtt_private.number_ok(d,'size',.25,20) OR NOT forge_vtt_private.number_ok(d,'rotation',0,359.999) OR NOT forge_vtt_private.number_ok(d,'hp',0,100000) OR NOT forge_vtt_private.number_ok(d,'maxHp',1,100000) OR NOT forge_vtt_private.number_ok(d,'zIndex',-1000000,1000000) THEN RAISE EXCEPTION 'Invalid token values'; END IF;
    IF d ? 'name' AND (jsonb_typeof(d->'name')<>'string' OR length(d->>'name') NOT BETWEEN 1 AND 120) THEN RAISE EXCEPTION 'Invalid token name'; END IF;
    IF d ? 'color' AND (d->>'color') !~ '^#[0-9a-fA-F]{6}$' THEN RAISE EXCEPTION 'Invalid token color'; END IF;
    FOREACH kind IN ARRAY ARRAY['hidden','locked'] LOOP IF d ? kind AND jsonb_typeof(d->kind)<>'boolean' THEN RAISE EXCEPTION 'Invalid token flag'; END IF; END LOOP;
    SELECT * INTO s FROM public.forge_vtt_scenes WHERE campaign_id=c AND id=coalesce((d->>'sceneId')::uuid,e.scene_id) AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid target scene'; END IF;
    -- A player may add a visible token for themself to the active published scene.
    -- Existing tokens retain their original protected-field rules.
    IF r<>'dm' AND actual=0 THEN
     IF r<>'player' OR ch->>'op'<>'upsert' OR NOT forge_vtt_private.scene_readable(c,s.id)
       OR (d->'ownerIds') IS DISTINCT FROM jsonb_build_array(u::text)
       OR coalesce((d->>'hidden')::boolean,false) OR coalesce((d->>'locked')::boolean,false)
       OR coalesce((d->>'zIndex')::integer,0)<>0 OR (d->>'imageAssetId') IS NOT NULL
     THEN RAISE EXCEPTION 'Create only your own character token on the active scene' USING ERRCODE='42501'; END IF;
     IF (SELECT count(*) FROM public.forge_vtt_entities owned WHERE owned.campaign_id=c AND owned.scene_id=s.id AND owned.created_by=u AND owned.deleted_at IS NULL)>=10 THEN RAISE EXCEPTION 'Player token limit reached for this scene'; END IF;
    END IF;

    asset:=(d->>'imageAssetId')::uuid;
    IF asset IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.forge_vtt_assets WHERE id=asset AND campaign_id=c AND deleted_at IS NULL AND mime_type LIKE 'image/%' AND (r='dm' OR uploaded_by=u OR forge_vtt_private.asset_readable(c,asset))) THEN RAISE EXCEPTION 'Invalid portrait asset'; END IF;
    IF actual=0 AND (SELECT count(*) FROM public.forge_vtt_entities counted WHERE counted.campaign_id=c AND counted.kind='token' AND counted.deleted_at IS NULL)>=5000 THEN RAISE EXCEPTION 'Token limit reached'; END IF;
    IF actual=0 THEN
     INSERT INTO public.forge_vtt_entities(id,campaign_id,scene_id,kind,layer,visibility,created_by) VALUES(target,c,s.id,'token','tokens','campaign',u);
     INSERT INTO public.forge_vtt_tokens(id,campaign_id,name) VALUES(target,c,coalesce(d->>'name','New token'));
     INSERT INTO public.forge_vtt_private_data(campaign_id,entity_id,scope,data) VALUES(c,target,'controller','{"hp":10,"maxHp":10}');
    END IF;
    UPDATE public.forge_vtt_entities SET deleted_at=NULL,scene_id=s.id,visibility=CASE WHEN d ? 'hidden' THEN CASE WHEN (d->>'hidden')::boolean THEN 'dm' ELSE 'campaign' END ELSE visibility END,revision=actual+1,updated_at=now(),field_versions=field_versions||jsonb_build_object('last_operation',op) WHERE id=target AND campaign_id=c;
    UPDATE public.forge_vtt_tokens SET name=coalesce(d->>'name',name),x=coalesce((d->>'x')::numeric,x),y=coalesce((d->>'y')::numeric,y),width_cells=coalesce((d->>'size')::numeric,width_cells),height_cells=coalesce((d->'meta'->>'height')::numeric,(d->>'size')::numeric,height_cells),shape=coalesce(d->'meta'->>'shape',shape),rotation=coalesce((d->>'rotation')::numeric,rotation),border_color=coalesce(d->>'color',border_color),locked=coalesce((d->>'locked')::boolean,locked),z_index=coalesce((d->>'zIndex')::integer,z_index),portrait_asset_id=CASE WHEN d ? 'imageAssetId' THEN asset ELSE portrait_asset_id END WHERE id=target AND campaign_id=c RETURNING * INTO t;
    IF r<>'dm' AND coalesce((s.settings#>>'{layers,tokens,locked}')::boolean,false) THEN RAISE EXCEPTION 'Token layer locked' USING ERRCODE='42501';END IF;
    IF d?'meta' THEN UPDATE public.forge_vtt_entities SET public_data=d->'meta',layer=coalesce(d->'meta'->>'layer',layer),visibility=CASE WHEN d->'meta'->>'layer'='gm' THEN 'dm' ELSE visibility END WHERE id=target;END IF;
    IF t.x+t.width_cells*s.cell_px>s.width_cells*s.cell_px OR t.y+t.height_cells*s.cell_px>s.height_cells*s.cell_px THEN RAISE EXCEPTION 'Token outside map'; END IF;
    SELECT data INTO stats FROM public.forge_vtt_private_data WHERE campaign_id=c AND entity_id=target AND scope='controller';
    IF d?'details' THEN stats:=stats||jsonb_build_object('details',d->'details');END IF;
    stats:=stats||jsonb_strip_nulls(jsonb_build_object('hp',d->'hp','maxHp',d->'maxHp'));
    IF (stats->>'hp')::numeric>(stats->>'maxHp')::numeric THEN RAISE EXCEPTION 'HP exceeds maximum'; END IF;
    UPDATE public.forge_vtt_private_data SET data=stats,revision=revision+1,updated_at=now() WHERE campaign_id=c AND entity_id=target AND scope='controller';
    IF d ? 'ownerIds' THEN
     IF jsonb_typeof(d->'ownerIds')<>'array' OR jsonb_array_length(d->'ownerIds')>50 THEN RAISE EXCEPTION 'Invalid token owners'; END IF;
     DELETE FROM public.forge_vtt_token_owners WHERE campaign_id=c AND token_id=target;
     FOR member_id IN SELECT value::uuid FROM jsonb_array_elements_text(d->'ownerIds') LOOP
      IF NOT EXISTS(SELECT 1 FROM public.forge_vtt_campaign_members WHERE campaign_id=c AND user_id=member_id AND role='player') THEN RAISE EXCEPTION 'Assign only campaign players'; END IF;
      INSERT INTO public.forge_vtt_token_owners VALUES(c,target,member_id) ON CONFLICT DO NOTHING;
     END LOOP;
    END IF;
    DELETE FROM public.forge_vtt_asset_uses WHERE campaign_id=c AND entity_id=target;
    INSERT INTO public.forge_vtt_asset_uses(campaign_id,asset_id,entity_id,audience) SELECT c,portrait_asset_id,target,'campaign' FROM public.forge_vtt_tokens WHERE id=target AND portrait_asset_id IS NOT NULL;
   END IF;
  ELSIF kind='drawing' THEN
   SELECT * INTO e FROM public.forge_vtt_entities WHERE id=target AND campaign_id=c FOR UPDATE;actual:=CASE WHEN FOUND THEN e.revision ELSE 0 END;
   IF actual>0 AND e.kind<>'drawing' THEN RAISE EXCEPTION 'Entity type mismatch';END IF;
   IF actual<>expected THEN RAISE EXCEPTION 'Drawing changed' USING ERRCODE='40001';END IF;
   SELECT * INTO s FROM public.forge_vtt_scenes WHERE campaign_id=c AND id=coalesce((d->>'sceneId')::uuid,e.scene_id) AND deleted_at IS NULL;
   IF NOT FOUND OR NOT forge_vtt_private.scene_readable(c,s.id) OR (r<>'dm' AND (NOT coalesce((s.settings->>'playerDrawing')::boolean,false) OR (actual>0 AND e.created_by<>u) OR coalesce((d->>'hidden')::boolean,false))) THEN RAISE EXCEPTION 'Drawing permission denied' USING ERRCODE='42501';END IF;
   IF coalesce((s.settings#>>'{layers,drawing,locked}')::boolean,false) THEN RAISE EXCEPTION 'Drawing layer locked';END IF;
   IF ch->>'op'='delete' THEN UPDATE public.forge_vtt_entities SET deleted_at=now(),revision=revision+1 WHERE id=target AND campaign_id=c;
   ELSE
    IF NOT forge_vtt_private.allow_keys(d,ARRAY['sceneId','hidden','drawing']) OR NOT forge_vtt_private.allow_keys(d->'drawing',ARRAY['type','x','y','w','h','points','text','style','template']) OR octet_length((d->'drawing')::text)>65536 OR d->'drawing'->>'type' NOT IN ('pen','line','rect','ellipse','polygon','text','arrow','template') OR length(coalesce(d->'drawing'->>'text',''))>2000 THEN RAISE EXCEPTION 'Invalid drawing';END IF;
    IF NOT forge_vtt_private.number_ok(d->'drawing','x',0,128000) OR NOT forge_vtt_private.number_ok(d->'drawing','y',0,128000) OR NOT forge_vtt_private.number_ok(d->'drawing','w',-128000,128000) OR NOT forge_vtt_private.number_ok(d->'drawing','h',-128000,128000) THEN RAISE EXCEPTION 'Invalid drawing dimensions';END IF;
    IF d->'drawing'?'points' AND (jsonb_typeof(d->'drawing'->'points')<>'array' OR jsonb_array_length(d->'drawing'->'points')>2000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(d->'drawing'->'points') pt WHERE NOT forge_vtt_private.allow_keys(pt,ARRAY['x','y']) OR NOT (pt ?& ARRAY['x','y']) OR NOT forge_vtt_private.number_ok(pt,'x',0,128000) OR NOT forge_vtt_private.number_ok(pt,'y',0,128000))) THEN RAISE EXCEPTION 'Invalid drawing points';END IF;
    IF NOT forge_vtt_private.allow_keys(coalesce(d->'drawing'->'style','{}'),ARRAY['stroke','fill','width','opacity']) OR coalesce(d->'drawing'->'style'->>'stroke','#b4a7ff')!~'^#[0-9a-fA-F]{6}$' OR coalesce(d->'drawing'->'style'->>'fill','none')!~'^(none|#[0-9a-fA-F]{6})$' OR NOT forge_vtt_private.number_ok(coalesce(d->'drawing'->'style','{}'),'width',.1,30) OR NOT forge_vtt_private.number_ok(coalesce(d->'drawing'->'style','{}'),'opacity',0,1) THEN RAISE EXCEPTION 'Invalid drawing style';END IF;
    IF d->'drawing'?'template' AND (NOT forge_vtt_private.allow_keys(d->'drawing'->'template',ARRAY['kind','width']) OR d->'drawing'->'template'->>'kind' NOT IN ('ruler','cone','circle','square','beam') OR NOT forge_vtt_private.number_ok(d->'drawing'->'template','width',1,128000)) THEN RAISE EXCEPTION 'Invalid drawing template';END IF;
    IF actual=0 AND (SELECT count(*) FROM public.forge_vtt_entities WHERE forge_vtt_entities.campaign_id=c AND forge_vtt_entities.kind='drawing' AND deleted_at IS NULL)>=2000 THEN RAISE EXCEPTION 'Drawing limit reached';END IF;
    IF actual=0 THEN INSERT INTO public.forge_vtt_entities(id,campaign_id,scene_id,kind,layer,visibility,created_by,public_data) VALUES(target,c,s.id,'drawing','drawing',CASE WHEN coalesce((d->>'hidden')::boolean,false) THEN 'dm' ELSE 'campaign' END,u,d->'drawing');
    ELSE UPDATE public.forge_vtt_entities SET public_data=coalesce(d->'drawing',public_data),visibility=CASE WHEN d?'hidden' THEN CASE WHEN (d->>'hidden')::boolean THEN 'dm' ELSE 'campaign' END ELSE visibility END,deleted_at=NULL,revision=revision+1,updated_at=now() WHERE id=target;END IF;
   END IF;
  ELSE RAISE EXCEPTION 'Unknown command type'; END IF;
 END LOOP;
 UPDATE public.forge_vtt_campaigns SET revision=revision+1,updated_at=now() WHERE id=c RETURNING revision INTO rev;
 INSERT INTO public.forge_vtt_commands(campaign_id,actor_id,operation_id,campaign_revision,command_type,forward_patch,inverse_patch) VALUES(c,u,op,rev,'batch',changes,before_state);
 RETURN jsonb_build_object('status','saved','game',forge_vtt_private.snapshot(c));
END $$;

CREATE OR REPLACE FUNCTION forge_vtt_private.live_rpc(action text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); c uuid:=(p->>'campaignId')::uuid; v_client uuid:=(p->>'clientId')::uuid; scene uuid:=(p->>'sceneId')::uuid;
 role_name text; key uuid; topic text; stamp numeric:=floor(extract(epoch from clock_timestamp())*1000); second bigint:=floor(extract(epoch from clock_timestamp())); count_hits integer;
 display_name text; color text; body jsonb; shared jsonb; roster jsonb; all_tokens jsonb:='[]'; public_tokens jsonb:='[]'; item jsonb; token public.forge_vtt_tokens; entity public.forge_vtt_entities; board public.forge_vtt_scenes; shared_scene boolean:=false; hide_cursor boolean:=false; cursor_data jsonb:='null'; prev_ping timestamptz;
BEGIN
 IF NOT forge_vtt_private.regular_user(u) OR c IS NULL OR v_client IS NULL OR octet_length(p::text)>32768 THEN RAISE EXCEPTION 'Invalid live request' USING ERRCODE='42501'; END IF;
 -- Hold the room key while authorizing/sending so removal cannot race a new-topic broadcast.
 SELECT room_key INTO key FROM forge_vtt_private.live_rooms WHERE campaign_id=c FOR SHARE;
 IF key IS NULL OR NOT forge_vtt_private.member_of(c) THEN RAISE EXCEPTION 'Campaign unavailable' USING ERRCODE='42501'; END IF;
 role_name:=forge_vtt_private.user_role(c,u);topic:='vtt-room:'||c::text||':'||key::text;
 SELECT left(m.display_name,60) INTO display_name FROM public.forge_vtt_campaign_members m WHERE m.campaign_id=c AND m.user_id=u;
 display_name:=coalesce(nullif(display_name,''),'Adventurer');
 color:=(ARRAY['#c5a3ff','#79c9ff','#80d8aa','#ffbb75','#ff92b1','#e7d87a'])[(get_byte(decode(md5(u::text),'hex'),0)%6)+1];
 INSERT INTO forge_vtt_private.live_rate AS rate(campaign_id,user_id,second) VALUES(c,u,second)
 ON CONFLICT(campaign_id,user_id) DO UPDATE SET hits=CASE WHEN rate.second=EXCLUDED.second THEN rate.hits+1 ELSE 1 END,second=EXCLUDED.second RETURNING hits,last_ping INTO count_hits,prev_ping;
 IF count_hits>40 THEN RETURN jsonb_build_object('limited',true); END IF;
 IF action='hello' THEN
  DELETE FROM forge_vtt_private.live_peers WHERE campaign_id=c AND seen_at<now()-interval '90 seconds';
  IF NOT EXISTS(SELECT 1 FROM forge_vtt_private.live_peers WHERE campaign_id=c AND user_id=u AND client_id=v_client) AND (SELECT count(*) FROM forge_vtt_private.live_peers WHERE campaign_id=c AND user_id=u)>=8 THEN RAISE EXCEPTION 'Too many live tabs'; END IF;
  INSERT INTO forge_vtt_private.live_peers(campaign_id,user_id,client_id,away) VALUES(c,u,v_client,coalesce((p->>'away')::boolean,false)) ON CONFLICT(campaign_id,user_id,client_id) DO UPDATE SET seen_at=now(),away=EXCLUDED.away;
  SELECT coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'name',left(m.display_name,60),'role',m.role,'seenAt',floor(extract(epoch from peers.seen_at)*1000),'away',peers.away)), '[]'::jsonb) INTO roster FROM (SELECT user_id,max(seen_at) seen_at,bool_and(away) away FROM forge_vtt_private.live_peers WHERE campaign_id=c AND seen_at>now()-interval '45 seconds' GROUP BY user_id) peers JOIN public.forge_vtt_campaign_members m ON m.campaign_id=c AND m.user_id=peers.user_id;
  body:=jsonb_build_object('kind','presence','userId',u,'clientId',v_client,'name',display_name,'role',role_name,'color',color,'at',stamp,'away',coalesce((p->>'away')::boolean,false));
  PERFORM realtime.send(body,'room',topic||':players',true);PERFORM realtime.send(body,'room',topic||':dm',true);
  RETURN jsonb_build_object('topic',topic||CASE WHEN role_name='dm' THEN ':dm' ELSE ':players' END,'peers',roster,'serverTime',stamp,'userId',u,'color',color);
 ELSIF action='bye' THEN
  DELETE FROM forge_vtt_private.live_peers WHERE campaign_id=c AND user_id=u AND live_peers.client_id=v_client;
  PERFORM realtime.send(jsonb_build_object('kind','leave','userId',u,'clientId',v_client,'at',stamp),'room',topic||':players',true);PERFORM realtime.send(jsonb_build_object('kind','leave','userId',u,'clientId',v_client,'at',stamp),'room',topic||':dm',true);RETURN '{}'::jsonb;
 END IF;
 SELECT * INTO board FROM public.forge_vtt_scenes WHERE campaign_id=c AND id=scene AND deleted_at IS NULL;
 IF NOT FOUND OR NOT forge_vtt_private.scene_readable(c,scene) THEN RAISE EXCEPTION 'Scene unavailable' USING ERRCODE='42501'; END IF;
 shared_scene:=board.published AND EXISTS(SELECT 1 FROM public.forge_vtt_campaigns WHERE id=c AND active_scene_id=scene);
 body:=jsonb_build_object('kind',action,'userId',u,'clientId',v_client,'sceneId',scene,'name',display_name,'color',color,'at',stamp,'seq',p->'seq');
 IF action='pointer' THEN
  IF NOT (p ? 'seq') OR NOT forge_vtt_private.number_ok(p,'seq',0,2147483647) THEN RAISE EXCEPTION 'Invalid sequence'; END IF;
  IF p->'cursor' IS NOT NULL AND p->'cursor'<>'null'::jsonb THEN
   IF NOT forge_vtt_private.number_ok(p->'cursor','x',0,board.width_cells*board.cell_px) OR NOT forge_vtt_private.number_ok(p->'cursor','y',0,board.height_cells*board.cell_px) OR NOT (p->'cursor' ? 'x' AND p->'cursor' ? 'y') THEN RAISE EXCEPTION 'Invalid cursor'; END IF;
   cursor_data:=jsonb_build_object('x',p->'cursor'->'x','y',p->'cursor'->'y');
  END IF;
  IF p ? 'tokens' THEN
   IF jsonb_typeof(p->'tokens')<>'array' OR jsonb_array_length(p->'tokens')>50 THEN RAISE EXCEPTION 'Invalid movement preview'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(p->'tokens') LOOP
    SELECT * INTO token FROM public.forge_vtt_tokens WHERE campaign_id=c AND id=(item->>'id')::uuid;
    SELECT * INTO entity FROM public.forge_vtt_entities WHERE campaign_id=c AND id=token.id AND scene_id=scene AND deleted_at IS NULL;
    IF NOT FOUND OR (role_name<>'dm' AND (token.locked OR NOT forge_vtt_private.controls_token(c,token.id))) THEN RAISE EXCEPTION 'Token preview denied' USING ERRCODE='42501'; END IF;
    IF NOT (item ?& ARRAY['x','y','size','rotation']) OR NOT forge_vtt_private.number_ok(item,'x',0,128000) OR NOT forge_vtt_private.number_ok(item,'y',0,128000) OR NOT forge_vtt_private.number_ok(item,'size',.25,20) OR NOT forge_vtt_private.number_ok(item,'height',.25,20) OR NOT forge_vtt_private.number_ok(item,'rotation',0,359.999) THEN RAISE EXCEPTION 'Invalid movement'; END IF;
    IF (item->>'x')::numeric+(item->>'size')::numeric*board.cell_px>board.width_cells*board.cell_px OR (item->>'y')::numeric+coalesce((item->>'height')::numeric,(item->>'size')::numeric)*board.cell_px>board.height_cells*board.cell_px THEN RAISE EXCEPTION 'Preview outside map'; END IF;
    item:=jsonb_build_object('id',token.id,'x',item->'x','y',item->'y','size',item->'size','height',coalesce(item->'height',item->'size'),'rotation',item->'rotation','revision',(SELECT revision FROM public.forge_vtt_entities WHERE id=token.id));
    all_tokens:=all_tokens||jsonb_build_array(item);
    IF entity.visibility='campaign' AND entity.layer<>'gm' AND coalesce((board.settings#>>ARRAY['layers',entity.layer,'visible'])::boolean,true) THEN public_tokens:=public_tokens||jsonb_build_array(item); ELSE hide_cursor:=true; END IF;
   END LOOP;
  END IF;
  body:=body||jsonb_build_object('cursor',cursor_data,'tokens',all_tokens,'ended',coalesce((p->>'ended')::boolean,false));
  shared:=body||jsonb_build_object('tokens',public_tokens,'cursor',CASE WHEN hide_cursor THEN 'null'::jsonb ELSE cursor_data END);
 ELSIF action='measure' THEN
  IF NOT (p ?& ARRAY['x','y','x2','y2']) OR NOT forge_vtt_private.number_ok(p,'x',0,128000) OR NOT forge_vtt_private.number_ok(p,'y',0,128000) OR NOT forge_vtt_private.number_ok(p,'x2',0,128000) OR NOT forge_vtt_private.number_ok(p,'y2',0,128000) OR NOT forge_vtt_private.number_ok(p,'width',1,128000) OR p->>'shape' NOT IN ('ruler','cone','circle','square','beam') THEN RAISE EXCEPTION 'Invalid measure';END IF;
  body:=body||jsonb_build_object('x',p->'x','y',p->'y','x2',p->'x2','y2',p->'y2','shape',p->'shape','width',p->'width');shared:=body;
 ELSIF action='ping' THEN
  IF NOT (p ?& ARRAY['x','y']) OR NOT forge_vtt_private.number_ok(p,'x',0,board.width_cells*board.cell_px) OR NOT forge_vtt_private.number_ok(p,'y',0,board.height_cells*board.cell_px) THEN RAISE EXCEPTION 'Invalid ping'; END IF;
  IF prev_ping>clock_timestamp()-interval '500 milliseconds' THEN RETURN jsonb_build_object('limited',true); END IF;
  UPDATE forge_vtt_private.live_rate SET last_ping=clock_timestamp() WHERE campaign_id=c AND user_id=u;
  body:=body||jsonb_build_object('x',p->'x','y',p->'y');shared:=body;
 ELSIF action='view' THEN
  IF role_name<>'dm' OR NOT shared_scene THEN RAISE EXCEPTION 'Only the DM can pull the active published view' USING ERRCODE='42501'; END IF;
  IF NOT (p ?& ARRAY['x','y','zoom']) OR NOT forge_vtt_private.number_ok(p,'x',0,board.width_cells*board.cell_px) OR NOT forge_vtt_private.number_ok(p,'y',0,board.height_cells*board.cell_px) OR NOT forge_vtt_private.number_ok(p,'zoom',.2,2) THEN RAISE EXCEPTION 'Invalid camera'; END IF;
  body:=body||jsonb_build_object('x',p->'x','y',p->'y','zoom',p->'zoom');shared:=body;
 ELSE RAISE EXCEPTION 'Unknown live action'; END IF;
 PERFORM realtime.send(body,'room',topic||':dm',true);
 IF shared_scene AND NOT (action='pointer' AND hide_cursor AND jsonb_array_length(public_tokens)=0) THEN PERFORM realtime.send(shared,'room',topic||':players',true); END IF;
 RETURN jsonb_build_object('sent',true);
END $$;
CREATE OR REPLACE FUNCTION forge_vtt_private.asset_readable(c uuid,a uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT forge_vtt_private.member_of(c) AND EXISTS(
  SELECT 1 FROM public.forge_vtt_assets x WHERE x.campaign_id=c AND x.id=a AND x.deleted_at IS NULL
   AND (forge_vtt_private.dm_of(c) OR EXISTS(
    SELECT 1 FROM public.forge_vtt_asset_uses u WHERE u.campaign_id=c AND u.asset_id=a
     AND u.audience='campaign' AND
      ((u.scene_id IS NOT NULL AND forge_vtt_private.scene_readable(c,u.scene_id) AND coalesce((SELECT (sc.settings#>>'{layers,map,visible}')::boolean FROM public.forge_vtt_scenes sc WHERE sc.id=u.scene_id),true)) OR
       (u.entity_id IS NOT NULL AND forge_vtt_private.entity_readable(c,u.entity_id))))));
$$;

COMMIT;
