# VTT Phase 1 — implementation and deployment handoff

Release: **2.0.0-alpha.1 · Sites experimental beta · Phase 1 only.**

The hosted Supabase schema and Edge Functions are deployed. A follow-up migration removes direct browser VTT bucket downloads; the asset gateway authorizes every GET against current-user RLS and returns no-store responses. Hosted rolled-back synthetic-user tests and real authenticated HTTP tests passed, including invite redemption/revocation, owned-token edits, hidden/private data, image upload/download, removal and account/file cleanup. No temporary test accounts or files are retained. Phase 2 is now documented separately in `docs/vtt-phase2.md`; the remainder of this handoff records Phase 1 behavior.

The first deployment attempts required an expired confirmation retry. An approval-review objection cited an earlier SQL ambiguity; the already-fixed migration was revalidated before approval succeeded. A real HTTP test then found cached direct Storage access after removal; publication was held until the no-store gateway and direct-bucket denial passed a fresh end-to-end test.

## Changes in Phase 1

- Separate account-owned cloud campaigns, an owner/co-DM distinction, player and spectator membership, regular-account login through the existing Supabase client.
- Additive normalized VTT tables with current-user RLS. Browser writes are revoked; authorized atomic command functions own all writes. Players can edit assigned/unlocked tokens only; hidden scenes/tokens/private HP remain filtered by server authorization.
- Create/join cloud campaigns, role management, ownership transfer, member removal, revocable 6-character codes and high-entropy invitation links. Invite hashes and a server-only pepper stay private. Persistent user/IP/global throttling lives in Postgres and the Edge gateway verifies the caller with Auth.getUser.
- Existing local tabletops stay independent. Explicit Upload a copy imports a separate cloud campaign. The original local key is preserved; new local saves and account-specific cloud recovery data use IndexedDB.
- Debounced saves with an approximately two-second maximum flush interval, a durable desired-state outbox, stable in-flight operation IDs, optimistic rendering, version checks, visible save/conflict/offline status and explicit recovery controls. Edits during a save survive the acknowledgement.
- Field patches and per-actor Undo/Redo with revision guards rather than whole-scene shared overwrites. Local prototype Undo behavior remains available for local games.
- Version 2 JSON backups, legacy import, ID/reference remapping, cloud and local recovery exports. Portable exports use the already-authorized downloaded/embedded image data rather than expiring signed URLs.
- Minimal private map/portrait upload gateway: bounded request body, MIME signatures, decoded-dimension headers, 20 MB map/2 MB player portrait upload caps, campaign/account quota reservations, private no-store gateway downloads and no direct browser bucket uploads/downloads/upserts.
- Campaign soft deletion and owner restoration within 30 days. Extension of existing maintenance/account-deletion functions to clean VTT files using the Storage API. Expired unfinalized reservations continue to count against quotas until cleanup, avoiding an orphan-upload quota bypass.

The frontend remains a buildless static app. New files live in `dist/vtt/`; `tabletop.js` remains the renderer/compatibility facade. Existing character and party data models are unchanged. No new runtime package is added: Edge Functions reuse the already pinned Supabase JS 2.76.1. Development-only PGlite 0.3.14 provides a reproducible local PostgreSQL test environment and is not shipped to browsers.

## Complete code and migration

The companion source archive contains every new/modified file in full, plus `phase1.patch` and this checklist. The SQL migration was generated using the installed CLI's `migration new` command:

`supabase/migrations/20261111091451_vtt_phase1_accounts.sql` and the follow-up `supabase/migrations/20261111102805_vtt_asset_gateway_access.sql`

Do not run the older proposal's rollback-wrapped example SQL. The migration in this archive is the actual implementation. The first migration adds the core Phase 1 tables/functions/private bucket and policies; the second removes direct browser byte access in favor of the gateway. The connector records its own hosted timestamps; local source filenames retain their CLI creation timestamps. Future rendering, fog, chat, combat, journal and compendium tables/features are not enabled by this migration.

## Automated checks performed

Run from the repository root:

