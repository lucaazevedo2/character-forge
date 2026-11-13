-- VTT Phase 1: additive tables, current-user RLS, atomic command API.
BEGIN;

CREATE SCHEMA forge_vtt_private;
REVOKE ALL ON SCHEMA forge_vtt_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA forge_vtt_private TO authenticated;

CREATE TABLE public.forge_vtt_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  active_scene_id uuid,
  allow_player_drawing boolean NOT NULL DEFAULT false,
  settings jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(settings)='object'),
  schema_version integer NOT NULL DEFAULT 2 CHECK (schema_version > 0),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX forge_vtt_campaigns_owner ON public.forge_vtt_campaigns(owner_id, updated_at DESC);

CREATE TABLE public.forge_vtt_campaign_members (
  campaign_id uuid NOT NULL REFERENCES public.forge_vtt_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('dm','player','spectator')),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id,user_id)
);
CREATE INDEX forge_vtt_members_user ON public.forge_vtt_campaign_members(user_id,campaign_id);

CREATE TABLE public.forge_vtt_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.forge_vtt_campaigns(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  bucket_id text NOT NULL DEFAULT 'vtt-assets' CHECK (bucket_id='vtt-assets'),
  object_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/png','image/jpeg','image/webp','audio/mpeg','audio/ogg','audio/wav')),
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 104857600),
  width_px integer CHECK (width_px BETWEEN 1 AND 8000),
  height_px integer CHECK (height_px BETWEEN 1 AND 8000),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  label text NOT NULL DEFAULT '' CHECK (length(label)<=200),
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(campaign_id,id)
);
CREATE INDEX forge_vtt_assets_campaign ON public.forge_vtt_assets(campaign_id,created_at DESC);

CREATE TABLE public.forge_vtt_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.forge_vtt_campaigns(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  width_cells numeric NOT NULL DEFAULT 25 CHECK (width_cells > 0 AND width_cells <= 500),
  height_cells numeric NOT NULL DEFAULT 20 CHECK (height_cells > 0 AND height_cells <= 500),
  cell_px integer NOT NULL DEFAULT 64 CHECK (cell_px BETWEEN 16 AND 256),
  grid_type text NOT NULL DEFAULT 'square' CHECK (grid_type IN ('square','hex-flat','hex-pointy','none')),
  grid_offset_x numeric NOT NULL DEFAULT 0,
  grid_offset_y numeric NOT NULL DEFAULT 0,
  grid_color text NOT NULL DEFAULT '#ffffff' CHECK (grid_color ~ '^#[0-9a-fA-F]{6}$'),
  grid_opacity numeric NOT NULL DEFAULT 0.16 CHECK (grid_opacity BETWEEN 0 AND 1),
  grid_thickness numeric NOT NULL DEFAULT 1 CHECK (grid_thickness > 0 AND grid_thickness <= 8),
  distance_per_cell numeric NOT NULL DEFAULT 5 CHECK (distance_per_cell > 0),
  units text NOT NULL DEFAULT 'ft' CHECK (length(units) BETWEEN 1 AND 12),
  diagonal_rule text NOT NULL DEFAULT '5e' CHECK (diagonal_rule IN ('5e','alternating','euclidean')),
  show_grid boolean NOT NULL DEFAULT true,
  snap boolean NOT NULL DEFAULT true,
  published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  player_map_asset_id uuid,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision>0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(campaign_id,id),
  FOREIGN KEY(campaign_id,player_map_asset_id) REFERENCES public.forge_vtt_assets(campaign_id,id)
);
CREATE INDEX forge_vtt_scenes_campaign ON public.forge_vtt_scenes(campaign_id,sort_order,id);
ALTER TABLE public.forge_vtt_campaigns ADD CONSTRAINT forge_vtt_active_scene
 FOREIGN KEY(id,active_scene_id) REFERENCES public.forge_vtt_scenes(campaign_id,id)
 DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.forge_vtt_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.forge_vtt_campaigns(id) ON DELETE CASCADE,
  scene_id uuid,
  kind text NOT NULL CHECK (kind IN ('token','drawing','fog','wall','light','handout','audio','macro','journal','initiative','pin')),
  layer text NOT NULL DEFAULT 'tokens' CHECK (layer IN ('map','objects','tokens','gm','drawing','lighting','fog','campaign')),
  visibility text NOT NULL DEFAULT 'dm' CHECK (visibility IN ('dm','campaign')),
  public_data jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(public_data)='object' AND octet_length(public_data::text)<=131072),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision>0),
  field_versions jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(field_versions)='object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(campaign_id,id),
  FOREIGN KEY(campaign_id,scene_id) REFERENCES public.forge_vtt_scenes(campaign_id,id)
);
CREATE INDEX forge_vtt_entities_scene ON public.forge_vtt_entities(campaign_id,scene_id,layer,id) WHERE deleted_at IS NULL;
CREATE INDEX forge_vtt_entities_changes ON public.forge_vtt_entities(campaign_id,updated_at,id);

