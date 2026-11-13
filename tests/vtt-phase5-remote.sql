-- Rollback-only hosted PostgreSQL assertions; no campaign/account persists.
BEGIN;
SELECT set_config('vtt.play.qa',jsonb_build_object('dm',gen_random_uuid(),'player',gen_random_uuid(),'campaign',gen_random_uuid(),'scene',gen_random_uuid(),'token',gen_random_uuid())::text,true);
DO $$DECLARE a jsonb:=current_setting('vtt.play.qa')::jsonb;BEGIN INSERT INTO auth.users(id,is_anonymous) VALUES((a->>'dm')::uuid,false),((a->>'player')::uuid,false);END$$;
SELECT set_config('request.jwt.claim.sub',current_setting('vtt.play.qa')::jsonb->>'dm',true);
SET LOCAL ROLE authenticated;
DO $$DECLARE a jsonb:=current_setting('vtt.play.qa')::jsonb;changes jsonb;BEGIN
 PERFORM public.forge_vtt_api('create',jsonb_build_object('campaignId',a->'campaign','name','Phase 5 rollback QA','operationId',gen_random_uuid()));
 changes:=jsonb_build_array(jsonb_build_object('kind','scene','id',a->'scene','op','upsert','expected',0,'data',jsonb_build_object('name','QA','published',true)),jsonb_build_object('kind','campaign','id',a->'campaign','op','upsert','expected',1,'data',jsonb_build_object('activeSceneId',a->'scene')),jsonb_build_object('kind','token','id',a->'token','op','upsert','expected',0,'data',jsonb_build_object('sceneId',a->'scene','name','Monster','hp',5,'maxHp',10,'meta',jsonb_build_object('conditions',jsonb_build_array('Poisoned')),'details',jsonb_build_object('ac',18))));
 PERFORM public.forge_vtt_api('apply',jsonb_build_object('campaignId',a->'campaign','operationId',gen_random_uuid(),'changes',changes));
 PERFORM public.forge_vtt_play('combat',jsonb_build_object('campaignId',a->'campaign','action','add','expected',0,'requestId',gen_random_uuid(),'entries',jsonb_build_array(jsonb_build_object('tokenId',a->'token','initiative',10))));
 PERFORM public.forge_vtt_play('combat',jsonb_build_object('campaignId',a->'campaign','action','entry','expected',1,'requestId',gen_random_uuid(),'tokenId',a->'token','showConditions',false,'showAc',false,'hpDisplay','hidden'));
 IF has_function_privilege('authenticated','public.forge_vtt_roll_gateway(uuid,jsonb,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Gateway ACL leak';END IF;
END$$;
RESET ROLE;
DO $$DECLARE a jsonb:=current_setting('vtt.play.qa')::jsonb;BEGIN INSERT INTO public.forge_vtt_campaign_members(campaign_id,user_id,role,display_name) VALUES((a->>'campaign')::uuid,(a->>'player')::uuid,'player','QA player');END$$;
SELECT set_config('request.jwt.claim.sub',current_setting('vtt.play.qa')::jsonb->>'player',true);
SET LOCAL ROLE authenticated;
DO $$DECLARE a jsonb:=current_setting('vtt.play.qa')::jsonb;v jsonb;BEGIN
 v:=public.forge_vtt_play('get',jsonb_build_object('campaignId',a->'campaign'));
 IF v#>'{combat,entries,0,conditions}'<>'[]'::jsonb OR v#>'{combat,entries,0,durations}'<>'[]'::jsonb OR v#>'{combat,entries,0,hp}' IS NOT NULL OR v#>'{combat,entries,0,ac}' IS NOT NULL THEN RAISE EXCEPTION 'Combat display permission leak';END IF;
 IF EXISTS(SELECT 1 FROM public.forge_vtt_combat) THEN RAISE EXCEPTION 'Raw combat leak';END IF;
 BEGIN PERFORM public.forge_vtt_play('send',jsonb_build_object('campaignId',a->'campaign','kind','roll','body','Forged'));RAISE EXCEPTION 'Forged roll accepted';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END$$;
SELECT 'PASS hosted condition/HP/AC masking, raw table isolation and trusted gateway ACL' AS result;
ROLLBACK;
