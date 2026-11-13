BEGIN;
-- Wall metadata and full fog history are DM-only. Players receive a checked snapshot DTO.
CREATE TABLE public.forge_vtt_environments(scene_id uuid PRIMARY KEY REFERENCES public.forge_vtt_scenes(id) ON DELETE CASCADE,campaign_id uuid NOT NULL REFERENCES public.forge_vtt_campaigns(id) ON DELETE CASCADE,revision bigint NOT NULL DEFAULT 1,data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND octet_length(data::text)<=1048576));
CREATE INDEX forge_vtt_environments_campaign ON public.forge_vtt_environments(campaign_id);
ALTER TABLE public.forge_vtt_environments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forge_vtt_environments FROM anon,authenticated;GRANT SELECT ON public.forge_vtt_environments TO authenticated;
CREATE POLICY vtt_environment_dm ON public.forge_vtt_environments TO authenticated USING(forge_vtt_private.dm_of(campaign_id));
CREATE TABLE public.forge_vtt_exploration(scene_id uuid NOT NULL REFERENCES public.forge_vtt_scenes(id) ON DELETE CASCADE,campaign_id uuid NOT NULL REFERENCES public.forge_vtt_campaigns(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,seen jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(seen)='array' AND jsonb_array_length(seen)<=16384),PRIMARY KEY(scene_id,user_id));
CREATE INDEX forge_vtt_exploration_campaign ON public.forge_vtt_exploration(campaign_id);
ALTER TABLE public.forge_vtt_exploration ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forge_vtt_exploration FROM anon,authenticated;GRANT SELECT ON public.forge_vtt_exploration TO authenticated;
CREATE POLICY vtt_exploration_self ON public.forge_vtt_exploration TO authenticated USING(user_id=(select auth.uid()) AND forge_vtt_private.member_of(campaign_id));
CREATE FUNCTION forge_vtt_private.p4_points(a jsonb,n integer) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ BEGIN
 RETURN jsonb_typeof(a)='array' AND jsonb_array_length(a) BETWEEN n AND 128 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(a) p WHERE NOT forge_vtt_private.allow_keys(p,ARRAY['x','y']) OR NOT(p ?& ARRAY['x','y']) OR NOT forge_vtt_private.number_ok(p,'x',0,128000) OR NOT forge_vtt_private.number_ok(p,'y',0,128000));EXCEPTION WHEN OTHERS THEN RETURN false;END $$;
