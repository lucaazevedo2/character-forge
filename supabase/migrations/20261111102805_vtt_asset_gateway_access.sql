-- Private VTT bytes use the no-store gateway, which rechecks current-user metadata RLS on every request.
BEGIN;
DROP POLICY IF EXISTS vtt_asset_bytes_read ON storage.objects;
COMMIT;
