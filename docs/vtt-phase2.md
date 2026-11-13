# VTT Phase 2 — live tabletop synchronization

Release: **2.0.0-alpha.3**, Sites experimental beta, November 11, 2026 (America/New_York). GitHub and the stable frontend are unchanged. Final 2.0 is not declared.

## Behavior

Cloud campaigns subscribe to live invalidations. Committed token movement, HP, resize/rotation, map, visibility, membership and active-scene changes cause other clients to load a current authorized snapshot. Players follow the DM’s active published scene; DMs retain their selected prep scene. Panning and zoom stay local, and incoming snapshots wait for an active pointer gesture to finish. Unpublishing the active scene leaves players on an empty waiting map.

The header shows this device’s Live / Connecting / Reconnecting / Offline state. Automatic reconnect and focus/visibility resynchronization catch missed changes. A 15-second visible-page check also revalidates permissions and catches lost notifications; network failures preserve the offline outbox. More → Check for updates remains as a manual fallback.

Pending changes rebase only if their fields are unchanged remotely or already agree. Different fields of the same token can merge with current entity revisions; competing edits to the same field, deleted/hidden targets, missing scenes and conflicting portraits stop for review. Ambiguous network failures replay their original idempotent operation before accepting later snapshots. Conflicting operations known to have failed may be rebased. Undo/Redo retains its field guards. Local browser tabletops do not subscribe.

## Security and deployment

