-- Synthetic identities exist only inside this rolled-back transaction.
BEGIN;
SELECT set_config('vtt.resource.qa',jsonb_build_object('dm',gen_random_uuid(),'player',gen_random_uuid(),'campaign',gen_random_uuid(),'doc',gen_random_uuid(),'asset',gen_random_uuid(),'reservation',gen_random_uuid())::text,true);
DO $$DECLARE a jsonb:=current_setting('vtt.resource.qa')::jsonb;BEGIN
 INSERT INTO auth.users(id,is_anonymous) VALUES((a->>'dm')::uuid,false),((a->>'player')::uuid,false);
END$$;
SELECT set_config('request.jwt.claim.sub',current_setting('vtt.resource.qa')::jsonb->>'dm',true);
SET LOCAL ROLE authenticated;
DO $$DECLARE a jsonb:=current_setting('vtt.resource.qa')::jsonb;BEGIN
 PERFORM public.forge_vtt_api('create',jsonb_build_object('campaignId',a->'campaign','name','Phase 7 rollback QA','operationId',gen_random_uuid()));
END$$;
RESET ROLE;
DO $$DECLARE a jsonb:=current_setting('vtt.resource.qa')::jsonb;BEGIN
 INSERT INTO public.forge_vtt_campaign_members(campaign_id,user_id,role,display_name) VALUES((a->>'campaign')::uuid,(a->>'player')::uuid,'player','QA');
 INSERT INTO forge_vtt_private.upload_reservations(id,campaign_id,user_id,asset_id,operation_id,reserved_bytes,object_path,expires_at) VALUES((a->>'reservation')::uuid,(a->>'campaign')::uuid,(a->>'dm')::uuid,(a->>'asset')::uuid,gen_random_uuid(),44,'rollback-qa/audio',now()+interval '5 minutes');
 PERFORM public.forge_vtt_finalize_media((a->>'dm')::uuid,(a->>'reservation')::uuid,'audio/wav',repeat('a',64),null,null);
END$$;
SET LOCAL ROLE authenticated;
DO $$DECLARE a jsonb:=current_setting('vtt.resource.qa')::jsonb;BEGIN
 PERFORM public.forge_vtt_resources_api('save',jsonb_build_object('campaignId',a->'campaign','id',a->'doc','kind','audio','title','QA audio','expected',0,'payload',jsonb_build_object('tracks',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'title','Test sound','assetId',a->'asset')),'status','stopped','position',0,'volume',1,'crossfade',0)));
END$$;
SELECT set_config('request.jwt.claim.sub',current_setting('vtt.resource.qa')::jsonb->>'player',true);
DO $$DECLARE a jsonb:=current_setting('vtt.resource.qa')::jsonb;v jsonb;BEGIN
 v:=public.forge_vtt_resources_api('list',jsonb_build_object('campaignId',a->'campaign'));
 IF jsonb_array_length(v->'records')<>0 OR EXISTS(SELECT 1 FROM public.forge_vtt_assets WHERE id=(a->>'asset')::uuid) THEN RAISE EXCEPTION 'Private resource leaked';END IF;
 IF has_function_privilege('authenticated','public.forge_vtt_finalize_media(uuid,uuid,text,text,integer,integer)','EXECUTE') THEN RAISE EXCEPTION 'Finalization exposed';END IF;
END$$;
SELECT set_config('request.jwt.claim.sub',current_setting('vtt.resource.qa')::jsonb->>'dm',true);
DO $$DECLARE a jsonb:=current_setting('vtt.resource.qa')::jsonb;r jsonb;BEGIN
 SELECT payload INTO r FROM public.forge_vtt_resources WHERE id=(a->>'doc')::uuid;
 PERFORM public.forge_vtt_resources_api('save',jsonb_build_object('campaignId',a->'campaign','id',a->'doc','kind','audio','title','QA audio','expected',1,'audience','selected','recipients',jsonb_build_array(a->'player'),'payload',r));
END$$;
SELECT set_config('request.jwt.claim.sub',current_setting('vtt.resource.qa')::jsonb->>'player',true);
DO $$DECLARE a jsonb:=current_setting('vtt.resource.qa')::jsonb;BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.forge_vtt_assets WHERE id=(a->>'asset')::uuid) THEN RAISE EXCEPTION 'Selected-player audio missing';END IF;
END$$;
SELECT set_config('request.jwt.claim.sub',current_setting('vtt.resource.qa')::jsonb->>'dm',true);
DO $$DECLARE a jsonb:=current_setting('vtt.resource.qa')::jsonb;BEGIN
 PERFORM public.forge_vtt_resources_api('trash',jsonb_build_object('campaignId',a->'campaign','id',a->'doc','expected',2));
END$$;
SELECT set_config('request.jwt.claim.sub',current_setting('vtt.resource.qa')::jsonb->>'player',true);
DO $$DECLARE a jsonb:=current_setting('vtt.resource.qa')::jsonb;BEGIN
 IF EXISTS(SELECT 1 FROM public.forge_vtt_assets WHERE id=(a->>'asset')::uuid) THEN RAISE EXCEPTION 'Revoked audio leaked';END IF;
END$$;
SELECT 'PASS hosted audio finalization, private/selected/revoked resources, RLS and gateway ACL' AS result;
ROLLBACK;