CREATE TABLE public.forge_vtt_tokens (
  id uuid PRIMARY KEY,
  campaign_id uuid NOT NULL,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  x numeric NOT NULL DEFAULT 0,
  y numeric NOT NULL DEFAULT 0,
  width_cells numeric NOT NULL DEFAULT 1 CHECK(width_cells BETWEEN 0.25 AND 20),
  height_cells numeric NOT NULL DEFAULT 1 CHECK(height_cells BETWEEN 0.25 AND 20),
  rotation numeric NOT NULL DEFAULT 0 CHECK(rotation>=0 AND rotation<360),
  shape text NOT NULL DEFAULT 'circle' CHECK(shape IN ('circle','square')),
  border_color text NOT NULL DEFAULT '#b4a7ff' CHECK(border_color ~ '^#[0-9a-fA-F]{6}$'),
  portrait_asset_id uuid,
  locked boolean NOT NULL DEFAULT false,
  elevation numeric NOT NULL DEFAULT 0,
  z_index integer NOT NULL DEFAULT 0,
  UNIQUE(campaign_id,id),
  FOREIGN KEY(campaign_id,id) REFERENCES public.forge_vtt_entities(campaign_id,id) ON DELETE CASCADE,
  FOREIGN KEY(campaign_id,portrait_asset_id) REFERENCES public.forge_vtt_assets(campaign_id,id)
);

CREATE TABLE public.forge_vtt_token_owners (
  campaign_id uuid NOT NULL,
  token_id uuid NOT NULL,
  user_id uuid NOT NULL,
  PRIMARY KEY(campaign_id,token_id,user_id),
  FOREIGN KEY(campaign_id,token_id) REFERENCES public.forge_vtt_tokens(campaign_id,id) ON DELETE CASCADE,
  FOREIGN KEY(campaign_id,user_id) REFERENCES public.forge_vtt_campaign_members(campaign_id,user_id) ON DELETE CASCADE
);
CREATE INDEX forge_vtt_token_owners_user ON public.forge_vtt_token_owners(user_id,campaign_id,token_id);

CREATE TABLE public.forge_vtt_private_data (
  campaign_id uuid NOT NULL REFERENCES public.forge_vtt_campaigns(id) ON DELETE CASCADE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id uuid,
  entity_id uuid,
  scope text NOT NULL CHECK(scope IN ('dm','controller')),
  data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND octet_length(data::text)<=262144),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,entity_id,scope),
  FOREIGN KEY(campaign_id,scene_id) REFERENCES public.forge_vtt_scenes(campaign_id,id),
  FOREIGN KEY(campaign_id,entity_id) REFERENCES public.forge_vtt_entities(campaign_id,id),
  CHECK(scope='dm' OR entity_id IS NOT NULL)
);
CREATE INDEX forge_vtt_private_entity ON public.forge_vtt_private_data(campaign_id,entity_id);
-- DM notes, actual monster HP/AC and secret journals use scope='dm'.
-- Controller-visible PC HP/AC/stats use scope='controller'.
-- Player-disclosed bars/conditions are generated into public_data by validated commands.

CREATE TABLE public.forge_vtt_asset_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  scene_id uuid,
  entity_id uuid,
  audience text NOT NULL DEFAULT 'dm' CHECK(audience IN ('dm','campaign')),
  FOREIGN KEY(campaign_id,asset_id) REFERENCES public.forge_vtt_assets(campaign_id,id) ON DELETE CASCADE,
  FOREIGN KEY(campaign_id,scene_id) REFERENCES public.forge_vtt_scenes(campaign_id,id) ON DELETE CASCADE,
  FOREIGN KEY(campaign_id,entity_id) REFERENCES public.forge_vtt_entities(campaign_id,id) ON DELETE CASCADE,
  CHECK(num_nonnulls(scene_id,entity_id)=1)
);
CREATE INDEX forge_vtt_asset_uses_asset ON public.forge_vtt_asset_uses(campaign_id,asset_id);

CREATE TABLE public.forge_vtt_campaign_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.forge_vtt_campaigns(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK(role IN ('player','spectator')),
  code_digest text NOT NULL UNIQUE CHECK(length(code_digest)=64),
  link_digest text NOT NULL UNIQUE CHECK(length(link_digest)=64),
  expires_at timestamptz NOT NULL,
  max_uses integer CHECK(max_uses>0),
  use_count integer NOT NULL DEFAULT 0 CHECK(use_count>=0),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX forge_vtt_invites_campaign ON public.forge_vtt_campaign_invites(campaign_id,created_at DESC);

CREATE TABLE public.forge_vtt_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.forge_vtt_campaigns(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  operation_id uuid NOT NULL,
  campaign_revision bigint NOT NULL,
  entity_ids uuid[] NOT NULL DEFAULT '{}',
  command_type text NOT NULL,
  forward_patch jsonb NOT NULL,
  inverse_patch jsonb NOT NULL,
  undo_of uuid REFERENCES public.forge_vtt_commands(id),
  schema_version integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,operation_id),
  UNIQUE(campaign_id,campaign_revision)
);
CREATE INDEX forge_vtt_commands_actor ON public.forge_vtt_commands(campaign_id,actor_id,created_at DESC);

CREATE FUNCTION forge_vtt_private.member_of(c uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND public.forge_account_active()
 AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND NOT u.is_anonymous)
 AND EXISTS(SELECT 1 FROM public.forge_vtt_campaigns g
   WHERE g.id=c AND g.deleted_at IS NULL AND
    (g.owner_id=auth.uid() OR EXISTS(SELECT 1 FROM public.forge_vtt_campaign_members m
      WHERE m.campaign_id=c AND m.user_id=auth.uid())));
