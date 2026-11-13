# Phase 7 — Campaign resources

Release: 2.0.0-alpha.9, ChatGPT Sites experimental beta only.

Open **Campaign tools** in the map toolbar. Players see **Journal & audio**, with only authorized resources and their own preferences. Assets, sharing, pins and playlists are DM controls.

## Features

- Assets: image/audio search, folders, tags, lazy thumbnails, map and portrait reuse, drag-to-map tokens and usage totals. Upload PNG/JPEG/WebP or MP3/Ogg/WAV, at most 20 MB per file. Campaign storage is 250 MB; campaign-owner and uploader limits are 500 MB. Trashed files count toward usage.
- Documents: escaped Markdown, private drafts, everyone/selected-member sharing, collaborative journals with optimistic revisions, token links and map pins. Pins inherit linked-document access checks. Restore deleted records/assets within 30 days; no permanent-delete UI is exposed.
- Audio: persistent campaign playlists, shared play clock, pause/stop/next, loop, crossfade, SFX and personal audio enable/volume/mute. Browsers require an initial user gesture. Direct HTTPS media must be playable by the listener's browser; streaming service page URLs are unsupported.
- Preferences: account-scoped appearance, scale, default zoom, animation, sound and token snapping. Guest settings stay on the device.
- Backups include authorized resources and embedded media. IDs and token/scene/document references are remapped on import. Uploading a local copy carries resources to the new campaign privately. The original local campaign remains intact if a transfer fails.

## Data and access

Migration `20261112215139_vtt_resources_audio_preferences.sql` adds public resource/preferences tables with RLS, a private resource-to-asset relation, checked resource commands and service-only media finalization. Resource events reuse the existing play invalidation channel, fetching fresh permission-filtered snapshots with a seven-second polling fallback. Client drafts survive incoming resource updates until save/cancel.

`vtt-media` verifies the caller with Auth.getUser, reserves quota through the user's command API, detects file container signatures, bounds the request stream, uploads with the backend service client and finalizes metadata. GET evaluates current-user asset RLS on every request, disables HTTP caching and streams bytes. Direct browser bucket reads remain disabled. Previously received bytes cannot be retracted from a person's device; the client revokes its cached URLs when authorization disappears.

The source contains no new secret key. Existing character/party workflows and stable hosting are unchanged.

## Validation

Run from the checkout:

```sh
node tests/vtt-resources.cjs
node tests/vtt-resource-import.cjs
node tests/vtt-media-edge.cjs
node tests/vtt-db-runner.cjs supabase/migrations/20261111091451_vtt_phase1_accounts.sql ./vtt-phase7-db.cjs
```

The database runner uses an ephemeral WASM Postgres and pgcrypto test stubs. Hosted `tests/vtt-phase7-remote.sql` runs with real Postgres in a rolled-back transaction and verifies audio finalization, private/selected/revoked resources and finalization privileges. No synthetic identity persists.

Local desktop and 390px iframe browser checks passed handout creation/formatting, map pin creation and navigation, and audio panel scrolling without horizontal overflow. Model/gateway and existing save/lighting/selection/sidebar/combat checks passed. Security advisors report the intentional checked SECURITY DEFINER APIs and private deny-all tables; authorization is covered by the role tests.

Automatic approval review rejected creation of persistent temporary hosted accounts. Real authenticated end-to-end HTTP upload/download and multi-device audible playback were therefore not tested in this release. Physical iPhone testing remains outstanding. No existing user account or campaign was used for QA.
