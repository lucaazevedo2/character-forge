BEGIN;
-- Stream invalidation counters only. Game contents always come from the checked snapshot API.
CREATE TABLE public.forge_vtt_live_events (
 campaign_id uuid PRIMARY KEY REFERENCES public.forge_vtt_campaigns(id) ON DELETE CASCADE,
 sequence bigint NOT NULL DEFAULT 1,
 changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.forge_vtt_live_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forge_vtt_live_events FROM anon,authenticated;
GRANT SELECT ON public.forge_vtt_live_events TO authenticated;
CREATE POLICY vtt_live_member_read ON public.forge_vtt_live_events FOR SELECT TO authenticated
 USING(forge_vtt_private.member_of(campaign_id));
CREATE FUNCTION forge_vtt_private.notify_live() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid;
BEGIN
 IF TG_TABLE_NAME='forge_vtt_campaigns' THEN c:=NEW.id;
 ELSIF TG_OP='DELETE' THEN c:=OLD.campaign_id; ELSE c:=NEW.campaign_id; END IF;
 IF EXISTS(SELECT 1 FROM public.forge_vtt_campaigns WHERE id=c) THEN
  INSERT INTO public.forge_vtt_live_events(campaign_id) VALUES(c)
  ON CONFLICT(campaign_id) DO UPDATE SET sequence=public.forge_vtt_live_events.sequence+1,changed_at=clock_timestamp();
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION forge_vtt_private.notify_live() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER vtt_campaign_live AFTER INSERT OR UPDATE ON public.forge_vtt_campaigns FOR EACH ROW EXECUTE FUNCTION forge_vtt_private.notify_live();
CREATE TRIGGER vtt_members_live AFTER INSERT OR UPDATE OR DELETE ON public.forge_vtt_campaign_members FOR EACH ROW EXECUTE FUNCTION forge_vtt_private.notify_live();
INSERT INTO public.forge_vtt_live_events(campaign_id) SELECT id FROM public.forge_vtt_campaigns WHERE deleted_at IS NULL;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN CREATE PUBLICATION supabase_realtime; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='forge_vtt_live_events') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.forge_vtt_live_events;
 END IF;
END $$;
COMMIT;