$$;
CREATE FUNCTION forge_vtt_private.dm_of(c uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT forge_vtt_private.member_of(c) AND EXISTS(
  SELECT 1 FROM public.forge_vtt_campaigns g WHERE g.id=c AND
   (g.owner_id=auth.uid() OR EXISTS(SELECT 1 FROM public.forge_vtt_campaign_members m
    WHERE m.campaign_id=c AND m.user_id=auth.uid() AND m.role='dm')));
$$;
CREATE FUNCTION forge_vtt_private.scene_readable(c uuid,s uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT forge_vtt_private.member_of(c) AND EXISTS(
  SELECT 1 FROM public.forge_vtt_scenes x WHERE x.campaign_id=c AND x.id=s
   AND x.deleted_at IS NULL AND
   (forge_vtt_private.dm_of(c) OR (x.published AND EXISTS(
    SELECT 1 FROM public.forge_vtt_campaigns g WHERE g.id=c AND g.active_scene_id=s))));
$$;
CREATE FUNCTION forge_vtt_private.entity_readable(c uuid,e uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT forge_vtt_private.member_of(c) AND EXISTS(
  SELECT 1 FROM public.forge_vtt_entities x WHERE x.campaign_id=c AND x.id=e
   AND x.deleted_at IS NULL AND (x.scene_id IS NULL OR forge_vtt_private.scene_readable(c,x.scene_id))
   AND (forge_vtt_private.dm_of(c) OR (x.visibility='campaign' AND x.layer<>'gm')));
$$;
CREATE FUNCTION forge_vtt_private.controls_token(c uuid,t uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT forge_vtt_private.entity_readable(c,t) AND EXISTS(
  SELECT 1 FROM public.forge_vtt_campaign_members m
  JOIN public.forge_vtt_token_owners o ON o.campaign_id=m.campaign_id AND o.user_id=m.user_id
  WHERE m.campaign_id=c AND m.user_id=auth.uid() AND m.role='player' AND o.token_id=t);
$$;
CREATE FUNCTION forge_vtt_private.asset_readable(c uuid,a uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT forge_vtt_private.member_of(c) AND EXISTS(
  SELECT 1 FROM public.forge_vtt_assets x WHERE x.campaign_id=c AND x.id=a AND x.deleted_at IS NULL
   AND (forge_vtt_private.dm_of(c) OR EXISTS(
    SELECT 1 FROM public.forge_vtt_asset_uses u WHERE u.campaign_id=c AND u.asset_id=a
     AND u.audience='campaign' AND
      ((u.scene_id IS NOT NULL AND forge_vtt_private.scene_readable(c,u.scene_id)) OR
       (u.entity_id IS NOT NULL AND forge_vtt_private.entity_readable(c,u.entity_id))))));
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA forge_vtt_private FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION forge_vtt_private.member_of(uuid),
 forge_vtt_private.dm_of(uuid), forge_vtt_private.scene_readable(uuid,uuid),
 forge_vtt_private.entity_readable(uuid,uuid), forge_vtt_private.controls_token(uuid,uuid),
 forge_vtt_private.asset_readable(uuid,uuid) TO authenticated;


DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['campaigns','campaign_members','assets','scenes','entities','tokens','token_owners','private_data','asset_uses','campaign_invites','commands'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY','forge_vtt_'||t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated','forge_vtt_'||t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role','forge_vtt_'||t);
 END LOOP;
END $$;
GRANT SELECT ON public.forge_vtt_campaigns, public.forge_vtt_campaign_members,
 public.forge_vtt_scenes, public.forge_vtt_entities, public.forge_vtt_tokens,
 public.forge_vtt_token_owners, public.forge_vtt_private_data, public.forge_vtt_assets,
 public.forge_vtt_commands TO authenticated;

CREATE POLICY vtt_campaign_read ON public.forge_vtt_campaigns FOR SELECT TO authenticated
 USING(forge_vtt_private.member_of(id));
CREATE POLICY vtt_members_read ON public.forge_vtt_campaign_members FOR SELECT TO authenticated
 USING(forge_vtt_private.member_of(campaign_id));
CREATE POLICY vtt_scene_read ON public.forge_vtt_scenes FOR SELECT TO authenticated
 USING(forge_vtt_private.scene_readable(campaign_id,id));
CREATE POLICY vtt_entity_read ON public.forge_vtt_entities FOR SELECT TO authenticated
 USING(forge_vtt_private.entity_readable(campaign_id,id));
CREATE POLICY vtt_token_read ON public.forge_vtt_tokens FOR SELECT TO authenticated
 USING(forge_vtt_private.entity_readable(campaign_id,id));
CREATE POLICY vtt_token_owner_read ON public.forge_vtt_token_owners FOR SELECT TO authenticated
 USING(forge_vtt_private.entity_readable(campaign_id,token_id));
CREATE POLICY vtt_asset_read ON public.forge_vtt_assets FOR SELECT TO authenticated
 USING(forge_vtt_private.asset_readable(campaign_id,id));
CREATE POLICY vtt_private_read ON public.forge_vtt_private_data FOR SELECT TO authenticated
 USING(forge_vtt_private.member_of(campaign_id) AND
  (forge_vtt_private.dm_of(campaign_id) OR
   (scope='controller' AND forge_vtt_private.controls_token(campaign_id,entity_id))));
CREATE POLICY vtt_command_read ON public.forge_vtt_commands FOR SELECT TO authenticated
 USING(forge_vtt_private.dm_of(campaign_id));



CREATE TABLE forge_vtt_private.invite_attempts (
 key_hash text PRIMARY KEY CHECK(length(key_hash)=64),
 scope text NOT NULL CHECK(scope IN ('user','ip','global')),
 window_start timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 blocked_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vtt_invite_attempts_expiry ON forge_vtt_private.invite_attempts(updated_at);
CREATE TABLE forge_vtt_private.upload_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 campaign_id uuid NOT NULL REFERENCES public.forge_vtt_campaigns(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 asset_id uuid NOT NULL,
 operation_id uuid NOT NULL,
 reserved_bytes bigint NOT NULL CHECK(reserved_bytes>0),
 object_path text NOT NULL UNIQUE,
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','uploaded','finalized','failed')),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(campaign_id,operation_id)
);
CREATE INDEX vtt_upload_reservation_user ON forge_vtt_private.upload_reservations(user_id,state,expires_at);
CREATE INDEX vtt_upload_reservation_campaign ON forge_vtt_private.upload_reservations(campaign_id,state,expires_at);
ALTER TABLE forge_vtt_private.invite_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE forge_vtt_private.upload_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON forge_vtt_private.invite_attempts, forge_vtt_private.upload_reservations FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA forge_vtt_private TO service_role;
GRANT ALL ON forge_vtt_private.invite_attempts, forge_vtt_private.upload_reservations TO service_role;


CREATE TABLE forge_vtt_private.secrets(name text PRIMARY KEY,value text NOT NULL);
INSERT INTO forge_vtt_private.secrets VALUES('invite_pepper',encode(extensions.gen_random_bytes(32),'hex'));
ALTER TABLE forge_vtt_private.secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON forge_vtt_private.secrets FROM PUBLIC,anon,authenticated;
GRANT ALL ON forge_vtt_private.secrets TO service_role;

-- Only current caller helpers are exposed to RLS. Arbitrary-user helpers are private.
CREATE FUNCTION forge_vtt_private.regular_user(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=u AND NOT is_anonymous)
 AND NOT EXISTS(SELECT 1 FROM public.forge_deleting_accounts WHERE user_id=u);
$$;
CREATE FUNCTION forge_vtt_private.user_role(c uuid,u uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN g.owner_id=u THEN 'dm' ELSE m.role END
 FROM public.forge_vtt_campaigns g LEFT JOIN public.forge_vtt_campaign_members m ON m.campaign_id=g.id AND m.user_id=u
 WHERE g.id=c AND g.deleted_at IS NULL AND forge_vtt_private.regular_user(u);
$$;
CREATE FUNCTION forge_vtt_private.allow_keys(d jsonb,allowed text[]) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_typeof(d)='object' AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(d) k WHERE NOT k=ANY(allowed));
$$;
CREATE FUNCTION forge_vtt_private.number_ok(d jsonb,k text,lo numeric,hi numeric) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN NOT d ? k THEN true WHEN jsonb_typeof(d->k)='number' THEN (d->>k)::numeric BETWEEN lo AND hi ELSE false END;
$$;
CREATE FUNCTION forge_vtt_private.snapshot(c uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.forge_vtt_campaigns; role_name text; result jsonb;
BEGIN
 role_name:=forge_vtt_private.user_role(c,auth.uid());
 IF role_name IS NULL THEN RAISE EXCEPTION 'Campaign unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO g FROM public.forge_vtt_campaigns WHERE id=c;
 SELECT jsonb_build_object('id',g.id,'name',g.name,'activeSceneId',g.active_scene_id,
  '_cloud',jsonb_build_object('id',g.id,'role',role_name,'ownerId',g.owner_id,'revision',g.revision),
  'members',coalesce((SELECT jsonb_agg(jsonb_build_object('userId',m.user_id,'name',m.display_name,'role',m.role) ORDER BY m.joined_at) FROM public.forge_vtt_campaign_members m WHERE m.campaign_id=c),'[]'::jsonb),
  'scenes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'width',s.width_cells*s.cell_px,'height',s.height_cells*s.cell_px,'grid',s.cell_px,
   'showGrid',s.show_grid,'snap',s.snap,'published',s.published,'_revision',s.revision,'_mapAssetId',s.player_map_asset_id,'map','',
   'tokens',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'x',t.x,'y',t.y,'size',t.width_cells,'rotation',t.rotation,'color',t.border_color,
    'image','','_imageAssetId',t.portrait_asset_id,'hp',CASE WHEN role_name='dm' OR forge_vtt_private.controls_token(c,t.id) THEN (p.data->>'hp')::integer ELSE NULL END,
    'maxHp',CASE WHEN role_name='dm' OR forge_vtt_private.controls_token(c,t.id) THEN (p.data->>'maxHp')::integer ELSE NULL END,
    'hidden',e.visibility='dm','locked',t.locked,'_revision',e.revision,'_canEdit',role_name='dm' OR (NOT t.locked AND forge_vtt_private.controls_token(c,t.id)),
    'ownerIds',coalesce((SELECT jsonb_agg(o.user_id) FROM public.forge_vtt_token_owners o WHERE o.campaign_id=c AND o.token_id=t.id),'[]'::jsonb)) ORDER BY t.z_index,t.id)
    FROM public.forge_vtt_tokens t JOIN public.forge_vtt_entities e ON e.campaign_id=t.campaign_id AND e.id=t.id
    LEFT JOIN public.forge_vtt_private_data p ON p.campaign_id=t.campaign_id AND p.entity_id=t.id AND p.scope='controller'
    WHERE t.campaign_id=c AND e.scene_id=s.id AND forge_vtt_private.entity_readable(c,t.id)),'[]'::jsonb)) ORDER BY s.sort_order,s.id)
   FROM public.forge_vtt_scenes s WHERE s.campaign_id=c AND forge_vtt_private.scene_readable(c,s.id)),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;

CREATE FUNCTION forge_vtt_private.apply_changes(c uuid,op uuid,changes jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
   IF r<>'dm' AND (actual=0 OR ch->>'op'='delete' OR t.locked OR NOT forge_vtt_private.controls_token(c,target)) THEN RAISE EXCEPTION 'Token permission denied' USING ERRCODE='42501'; END IF;
   IF ch->>'op'='delete' THEN UPDATE public.forge_vtt_entities SET deleted_at=now(),revision=revision+1,updated_at=now() WHERE id=target AND campaign_id=c;
   ELSE
    IF NOT forge_vtt_private.allow_keys(d,CASE WHEN r='dm' THEN ARRAY['sceneId','name','x','y','size','rotation','color','hp','maxHp','imageAssetId','ownerIds','hidden','locked','zIndex'] ELSE ARRAY['name','x','y','size','rotation','color','hp','maxHp','imageAssetId'] END) THEN RAISE EXCEPTION 'Protected token fields' USING ERRCODE='42501'; END IF;
    IF NOT forge_vtt_private.number_ok(d,'x',0,128000) OR NOT forge_vtt_private.number_ok(d,'y',0,128000) OR NOT forge_vtt_private.number_ok(d,'size',.25,20) OR NOT forge_vtt_private.number_ok(d,'rotation',0,359.999) OR NOT forge_vtt_private.number_ok(d,'hp',0,100000) OR NOT forge_vtt_private.number_ok(d,'maxHp',1,100000) OR NOT forge_vtt_private.number_ok(d,'zIndex',-1000000,1000000) THEN RAISE EXCEPTION 'Invalid token values'; END IF;
    IF d ? 'name' AND (jsonb_typeof(d->'name')<>'string' OR length(d->>'name') NOT BETWEEN 1 AND 120) THEN RAISE EXCEPTION 'Invalid token name'; END IF;
    IF d ? 'color' AND (d->>'color') !~ '^#[0-9a-fA-F]{6}$' THEN RAISE EXCEPTION 'Invalid token color'; END IF;
    FOREACH kind IN ARRAY ARRAY['hidden','locked'] LOOP IF d ? kind AND jsonb_typeof(d->kind)<>'boolean' THEN RAISE EXCEPTION 'Invalid token flag'; END IF; END LOOP;
    SELECT * INTO s FROM public.forge_vtt_scenes WHERE campaign_id=c AND id=coalesce((d->>'sceneId')::uuid,e.scene_id) AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid target scene'; END IF;
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

CREATE FUNCTION forge_vtt_private.api(action text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=auth.uid(); c uuid; target uuid; r text; op uuid; result jsonb; current_owner uuid; role_name text; reservation uuid; bytes bigint; path text; count_rows integer;
BEGIN
 IF NOT forge_vtt_private.regular_user(u) THEN RAISE EXCEPTION 'Sign in with a regular account' USING ERRCODE='42501'; END IF;
 IF octet_length(p::text)>1100000 OR jsonb_typeof(p)<>'object' THEN RAISE EXCEPTION 'Invalid request'; END IF;
 IF action='list' THEN
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'role',forge_vtt_private.user_role(g.id,u),'ownerId',g.owner_id,'revision',g.revision,'updatedAt',g.updated_at) ORDER BY g.updated_at DESC) FROM public.forge_vtt_campaigns g WHERE forge_vtt_private.member_of(g.id)),'[]'::jsonb);
 END IF;
 c:=(p->>'campaignId')::uuid;
 IF action='create' THEN
  op:=(p->>'operationId')::uuid;
  IF c IS NULL OR op IS NULL OR length(p->>'name') NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid campaign'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('vtt-owner:'||u::text,0));
  IF EXISTS(SELECT 1 FROM public.forge_vtt_campaigns WHERE id=c AND owner_id=u) THEN RETURN forge_vtt_private.snapshot(c); END IF;
  IF (SELECT count(*) FROM public.forge_vtt_campaigns WHERE owner_id=u)>=30 THEN RAISE EXCEPTION 'Campaign limit reached'; END IF;
  INSERT INTO public.forge_vtt_campaigns(id,owner_id,name) VALUES(c,u,p->>'name');
  INSERT INTO public.forge_vtt_campaign_members(campaign_id,user_id,role,display_name) VALUES(c,u,'dm',left(coalesce(nullif(p->>'displayName',''),'Dungeon Master'),80));
  RETURN forge_vtt_private.snapshot(c);
 END IF;
 IF action='list_trash' THEN RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'deletedAt',deleted_at)) FROM public.forge_vtt_campaigns WHERE owner_id=u AND deleted_at>now()-interval '30 days'),'[]'); END IF;
 IF action='restore' THEN UPDATE public.forge_vtt_campaigns SET deleted_at=NULL,revision=revision+1 WHERE id=c AND owner_id=u AND deleted_at>now()-interval '30 days';IF NOT FOUND THEN RAISE EXCEPTION 'Campaign cannot be restored'; END IF;RETURN forge_vtt_private.snapshot(c);END IF;
 r:=forge_vtt_private.user_role(c,u);
 IF r IS NULL THEN RAISE EXCEPTION 'Campaign unavailable' USING ERRCODE='42501'; END IF;
 IF action='snapshot' THEN RETURN forge_vtt_private.snapshot(c); END IF;
 IF action='apply' THEN RETURN forge_vtt_private.apply_changes(c,(p->>'operationId')::uuid,p->'changes'); END IF;
 SELECT owner_id INTO current_owner FROM public.forge_vtt_campaigns WHERE id=c FOR UPDATE;
 IF action IN ('role','remove','transfer','delete','leave') THEN
  target:=(p->>'userId')::uuid;
  IF action='leave' THEN target:=u; END IF;
  IF action='delete' THEN
   IF current_owner<>u THEN RAISE EXCEPTION 'Only the owner can delete this campaign' USING ERRCODE='42501'; END IF;
   UPDATE public.forge_vtt_campaigns SET deleted_at=now(),revision=revision+1 WHERE id=c; RETURN '{"status":"deleted"}';
  END IF;
  IF target IS NULL OR NOT EXISTS(SELECT 1 FROM public.forge_vtt_campaign_members WHERE campaign_id=c AND user_id=target) THEN RAISE EXCEPTION 'Member unavailable'; END IF;
  SELECT role INTO role_name FROM public.forge_vtt_campaign_members WHERE campaign_id=c AND user_id=target;
  IF action='transfer' THEN
   IF current_owner<>u OR NOT forge_vtt_private.regular_user(target) THEN RAISE EXCEPTION 'Ownership transfer denied' USING ERRCODE='42501'; END IF;
   UPDATE public.forge_vtt_campaigns SET owner_id=target,revision=revision+1 WHERE id=c;
   UPDATE public.forge_vtt_campaign_members SET role='dm' WHERE campaign_id=c AND user_id=target;
  ELSIF action='role' THEN
   IF current_owner<>u OR target=current_owner OR p->>'role' NOT IN ('dm','player','spectator') THEN RAISE EXCEPTION 'Only the owner can change roles' USING ERRCODE='42501'; END IF;
   UPDATE public.forge_vtt_campaign_members SET role=p->>'role' WHERE campaign_id=c AND user_id=target;
   IF p->>'role'<>'player' THEN DELETE FROM public.forge_vtt_token_owners WHERE campaign_id=c AND user_id=target; END IF;
  ELSE
   IF target=current_owner OR (target<>u AND (r<>'dm' OR (role_name='dm' AND current_owner<>u))) THEN RAISE EXCEPTION 'Member removal denied' USING ERRCODE='42501'; END IF;
   DELETE FROM public.forge_vtt_campaign_members WHERE campaign_id=c AND user_id=target;
   IF target=u THEN RETURN '{"status":"left"}'; END IF;
  END IF;
  UPDATE public.forge_vtt_campaigns SET revision=revision+1,updated_at=now() WHERE id=c;
  RETURN forge_vtt_private.snapshot(c);
 END IF;
 IF action='reserve_upload' THEN
  IF r='spectator' THEN RAISE EXCEPTION 'Upload denied' USING ERRCODE='42501'; END IF;
  IF r<>'dm' AND NOT forge_vtt_private.controls_token(c,(p->>'tokenId')::uuid) THEN RAISE EXCEPTION 'Upload denied' USING ERRCODE='42501'; END IF;
  bytes:=(p->>'bytes')::bigint; op:=(p->>'operationId')::uuid;
  IF bytes IS NULL OR bytes NOT BETWEEN 1 AND 20971520 OR (r<>'dm' AND bytes>2097152) THEN RAISE EXCEPTION 'Image too large'; END IF;
  IF p->>'mime' NOT IN ('image/png','image/jpeg','image/webp') THEN RAISE EXCEPTION 'Unsupported image'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('vtt-storage:'||current_owner::text,0));
  IF (SELECT coalesce(sum(a.byte_size),0) FROM public.forge_vtt_assets a WHERE a.campaign_id=c)+(SELECT coalesce(sum(reserved_bytes),0) FROM forge_vtt_private.upload_reservations WHERE campaign_id=c AND state IN ('reserved','uploaded'))+bytes>262144000 THEN RAISE EXCEPTION 'Campaign storage quota reached'; END IF;
  IF (SELECT coalesce(sum(a.byte_size),0) FROM public.forge_vtt_assets a JOIN public.forge_vtt_campaigns g ON g.id=a.campaign_id WHERE g.owner_id=current_owner)+(SELECT coalesce(sum(q.reserved_bytes),0) FROM forge_vtt_private.upload_reservations q JOIN public.forge_vtt_campaigns g ON g.id=q.campaign_id WHERE g.owner_id=current_owner AND q.state IN ('reserved','uploaded'))+bytes>524288000 THEN RAISE EXCEPTION 'Account storage quota reached'; END IF;
  IF (SELECT count(*) FROM forge_vtt_private.upload_reservations WHERE user_id=u AND state IN ('reserved','uploaded'))>=20 THEN RAISE EXCEPTION 'Too many pending uploads'; END IF;
  reservation:=gen_random_uuid(); target:=gen_random_uuid();path:=c::text||'/'||target::text||'/image';
  INSERT INTO forge_vtt_private.upload_reservations(id,campaign_id,user_id,asset_id,operation_id,reserved_bytes,object_path,expires_at) VALUES(reservation,c,u,target,op,bytes,path,now()+interval '15 minutes');
  RETURN jsonb_build_object('reservationId',reservation,'assetId',target,'path',path);
 END IF;
 RAISE EXCEPTION 'Unknown VTT action';
