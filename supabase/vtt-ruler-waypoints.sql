DO $patch$
DECLARE definition text; needle text := $needle$body:=body||jsonb_build_object('x',p->'x','y',p->'y','x2',p->'x2','y2',p->'y2','shape',p->'shape','width',p->'width');shared:=body;$needle$;
addition text := $addition$
  IF p->>'shape'='ruler' AND p ? 'points' THEN
   IF jsonb_typeof(p->'points') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid ruler waypoints'; END IF;
   IF jsonb_array_length(p->'points')>2048 THEN RAISE EXCEPTION 'Too many ruler waypoints'; END IF;
   IF EXISTS (SELECT 1 FROM jsonb_array_elements(p->'points') AS waypoint WHERE jsonb_typeof(waypoint->'x') IS DISTINCT FROM 'number' OR jsonb_typeof(waypoint->'y') IS DISTINCT FROM 'number' OR NOT forge_vtt_private.number_ok(waypoint,'x',0,128000) OR NOT forge_vtt_private.number_ok(waypoint,'y',0,128000)) THEN RAISE EXCEPTION 'Invalid ruler waypoint'; END IF;
   body:=body||jsonb_build_object('points',p->'points');shared:=body;
  END IF;
$addition$;
BEGIN
 definition:=pg_get_functiondef('forge_vtt_private.live_rpc(text,jsonb)'::regprocedure);
 IF position('Invalid ruler waypoints' in definition)>0 THEN RETURN; END IF;
 IF position(needle in definition)=0 THEN RAISE EXCEPTION 'Live measure definition changed; review before applying'; END IF;
 EXECUTE replace(definition,needle,needle||addition);
END
$patch$;

-- Upgrade the earlier beta validator without touching membership or visibility checks.
DO $patch$ DECLARE d text; BEGIN d:=pg_get_functiondef('forge_vtt_private.live_rpc(text,jsonb)'::regprocedure); IF position('jsonb_array_length(p->''points'')>65' in d)>0 THEN EXECUTE replace(d,'jsonb_array_length(p->''points'')>65','jsonb_array_length(p->''points'')>2048'); END IF; END $patch$;
