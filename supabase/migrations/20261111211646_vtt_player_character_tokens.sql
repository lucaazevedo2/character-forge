BEGIN;
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
    IF NOT forge_vtt_private.allow_keys(d,ARRAY['name','width','height','grid','snap','showGrid','published','mapAssetId']) THEN RAISE EXCEPTION 'Invalid scene fields'; END IF;
    IF NOT forge_vtt_private.number_ok(d,'width',16,128000) OR NOT forge_vtt_private.number_ok(d,'height',16,128000) OR NOT forge_vtt_private.number_ok(d,'grid',16,256) THEN RAISE EXCEPTION 'Invalid scene dimensions'; END IF;
    IF d ? 'name' AND (jsonb_typeof(d->'name')<>'string' OR length(d->>'name') NOT BETWEEN 1 AND 120) THEN RAISE EXCEPTION 'Invalid scene name'; END IF;
    FOREACH kind IN ARRAY ARRAY['snap','showGrid','published'] LOOP IF d ? kind AND jsonb_typeof(d->kind)<>'boolean' THEN RAISE EXCEPTION 'Invalid scene setting'; END IF; END LOOP;
    asset:=(d->>'mapAssetId')::uuid;
    IF asset IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.forge_vtt_assets WHERE id=asset AND campaign_id=c AND deleted_at IS NULL AND mime_type LIKE 'image/%') THEN RAISE EXCEPTION 'Invalid map asset'; END IF;
    IF actual=0 AND (SELECT count(*) FROM public.forge_vtt_scenes WHERE campaign_id=c AND deleted_at IS NULL)>=100 THEN RAISE EXCEPTION 'Scene limit reached'; END IF;
    IF actual=0 THEN INSERT INTO public.forge_vtt_scenes(id,campaign_id,name) VALUES(target,c,coalesce(d->>'name','New scene')); END IF;
    UPDATE public.forge_vtt_scenes SET name=coalesce(d->>'name',name),
     width_cells=coalesce((d->>'width')::numeric,width_cells*cell_px)/coalesce((d->>'grid')::integer,cell_px),
     height_cells=coalesce((d->>'height')::numeric,height_cells*cell_px)/coalesce((d->>'grid')::integer,cell_px),
     cell_px=coalesce((d->>'grid')::integer,cell_px),snap=coalesce((d->>'snap')::boolean,snap),show_grid=coalesce((d->>'showGrid')::boolean,show_grid),published=coalesce((d->>'published')::boolean,published),
     player_map_asset_id=CASE WHEN d ? 'mapAssetId' THEN asset ELSE player_map_asset_id END,deleted_at=NULL,revision=actual+1,updated_at=now() WHERE id=target AND campaign_id=c;
    DELETE FROM public.forge_vtt_asset_uses WHERE campaign_id=c AND scene_id=target;
    INSERT INTO public.forge_vtt_asset_uses(campaign_id,asset_id,scene_id,audience) SELECT c,player_map_asset_id,target,'campaign' FROM public.forge_vtt_scenes WHERE id=target AND player_map_asset_id IS NOT NULL;
   END IF;
  ELSIF kind='token' THEN
   SELECT * INTO e FROM public.forge_vtt_entities WHERE id=target AND campaign_id=c FOR UPDATE;
   actual:=CASE WHEN FOUND THEN e.revision ELSE 0 END;
   IF actual<>expected OR (actual>0 AND e.deleted_at IS NOT NULL AND (ch->>'op'<>'upsert' OR r<>'dm')) THEN RAISE EXCEPTION 'Token changed; review local edits' USING ERRCODE='40001'; END IF;
   SELECT * INTO t FROM public.forge_vtt_tokens WHERE id=target AND campaign_id=c;
   IF r<>'dm' AND actual>0 AND (ch->>'op'='delete' OR t.locked OR NOT forge_vtt_private.controls_token(c,target)) THEN RAISE EXCEPTION 'Token permission denied' USING ERRCODE='42501'; END IF;
   IF ch->>'op'='delete' THEN UPDATE public.forge_vtt_entities SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE id=target AND campaign_id=c;
   ELSE
    IF NOT forge_vtt_private.allow_keys(d,CASE WHEN r='dm' OR actual=0 THEN ARRAY['sceneId','name','x','y','size','rotation','color','hp','maxHp','imageAssetId','ownerIds','hidden','locked','zIndex'] ELSE ARRAY['name','x','y','size','rotation','color','hp','maxHp','imageAssetId'] END) THEN RAISE EXCEPTION 'Protected token fields' USING ERRCODE='42501'; END IF;
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
    UPDATE public.forge_vtt_tokens SET name=coalesce(d->>'name',name),x=coalesce((d->>'x')::numeric,x),y=coalesce((d->>'y')::numeric,y),width_cells=coalesce((d->>'size')::numeric,width_cells),height_cells=coalesce((d->>'size')::numeric,height_cells),rotation=coalesce((d->>'rotation')::numeric,rotation),border_color=coalesce(d->>'color',border_color),locked=coalesce((d->>'locked')::boolean,locked),z_index=coalesce((d->>'zIndex')::integer,z_index),portrait_asset_id=CASE WHEN d ? 'imageAssetId' THEN asset ELSE portrait_asset_id END WHERE id=target AND campaign_id=c RETURNING * INTO t;
    IF t.x+t.width_cells*s.cell_px>s.width_cells*s.cell_px OR t.y+t.height_cells*s.cell_px>s.height_cells*s.cell_px THEN RAISE EXCEPTION 'Token outside map'; END IF;
    SELECT data INTO stats FROM public.forge_vtt_private_data WHERE campaign_id=c AND entity_id=target AND scope='controller';
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
  ELSE RAISE EXCEPTION 'Unknown command type'; END IF;
 END LOOP;
 UPDATE public.forge_vtt_campaigns SET revision=revision+1,updated_at=now() WHERE id=c RETURNING revision INTO rev;
 INSERT INTO public.forge_vtt_commands(campaign_id,actor_id,operation_id,campaign_revision,command_type,forward_patch,inverse_patch) VALUES(c,u,op,rev,'batch',changes,before_state);
 RETURN jsonb_build_object('status','saved','game',forge_vtt_private.snapshot(c));
END $$;

COMMIT;
