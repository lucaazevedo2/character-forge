Release 0.23.0: the stable and GitHub application origins are being configured for sign-in. The delete-account function origin update is prepared in source but its production deployment was blocked by automatic approval review, pending explicit approval. Do not retry that deployment without approval.

# Character Forge Google login and cloud saves — setup

Status as of November 1, 2026: connected to Supabase project `vrjwaejlqupmkqrhmzra` (character-forge). Private tables and portrait bucket deployed; delete-account and purge-trash functions active; daily Trash cleanup scheduled for 08:17 UTC. Live PostgreSQL owner-save, conflict and cross-account isolation checks passed using rolled-back synthetic accounts. Google provider is enabled and its authorize endpoint redirects successfully to accounts.google.com with the correct Supabase callback. Frontend cloud saves are enabled on Sites beta; first real-account OAuth completion and cross-device portrait checks remain pending. Guest characters continue to work.

## Connect the service

1. Create a Supabase project (Free is sufficient for initial testing). Run
   `supabase/schema.sql` once in its SQL editor. Re-running requires removing the
   existing named policies first; do not drop data tables.
2. In Google Cloud create an external OAuth web client for Character Forge.
   Request only `openid`, `email`, `profile`. Use the exact authorized redirect
   URI Supabase shows for the Google provider, ending `/auth/v1/callback`.
   Put the Google client ID and secret in Supabase Auth's Google settings only.
   Publish the consent configuration as appropriate; add homepage, support contact
   and an accurate privacy notice. Do not request Gmail/Drive permissions.
3. In Supabase Auth URL Configuration set Site URL to
   `https://lucas-character-forge.lucaazevedo.chatgpt.site/`. Allow that exact
   redirect URL and the exact development origin used for testing. Add
   `https://characterforge5e.com/` only when separately deploying there. Do not
   allow arbitrary preview wildcards or add unneeded domains.
4. Deploy functions with the Supabase CLI from this checkout:
   `supabase functions deploy delete-account`
   `supabase functions deploy purge-trash`
   Set `FORGE_ALLOWED_ORIGINS` to the comma-separated exact site origins and
   `FORGE_MAINTENANCE_SECRET` to a strong random secret using Supabase secrets.
   The functions' service-role credential is server-side only. Never put it in
   frontend JS, Git, build arguments or the Sites manifest.
5. Schedule a daily POST to the purge-trash function using Supabase Cron/pg_net
   and a secret stored in Supabase Vault; send the maintenance secret as Bearer
   authorization. Process 100 expired characters per call; increase frequency
   if needed. Use the Storage API for file removal. Do not SQL-delete storage
   object metadata. Recovery expires at 30 days even if the purge job is delayed.
6. Fill `dist/cloud-config.js` with the project's HTTPS Supabase URL and public
   publishable key (legacy anon key is also supported). Do not enable it until
   functions, scheduled maintenance, RLS and the tests below pass. The Google
   secret and service_role key must NEVER go here.
7. Enable the config and publish Sites beta. Stable Cloudflare and GitHub require
   their own publication authorization. No new paid service is required just
   to implement these changes.

## Storage and synchronization

- Guests use the original browser keys. Signing in starts a separate account
  workspace and asks which guest characters to import; nothing auto-imports.
- Signed-in browser caches and recovery snapshots are namespaced by account and
  tab. Immediate local saves are followed by cloud writes after a two-second pause.
  Refresh preserves the tab's pending edits. Browser focus/online retries sync;
  Sync now is also available. A persistent auth session uses Supabase's PKCE SDK.
- Each row contains owner, local import ID, name, timestamp, revision, deleted_at
  and a versioned JSON envelope. It includes the current homebrew library so the
  character can load on another device; built-in catalog artwork stays hosted
  with the site. Conflicting homebrew definitions with the same ID preserve the
  workspace's current definition; rename IDs when distributing alternate content.
- Cloud writes go through an atomic RPC, with an account lock, ownership checks,
  expected revision and a 2 MiB JSON ceiling. Direct client writes are denied;
  owner-only RLS applies to reads. There is a 200-row/account limit including Trash.
