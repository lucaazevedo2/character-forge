# Character Forge 2.0.0 release audit

November 12, 2026 · America/New_York. Audited against the original seven-phase VTT brief and subsequent image, creature, storage and YouTube requests. This report distinguishes working features from limitations; it does not certify every browser or promise a full Monster Manual catalog.

## Requirement coverage

| Area | Delivered and checked | Remaining scope / limits |
| --- | --- | --- |
| Campaigns and persistence | Cloud/local campaigns, DM/co-DM/player/spectator roles, membership and invitations, strict server checks, autosave, durable outbox, conflict review, undo/redo, legacy/versioned backups | Full embedded backups are bounded to 100 MB; account token templates and chat history are separate from campaign backups. Browser-only local games require exports for independent protection. |
| Live play | Real committed notifications and authorized snapshots; private presence, cursor/drag/ping/measurement packets; camera pull; revocation and room-key rotation; reconnect recovery | Same nested metadata object/drawing uses conservative conflict review. Transient preview packets are not persisted. |
| Map editing | Canvas renderer, bounded decoded-image caches, viewport culling, 8000px maps, square/hex/no grid, calibration/offset/half snapping, 5e/5–10/Euclidean distance, layers/locks, drawings, templates, bulk creatures with rolled HP, grouping, keyboard controls and image drop | Display maps downsample to 4096px. Complex paths, dynamic vision and device memory still affect performance. Free transforms for existing drawings and a custom condition-icon editor are absent. |
| Fog and vision | Fog reveal/hide/exploration, walls/doors/window variants, lights, owned vision, visibility filtering and movement barriers | Fog masks a player map visually; authorized player map bytes can be downloaded. Separate DM maps and hidden entities are protected. Vision is 2D; this is not secret tile streaming. |
| Chat, dice, combat | Persistent chat/whispers, speaker portraits, trusted server rolls, macros/hotbar, initiative/rounds, turn markers/timer, HP and condition/concentration tools | Browser-local rolls are marked unverified. Existing published game rules/counters remain authoritative; not every tabletop rule is automated. |
| Character and compendium | Owner-client HP/AC/speed/portrait/condition synchronization, sheet drawer, rolls, spells/resources/rests, existing items/spells/rules and SRD creature data | Owner must have the tabletop open for sheet synchronization. Full cross-account character sheets and offline server mirroring are absent. Current imported creature catalog is 88 beasts/elementals, with custom complete stat blocks available. Advanced multiclass edits and character creation choices remain on the main sheet. |
| Resources and media | Asset search/folders/tags, private/selected handouts and pins, drag/drop picture choice, Monsters & NPCs CRUD/import, creature Delete → Trash/restore, account preferences, uploaded/direct audio, YouTube links and separate visible player | Optional random tables are not implemented. Resource/asset/campaign trash has recovery; scene/token deletion uses undo/backups rather than its own 30-day trash browser. UI strings are only partly centralized; no translated interface is claimed. |
| Account storage | Immutable account-specific 200 GiB allowance for Luca; standard account/campaign caps remain for others; quota enforced on both upload paths | Per-file cap remains 20 MB; quota is a limit rather than preallocated storage. |

## Release fixes

- All four VTT Edge gateways now accept the exact production and existing beta/GitHub origins; untrusted origins and missing authentication remain denied. Deployed and checked using the production Origin header.
- Tabletop JavaScript loads in dependency order on first open, avoiding roughly 350 KB of uncompressed VTT JavaScript on ordinary character pages. Partial download failures offer retry and preserve direct routes.
- Campaign resource tabs retain keyboard focus across redraws. Touch controls, zoom and campaign tabs have 44px minimum targets; inputs use 16px text to avoid iOS focus zoom. Focus indicators, forced-colors selection and scroll containment were strengthened.
- Real account cleanup exposed immediate media-reference foreign-key checks firing before a campaign cascade completed. Migration `20261113033000_vtt_resource_delete_order.sql` defers that reference check until transaction completion. Direct deletion of referenced media still fails. The regression failed before the migration, passed afterwards, and the actual failed disposable account deletion succeeded on retry.