CREATE FUNCTION forge_vtt_private.p4_light(d jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ BEGIN
 RETURN forge_vtt_private.allow_keys(d,ARRAY['bright','dim','color','intensity','animation']) AND d ?& ARRAY['bright','dim'] AND forge_vtt_private.number_ok(d,'bright',0,1000) AND forge_vtt_private.number_ok(d,'dim',0,1000) AND (d->>'dim')::numeric>=(d->>'bright')::numeric AND forge_vtt_private.number_ok(d,'intensity',0,1) AND coalesce(d->>'color','#fff0c2')~'^#[0-9a-fA-F]{6}$' AND coalesce(d->>'animation','none') IN ('none','flicker','pulse');EXCEPTION WHEN OTHERS THEN RETURN false;END $$;
CREATE FUNCTION forge_vtt_private.p4_vision(d jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ BEGIN
 RETURN forge_vtt_private.allow_keys(d,ARRAY['enabled','range','darkvision','blindsight','truesight']) AND (NOT d?'enabled' OR jsonb_typeof(d->'enabled')='boolean') AND forge_vtt_private.number_ok(d,'range',0,1000) AND forge_vtt_private.number_ok(d,'darkvision',0,1000) AND forge_vtt_private.number_ok(d,'blindsight',0,1000) AND forge_vtt_private.number_ok(d,'truesight',0,1000);EXCEPTION WHEN OTHERS THEN RETURN false;END $$;
ALTER FUNCTION forge_vtt_private.phase3_meta_ok(jsonb) RENAME TO p3_meta_ok;
CREATE FUNCTION forge_vtt_private.phase3_meta_ok(d jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT forge_vtt_private.p3_meta_ok(d-'light') AND (NOT d?'light' OR forge_vtt_private.p4_light(d->'light'))$$;
ALTER FUNCTION forge_vtt_private.phase3_details_ok(jsonb) RENAME TO p3_details_ok;
CREATE FUNCTION forge_vtt_private.phase3_details_ok(d jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT forge_vtt_private.p3_details_ok(d-'vision') AND (NOT d?'vision' OR forge_vtt_private.p4_vision(d->'vision'))$$;
CREATE FUNCTION forge_vtt_private.p4_environment(d jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$ DECLARE v jsonb;k text;BEGIN
 IF NOT forge_vtt_private.allow_keys(d,ARRAY['config','fogOps','walls','lights']) OR NOT d ?& ARRAY['config','fogOps','walls','lights'] OR octet_length(d::text)>1048576 THEN RETURN false;END IF;
 v:=d->'config';IF NOT forge_vtt_private.allow_keys(v,ARRAY['mode','covered','hint','dmOpacity','memory','collision','memoryEpoch']) OR v->>'mode' NOT IN ('off','manual','dynamic') OR NOT v?'mode' OR NOT forge_vtt_private.number_ok(v,'dmOpacity',0,1) OR length(coalesce(v->>'memoryEpoch',''))>100 THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['covered','hint','memory','collision'] LOOP IF v?k AND jsonb_typeof(v->k)<>'boolean' THEN RETURN false;END IF;END LOOP;
 IF jsonb_typeof(d->'walls')<>'array' OR jsonb_array_length(d->'walls')>500 OR jsonb_typeof(d->'lights')<>'array' OR jsonb_array_length(d->'lights')>100 OR jsonb_typeof(d->'fogOps')<>'array' OR jsonb_array_length(d->'fogOps')>500 THEN RETURN false;END IF;
 IF (SELECT coalesce(sum(jsonb_array_length(w->'points')),0) FROM jsonb_array_elements(d->'walls') w)>2000 THEN RETURN false;END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(d->'walls') LOOP
 IF NOT forge_vtt_private.allow_keys(v,ARRAY['id','points','closed','type','state','blockMovement','blockSight','blockLight']) OR NOT v ?& ARRAY['id','type','points'] OR jsonb_typeof(v->'id')<>'string' OR length(v->>'id') NOT BETWEEN 1 AND 100 OR v->>'type' NOT IN ('wall','door','secret','window','oneWay','invisible') OR NOT forge_vtt_private.p4_points(v->'points',2) OR coalesce(v->>'state','closed') NOT IN ('open','closed','locked') THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['closed','blockMovement','blockSight','blockLight'] LOOP IF v?k AND jsonb_typeof(v->k)<>'boolean' THEN RETURN false;END IF;END LOOP;END LOOP;
 FOR v IN SELECT value FROM jsonb_array_elements(d->'lights') LOOP IF NOT forge_vtt_private.p4_light(v-ARRAY['id','x','y','hidden']) OR NOT forge_vtt_private.number_ok(v,'x',0,128000) OR NOT forge_vtt_private.number_ok(v,'y',0,128000) OR NOT v ?& ARRAY['x','y','id'] OR length(v->>'id') NOT BETWEEN 1 AND 100 OR v?'hidden' AND jsonb_typeof(v->'hidden')<>'boolean' THEN RETURN false;END IF;END LOOP;
 FOR v IN SELECT value FROM jsonb_array_elements(d->'fogOps') LOOP IF NOT forge_vtt_private.allow_keys(v,ARRAY['type','reveal','x','y','w','h','points','radius']) OR v->>'type' NOT IN ('rect','brush','polygon') OR NOT v ?& ARRAY['type','reveal'] OR jsonb_typeof(v->'reveal')<>'boolean' THEN RETURN false;END IF;
 IF v->>'type'='rect' THEN IF NOT v ?& ARRAY['x','y','w','h'] OR NOT forge_vtt_private.number_ok(v,'x',0,128000) OR NOT forge_vtt_private.number_ok(v,'y',0,128000) OR NOT forge_vtt_private.number_ok(v,'w',0,128000) OR NOT forge_vtt_private.number_ok(v,'h',0,128000) THEN RETURN false;END IF;
 ELSE IF NOT forge_vtt_private.p4_points(v->'points',CASE WHEN v->>'type'='polygon' THEN 3 ELSE 1 END) OR v->>'type'='brush' AND (NOT v?'radius' OR NOT forge_vtt_private.number_ok(v,'radius',1,4096)) THEN RETURN false;END IF;END IF;END LOOP;
 RETURN true;EXCEPTION WHEN OTHERS THEN RETURN false;END $$;
CREATE FUNCTION forge_vtt_private.p4_cross(ax numeric,ay numeric,bx numeric,by_ numeric,px numeric,py numeric) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT (bx-ax)*(py-ay)-(by_-ay)*(px-ax)$$;
CREATE FUNCTION forge_vtt_private.p4_hit(ax numeric,ay numeric,bx numeric,by_ numeric,cx numeric,cy numeric,dx numeric,dy numeric) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$DECLARE den numeric; t numeric;v numeric;BEGIN den:=(bx-ax)*(dy-cy)-(by_-ay)*(dx-cx);IF abs(den)<.000000001 THEN RETURN false;END IF;t:=((cx-ax)*(dy-cy)-(cy-ay)*(dx-cx))/den;v:=((cx-ax)*(by_-ay)-(cy-ay)*(bx-ax))/den;RETURN t>.0000001 AND t<.9999999 AND v>=-.0000001 AND v<=1.0000001;END $$;
CREATE FUNCTION forge_vtt_private.p4_clear(env jsonb,ax numeric,ay numeric,bx numeric,by_ numeric,kind text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$DECLARE w jsonb;a jsonb;b jsonb;i integer;n integer;blocks boolean;BEGIN
 FOR w IN SELECT value FROM jsonb_array_elements(coalesce(env->'walls','[]')) LOOP
 IF w->>'type' IN ('door','secret') AND w->>'state'='open' THEN CONTINUE;END IF;
 blocks:=coalesce((w->>CASE kind WHEN 'movement' THEN 'blockMovement' WHEN 'light' THEN 'blockLight' ELSE 'blockSight' END)::boolean,kind='movement' OR w->>'type' NOT IN ('window','invisible'));IF NOT blocks THEN CONTINUE;END IF;
 n:=jsonb_array_length(w->'points');FOR i IN 1..(n-1+CASE WHEN coalesce((w->>'closed')::boolean,false) THEN 1 ELSE 0 END) LOOP a:=w->'points'->(i-1);b:=w->'points'->(i%n);
 IF w->>'type'='oneWay' AND forge_vtt_private.p4_cross((a->>'x')::numeric,(a->>'y')::numeric,(b->>'x')::numeric,(b->>'y')::numeric,ax,ay)<0 THEN CONTINUE;END IF;
 IF forge_vtt_private.p4_hit(ax,ay,bx,by_,(a->>'x')::numeric,(a->>'y')::numeric,(b->>'x')::numeric,(b->>'y')::numeric) THEN RETURN false;END IF;END LOOP;END LOOP;RETURN true;END $$;
CREATE FUNCTION forge_vtt_private.p4_contains(o jsonb,px numeric,py numeric) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$DECLARE a jsonb;b jsonb;i integer;n integer;yes boolean:=false;dx numeric;dy numeric;ratio numeric;BEGIN
 IF o->>'type'='rect' THEN RETURN px BETWEEN (o->>'x')::numeric AND (o->>'x')::numeric+(o->>'w')::numeric AND py BETWEEN (o->>'y')::numeric AND (o->>'y')::numeric+(o->>'h')::numeric;END IF;
 n:=jsonb_array_length(o->'points');FOR i IN 0..n-1 LOOP a:=o->'points'->i;b:=o->'points'->((i+1)%n);dx:=(b->>'x')::numeric-(a->>'x')::numeric;dy:=(b->>'y')::numeric-(a->>'y')::numeric;
 IF o->>'type'='brush' THEN ratio:=CASE WHEN dx*dx+dy*dy=0 THEN 0 ELSE greatest(0,least(1,((px-(a->>'x')::numeric)*dx+(py-(a->>'y')::numeric)*dy)/(dx*dx+dy*dy))) END;IF sqrt((px-(a->>'x')::numeric-ratio*dx)^2+(py-(a->>'y')::numeric-ratio*dy)^2)<=(o->>'radius')::numeric THEN RETURN true;END IF;
 ELSIF ((a->>'y')::numeric>py)<>((b->>'y')::numeric>py) THEN IF px<dx*(py-(a->>'y')::numeric)/dy+(a->>'x')::numeric THEN yes:=NOT yes;END IF;END IF;END LOOP;RETURN yes;END $$;
CREATE FUNCTION forge_vtt_private.p4_can_see(c uuid,sid uuid,px numeric,py numeric,invisible boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$DECLARE env jsonb;s public.forge_vtt_scenes;op jsonb;yes boolean;source record;v jsonb;light record;a numeric;b numeric;distance numeric;k numeric;lit boolean;BEGIN
 SELECT data INTO env FROM public.forge_vtt_environments WHERE scene_id=sid AND campaign_id=c;
 IF coalesce(env#>>'{config,mode}','off')='off' THEN RETURN true;END IF;
 IF env#>>'{config,mode}'='manual' THEN yes:=NOT coalesce((env#>>'{config,covered}')::boolean,true);FOR op IN SELECT value FROM jsonb_array_elements(env->'fogOps') LOOP IF forge_vtt_private.p4_contains(op,px,py) THEN yes:=(op->>'reveal')::boolean;END IF;END LOOP;RETURN yes;END IF;
 SELECT * INTO s FROM public.forge_vtt_scenes WHERE id=sid AND campaign_id=c;k:=s.cell_px/coalesce((s.settings->>'distance')::numeric,5);
 lit:=coalesce(s.settings->>'lighting','bright')<>'dark' AND coalesce((s.settings->>'ambient')::numeric,1)>0;
 IF NOT lit THEN FOR light IN SELECT (l->>'x')::numeric x,(l->>'y')::numeric y,(l->>'dim')::numeric dim FROM jsonb_array_elements(env->'lights') l WHERE NOT coalesce((l->>'hidden')::boolean,false) AND coalesce((l->>'intensity')::numeric,1)>0
 UNION ALL SELECT t.x+t.width_cells*s.cell_px/2,t.y+t.height_cells*s.cell_px/2,(e.public_data#>>'{light,dim}')::numeric FROM public.forge_vtt_tokens t JOIN public.forge_vtt_entities e ON e.id=t.id WHERE e.campaign_id=c AND e.scene_id=sid AND e.deleted_at IS NULL AND e.visibility='campaign' AND e.layer<>'gm' AND e.public_data?'light' AND coalesce((e.public_data#>>'{light,intensity}')::numeric,1)>0 AND coalesce((s.settings#>>ARRAY['layers',e.layer,'visible'])::boolean,true) LOOP
 IF sqrt((px-light.x)^2+(py-light.y)^2)<=light.dim*k AND forge_vtt_private.p4_clear(env,light.x,light.y,px,py,'light') THEN lit:=true;EXIT;END IF;END LOOP;END IF;
 -- Query ownership directly: controls_token itself calls entity_readable.
 FOR source IN SELECT t.*,p.data FROM public.forge_vtt_tokens t JOIN public.forge_vtt_entities e ON e.id=t.id JOIN public.forge_vtt_token_owners own ON own.token_id=t.id AND own.user_id=auth.uid() LEFT JOIN public.forge_vtt_private_data p ON p.entity_id=t.id AND p.scope='controller' WHERE e.campaign_id=c AND e.scene_id=sid AND e.deleted_at IS NULL AND e.visibility='campaign' AND e.layer<>'gm' AND coalesce((s.settings#>>ARRAY['layers',e.layer,'visible'])::boolean,true) LOOP
 v:=coalesce(source.data#>'{details,vision}','{}');IF NOT coalesce((v->>'enabled')::boolean,true) THEN CONTINUE;END IF;a:=source.x+source.width_cells*s.cell_px/2;b:=source.y+source.height_cells*s.cell_px/2;distance:=sqrt((px-a)^2+(py-b)^2)/k;
 IF distance>greatest(coalesce((v->>'range')::numeric,60),coalesce((v->>'darkvision')::numeric,0),coalesce((v->>'blindsight')::numeric,0),coalesce((v->>'truesight')::numeric,0)) OR NOT forge_vtt_private.p4_clear(env,a,b,px,py,'sight') THEN CONTINUE;END IF;
 IF distance<=coalesce((v->>'blindsight')::numeric,0) OR distance<=coalesce((v->>'truesight')::numeric,0) OR NOT invisible AND (distance<=coalesce((v->>'darkvision')::numeric,0) OR lit AND distance<=coalesce((v->>'range')::numeric,60)) THEN RETURN true;END IF;END LOOP;RETURN false;END $$;
CREATE OR REPLACE FUNCTION forge_vtt_private.entity_readable(c uuid,e uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT forge_vtt_private.member_of(c) AND EXISTS(SELECT 1 FROM public.forge_vtt_entities x WHERE x.campaign_id=c AND x.id=e AND x.deleted_at IS NULL AND (x.scene_id IS NULL OR forge_vtt_private.scene_readable(c,x.scene_id)) AND (forge_vtt_private.dm_of(c) OR x.visibility='campaign' AND x.layer<>'gm' AND coalesce((SELECT (sc.settings#>>ARRAY['layers',x.layer,'visible'])::boolean FROM public.forge_vtt_scenes sc WHERE sc.id=x.scene_id),true))) AND (forge_vtt_private.dm_of(c) OR EXISTS(SELECT 1 FROM public.forge_vtt_token_owners o WHERE o.campaign_id=c AND o.token_id=e AND o.user_id=auth.uid()) OR EXISTS(SELECT 1 FROM public.forge_vtt_entities x LEFT JOIN public.forge_vtt_tokens t ON t.id=x.id JOIN public.forge_vtt_scenes s ON s.id=x.scene_id WHERE x.campaign_id=c AND x.id=e AND forge_vtt_private.p4_can_see(c,x.scene_id,coalesce(t.x+t.width_cells*s.cell_px/2,(x.public_data->>'x')::numeric,0),coalesce(t.y+t.height_cells*s.cell_px/2,(x.public_data->>'y')::numeric,0),coalesce(x.public_data->'conditions','[]')?'Invisible'))) $$;
ALTER FUNCTION forge_vtt_private.snapshot(uuid) RENAME TO p3_snapshot;
CREATE FUNCTION forge_vtt_private.snapshot(c uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$DECLARE result jsonb;sc jsonb;env jsonb;scenes jsonb:='[]';walls jsonb;w jsonb;rev bigint;seen jsonb;BEGIN
 result:=forge_vtt_private.p3_snapshot(c);
 FOR sc IN SELECT value FROM jsonb_array_elements(result->'scenes') LOOP
 SELECT data,revision INTO env,rev FROM public.forge_vtt_environments WHERE scene_id=(sc->>'id')::uuid AND campaign_id=c;
 IF env IS NOT NULL THEN
 IF NOT forge_vtt_private.dm_of(c) THEN walls:='[]';FOR w IN SELECT value FROM jsonb_array_elements(env->'walls') LOOP
 -- Secret doors are indistinguishable from generic blockers in a player DTO.
 IF w->>'type'='door' AND forge_vtt_private.p4_can_see(c,(sc->>'id')::uuid,((w->'points'->0->>'x')::numeric+(w->'points'->1->>'x')::numeric)/2,((w->'points'->0->>'y')::numeric+(w->'points'->1->>'y')::numeric)/2) THEN walls:=walls||jsonb_build_array(w);
 ELSE walls:=walls||jsonb_build_array(jsonb_build_object('type',CASE WHEN w->>'type'='oneWay' THEN 'oneWay' ELSE 'wall' END,'points',w->'points','closed',coalesce((w->>'closed')::boolean,false),'blockMovement',NOT(w->>'type' IN ('door','secret') AND w->>'state'='open') AND coalesce((w->>'blockMovement')::boolean,true),'blockSight',NOT(w->>'type' IN ('door','secret') AND w->>'state'='open') AND coalesce((w->>'blockSight')::boolean,w->>'type' NOT IN ('window','invisible')),'blockLight',NOT(w->>'type' IN ('door','secret') AND w->>'state'='open') AND coalesce((w->>'blockLight')::boolean,w->>'type' NOT IN ('window','invisible'))));END IF;END LOOP;
 env:=env||jsonb_build_object('walls',walls,'lights',coalesce((SELECT jsonb_agg(l-'hidden') FROM jsonb_array_elements(env->'lights') l WHERE NOT coalesce((l->>'hidden')::boolean,false)),'[]'));
 END IF;
 SELECT ex.seen INTO seen FROM public.forge_vtt_exploration ex WHERE ex.scene_id=(sc->>'id')::uuid AND ex.user_id=auth.uid();sc:=sc||jsonb_build_object('environment',env||jsonb_build_object('_revision',rev,'_explored',coalesce(seen,'[]')));END IF;
 scenes:=scenes||jsonb_build_array(sc);END LOOP;RETURN result||jsonb_build_object('scenes',scenes);END $$;
ALTER FUNCTION forge_vtt_private.apply_changes(uuid,uuid,jsonb) RENAME TO p3_apply_changes;
CREATE FUNCTION forge_vtt_private.apply_changes(c uuid,op uuid,changes jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE ch jsonb;d jsonb;rest jsonb:='[]';sid uuid;old public.forge_vtt_environments;g public.forge_vtt_campaigns;t public.forge_vtt_tokens;e public.forge_vtt_entities;s public.forge_vtt_scenes;stats jsonb;r text;BEGIN
 r:=forge_vtt_private.user_role(c,auth.uid());IF r IS NULL OR r='spectator' THEN RAISE EXCEPTION 'Editing not permitted' USING ERRCODE='42501';END IF;
 SELECT * INTO g FROM public.forge_vtt_campaigns WHERE id=c FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.forge_vtt_commands WHERE campaign_id=c AND operation_id=op) THEN RETURN jsonb_build_object('status','saved','game',forge_vtt_private.snapshot(c));END IF;
 IF jsonb_typeof(changes)<>'array' OR jsonb_array_length(changes) NOT BETWEEN 1 AND 500 OR octet_length(changes::text)>1048576 THEN RAISE EXCEPTION 'Invalid change batch';END IF;
 FOR ch IN SELECT value FROM jsonb_array_elements(changes) LOOP d:=ch->'data';
 IF ch->>'kind'='environment' THEN IF r<>'dm' OR ch->>'op'<>'upsert' OR NOT forge_vtt_private.allow_keys(ch,ARRAY['kind','id','op','expected','data']) OR NOT forge_vtt_private.allow_keys(d,ARRAY['environment']) OR NOT coalesce(forge_vtt_private.p4_environment(d->'environment'),false) THEN RAISE EXCEPTION 'Invalid fog or lighting update' USING ERRCODE='42501';END IF;
 ELSE
 IF ch->>'kind'='token' AND r<>'dm' AND ch->>'op'='upsert' THEN
 SELECT * INTO t FROM public.forge_vtt_tokens WHERE campaign_id=c AND id=(ch->>'id')::uuid;SELECT * INTO e FROM public.forge_vtt_entities WHERE campaign_id=c AND id=(ch->>'id')::uuid;
 SELECT data INTO stats FROM public.forge_vtt_private_data WHERE entity_id=t.id AND scope='controller';
 IF d?'meta' AND (d#>'{meta,light}') IS DISTINCT FROM (e.public_data->'light') OR d?'details' AND (d#>'{details,vision}') IS DISTINCT FROM (stats#>'{details,vision}') THEN RAISE EXCEPTION 'Only the DM can change vision or light' USING ERRCODE='42501';END IF;
 IF t.id IS NOT NULL AND (d?'x' OR d?'y' OR d?'size' OR d?'rotation' OR d?'sceneId' OR d?'meta') THEN SELECT * INTO s FROM public.forge_vtt_scenes WHERE id=e.scene_id;SELECT * INTO old FROM public.forge_vtt_environments WHERE scene_id=e.scene_id;
 IF coalesce((old.data#>>'{config,collision}')::boolean,true) AND NOT forge_vtt_private.p4_clear(old.data,t.x+t.width_cells*s.cell_px/2,t.y+t.height_cells*s.cell_px/2,coalesce((d->>'x')::numeric,t.x)+coalesce((d->>'size')::numeric,t.width_cells)*s.cell_px/2,coalesce((d->>'y')::numeric,t.y)+coalesce((d#>>'{meta,height}')::numeric,(d->>'size')::numeric,t.height_cells)*s.cell_px/2,'movement') THEN RAISE EXCEPTION 'A wall or closed door blocks movement' USING ERRCODE='42501';END IF;END IF;
 END IF;rest:=rest||jsonb_build_array(ch);END IF;END LOOP;
 IF jsonb_array_length(rest)=0 THEN rest:=jsonb_build_array(jsonb_build_object('kind','campaign','id',c,'op','upsert','expected',g.revision,'data',jsonb_build_object('name',g.name)));END IF;
 PERFORM forge_vtt_private.p3_apply_changes(c,op,rest);
 FOR ch IN SELECT value FROM jsonb_array_elements(changes) WHERE value->>'kind'='environment' LOOP sid:=(ch->>'id')::uuid;SELECT * INTO old FROM public.forge_vtt_environments WHERE scene_id=sid;
 IF NOT EXISTS(SELECT 1 FROM public.forge_vtt_scenes WHERE id=sid AND campaign_id=c AND deleted_at IS NULL) OR coalesce(old.revision,0)<>(ch->>'expected')::bigint THEN RAISE EXCEPTION 'Fog or lighting changed; review local edits' USING ERRCODE='40001';END IF;
 d:=ch#>'{data,environment}';IF old.data#>>'{config,memoryEpoch}' IS DISTINCT FROM d#>>'{config,memoryEpoch}' THEN DELETE FROM public.forge_vtt_exploration WHERE scene_id=sid;END IF;
 INSERT INTO public.forge_vtt_environments(scene_id,campaign_id,data) VALUES(sid,c,d) ON CONFLICT(scene_id) DO UPDATE SET data=EXCLUDED.data,revision=forge_vtt_environments.revision+1;END LOOP;
 UPDATE public.forge_vtt_commands SET forward_patch=changes WHERE campaign_id=c AND operation_id=op;
 RETURN jsonb_build_object('status','saved','game',forge_vtt_private.snapshot(c));END $$;
CREATE FUNCTION public.forge_vtt_vision(p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE c uuid:=(p_payload->>'campaignId')::uuid;sid uuid:=(p_payload->>'sceneId')::uuid;env public.forge_vtt_environments;s public.forge_vtt_scenes;item jsonb;w jsonb;walls jsonb:='[]';seen jsonb;approved jsonb:='[]';cell integer;px numeric;py numeric;nearby boolean;changed boolean:=false;BEGIN
 IF NOT forge_vtt_private.regular_user(auth.uid()) OR NOT forge_vtt_private.scene_readable(c,sid) OR octet_length(p_payload::text)>8192 THEN RAISE EXCEPTION 'Scene unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.forge_vtt_scenes WHERE id=sid AND campaign_id=c;
 IF p_action='memory' THEN
 SELECT * INTO env FROM public.forge_vtt_environments WHERE scene_id=sid AND campaign_id=c;
 IF env.data#>>'{config,mode}'<>'dynamic' OR NOT coalesce((env.data#>>'{config,memory}')::boolean,true) OR jsonb_typeof(p_payload->'cells')<>'array' OR jsonb_array_length(p_payload->'cells')>256 THEN RAISE EXCEPTION 'Invalid exploration request';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(sid::text||auth.uid()::text,0));
 SELECT ex.seen INTO seen FROM public.forge_vtt_exploration ex WHERE ex.scene_id=sid AND ex.user_id=auth.uid();seen:=coalesce(seen,'[]');
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'cells') LOOP cell:=(item#>>'{}')::integer;IF cell NOT BETWEEN 0 AND 16383 THEN RAISE EXCEPTION 'Invalid exploration cell';END IF;
 IF seen @> jsonb_build_array(cell) THEN CONTINUE;END IF;px:=(cell%128+.5)*s.width_cells*s.cell_px/128;py:=(cell/128+.5)*s.height_cells*s.cell_px/128;
 IF forge_vtt_private.p4_can_see(c,sid,px,py) THEN approved:=approved||jsonb_build_array(cell);END IF;END LOOP;
 SELECT coalesce(jsonb_agg(v ORDER BY v),'[]') INTO seen FROM (SELECT DISTINCT value::integer v FROM jsonb_array_elements_text(seen||approved)) cells;
 INSERT INTO public.forge_vtt_exploration(scene_id,campaign_id,user_id,seen) VALUES(sid,c,auth.uid(),seen) ON CONFLICT(scene_id,user_id) DO UPDATE SET seen=EXCLUDED.seen;
 RETURN jsonb_build_object('seen',seen);
 ELSIF p_action='door' THEN
 IF forge_vtt_private.user_role(c,auth.uid())='spectator' THEN RAISE EXCEPTION 'Door permission denied' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.forge_vtt_campaigns WHERE id=c FOR UPDATE;SELECT * INTO env FROM public.forge_vtt_environments WHERE scene_id=sid AND campaign_id=c FOR UPDATE;
 IF env.revision IS DISTINCT FROM (p_payload->>'expected')::bigint THEN RAISE EXCEPTION 'Door changed; update the tabletop' USING ERRCODE='40001';END IF;
 FOR w IN SELECT value FROM jsonb_array_elements(env.data->'walls') LOOP
 IF w->>'id'=p_payload->>'wallId' THEN
 IF w->>'type' NOT IN ('door','secret') THEN RAISE EXCEPTION 'Not a door';END IF;
 px:=((w->'points'->0->>'x')::numeric+(w->'points'->1->>'x')::numeric)/2;py:=((w->'points'->0->>'y')::numeric+(w->'points'->1->>'y')::numeric)/2;
 IF NOT forge_vtt_private.dm_of(c) THEN
 SELECT EXISTS(SELECT 1 FROM public.forge_vtt_token_owners own JOIN public.forge_vtt_tokens t ON t.id=own.token_id JOIN public.forge_vtt_entities e ON e.id=t.id WHERE own.user_id=auth.uid() AND own.campaign_id=c AND e.scene_id=sid AND forge_vtt_private.entity_readable(c,t.id) AND sqrt((px-t.x-t.width_cells*s.cell_px/2)^2+(py-t.y-t.height_cells*s.cell_px/2)^2)<=s.cell_px*1.5) INTO nearby;
 IF w->>'type'<>'door' OR w->>'state'='locked' OR NOT nearby OR NOT forge_vtt_private.p4_can_see(c,sid,px,py) THEN RAISE EXCEPTION 'Move beside a visible unlocked door' USING ERRCODE='42501';END IF;END IF;
 w:=w||jsonb_build_object('state',CASE WHEN w->>'state'='open' THEN 'closed' ELSE 'open' END);changed:=true;END IF;walls:=walls||jsonb_build_array(w);END LOOP;
 IF NOT changed THEN RAISE EXCEPTION 'Door unavailable';END IF;
 UPDATE public.forge_vtt_environments SET data=jsonb_set(data,'{walls}',walls),revision=revision+1 WHERE scene_id=sid;
 UPDATE public.forge_vtt_campaigns SET revision=revision+1,updated_at=now() WHERE id=c;
 RETURN jsonb_build_object('updated',true);
 ELSE RAISE EXCEPTION 'Unknown vision request';END IF;END $$;
REVOKE ALL ON FUNCTION public.forge_vtt_vision(text,jsonb) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.forge_vtt_vision(text,jsonb) TO authenticated;
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
 IF shared_scene AND NOT (action='pointer' AND EXISTS(SELECT 1 FROM public.forge_vtt_environments ve WHERE ve.scene_id=scene AND ve.data#>>'{config,mode}'<>'off')) AND NOT (action='pointer' AND hide_cursor AND jsonb_array_length(public_tokens)=0) THEN PERFORM realtime.send(shared,'room',topic||':players',true); END IF;
 RETURN jsonb_build_object('sent',true);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA forge_vtt_private FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION forge_vtt_private.p4_points(jsonb,integer) FROM authenticated;
REVOKE ALL ON FUNCTION forge_vtt_private.p4_light(jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION forge_vtt_private.p4_vision(jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION forge_vtt_private.phase3_meta_ok(jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION forge_vtt_private.phase3_details_ok(jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION forge_vtt_private.p4_environment(jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION forge_vtt_private.p4_cross(numeric,numeric,numeric,numeric,numeric,numeric) FROM authenticated;
REVOKE ALL ON FUNCTION forge_vtt_private.p4_hit(numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric) FROM authenticated;
REVOKE ALL ON FUNCTION forge_vtt_private.p4_clear(jsonb,numeric,numeric,numeric,numeric,text) FROM authenticated;
REVOKE ALL ON FUNCTION forge_vtt_private.p4_contains(jsonb,numeric,numeric) FROM authenticated;
REVOKE ALL ON FUNCTION forge_vtt_private.p4_can_see(uuid,uuid,numeric,numeric,boolean) FROM authenticated;
REVOKE ALL ON FUNCTION forge_vtt_private.p3_snapshot(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION forge_vtt_private.snapshot(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION forge_vtt_private.p3_apply_changes(uuid,uuid,jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION forge_vtt_private.apply_changes(uuid,uuid,jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION forge_vtt_private.entity_readable(uuid,uuid) TO authenticated;
COMMIT;