- Portraits stay as portable compressed data URIs in local saves and JSON exports.
  Cloud payloads store a private Storage path instead. Authenticated download
  restores the image for display/export. Uploads have a 512 KiB limit, safe image
  MIME allowlist and account-scoped content-addressed paths. Repeated identical
  uploads reuse the path. Changed portraits remain until character purge/account
  deletion; monitor storage and add unreferenced-file cleanup if churn is high.
- Offline edits stay pending until a successful sync. A session expiration hides
  the account workspace but retains its namespaced recovery data for re-login.
  Explicit sign-out clears this account's local caches/recovery and returns to
  guests; unsynced edits trigger an export/sync warning before clearing.
- A conflicting revision is never silently overwritten. Choose Keep mine, Keep
  theirs, Save mine as a copy, or export the local copy. Keep mine still checks
  the new revision. A permanently purged character can only be saved as a copy.
- Trash is reversible for 30 days. Account deletion requires typing DELETE,
  blocks further writes via a server-only deletion lock, removes private objects through the
  Storage API, then deletes the auth user and cascades character rows. Partial
  deletion is retryable after re-authentication too; the account stays locked until removal finishes.
- Bulk JSON exports include active characters and homebrew; the existing import
  accepts the characters array as well as a single-character JSON. For homebrew
  characters, import the exported `homebrew` object through the content library
  before importing the characters. Trash is restored before exporting if desired.

## Required hosted checks before enablement

Use two unrelated Google accounts and make direct SDK calls, not only UI clicks:

- Both can create/save/reload their own characters, including compressed portraits.
- Account B cannot read A's rows, call save_character on A's row, or read/upload/
  delete paths under A's portrait prefix. Anonymous calls cannot access either.
- Direct table insert/update/delete attempts fail even for the owner; only the
  checked save RPC writes. Invalid schema versions, >2 MiB JSON and >512 KiB
  portraits are rejected. Owners cannot rewrite owner_id or revision directly.
- Two tabs start at revision N. First save succeeds; second returns conflict.
  Exercise every resolution, including another save racing Keep mine.
- Edit offline, refresh, reconnect, and expire/revoke a session mid-edit. Pending
  work must survive; failed saves must not display Saved to cloud.
- Import twice and from two devices: identical local IDs must not create duplicate
  cloud rows. Import none leaves guest data untouched.
- Account switch/sign-out hides the previous account's characters/recovery. Guest
  originals remain. Unsynced sign-out warns before clearing the cache.
- Delete/restore and inspect Trash on a second device. Verify an expired Trash
  row cannot be restored, maintenance removes files before the row, and manual
  account deletion removes auth, database data and portrait files.
- Export/import JSON and printable PDF still work. No private Storage URLs or
  session keys leak into exports. Google cancellation and denied redirects leave
  guest mode usable. Test narrow mobile widths and keyboard-only dialogs.

## Verification boundary

Local regression tests validate the adapter and its failure paths with a simulated
backend. Real Google OAuth, Supabase SQL/Storage policy execution, function
execution and scheduled purging need the connected project; they are not claimed
as passing until the hosted checks above run.

## Current Google setup values

- Google OAuth client type: Web application.
- Google authorized JavaScript origin: `https://lucas-character-forge.lucaazevedo.chatgpt.site`
- Google authorized redirect URI: `https://vrjwaejlqupmkqrhmzra.supabase.co/auth/v1/callback`
- Supabase Site URL and allowed redirect: `https://lucas-character-forge.lucaazevedo.chatgpt.site/`
- Enter Google client ID and client secret directly in Supabase Authentication > Sign In / Providers > Google. Do not commit or paste the secret into frontend code.
- Runtime maintenance authorization now uses a server-only Vault secret and RPC check from `supabase/maintenance.sql`; no manual maintenance-secret environment variable is needed.
- delete-account defaults to the exact Sites origin above; set FORGE_ALLOWED_ORIGINS only when separately authorizing other deployments.
- Supabase advisor notices about the intentional authenticated SECURITY DEFINER save RPC/helper and the policy-free, server-only deletion-lock table are expected. The RPC explicitly enforces ownership/revisions; the lock table deliberately denies client access.
