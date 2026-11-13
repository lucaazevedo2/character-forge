-- Check cross-resource media references after every campaign cascade has finished.
-- Direct deletion of media still fails if any resource keeps a reference.
BEGIN;
ALTER TABLE forge_vtt_private.resource_assets
  ALTER CONSTRAINT resource_assets_campaign_id_asset_id_fkey
  DEFERRABLE INITIALLY DEFERRED;
COMMIT;
