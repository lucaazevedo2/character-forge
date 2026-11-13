# Phase 4 — fog, vision and lighting

Release: **2.0.0-alpha.5**, November 11, 2026 (America/New_York). Experimental Sites beta; no stable frontend/GitHub publication.

## Using it

Open **More → Fog & lighting** as DM (or the sidebar fold on desktop). Existing scenes remain Off until the DM enables fog.

- Manual: choose Reveal/Hide and a brush, rectangle or polygon. Drag a stroke/rectangle; tap polygon corners and Finish. Reveal all/Cover all reset the bounded operation history. Done or V returns to Select.
- Dynamic: draw walls/doors as lines or closed polygons. Wall list → Edit changes door state and movement/sight/light blocking independently. One-way walls block from the left of each directed segment. Windows and invisible barriers block movement while passing sight/light.
- Place a map light, then edit its bright radius, total dim radius, color, intensity or animation. Lights can instead be attached to tokens. Torch 20/40, Lantern 30/60, Candle 5/10, Light 20/40 and Daylight 60/120 are included.
- Select a token → right-click Edit → **Vision & token light**. The DM sets vision, range, grayscale darkvision, blindsight and truesight; Has vision off removes that vision source. Distances use the scene’s distance/units. Assign control to players through existing permissions.
- Preview player vision uses selected non-GM tokens, otherwise all player-assigned tokens. It uses the player map and omits hidden/GM tokens. It is a DM visualization, not an impersonated account permission test.
- Players see their own controlled-token vision and can toggle visible unlocked normal doors beside their tokens. Secret doors have no player door labels/IDs. Spectators cannot toggle doors. DM fog opacity leaves the DM’s map readable.
- Remember explored map persists per account and scene. Unseen explored terrain is dim/grayscale, without remembered tokens. The DM can reset everyone’s exploration. A faint map hint is optional.

## Data and security

`forge_vtt_environments` stores full config, manual operations, wall geometry and map lights with revision checks; raw SELECT is DM-only. `forge_vtt_exploration` stores a checked 128 × 128 map mask per account/scene. Its RLS allows only that member’s own row. Browser roles have no direct writes to either table.

The existing `forge_vtt_api` checked command path accepts DM environment edits. Token light and vision properties are DM-only, including on player-created tokens. Player movement is checked against movement blockers. Cloud Undo/Redo uses the same command/revision path; undoing initial environment creation sets it back to Off, retaining a revision guard. Door toggles are checked immediate interactions outside command Undo/Redo.

`entity_readable` retains membership, published/active scene, hidden and layer checks, then checks current sight. This same function guards raw token/entity/private-data/portrait access and snapshots. Controllers can still access their own token. Owned vision sources are queried directly to avoid recursion through `controls_token`. Explicit hidden/GM tokens never illuminate a player scene.

The player environment DTO strips secret wall metadata and hidden map lights. Public token illumination is a separate anonymous light component (position/radius/color only); it works even when an emitter’s token is outside sight, without sending the token ID, name, portrait, HP, owners or private properties. A light’s position is public illumination; do not use a public light to conceal its emission position. This component and exploration metadata are excluded from outgoing commands and portable backups.

Per-player vision is enforced on the server. Shared room movement/cursor previews are withheld from the shared player audience whenever fog is enabled; DM previews remain live and committed model changes still notify players normally. Deliberately shared pings and rulers stay shared. No hidden payload is sent through a broadly subscribed Realtime channel.

The private asset gateway remains authorized on every request; previously seen/cached information cannot be made unknown retroactively. The public player-map image remains downloadable as in prior phases: fog masks terrain visually and filters entity data, rather than encrypting individual map tiles.

## Rendering and limits

`vision-geometry.js` contains pure point/segment tests and endpoint ray casting. Spatial buckets limit ray/wall work; visibility polygons are cached across paints. `vision.js` uses viewport-sized OffscreenCanvas buffers (DOM canvas fallback), capped device pixel ratio, grayscale masks, lighting gradients and a separate clean terrain buffer for memory/hints. No full-map pixel masks are allocated. Reduced-motion preferences disable flicker/pulse animation. Polygon cache is bounded.

Limits per scene: 500 walls, 2,000 total wall vertices, 100 map lights, 500 manual operations, 128 points per shape and 1 MB environment JSON. Cloud exploration accepts at most 256 candidate cells per request and independently verifies each new cell’s current visibility before storing it. A reset invalidates all scene memory through a new epoch.

Visibility, collision and door proximity use token centers in two dimensions; elevation does not create vertical occlusion. Vision defaults to 60 scene units for player-assigned tokens until the DM configures it. Character-sheet senses do not automatically set these fields. No cones, terrain heights or 3D simulation are included.

## Verification

- `tests/vtt-phase4-geometry.cjs`: ordered fog shapes, wall kinds/doors, light/darkvision/blindsight/truesight, ray clipping, environment diffs/rebase/undo, derived metadata exclusion and a 500-wall performance sample.
- `tests/vtt-phase4-db.cjs` through `vtt-db-runner.cjs`: actual PostgreSQL RLS/helper logic in WASM PostgreSQL, ownership/escalation denials, raw tables, assets, unseen/secret entities, doors, collisions, exploration/reset, packet isolation and anonymous light components. All earlier VTT migrations compile and Phase 3 checks remain compatible.
- `tests/vtt-phase4-remote.sql`: rollback-only hosted PostgreSQL smoke test verifies snapshot filtering, raw RLS, secret-door denial, wall collision and memory RPC with ephemeral rows. No account/campaign data persists.
- Existing core, Stage selection, navigation, offline/rebase/Undo, live notifications/rooms, image, Edge gateway and party invite checks.
- Browser QA with actual scripts/CSS in isolated temporary fixtures: desktop manual/dynamic editor, saved reveal brush; 390 px DM/player layouts; mobile drawer, one-click door toggle, left-click selection/resize/rotation, right-click actions and token vision controls. Fixtures are removed before deployment. Mobile Safari hardware was not available.

Security advisors flag `forge_vtt_vision` because it is an intentional authenticated SECURITY DEFINER RPC; it checks regular-account membership, scene access, roles, proximity, revision and bounded inputs. Helpers remain private. Existing project-wide advisor findings were not broadened or changed outside this feature.