```sh
node tests/tabletop-navigation.cjs
node tests/vtt-core.cjs
node tests/vtt-cloud-repository.cjs
node tests/vtt-images.cjs
node tests/vtt-edge-gates.cjs
node tests/cloud-saves.cjs
node tests/auth-refresh-backoff.cjs
npm ci --prefix tests/vtt-qa
node tests/vtt-db-runner.cjs
```

All these check categories passed locally during development. Syntax checks and `git diff --check` also passed.

The database test runner creates an ephemeral local WASM PostgreSQL database, synthetic auth users, request-claim fixtures and the actual migration. It tests SQL function execution and RLS as authenticated users, not just mocked permission checks. Its pgcrypto hash/random functions are *local test stubs*, because this WASM setup does not ship pgcrypto; it does not prove cryptographic correctness. The hosted project was inspected read-only to confirm its real pgcrypto functions are available. Hosted tests subsequently passed using the real Postgres/pgcrypto and authenticated API sessions; the local stub limitation still applies to local-only test runs.

Covered locally:

- DM/co-DM/player/spectator/outsider access; private scenes and hidden tokens; private HP; rejection of direct REST-equivalent table writes and protected token fields.
- Stale revisions, rollback of an entire group if a later row conflicts, duplicate-operation idempotency, demotion/removal authorization.
- Invite redemption, revocation, invalid code handling and persistent rate limiting; service-only gateway permissions.
- Offline queue durability, edits during a pending save, acknowledgements, conflict preservation, Undo/Redo and account-separated caches.
- Legacy/version 2 backup migration, new IDs, invalid/unknown version rejection, field-only patches and revision-aware restores.
- Image signature and dimension rejection (including active SVG), gateway TypeScript parsing, exact-origin CORS/preflight, unsupported methods and missing-bearer rejection.
- Existing token selection/group transforms, right-click menu/right-drag, ruler, scene routes and exit cleanup.
- Existing character-save isolation, quota fallback, offline writes/conflicts and authentication refresh backoff.

## Browser checks performed

An isolated local fixture loaded the real VTT modules and CSS with a clearly fake, in-memory cloud adapter and no Google/Auth provider scripts. Browser observations confirmed:

1. Cloud campaign gallery and launch controls render.
2. DM controls, publishing/active-scene buttons, member-role controls and invite creation/display render and respond.
3. Spectator scene/token editors are disabled; HP is unknown and transform handles are absent for non-editable tokens.

This was an **isolated UI check**, not a live cross-device Supabase authentication test. The temporary fixture was removed from the source delivery. Real signed-in HTTP tests against Supabase subsequently passed. The manual two-browser Google sign-in/UI checklist below remains useful acceptance testing; those exact interactive Google flows were not automated.

## Deployment sequence after the native confirmation succeeds

1. Inspect the latest remote migration history and schema again to prevent a duplicate application. Apply the reviewed migration through the Supabase connector and accept its required confirmation. If its result is uncertain, check history before retrying. Do not replace an unaccepted confirmation with another route.
2. Run rolled-back synthetic-user authorization tests on the hosted project; inspect RLS/grants/functions/bucket privacy and security advisories. Do not touch real character/player data for tests.
3. Deploy the new `vtt-invites` and `vtt-assets` functions, including relative source files. They validate their own bearer with `Auth.getUser` and reject anonymous accounts; gateway `verify_jwt=false` is configured for that explicit in-function validation. The existing `delete-account` and `purge-trash` functions also validate their own bearer/maintenance credentials.
4. Deploy the reviewed `_shared/storage.ts` changes with `delete-account` and `purge-trash`. Compare the current remote versions first; do not overwrite unrelated concurrent changes. Existing daily maintenance runs the extended cleanup. No new user-facing automation is needed.
5. Check CORS OPTIONS and unauthenticated rejection on the live gateways; then test authenticated upload/finalization/download, quota failures and access removal with synthetic/consenting test accounts.
6. Publish the matching static source to Sites beta only after backend checks pass. No build command; static directory remains `dist`. Keep public Supabase URL/publishable key in existing public config. No service-role key, invite pepper, Google secret or maintenance secret belongs in the static site, Git, logs, screenshots or command arguments.
7. Verify existing guest tabletops, character login/saves and party flows after publication. Then complete the manual Phase 1 checks below. Do not begin Phase 2 until Luca says continue after accepting the phase.

