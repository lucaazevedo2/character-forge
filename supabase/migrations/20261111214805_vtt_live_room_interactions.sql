BEGIN;
CREATE TABLE forge_vtt_private.live_rooms(campaign_id uuid PRIMARY KEY REFERENCES public.forge_vtt_campaigns(id) ON DELETE CASCADE, room_key uuid NOT NULL DEFAULT gen_random_uuid());
CREATE TABLE forge_vtt_private.live_peers(campaign_id uuid REFERENCES public.forge_vtt_campaigns(id) ON DELETE CASCADE,user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,client_id uuid NOT NULL,seen_at timestamptz NOT NULL DEFAULT now(),away boolean NOT NULL DEFAULT false,PRIMARY KEY(campaign_id,user_id,client_id));
CREATE TABLE forge_vtt_private.live_rate(campaign_id uuid REFERENCES public.forge_vtt_campaigns(id) ON DELETE CASCADE,user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,second bigint NOT NULL,hits integer NOT NULL DEFAULT 1,last_ping timestamptz,PRIMARY KEY(campaign_id,user_id));
ALTER TABLE forge_vtt_private.live_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge_vtt_private.live_peers ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge_vtt_private.live_rate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON forge_vtt_private.live_rooms,forge_vtt_private.live_peers,forge_vtt_private.live_rate FROM PUBLIC,anon,authenticated;
INSERT INTO forge_vtt_private.live_rooms(campaign_id) SELECT id FROM public.forge_vtt_campaigns;
CREATE FUNCTION forge_vtt_private.rotate_live_room() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid;
BEGIN
 IF TG_TABLE_NAME='forge_vtt_campaigns' THEN c:=NEW.id; ELSIF TG_OP='DELETE' THEN c:=OLD.campaign_id; ELSE c:=NEW.campaign_id; END IF;
 IF EXISTS(SELECT 1 FROM public.forge_vtt_campaigns WHERE id=c) THEN
  INSERT INTO forge_vtt_private.live_rooms(campaign_id) VALUES(c) ON CONFLICT(campaign_id) DO UPDATE SET room_key=gen_random_uuid();
  DELETE FROM forge_vtt_private.live_peers p WHERE p.campaign_id=c AND NOT EXISTS(SELECT 1 FROM public.forge_vtt_campaign_members m WHERE m.campaign_id=c AND m.user_id=p.user_id);
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION forge_vtt_private.rotate_live_room() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER vtt_room_new AFTER INSERT ON public.forge_vtt_campaigns FOR EACH ROW EXECUTE FUNCTION forge_vtt_private.rotate_live_room();
CREATE TRIGGER vtt_room_owner AFTER UPDATE OF owner_id,deleted_at ON public.forge_vtt_campaigns FOR EACH ROW EXECUTE FUNCTION forge_vtt_private.rotate_live_room();
CREATE TRIGGER vtt_room_members AFTER INSERT OR UPDATE OR DELETE ON public.forge_vtt_campaign_members FOR EACH ROW EXECUTE FUNCTION forge_vtt_private.rotate_live_room();
CREATE FUNCTION forge_vtt_private.live_topic_allowed(topic text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM forge_vtt_private.live_rooms r WHERE forge_vtt_private.member_of(r.campaign_id) AND
 (topic='vtt-room:'||r.campaign_id::text||':'||r.room_key::text||':players' OR (forge_vtt_private.dm_of(r.campaign_id) AND topic='vtt-room:'||r.campaign_id::text||':'||r.room_key::text||':dm')));
$$;
REVOKE ALL ON FUNCTION forge_vtt_private.live_topic_allowed(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION forge_vtt_private.live_topic_allowed(text) TO authenticated;
CREATE POLICY vtt_live_broadcast_receive ON realtime.messages FOR SELECT TO authenticated USING(extension='broadcast' AND forge_vtt_private.live_topic_allowed((SELECT realtime.topic())));
-- No INSERT policy: browsers cannot spoof broadcasts or presence. All outgoing events use this checked gateway.
CREATE FUNCTION forge_vtt_private.live_rpc(action text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
    IF NOT (item ?& ARRAY['x','y','size','rotation']) OR NOT forge_vtt_private.number_ok(item,'x',0,128000) OR NOT forge_vtt_private.number_ok(item,'y',0,128000) OR NOT forge_vtt_private.number_ok(item,'size',.25,20) OR NOT forge_vtt_private.number_ok(item,'rotation',0,359.999) THEN RAISE EXCEPTION 'Invalid movement'; END IF;
    IF (item->>'x')::numeric+(item->>'size')::numeric*board.cell_px>board.width_cells*board.cell_px OR (item->>'y')::numeric+(item->>'size')::numeric*board.cell_px>board.height_cells*board.cell_px THEN RAISE EXCEPTION 'Preview outside map'; END IF;
    item:=jsonb_build_object('id',token.id,'x',item->'x','y',item->'y','size',item->'size','rotation',item->'rotation','revision',(SELECT revision FROM public.forge_vtt_entities WHERE id=token.id));
    all_tokens:=all_tokens||jsonb_build_array(item);
    IF entity.visibility='campaign' THEN public_tokens:=public_tokens||jsonb_build_array(item); ELSE hide_cursor:=true; END IF;
   END LOOP;
  END IF;
  body:=body||jsonb_build_object('cursor',cursor_data,'tokens',all_tokens,'ended',coalesce((p->>'ended')::boolean,false));
  shared:=body||jsonb_build_object('tokens',public_tokens,'cursor',CASE WHEN hide_cursor THEN 'null'::jsonb ELSE cursor_data END);
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
REVOKE ALL ON FUNCTION forge_vtt_private.live_rpc(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION forge_vtt_private.live_rpc(text,jsonb) TO authenticated;
CREATE FUNCTION public.forge_vtt_live(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT forge_vtt_private.live_rpc(p_action,p_payload); $$;
REVOKE ALL ON FUNCTION public.forge_vtt_live(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.forge_vtt_live(text,jsonb) TO authenticated;
COMMIT;