Migration `20261111212913_vtt_live_notifications.sql` adds `forge_vtt_live_events`: campaign ID, sequence and timestamp only. It has member-only SELECT RLS and no browser writes. Server-only triggers advance its counter when campaigns or memberships change. Only this table is added to the existing `supabase_realtime` publication; campaign, entity, stats, asset, command and character data are not added. The publication is not dropped or reset. Security advisors were reviewed; the anonymous-access heuristic also flags this SELECT policy, but `member_of` rejects anonymous accounts and local guest tests verify no readable counters. Existing server-only fail-closed and party-function advisories remain outside this change. [Advisor reference](https://supabase.com/docs/guides/database/database-linter?lint=0012_auth_allow_anonymous_sign_ins).

Notifications are hints, never trusted game data. Every refresh still uses `forge_vtt_api('snapshot')` under the current account. Images use the no-store authorization gateway. A removed member cannot fetch a new snapshot; because RLS also prevents them receiving the removal counter, periodic permission checks clear their active workspace. Previously downloaded bytes cannot be retroactively erased from a device. This does not broaden character-table access or add public channels carrying game state.

## Validation

- `node tests/vtt-core.cjs`: field-level rebasing, same-field/deletion/portrait conflicts, backup and character mapping.
- `node tests/vtt-cloud-repository.cjs`: offline outbox, in-flight edits, upload bytes/retries, Undo/Redo and account isolation.
- `node tests/vtt-live.cjs`: reconnect/fallback timers, stale-channel cleanup, two model replicas, automatic independent-field merge, preserved competing-field edits, and revocation.
- `node tests/vtt-db-runner.cjs`: all migrations on local WASM Postgres, command permissions, live-counter RLS, direct-write denial, hidden/private fields and role restrictions. Local pgcrypto stubs remain limited to DDL/permission validation.
- `node tests/tabletop-navigation.cjs`: routes, exits, selection, movement/transform, ruler and grid dimensions.
- `tests/vtt-live-transport.cjs`: real Supabase SDK, disposable authenticated accounts, actual player/outsider WebSocket subscriptions, committed scene notification, real live controller + cloud repository snapshot application, outsider denial and membership-removal denial. Cleanup deletes only the supplied disposable `vtt-qa-…@example.invalid` accounts and their campaigns/assets through delete-account. Never supply real accounts to this test.
- Mobile browser fixture: actual renderer/CSS and Live indicator with scoped mock data; no Google sign-in was required for this visual check. Real transport was verified separately above.

## Shared room additions

The compact **N online** menu lists canonical campaign names, role and Online/Away/Reconnecting state. Names/roles come from campaign membership, not user-supplied broadcast payloads. An authenticated heartbeat runs every 15 seconds; stale participants drop from the roster after 45 seconds. Multiple tabs are aggregated into one user. Clean exits send a departure; suspended/killed mobile browsers rely on expiry.

Colored, labeled cursors appear on the shared map. Drag/resize/rotation uses transient previews at a 20 Hz target, with a maximum of four requests in flight and latest-sample backpressure. Receivers interpolate token CSS positions over 70 ms and keep previews separate from the saved model. A committed entity revision replaces a preview; abandoned previews expire after three seconds. Cursor labels expire after five seconds without samples. No per-frame drag writes are made to game records. Groups preview up to 50 tokens; larger groups still save through the normal command pipeline.

**Alt-click** or a **stationary 650 ms hold** pings the map with the sender’s color/name. Pings are limited to one every 500 ms and animate for about two seconds. The DM’s **More → Pull players to my view** sets other clients’ scene/camera to the DM’s current center and zoom. It is enabled only on the active published scene; it never publishes a prep scene. Incoming camera pulls wait for a current pointer gesture to end.

Migration `20261111214805_vtt_live_room_interactions.sql` adds server-only, RLS-enabled room-key, presence and rate-limit tables, a private receive-only Realtime policy and the checked `forge_vtt_live` gateway. Browsers do not receive INSERT permission on `realtime.messages`. All outgoing presence/preview/ping/camera traffic goes through server checks. Players can preview only their controlled unlocked tokens; only DMs can pull a camera. The server constructs a separate DM packet and filters the player packet to the current active published scene and visible tokens. Hidden-only dragging suppresses the public cursor too.

Membership/ownership changes rotate the private room key. The gateway locks this key while checking permission and publishing so removal cannot race an event onto the replacement room. A removed subscriber may still have an old socket, but no new events are published to that old topic. Remaining members discover the new topic on refresh/heartbeat. Private topic authorization is membership checked, DM-room authorization is DM checked, and outsiders cannot join even when given the topic string. The server-only room/peer/rate tables deliberately have no browser RLS policies; the advisor’s fail-closed INFO notices are expected ([reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)).

Additional verification: `node tests/vtt-room.cjs` covers latest-sample throttling, private joins, topic rotation, roster expiry and cleanup. The extended database suite checks canonical presence, player camera/hidden movement denial and room-key revocation. The real transport suite verifies private DM/player channels, denied outsider joins, preview delivery without persisted movement, hidden-token isolation, shared pings, DM-only camera pulls, forged client broadcast denial and removal of an already-joined private subscriber. Mobile visual checks use scoped fixtures of the real renderer, including online menu, cursor labels, interpolated token previews and pulse overlays.

## Scope and limits

Updates are published after save/gesture completion, debounced up to 800 ms (at most 2 seconds during continuous captured edits), plus network latency. Smooth transient previews are separate from those committed updates. Voice/chat, fog/vision, combat automation and live character-sheet links remain later phases. Hidden/background mobile tabs may suspend networking; focus/reconnect catches up. Concurrent edits to the same field intentionally require review rather than choosing a silent winner. Network interruption keeps local changes; storage failure still requires a backup.

The connection indicator describes this device’s subscriptions. The roster uses heartbeat expiry, so offline detection may take up to 45 seconds. Fallback checks keep a session usable if WebSockets are blocked, but report reconnecting rather than pretending the socket is live.

## Manual acceptance checks

1. Use two signed-in browsers as DM and player. Invite/join, publish a scene, make it active. Both should show Live; the player follows the active scene automatically.
2. Move, resize or rotate a controlled token and change HP. The other browser updates after the save without pressing Update. Hidden tokens/private HP remain unavailable to unprivileged clients.
3. Pan/zoom while another client changes a token. The viewport remains local. Hold a drag while a remote update arrives; it applies after release.
4. Edit different fields concurrently; both survive. Edit the same field to different values; the stale client keeps its pending edit and offers recovery instead of overwriting the other value.
5. Disconnect one browser, edit locally, reconnect. Independent edits should rebase and save. Conflicting fields need review. Reloading or changing accounts must not send one account’s pending changes under another account.
6. Switch/unpublish the active map; players follow or see an empty waiting map. Remove/demote a player; refresh permission checks take effect without leaking new state. The removal sweep may take up to 15 seconds on an active visible page.
7. Confirm character import, avatar upload, local guest tabletops, backup download/restore, invitations and existing character/party features still work.

8. Move the pointer in the player browser: the DM sees its label/color. Drag an owned token: the other browser sees intermediate movement, with the final position saved on release. Try a hidden DM token and an unpublished prep scene: no player cursor/movement leakage.
9. Alt-click or hold still on blank map for 650 ms: both clients see a named pulse. Use More → Pull players to my view as DM: other clients center/zoom on the active published scene. The same action must fail for a player.
10. Check the online list with multiple tabs. Hide a tab to mark Away; close/kill it and wait up to 45 seconds. Remove a player while its private room is open; it must receive no new previews on the old room. Remaining clients reconnect to the replacement room on heartbeat/refresh.

Same-field competing saved edits still use the previously accepted conservative review workflow rather than silently choosing a last writer. Phase 3 was subsequently authorized and is documented in `docs/vtt-phase3.md`.