For an authorized maintainer using CLI rather than the connector, these flags were checked against installed CLI 3.1.0 help. They are documented for review, not a workaround for an expired connector confirmation:

```sh
npx --yes supabase@3.1.0 link vrjwaejlqupmkqrhmzra
npx --yes supabase@3.1.0 db push --remote=vrjwaejlqupmkqrhmzra --dry-run --skip-vault
# Review remote migration history before an actual push: the existing project has older migrations.
npx --yes supabase@3.1.0 functions deploy vtt-invites vtt-assets --remote=vrjwaejlqupmkqrhmzra --use-api
npx --yes supabase@3.1.0 functions deploy delete-account purge-trash --remote=vrjwaejlqupmkqrhmzra --use-api
```

The connector remains the intended migration route. Do not blindly `db push` an unreconciled historical project. Do not add `--prune`. Secrets are provided through existing Supabase project runtime configuration. `FORGE_ALLOWED_ORIGINS` may add exact approved development origins; it is not a wildcard. Standard `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` runtime values are server-side only. The invite pepper is generated in the private database schema by the migration, never returned to browsers. Existing maintenance uses the project's Vault-backed maintenance secret.

## Manual Phase 1 test steps and expected outcomes

1. Open an existing local tabletop, move/rotate/resize tokens and reload. Expect no missing tokens/maps and the same local behavior. Export version 2, import it, and import an older prototype JSON. Each import should create a separate local copy.
2. Sign in as test DM A. Create a cloud campaign, or Upload a copy from a local tabletop. Expect a separate cloud campaign and an untouched local original. Upload a real PNG/JPEG/WebP map and portrait; refresh/reopen on another device as the same account. Expect the same saved content.
3. In Members & invites, create a player invitation. Open the link or enter its code in a second browser as test account B. Publish a scene and Make active for players. B should see that scene only. In Phase 1, use Refresh cloud for changes from another client.
4. Assign one token to B. B can move/edit that token; another player's token, locked tokens, scene setup, ownership and hidden flags must remain uneditable. Verify that crafted API calls also fail. B must not receive a hidden token, prep scene, private monster HP or hidden portrait URL through raw API calls.
5. Invite account C as spectator. Expect read-only map and unknown private HP. Confirm writes fail through the API, not merely disabled buttons.
6. As owner A, promote B to co-DM, then demote B. Co-DM can prepare scenes/invite players, but cannot transfer ownership, change co-DM roles or remove the owner. Owner can transfer ownership explicitly. Removal/demotion should reject later unauthorized commits.
7. Revoke/regenerate an invitation and try the old code/link. It must fail. New invite success must not reset an existing member's role or grant DM.
8. Go offline, move your assigned token, reload and reconnect. Expect a queued local edit under the same account and exactly one eventual change, not duplicated tokens. Sign out/switch accounts while changes are pending; the other account must not see or send those edits.
9. Edit the same token in two browsers from the same revision. Expect the stale save to show a conflict and retain local edits. Recover edits can export a backup, keep a new campaign copy, or discard pending changes after confirmation. No silent whole-scene overwrite.
10. Move/edit several tokens, Undo and Redo, then repeat after another client changes an affected token. Expect safe patches and a conflict rather than overwriting the other client. Test Undo after a token/scene deletion.
11. Delete a cloud campaign, restore it from Campaign trash within 30 days and reopen. On synthetic test data, verify maintenance removes expired reservation files and purges campaigns after the recovery window. Never test permanent account deletion on a real account.
12. Export a full DM backup with maps/portraits, restore it as a new campaign, and confirm ID remapping, ownership isolation and image recovery. Player/spectator exports must be marked view-only and contain no secret rows.

## Known limitations and deliberate boundaries

