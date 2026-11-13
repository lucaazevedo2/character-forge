-- Rollback-only smoke test against hosted PostgreSQL. No accounts/campaigns persist.
BEGIN;
SELECT set_config('vtt.qa',jsonb_build_object('dm',gen_random_uuid(),'player',gen_random_uuid(),'campaign',gen_random_uuid(),'scene',gen_random_uuid(),'hero',gen_random_uuid(),'enemy',gen_random_uuid())::text,true);
DO $$DECLARE a jsonb:=current_setting('vtt.qa')::jsonb;BEGIN INSERT INTO auth.users(id,is_anonymous) VALUES((a->>'dm')::uuid,false),((a->>'player')::uuid,false);END$$;
SELECT set_config('request.jwt.claim.sub',current_setting('vtt.qa')::jsonb->>'dm',true);
SET LOCAL ROLE authenticated;
DO $$DECLARE a jsonb:=current_setting('vtt.qa')::jsonb;changes jsonb;BEGIN
 PERFORM public.forge_vtt_api('create',jsonb_build_object('campaignId',a->'campaign','name','Phase 4 rollback QA','operationId',gen_random_uuid()));
 changes:=jsonb_build_array(jsonb_build_object('kind','scene','id',a->'scene','op','upsert','expected',0,'data',jsonb_build_object('name','QA','width',640,'height',640,'grid',64,'published',true)),jsonb_build_object('kind','campaign','id',a->'campaign','op','upsert','expected',1,'data',jsonb_build_object('activeSceneId',a->'scene')));
 PERFORM public.forge_vtt_api('apply',jsonb_build_object('campaignId',a->'campaign','operationId',gen_random_uuid(),'changes',changes));
END$$;
RESET ROLE;
DO $$DECLARE a jsonb:=current_setting('vtt.qa')::jsonb;BEGIN INSERT INTO public.forge_vtt_campaign_members(campaign_id,user_id,role,display_name) VALUES((a->>'campaign')::uuid,(a->>'player')::uuid,'player','QA player');END$$;
SET LOCAL ROLE authenticated;
DO $$DECLARE a jsonb:=current_setting('vtt.qa')::jsonb;env jsonb;changes jsonb;BEGIN
 env:='{"config":{"mode":"dynamic","covered":true,"collision":true,"memory":true},"walls":[{"id":"secret-qa-door","type":"secret","state":"locked","points":[{"x":192,"y":0},{"x":192,"y":640}]}],"lights":[],"fogOps":[]}';
 changes:=jsonb_build_array(jsonb_build_object('kind','token','id',a->'hero','op','upsert','expected',0,'data',jsonb_build_object('sceneId',a->'scene','name','Hero','x',64,'y',64,'ownerIds',jsonb_build_array(a->'player'),'details',jsonb_build_object('vision',jsonb_build_object('enabled',true,'range',60)))),jsonb_build_object('kind','token','id',a->'enemy','op','upsert','expected',0,'data',jsonb_build_object('sceneId',a->'scene','name','HIDDEN_QA_ENEMY','x',256,'y',64)),jsonb_build_object('kind','environment','id',a->'scene','op','upsert','expected',0,'data',jsonb_build_object('environment',env)));
 PERFORM public.forge_vtt_api('apply',jsonb_build_object('campaignId',a->'campaign','operationId',gen_random_uuid(),'changes',changes));END$$;
SELECT set_config('request.jwt.claim.sub',current_setting('vtt.qa')::jsonb->>'player',true);
DO $$DECLARE a jsonb:=current_setting('vtt.qa')::jsonb;v jsonb;BEGIN
 v:=public.forge_vtt_api('snapshot',jsonb_build_object('campaignId',a->'campaign'));
 ASSERT jsonb_array_length(v#>'{scenes,0,tokens}')=1,'Token snapshot leaked';ASSERT v::text NOT LIKE '%HIDDEN_QA_ENEMY%','Enemy leaked';ASSERT v::text NOT LIKE '%secret-qa-door%','Secret metadata leaked';
 ASSERT NOT EXISTS(SELECT 1 FROM public.forge_vtt_entities WHERE id=(a->>'enemy')::uuid),'Entity RLS leaked';ASSERT NOT EXISTS(SELECT 1 FROM public.forge_vtt_tokens WHERE id=(a->>'enemy')::uuid),'Token RLS leaked';ASSERT NOT EXISTS(SELECT 1 FROM public.forge_vtt_environments WHERE scene_id=(a->>'scene')::uuid),'Environment RLS leaked';
 BEGIN PERFORM public.forge_vtt_api('apply',jsonb_build_object('campaignId',a->'campaign','operationId',gen_random_uuid(),'changes',jsonb_build_array(jsonb_build_object('kind','token','id',a->'hero','op','upsert','expected',1,'data',jsonb_build_object('x',256)))));RAISE EXCEPTION 'Movement unexpectedly allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.forge_vtt_vision('door',jsonb_build_object('campaignId',a->'campaign','sceneId',a->'scene','wallId','secret-qa-door','expected',1));RAISE EXCEPTION 'Secret door unexpectedly allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM public.forge_vtt_vision('memory',jsonb_build_object('campaignId',a->'campaign','sceneId',a->'scene','cells',jsonb_build_array(2451,2489)));
END$$;
SELECT jsonb_build_object('phase4_hosted_checks','passed','snapshot_filtering',true,'raw_rls',true,'secret_door',true,'wall_collision',true,'memory_rpc',true) AS result;
ROLLBACK;