## Validation evidence

- All **75 checks passed**: 68 executable frontend/model regressions and seven isolated Postgres suites. These suites cover original character features as well as VTT geometry, rendering, security, storage, restoration and error paths. The final run had zero failures.
- Actual hosted Supabase SDK/HTTP sessions used disposable DM, player and outsider accounts. Verified live scene changes reaching the real frontend repository; private room delivery; hidden token/drawing/stat/map isolation; denied outsider and forged broadcasts; real image upload; player drawing and template permissions; and removal cutting off existing subscribers.
- Additional real hosted acceptance: simultaneous DM/player edits allowed one current revision and rejected the stale write; explicit retry retained both changes; repeating an operation was idempotent. Disconnected/rejoined the real frontend repository and recovered a missed commit. WAV upload/download preserved exact bytes, used no-store responses, shared the playback clock, denied player controls, revoked access in Trash and restored access afterwards. Current hosted snapshots survived backup/import with new IDs and rejected future formats.
- All disposable accounts from the release run were removed. Cleanup failure was a discovered product regression, fixed and rechecked, not ignored.
- Chromium fixtures at 390px and 820px had no horizontal document overflow. Campaign tab focus survived switching; tablet arrow-key tabs selected Lighting. Every visible campaign dialog button met the 44px target after the final CSS fix. A native browser WAV remained unpaused while Preferences was opened and another tab was used; Stop paused it. This observes playback state, not an audible multi-device listening test.
- First-open loading was exercised in the actual application with authentication disabled: the home document loaded only the VTT loader; opening Tabletop loaded and rendered the campaign gallery. Unit coverage also interrupts a late script download and retries without reexecuting earlier modules.
- Existing official YouTube player and separate-window tests cover URL validation, shared clock, pop-up denial, main-page dialogs/tab independence and strict origin/source/nonce checks. Earlier beta browser QA connected the visible separate window and showed captions advancing behind a main-window settings dialog.

## Performance measurements

Actual Canvas renderer in Chromium, 8000 × 8000 generated map, 1016 × 733 viewport, DPR 1, pan/zoom samples with warm decoded map. Twenty measured frames after warmup:

| Tokens | Median Canvas draw | 95th percentile Canvas draw |
| --- | ---: | ---: |
| 100 | 7.4 ms | 16.0 ms |
| 225 | 9.7 ms | 20.1 ms |

The cloud browser throttled requestAnimationFrame to about one second between samples. These are measured renderer costs, not sustained FPS results. The original 60 FPS on a midrange laptop and under-three-second broadband cold-load targets are **not certified** by this environment. Physical hardware, representative networks, complex dynamic lighting, first decode and multiple image portraits need separate field measurement. The canvas remained viewport-sized rather than allocating an 8000px drawing surface.

## Explicitly unverified

Physical iPhone/iPad Safari gestures and background media policies; real Google OAuth navigation during this audit; audible playback heard on two physical devices; sustained device FPS and a representative broadband cold load. An automatic browser review blocked an unexpected Google Accounts navigation, so local browser fixtures disabled authentication. Real backend account sessions were tested independently. No existing user campaign or character was used for destructive QA.

## Release and recovery

Deploy all tracked migrations in timestamp order and the tracked Edge functions before the frontend. Keep backend verification of every caller; gateway CORS is not authorization. GitHub main uses the same static files flattened from the Sites `dist` directory, with `index.html` canonical. Cloudflare Pages project `lucas-character-forge` builds its root from main. Both footer and version.json identify 2.0.0.

The prior stable commit is `94c18e0400720f5809e05d01d16e3b695043f870`; prior stable Cloudflare deployment is `e18e3e87-cef6-4b60-981b-cc21bd494dcc`. A frontend rollback restores that deployment or a normal revert commit. Do not drop additive VTT tables during rollback: retain campaign data and exports. A frontend rollback is not a database restore. Download a campaign backup before major imports or bulk editing; verify an import into a separate copy before replacing working material.
