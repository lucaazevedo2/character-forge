BEGIN;
CREATE OR REPLACE FUNCTION forge_vtt_private.snapshot(c uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$DECLARE result jsonb;sc jsonb;env jsonb;scenes jsonb:='[]';walls jsonb;w jsonb;rev bigint;seen jsonb;BEGIN
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
 -- Public illumination is a separate component: never include token IDs, names, portraits or GM/hidden emitters.
 env:=env||jsonb_build_object('_tokenLights',coalesce((SELECT jsonb_agg((e.public_data->'light')||jsonb_build_object('x',t.x+t.width_cells*s.cell_px/2,'y',t.y+t.height_cells*s.cell_px/2)) FROM public.forge_vtt_tokens t JOIN public.forge_vtt_entities e ON e.id=t.id JOIN public.forge_vtt_scenes s ON s.id=e.scene_id WHERE e.campaign_id=c AND e.scene_id=(sc->>'id')::uuid AND e.deleted_at IS NULL AND e.visibility='campaign' AND e.layer<>'gm' AND e.public_data?'light' AND coalesce((s.settings#>>ARRAY['layers',e.layer,'visible'])::boolean,true)),'[]'));
 SELECT ex.seen INTO seen FROM public.forge_vtt_exploration ex WHERE ex.scene_id=(sc->>'id')::uuid AND ex.user_id=auth.uid();sc:=sc||jsonb_build_object('environment',env||jsonb_build_object('_revision',rev,'_explored',coalesce(seen,'[]')));END IF;
 scenes:=scenes||jsonb_build_array(sc);END LOOP;RETURN result||jsonb_build_object('scenes',scenes);END $$;
REVOKE ALL ON FUNCTION forge_vtt_private.snapshot(uuid) FROM PUBLIC,anon,authenticated;
COMMIT;