END $$;
CREATE FUNCTION public.forge_vtt_api(p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT forge_vtt_private.api(p_action,p_payload); $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA forge_vtt_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION forge_vtt_private.member_of(uuid),forge_vtt_private.dm_of(uuid),forge_vtt_private.scene_readable(uuid,uuid),forge_vtt_private.entity_readable(uuid,uuid),forge_vtt_private.controls_token(uuid,uuid),forge_vtt_private.asset_readable(uuid,uuid),forge_vtt_private.api(text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.forge_vtt_api(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.forge_vtt_api(text,jsonb) TO authenticated;

CREATE FUNCTION public.forge_vtt_finalize_asset(p_user uuid,p_reservation uuid,p_mime text,p_sha text,p_width integer,p_height integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q forge_vtt_private.upload_reservations;
BEGIN
 SELECT * INTO q FROM forge_vtt_private.upload_reservations WHERE id=p_reservation FOR UPDATE;
 IF NOT FOUND OR q.user_id<>p_user OR q.expires_at<now() OR forge_vtt_private.user_role(q.campaign_id,p_user) IS NULL OR forge_vtt_private.user_role(q.campaign_id,p_user) NOT IN ('dm','player') OR NOT forge_vtt_private.regular_user(p_user) THEN RAISE EXCEPTION 'Upload unavailable'; END IF;
 IF q.state='finalized' THEN RETURN q.asset_id; END IF;
 IF p_width NOT BETWEEN 1 AND 8000 OR p_height NOT BETWEEN 1 AND 8000 OR p_mime NOT IN ('image/png','image/jpeg','image/webp') THEN RAISE EXCEPTION 'Invalid image'; END IF;
 INSERT INTO public.forge_vtt_assets(id,campaign_id,uploaded_by,object_path,mime_type,byte_size,width_px,height_px,sha256) VALUES(q.asset_id,q.campaign_id,p_user,q.object_path,p_mime,q.reserved_bytes,p_width,p_height,p_sha);
 UPDATE forge_vtt_private.upload_reservations SET state='finalized' WHERE id=q.id;
 RETURN q.asset_id;
END $$;
REVOKE ALL ON FUNCTION public.forge_vtt_finalize_asset(uuid,uuid,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.forge_vtt_finalize_asset(uuid,uuid,text,text,integer,integer) TO service_role;

CREATE FUNCTION public.forge_vtt_invite_gateway(p_user uuid,p_ip_hash text,p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid:=p_user; c uuid:=(p_payload->>'campaignId')::uuid; r text; g public.forge_vtt_campaigns; inv public.forge_vtt_campaign_invites; material text; code text; link text; pepper text; k text; limiter_key text; limit_count integer; attempts integer; b bytea; i integer;
BEGIN
 IF NOT forge_vtt_private.regular_user(u) OR octet_length(p_payload::text)>4096 THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 -- Persistent fixed windows, shared by every function instance. IP supplied only by trusted Edge gateway.
 FOREACH k IN ARRAY ARRAY['user:'||u::text,'ip:'||coalesce(p_ip_hash,''),'global'] LOOP
  limit_count:=CASE WHEN k='global' THEN 500 WHEN k LIKE 'ip:%' THEN 60 ELSE 20 END;
  limiter_key:=encode(extensions.digest(k,'sha256'),'hex');
  INSERT INTO forge_vtt_private.invite_attempts(key_hash,scope,window_start,attempts) VALUES(limiter_key,CASE WHEN k='global' THEN 'global' WHEN k LIKE 'ip:%' THEN 'ip' ELSE 'user' END,date_trunc('minute',now()),1)
  ON CONFLICT(key_hash) DO UPDATE SET window_start=date_trunc('minute',now()),attempts=CASE WHEN invite_attempts.window_start=date_trunc('minute',now()) THEN invite_attempts.attempts+1 ELSE 1 END,updated_at=now() RETURNING invite_attempts.attempts INTO attempts;
  IF attempts>limit_count THEN RETURN '{"error":"Too many attempts. Try again shortly."}'; END IF;
 END LOOP;
 SELECT value INTO pepper FROM forge_vtt_private.secrets WHERE name='invite_pepper';
 IF p_action='redeem' THEN
  material:=upper(regexp_replace(coalesce(p_payload->>'code',''),'[^a-zA-Z0-9]','','g'));
  SELECT * INTO inv FROM public.forge_vtt_campaign_invites WHERE (length(material)=6 AND code_digest=encode(extensions.hmac(material,pepper,'sha256'),'hex')) OR (length(p_payload->>'token')=64 AND link_digest=encode(extensions.digest(p_payload->>'token','sha256'),'hex')) FOR UPDATE;
  IF NOT FOUND OR inv.revoked_at IS NOT NULL OR inv.expires_at<=now() OR (inv.max_uses IS NOT NULL AND inv.use_count>=inv.max_uses) THEN RETURN '{"error":"Invite is invalid or unavailable."}'; END IF;
  SELECT * INTO g FROM public.forge_vtt_campaigns WHERE id=inv.campaign_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN '{"error":"Invite is invalid or unavailable."}'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.forge_vtt_campaign_members WHERE campaign_id=g.id AND user_id=u) THEN
   IF (SELECT count(*) FROM public.forge_vtt_campaign_members WHERE campaign_id=g.id)>=50 THEN RETURN '{"error":"Campaign member limit reached."}'; END IF;
   INSERT INTO public.forge_vtt_campaign_members(campaign_id,user_id,role,display_name) VALUES(g.id,u,inv.role,left(coalesce(nullif(p_payload->>'name',''),'Adventurer'),80));
   UPDATE public.forge_vtt_campaign_invites SET use_count=use_count+1 WHERE id=inv.id;
  END IF;
  RETURN jsonb_build_object('campaignId',g.id);
 END IF;
 r:=forge_vtt_private.user_role(c,u); IF r IS DISTINCT FROM 'dm' THEN RAISE EXCEPTION 'DM permission required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.forge_vtt_campaigns WHERE id=c FOR UPDATE;
 IF p_action='list' THEN RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'role',role,'expiresAt',expires_at,'uses',use_count,'revoked',revoked_at IS NOT NULL) ORDER BY created_at DESC) FROM public.forge_vtt_campaign_invites WHERE campaign_id=c),'[]'); END IF;
 IF p_action='revoke' THEN UPDATE public.forge_vtt_campaign_invites SET revoked_at=coalesce(revoked_at,now()) WHERE campaign_id=c AND id=(p_payload->>'inviteId')::uuid; RETURN '{"status":"revoked"}'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('create','regenerate') OR p_payload->>'role' NOT IN ('player','spectator') THEN RAISE EXCEPTION 'Invalid invite request'; END IF;
 IF p_action='regenerate' THEN UPDATE public.forge_vtt_campaign_invites SET revoked_at=coalesce(revoked_at,now()) WHERE campaign_id=c; END IF;
 IF (SELECT count(*) FROM public.forge_vtt_campaign_invites WHERE campaign_id=c AND revoked_at IS NULL AND expires_at>now())>=20 THEN RAISE EXCEPTION 'Revoke unused invites first'; END IF;
 FOR i IN 1..20 LOOP
  code:='';b:=extensions.gen_random_bytes(6);
  FOR attempts IN 0..5 LOOP code:=code||substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',get_byte(b,attempts)%32+1,1); END LOOP;
  EXIT WHEN NOT EXISTS(SELECT 1 FROM public.forge_vtt_campaign_invites WHERE code_digest=encode(extensions.hmac(code,pepper,'sha256'),'hex'));
 END LOOP;
 link:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO public.forge_vtt_campaign_invites(campaign_id,created_by,role,code_digest,link_digest,expires_at,max_uses) VALUES(c,u,p_payload->>'role',encode(extensions.hmac(code,pepper,'sha256'),'hex'),encode(extensions.digest(link,'sha256'),'hex'),now()+interval '7 days',50) RETURNING * INTO inv;
 RETURN jsonb_build_object('id',inv.id,'code',code,'token',link,'expiresAt',inv.expires_at,'role',inv.role);
END $$;
REVOKE ALL ON FUNCTION public.forge_vtt_invite_gateway(uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.forge_vtt_invite_gateway(uuid,text,text,jsonb) TO service_role;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('vtt-assets','vtt-assets',false,20971520,ARRAY['image/png','image/jpeg','image/webp']);
CREATE POLICY vtt_asset_bytes_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='vtt-assets' AND EXISTS(SELECT 1 FROM public.forge_vtt_assets a WHERE a.object_path=name AND a.bucket_id='vtt-assets' AND forge_vtt_private.asset_readable(a.campaign_id,a.id)));
-- No browser upload/delete/upsert policy: validated Edge uploads and cleanup own these operations.
CREATE FUNCTION public.forge_vtt_maintenance(p_token text,p_action text,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.forge_maintenance_allowed(p_token) THEN RAISE EXCEPTION 'Maintenance denied' USING ERRCODE='42501'; END IF;
 IF p_action='list' THEN RETURN jsonb_build_object('reservations',coalesce((SELECT jsonb_agg(q) FROM (SELECT id,object_path FROM forge_vtt_private.upload_reservations WHERE state<>'finalized' AND expires_at<now() ORDER BY expires_at LIMIT 100) q),'[]'::jsonb),'campaigns',coalesce((SELECT jsonb_agg(g) FROM (SELECT id FROM public.forge_vtt_campaigns WHERE deleted_at<now()-interval '30 days' ORDER BY deleted_at LIMIT 10) g),'[]'::jsonb));
 ELSIF p_action='reservation_removed' THEN DELETE FROM forge_vtt_private.upload_reservations WHERE id=(p_payload->>'id')::uuid AND state<>'finalized' AND expires_at<now();
 ELSIF p_action='campaign_removed' THEN DELETE FROM public.forge_vtt_campaigns WHERE id=(p_payload->>'id')::uuid AND deleted_at<now()-interval '30 days';
 ELSE RAISE EXCEPTION 'Unknown maintenance action'; END IF;
 RETURN '{"ok":true}';
END $$;
REVOKE ALL ON FUNCTION public.forge_vtt_maintenance(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.forge_vtt_maintenance(text,text,jsonb) TO service_role;
COMMIT;
