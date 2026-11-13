BEGIN;
CREATE OR REPLACE FUNCTION forge_vtt_private.play_get(c uuid,before_id bigint DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$DECLARE combat jsonb;revision bigint;entry jsonb;entries jsonb:='[]';tid uuid;tok public.forge_vtt_tokens;private jsonb;own boolean;hp numeric;maximum numeric;BEGIN
 IF NOT forge_vtt_private.regular_user(auth.uid()) OR NOT forge_vtt_private.member_of(c) THEN RAISE EXCEPTION 'Campaign unavailable' USING ERRCODE='42501';END IF;
 SELECT data,forge_vtt_combat.revision INTO combat,revision FROM public.forge_vtt_combat WHERE campaign_id=c;combat:=coalesce(combat,'{"entries":[],"round":1,"activeTokenId":null,"timerSeconds":0}');
 FOR entry IN SELECT value FROM jsonb_array_elements(combat->'entries') LOOP tid:=(entry->>'tokenId')::uuid;IF NOT forge_vtt_private.entity_readable(c,tid) THEN CONTINUE;END IF;SELECT * INTO tok FROM public.forge_vtt_tokens WHERE id=tid;SELECT data INTO private FROM public.forge_vtt_private_data WHERE entity_id=tid AND scope='controller';own:=forge_vtt_private.dm_of(c) OR forge_vtt_private.controls_token(c,tid);hp:=coalesce((private->>'hp')::numeric,0);maximum:=greatest(1,coalesce((private->>'maxHp')::numeric,1));
 entry:=entry||jsonb_build_object('name',tok.name,'color',tok.border_color,'owned',own,'conditions',(SELECT coalesce(public_data->'conditions','[]') FROM public.forge_vtt_entities WHERE id=tid));
 IF own OR entry->>'hpDisplay'='numbers' OR coalesce((private#>>'{details,hpVisible}')::boolean,false) THEN entry:=entry||jsonb_build_object('hp',hp,'maxHp',maximum,'tempHp',coalesce(private#>'{details,tempHp}','0'));
 ELSIF entry->>'hpDisplay'='status' THEN entry:=entry||jsonb_build_object('health',CASE WHEN hp=0 THEN 'Defeated' WHEN hp/maximum<=.25 THEN 'Near death' WHEN hp/maximum<=.5 THEN 'Bloodied' ELSE 'Healthy' END);END IF;
 IF own OR coalesce((entry->>'showAc')::boolean,false) THEN entry:=entry||jsonb_build_object('ac',private#>'{details,ac}');END IF;
 IF NOT own AND NOT coalesce((entry->>'showConditions')::boolean,true) THEN entry:=entry||jsonb_build_object('conditions','[]'::jsonb,'durations','[]'::jsonb);END IF;
 entries:=entries||jsonb_build_array(entry);END LOOP;
 combat:=(combat-'history')||jsonb_build_object('entries',entries,'revision',coalesce(revision,0));tid:=(combat->>'activeTokenId')::uuid;IF tid IS NOT NULL AND NOT forge_vtt_private.entity_readable(c,tid) THEN combat:=combat||jsonb_build_object('activeTokenId',NULL);END IF;
 RETURN jsonb_build_object('combat',combat,'messages',coalesce((SELECT jsonb_agg(row ORDER BY (row->>'id')::bigint) FROM (SELECT to_jsonb(m) row FROM public.forge_vtt_messages m WHERE m.campaign_id=c AND (before_id IS NULL OR m.id<before_id) AND (m.scope='public' OR m.actor_id=auth.uid() OR m.scope IN ('gm','controllers') AND forge_vtt_private.dm_of(c) OR m.scope='whisper' AND m.recipient_id=auth.uid() OR m.scope='controllers' AND m.token_id IS NOT NULL AND forge_vtt_private.controls_token(c,m.token_id)) AND (m.token_id IS NULL OR forge_vtt_private.entity_readable(c,m.token_id)) ORDER BY m.id DESC LIMIT 100) sub),'[]'),'macros',coalesce((SELECT jsonb_agg(to_jsonb(m)) FROM public.forge_vtt_macros m WHERE m.campaign_id=c AND m.owner_id=auth.uid()),'[]'));
 END$$;
CREATE OR REPLACE FUNCTION forge_vtt_private.combat_action(c uuid,p jsonb,rolled jsonb DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE d jsonb;entries jsonb;entry jsonb;old jsonb;target uuid;active uuid;action text:=p->>'action';actual bigint;position integer;size integer;index integer;round integer;item jsonb;duration jsonb;durations jsonb;name text;context jsonb;result jsonb;history jsonb;conditions jsonb;BEGIN
 INSERT INTO public.forge_vtt_combat(campaign_id) VALUES(c) ON CONFLICT DO NOTHING;SELECT data,forge_vtt_combat.revision INTO d,actual FROM public.forge_vtt_combat WHERE campaign_id=c FOR UPDATE;
 IF actual IS DISTINCT FROM (p->>'expected')::bigint THEN RAISE EXCEPTION 'Combat changed; update before editing' USING ERRCODE='40001';END IF;
 active:=(d->>'activeTokenId')::uuid;target:=(p->>'tokenId')::uuid;
 IF NOT forge_vtt_private.dm_of(c) AND (action NOT IN ('ready','delay') OR target IS DISTINCT FROM active OR NOT forge_vtt_private.controls_token(c,target)) THEN RAISE EXCEPTION 'DM combat controls required' USING ERRCODE='42501';END IF;
 entries:=d->'entries';history:=coalesce(d->'history','[]');old:=d-'history';round:=coalesce((d->>'round')::integer,1);
 IF action='add' THEN
 IF jsonb_typeof(p->'entries')<>'array' OR jsonb_array_length(p->'entries')>100 THEN RAISE EXCEPTION 'Add at most 100 combatants';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p->'entries') LOOP target:=(item->>'tokenId')::uuid;IF NOT forge_vtt_private.entity_readable(c,target) OR NOT EXISTS(SELECT 1 FROM public.forge_vtt_tokens WHERE id=target) THEN RAISE EXCEPTION 'Combatant unavailable';END IF;
 context:=forge_vtt_private.play_context(c,target);result:=rolled->target::text;
 IF NOT forge_vtt_private.number_ok(item,'initiative',-1000,1000) THEN RAISE EXCEPTION 'Invalid initiative';END IF;
 entry:=jsonb_build_object('tokenId',target,'initiative',coalesce((result->>'total')::numeric,(item->>'initiative')::numeric,0),'dex',coalesce(context->'dex','0'),'hpDisplay','status','showAc',false,'durations','[]'::jsonb,'ready',false,'delayed',false);
 entries:=coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(entries) e WHERE e->>'tokenId'<>target::text),'[]')||jsonb_build_array(entry);END LOOP;
 IF jsonb_array_length(entries)>100 THEN RAISE EXCEPTION 'Combatant limit is 100';END IF;
 SELECT coalesce(jsonb_agg(e ORDER BY (e->>'initiative')::numeric DESC,(e->>'dex')::numeric DESC,ord),'[]') INTO entries FROM jsonb_array_elements(entries) WITH ORDINALITY AS t(e,ord);
 ELSIF action='remove' THEN entries:=coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(entries) e WHERE e->>'tokenId'<>target::text),'[]');IF active=target THEN active:=(entries->0->>'tokenId')::uuid;END IF;
 ELSIF action='settings' THEN IF NOT forge_vtt_private.number_ok(p,'timerSeconds',0,3600) THEN RAISE EXCEPTION 'Invalid timer';END IF;d:=d||jsonb_build_object('timerSeconds',coalesce((p->>'timerSeconds')::integer,0));
 ELSIF action='entry' THEN
 IF coalesce(p->>'hpDisplay','status') NOT IN ('hidden','status','numbers') OR NOT forge_vtt_private.number_ok(p,'initiative',-1000,1000) THEN RAISE EXCEPTION 'Invalid combat display';END IF;
 entries:=coalesce((SELECT jsonb_agg(CASE WHEN e->>'tokenId'=target::text THEN e||jsonb_build_object('initiative',coalesce(p->'initiative',e->'initiative'),'hpDisplay',coalesce(p->>'hpDisplay','status'),'showAc',coalesce((p->>'showAc')::boolean,false),'showConditions',coalesce((p->>'showConditions')::boolean,true)) ELSE e END) FROM jsonb_array_elements(entries) e),'[]');
 ELSIF action='order' THEN IF jsonb_typeof(p->'ids')<>'array' OR jsonb_array_length(p->'ids')<>jsonb_array_length(entries) OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(p->'ids'))<>jsonb_array_length(entries) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'ids') v WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(entries) e WHERE e->>'tokenId'=v)) THEN RAISE EXCEPTION 'Order must include each combatant once';END IF;
 SELECT jsonb_agg(e ORDER BY ord) INTO entries FROM jsonb_array_elements_text(p->'ids') WITH ORDINALITY AS t(v,ord) JOIN LATERAL jsonb_array_elements(entries) e ON e->>'tokenId'=v;
 ELSIF action='duration' THEN
 name:=btrim(p->>'name');IF NOT p ?& ARRAY['name','rounds'] OR length(name) NOT BETWEEN 1 AND 60 OR NOT forge_vtt_private.number_ok(p,'rounds',1,1000) THEN RAISE EXCEPTION 'Invalid condition duration';END IF;
 entries:=coalesce((SELECT jsonb_agg(CASE WHEN e->>'tokenId'=target::text THEN e||jsonb_build_object('durations',coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(e->'durations') x WHERE x->>'name'<>name),'[]')||jsonb_build_array(jsonb_build_object('name',name,'remaining',(p->>'rounds')::integer))) ELSE e END) FROM jsonb_array_elements(entries) e),'[]');
 UPDATE public.forge_vtt_entities SET public_data=jsonb_set(public_data,'{conditions}',coalesce(public_data->'conditions','[]')||CASE WHEN coalesce(public_data->'conditions','[]')?name THEN '[]'::jsonb ELSE jsonb_build_array(name) END),revision=revision+1 WHERE id=target AND campaign_id=c;
 ELSIF action IN ('start','next','previous','delay','ready','end') THEN
 size:=jsonb_array_length(entries);IF action='end' THEN active:=NULL;
 ELSIF action='previous' THEN IF jsonb_array_length(history)>0 THEN d:=history->(jsonb_array_length(history)-1);history:=history-(jsonb_array_length(history)-1);entries:=d->'entries';active:=(d->>'activeTokenId')::uuid;round:=(d->>'round')::integer;FOR entry IN SELECT value FROM jsonb_array_elements(entries) LOOP FOR duration IN SELECT value FROM jsonb_array_elements(entry->'durations') LOOP UPDATE public.forge_vtt_entities SET public_data=jsonb_set(public_data,'{conditions}',coalesce(public_data->'conditions','[]')||CASE WHEN coalesce(public_data->'conditions','[]')?(duration->>'name') THEN '[]'::jsonb ELSE jsonb_build_array(duration->>'name') END),revision=revision+1 WHERE id=(entry->>'tokenId')::uuid AND campaign_id=c;END LOOP;END LOOP;END IF;
 ELSIF action='ready' THEN entries:=coalesce((SELECT jsonb_agg(CASE WHEN e->>'tokenId'=target::text THEN e||'{"ready":true}' ELSE e END) FROM jsonb_array_elements(entries) e),'[]');
 ELSIF size>0 THEN
 SELECT ord::integer-1 INTO position FROM jsonb_array_elements(entries) WITH ORDINALITY AS t(e,ord) WHERE e->>'tokenId'=active::text;position:=coalesce(position,-1);
 IF action='start' THEN round:=1;index:=0;
 ELSIF action='delay' THEN entry:=entries->position;entries:=(entries-position)||jsonb_build_array(entry||'{"delayed":true}');index:=CASE WHEN position>=size-1 THEN 0 ELSE position END;IF position>=size-1 THEN round:=round+1;END IF;
 ELSE index:=(position+1)%size;IF index=0 AND position>=0 THEN round:=round+1;END IF;END IF;
 IF round>coalesce((old->>'round')::integer,1) THEN
 result:='[]';FOR entry IN SELECT value FROM jsonb_array_elements(entries) LOOP durations:='[]';FOR duration IN SELECT value FROM jsonb_array_elements(entry->'durations') LOOP IF (duration->>'remaining')::integer>1 THEN durations:=durations||jsonb_build_array(duration||jsonb_build_object('remaining',(duration->>'remaining')::integer-1));ELSE UPDATE public.forge_vtt_entities SET public_data=jsonb_set(public_data,'{conditions}',coalesce((SELECT jsonb_agg(v) FROM jsonb_array_elements(coalesce(public_data->'conditions','[]')) v WHERE v#>>'{}'<>duration->>'name'),'[]')),revision=revision+1 WHERE id=(entry->>'tokenId')::uuid AND campaign_id=c;END IF;END LOOP;result:=result||jsonb_build_array(entry||jsonb_build_object('durations',durations));END LOOP;entries:=result;END IF;
 active:=(entries->index->>'tokenId')::uuid;
 END IF;
 ELSE RAISE EXCEPTION 'Unknown combat action';END IF;
 IF action<>'previous' THEN history:=history||jsonb_build_array(old);IF jsonb_array_length(history)>30 THEN history:=history-0;END IF;END IF;
 d:=d||jsonb_build_object('entries',entries,'activeTokenId',active,'round',round,'startedAt',floor(extract(epoch from clock_timestamp())*1000),'history',history);
 UPDATE public.forge_vtt_combat SET data=d,revision=actual+1 WHERE campaign_id=c;
 IF action IN ('next','start','previous','delay','duration') THEN UPDATE public.forge_vtt_campaigns SET revision=revision+1,updated_at=now() WHERE id=c;END IF;
 IF active IS NOT NULL AND action IN ('start','next','previous','delay') THEN INSERT INTO public.forge_vtt_messages(campaign_id,actor_id,token_id,scope,speaker,kind,body,payload) VALUES(c,auth.uid(),active,'public','Combat','combat','Round '||round::text||' · '||(SELECT forge_vtt_tokens.name FROM public.forge_vtt_tokens WHERE id=active)||'’s turn',jsonb_build_object('turn',true));END IF;
 PERFORM forge_vtt_private.play_notify(c);END$$;
COMMIT;
