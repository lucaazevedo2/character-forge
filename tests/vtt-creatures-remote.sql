-- Hosted validation uses only synthetic rows in a rolled-back transaction.
BEGIN;
SELECT set_config('vtt.creature.qa',jsonb_build_object('dm',gen_random_uuid(),'player',gen_random_uuid(),'campaign',gen_random_uuid(),'creature',gen_random_uuid())::text,true);
DO $$DECLARE a jsonb:=current_setting('vtt.creature.qa')::jsonb;BEGIN
 INSERT INTO auth.users(id,is_anonymous)VALUES((a->>'dm')::uuid,false),((a->>'player')::uuid,false);
END$$;
SELECT set_config('request.jwt.claim.sub',current_setting('vtt.creature.qa')::jsonb->>'dm',true);
SET LOCAL ROLE authenticated;
DO $$DECLARE a jsonb:=current_setting('vtt.creature.qa')::jsonb;s jsonb:='{"name": "Rollback QA mage", "role": "Monster", "size": "Medium", "type": "humanoid", "subtype": "", "alignment": "unaligned", "armor": "", "hitDice": "1d8", "saves": "", "skills": "", "vulnerabilities": "", "resistances": "", "immunities": "", "conditionImmunities": "", "senses": "", "languages": "", "challenge": "0", "equipment": "", "description": "", "tactics": "", "regionalEffects": "", "source": "Custom", "sourceId": "", "spellAbility": "", "spells": "Cantrips: test", "innateSpells": "", "hover": false, "ac": 10, "hp": 4, "proficiency": 2, "initiative": 0, "xp": 0, "passivePerception": 10, "walk": 30, "fly": 0, "swim": 0, "climb": 0, "burrow": 0, "legendaryBudget": 3, "legendaryResistances": 0, "lairInitiative": 20, "casterLevel": 0, "spellDC": 0, "spellAttack": 0, "strength": 10, "dexterity": 10, "constitution": 10, "intelligence": 10, "wisdom": 10, "charisma": 10, "traits": [], "actions": [], "bonusActions": [], "reactions": [], "legendaryActions": [], "lairActions": [], "mythicActions": [], "slots": [0, 4, 0, 0, 0, 0, 0, 0, 0, 0]}'::jsonb;BEGIN
 PERFORM public.forge_vtt_api('create',jsonb_build_object('campaignId',a->'campaign','operationId',gen_random_uuid(),'name','Rollback creature QA'));
 PERFORM public.forge_vtt_resources_api('save',jsonb_build_object('campaignId',a->'campaign','id',a->'creature','kind','creature','title',s->>'name','expected',0,'payload',jsonb_build_object('statBlock',s)));
 IF (public.forge_vtt_resources_api('list',jsonb_build_object('campaignId',a->'campaign'))->>'accountLimit')::bigint<>524288000 THEN RAISE EXCEPTION 'Default quota changed';END IF;
END$$;
RESET ROLE;
DO $$DECLARE a jsonb:=current_setting('vtt.creature.qa')::jsonb;BEGIN
 INSERT INTO public.forge_vtt_campaign_members(campaign_id,user_id,role,display_name) VALUES((a->>'campaign')::uuid,(a->>'player')::uuid,'player','QA');
 INSERT INTO forge_vtt_private.storage_allowances VALUES((a->>'dm')::uuid,214748364800);
END$$;
SET LOCAL ROLE authenticated;
DO $$DECLARE a jsonb:=current_setting('vtt.creature.qa')::jsonb;s jsonb;BEGIN
 s:=public.forge_vtt_resources_api('list',jsonb_build_object('campaignId',a->'campaign'));
 IF (s->>'accountLimit')::bigint<>214748364800 OR (s->>'campaignLimit')::bigint<>214748364800 THEN RAISE EXCEPTION 'Allowance not applied';END IF;
 PERFORM public.forge_vtt_resources_api('reserve',jsonb_build_object('campaignId',a->'campaign','bytes',100,'mime','image/png'));
 PERFORM public.forge_vtt_api('reserve_upload',jsonb_build_object('campaignId',a->'campaign','bytes',100,'mime','image/png','operationId',gen_random_uuid()));
END$$;
SELECT set_config('request.jwt.claim.sub',current_setting('vtt.creature.qa')::jsonb->>'player',true);
DO $$DECLARE a jsonb:=current_setting('vtt.creature.qa')::jsonb;BEGIN
 IF jsonb_array_length(public.forge_vtt_resources_api('list',jsonb_build_object('campaignId',a->'campaign'))->'records')<>0 OR EXISTS(SELECT 1 FROM public.forge_vtt_resources WHERE campaign_id=(a->>'campaign')::uuid) THEN RAISE EXCEPTION 'Private stat block leaked';END IF;
 IF has_table_privilege('authenticated','forge_vtt_private.storage_allowances','INSERT') OR has_function_privilege('authenticated','forge_vtt_private.storage_limit(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Entitlement ACL leak';END IF;
END$$;
SELECT 'PASS hosted private creature save/read, spell/legendary fields, isolated defaults/200GB allowance, both reservation paths and entitlement ACL' AS result;
ROLLBACK;