- Hosted migration, gateway deployment, real JWT-backed permissions/storage tests, authenticated upload/download and temporary-account cleanup passed. Interactive Google sign-in and real multi-device UI checks remain manual checklist items.
- Phase 1 is persistence/roles with explicit Refresh cloud. No live token movement, presence, cursor broadcasts or shared view control until Phase 2.
- On reconnect, stale entity edits conflict conservatively; per-field server-ordered merging is planned for Phase 2.
- Offline data that was legitimately downloaded cannot be made unreadable retroactively. Account switching clears rendered cloud content and separates caches; this is not device-level encryption/DRM.
- Full backups embed images and can be large; import is capped at 100 MB JSON. Maps/portraits are stored in IndexedDB for offline recovery, so available browser disk space remains a limit. Export promptly if a save reports storage failure.
- Image validation checks signatures/dimension headers and allowed MIME, not a complete server decode of every compressed image. Corrupt files may still fail browser decoding. SVG/HTML uploads are rejected. GIF local backups are preserved; cloud upload converts them to WebP and loses animation.
- Minimal asset upload/download is included. Asset search/folders/thumbnails/audio/transcoding/tiling and a richer storage-management UI remain Phase 7. Replaced finalized assets continue to count toward quotas until campaign deletion or future library cleanup.
- Schema includes only Phase 1 core/support tables. Fog/vision, drawing, dice/chat/combat, private character sharing and compendium remain later phases; existing character-table RLS is not broadened.
- The asset gateway now rechecks metadata RLS on every GET and disables response caching. Direct browser VTT bucket downloads are denied. Already downloaded local bytes cannot be revoked retroactively.
- Raw command audit is DM-only. Local per-account Undo history is retained in IndexedDB; safe Undo may require conflict review after another client's changes.
- Only regular signed-in accounts join cloud VTT campaigns in this phase. Existing anonymous party sessions remain supported separately, and local guest tabletops remain available.

## Rollback / resume

If a later deployment fails, keep the last working frontend live. A later rollback disables cloud VTT UI/commands without dropping new tables or pending local queues. Do not delete users' cloud campaigns/assets as rollback. Existing prototype backup data is retained. For later schema changes, recheck migration history before applying anything. Do not reapply these migrations blindly; they are now present in the hosted project.

## Hosted verification results (November 11, 2026)

- RLS/commands: a transaction with synthetic DM, co-DM, player, spectator, outsider and anonymous users passed and was rolled back.
- Real HTTP/JWT flow: temporary confirmed accounts authenticated; created a campaign, scenes and visible/hidden tokens; created/redeemed/revoked an invite; edited an assigned token; denied protected writes; uploaded/finalized a real PNG; downloaded through the no-store gateway; denied direct bucket bytes; demoted a player to spectator; removed membership; denied subsequent snapshot/image access. Both temporary accounts were deleted through the reviewed account-deletion endpoint, exercising VTT file/campaign cleanup.
- Functions deployed: `vtt-invites` v1, `vtt-assets` v2, `delete-account` v4, `purge-trash` v2. CORS preflight and missing-bearer rejection also passed.
- Security advisors were reviewed. Server-only no-policy tables deliberately fail closed. Static anonymous-access notices do not model the account/membership helpers; anonymous VTT access was explicitly denied in SQL tests. Existing party RPC advisories were not changed by this feature. [Advisor reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- No production character or party contents were modified for testing. Stable frontend/GitHub publication is separately authorized.

## Player character import (November 11, 2026)

Players now see the active map without scenes or preparation panels. **Add my character** opens a modal picker from the current account’s loaded character ledger and copies the name, computed maximum HP, current HP (including zero) and avatar. It creates the self-controlled token before uploading its portrait so the upload is authorized. Token changes are independent from the source sheet. No published active scene means import is unavailable.

Migration `20261111211646_vtt_player_character_tokens.sql` updates only the checked command function: players can create up to ten visible, unlocked, self-owned tokens per scene, on the active published scene only. They cannot assign other owners, preattach image assets, change other tokens’ ownership, or delete tokens. Spectators cannot create tokens. DM permissions are preserved.

Verified the full local RLS suite with this migration, pure HP/avatar mapping and cloud import regression tests, and hosted rolled-back SQL checks of creation, HP/control, foreign-owner denial and spectator denial. A mobile browser fixture verified the actual renderer, modal picker and copied HP/avatar; authenticated Google/browser testing is separate from these fixture checks.
