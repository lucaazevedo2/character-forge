# VTT Phase 3 — Canvas, layers, tokens and drawing

Release: **2.0.0-alpha.4**, Sites experimental beta, November 11, 2026 (America/New_York). Final 2.0 is still in development. GitHub and the stable frontend are unchanged. The additive VTT backend migration is installed in the existing Supabase project.

## Renderer choice and behavior

Plain Canvas 2D fits this buildless application and its existing DOM controls, adds no rendering dependency, and keeps saved models independent of the renderer. The canvas is sized to the visible viewport, capped at DPR 2; it is never allocated as an 8000px square just to display a map. Off-screen tokens and hit regions are culled. Token artwork, HP and status badges render on canvas, while transparent named buttons and DOM transform controls preserve keyboard selection and editing. A bounded LRU cache retains two decoded map surfaces and 256 token/icon surfaces. Display surfaces downsample maps to 4096px and portraits to 256px; map uploads accept up to 20 MB and automatically downscale to at most 8000px, with original saved upload bytes otherwise retained. No remote rendering library is loaded.

Wheel zoom stays under the pointer; two-finger pinch zoom stays under the midpoint. Right drag and Space temporarily pan, Select drags a marquee, and token transforms retain existing pointer behavior. Live previews interpolate and final commands remain authoritative. Large-map quality at extreme zoom is bounded by the display downsampling above.

## Features

- DM-selected map, objects, tokens, GM and drawing layers; visibility and lock controls; active-layer selection or all layers. GM-only tokens, drawings, scene notes and separate DM map IDs/bytes are filtered by the server. Lighting/fog tools remain Phase 4.
- Square, flat-top hex, pointy-top hex and no grid; cell size, X/Y offset, style, half-cell snapping, Alt bypass, two-point calibration, distance/units and 5e/alternating/Euclidean diagonals. Default distance remains 5 ft. Rulers snap independently of token snapping.
- Custom token width/height and shape, rotation, elevation, HP/temp HP, AC, speed, initiative modifier, controller-private notes/stats, and up to three bars (HP plus two custom), with public visibility toggles. Character import records its avatar/HP and a private sheet reference; it does not synchronize ongoing sheet changes yet.
- All specified 5e conditions, exhaustion levels, concentrating/dead and custom labels; fallback letter badges. Custom icons can be registered at `window.ForgeVTTConditionIcons[condition]` using a same-origin path or data image. No custom icon editor is included yet.
- Context actions for status, damage/healing with temporary HP and resistance halving, initiative, visibility, locking, portrait reuse/upload, owners, sheet reference and a basic ordered combat list. Full turn tracking and combat automation remain Phase 5. Hidden combat entries are filtered along with their tokens.
- Multi-selection movement, resize/rotation, status, grouping, align and distribute; clipboard duplicate/copy/paste; nudge/delete. Owner assignment supports multiple campaign players.
- Account-owned token template library (50 templates per account, 2 MB per template); guests use this browser. Drag placement, numbered bulk groups up to 50 with hit-dice HP, and direct image drops. Portrait picker reuses campaign token portraits; the full cross-campaign asset manager remains a later phase.
- Movement trail/distance and optional speed warning. No wall collision until wall geometry/vision work.
- Live shared ruler, 60° cone, radius circle, square and width-configurable beam. Transient areas expire after three seconds; Keep as spell area stores the shape as a drawing.
- Pen, line, rectangle, ellipse, polygon (double-click to finish), text, arrow and eraser; color, width, opacity/fill, GM-only drawings, clear own/all and Undo/Redo. Players can draw only when the DM enables it, can edit/delete their own drawings, and cannot edit hidden or DM drawings. Cloud uses existing guarded, idempotent commands and outbox/history rather than browser table writes.
- Scene map and optional separate DM map, private notes, background, lighting tint/ambient brightness, reduced-motion-aware weather, duplication, drag ordering, collapsible folders, thumbnails and active-player marker. These lighting presets tint the scene; they do not imply vision enforcement.
- Shortcut help (`?`), V/H/M/D/T, Space, +/−, G, Ctrl+C/V/D, Ctrl+Z/Shift+Z, arrows/Delete/Escape. F is reserved for Phase 4 and says so. Long-press callout/text selection suppression remains scoped to tabletop controls and the map; editable fields retain normal selection.

## Backend migration and security

`supabase/migrations/20261111221823_vtt_canvas_layers_drawings.sql` adds bounded scene settings and account-owned token templates, expands checked snapshot/apply/live functions, and retains existing entry-point grants. It does not reset Realtime publications or broaden character-table access. Template rows have explicit owner RLS and an account eligibility predicate in the private schema; its private-schema helper only answers for the current user. Internal validators and quota triggers are not browser-executable.

Token metadata is public only after entity/layer permission checks. Notes, custom stats and hidden bars live in controller-scoped private data; noncontrollers receive only the explicitly public bars/HP. Separate DM images use DM-only asset uses and the existing no-store authorization gateway. Drawing commands validate type, geometry/style limits, current revisions, creator ownership, layer locks and entity kind; a drawing command cannot delete or rewrite a token by reusing its ID. Server-checked measure messages use the existing rotating private rooms, without granting browser broadcast writes.

Advisors were checked before/after migration. No new unprotected table or public definer endpoint was introduced. The anonymous-access heuristic flags the template policy, as it does other guarded VTT policies: `template_owner` calls `regular_user`, which rejects anonymous accounts. Existing fail-closed internal table, party RPC, and auth configuration notices are unchanged. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0012_auth_allow_anonymous_sign_ins).

## Validation performed

- Geometry/core tests: offset/half/hex snapping, inverse hex transforms, all distance rules, bounded dice, rectangular culling, drawing diffs/deletion restores and concurrent edit conflicts, private-map conflicts, backups and ID remapping.
- Existing core, outbox, room/live and tabletop navigation tests: preserved field/revision guards, offline retries, membership revocation, select/right-pan/group transform behavior, cell dimensions and routes.
- All VTT migrations compile on local WASM Postgres. New integration tests verify GM map/notes/drawing filtering, controller vs public token stats/bars, direct-row RLS, player drawing ownership, entity type confusion denial, layer locks, template ownership and transient measurement validation. Local pgcrypto stubs are restricted to migration/permission tests, not production.
- Real Supabase SDK tests with three disposable accounts: commit → actual notification → authorized frontend snapshot application, private room controls and revocation, drawing save and filtered snapshot, DM image upload and denied player download, template row isolation, and actual shared cone delivery. Cleanup succeeded for all supplied disposable accounts. Credentials were passed on hidden stdin, never included in source.
- Browser QA: 8000 × 8000 test map with 225 visible tokens; viewport canvas 938 × 671 in the desktop test, rather than an 8000px backing surface. A measured frame with the test scene was 11 ms; this is a spot check, not a universal frame-rate guarantee. Verified select-only transform UI, right-click actions, rectangle persistence, persistent cone, hex-grid rendering, and mobile player/DM layouts using 390px iframe viewports. No real iPhone/Safari or physical two-touch device was available.

## Manual acceptance

1. Open the experimental Tabletop tab. Launch a local and a cloud campaign; confirm exit and direct scene URLs still work.
2. Use DM and player browsers. Publish/activate a scene. Player sees the map, not the scene/setup controls. At mobile width, DM setup opens as a full-width drawer with a close control at the top.
3. Place 200+ tokens and a large map. Pan across empty and crowded regions, wheel/pinch zoom, marquee several tokens, move/resize/rotate and check live previews/final saves.
4. Change grid mode, offsets, cell scale/style and distance rules. Calibrate two points. Measure diagonals/hex distances, try half-snap and hold Alt while moving a token.
5. Move props to Objects and secrets to GM. Change active layer, visibility and locks. Confirm player snapshots, direct reads and asset downloads do not expose hidden data.
6. Edit rectangular token dimensions, conditions, temp HP, public/private bars and multiple owners. Right-click for damage/healing, initiative and combat list. Verify the unassigned player cannot edit or read private stats.
7. Save a template, place a group with `2d8+2` HP, drop an image, reuse a portrait, and copy/paste/duplicate. Reload and verify template/account isolation.
8. Draw every shape, finish a polygon with a double-click, erase, undo/redo, clear own drawings, and repeat as an allowed player. Put a GM-only drawing on the map and verify it never appears for the player.
9. Measure each area in two browsers; transient areas fade after three seconds. Keep an area, reload, and clear it as DM. Lock the drawing layer; ordinary rulers still work.
10. Duplicate/reorder/folder scenes. Add DM notes and a separate DM map. Verify player map stays public-only. Try lighting/ambient/weather and reduced-motion preference.
11. Disconnect during edits, reconnect, and try competing updates. Existing conservative conflict review remains in effect. Verify backups/restore, character creation, sheet export and existing party flows.

## Deployment and limits

The migration is already applied for this beta; no manual SQL, secret or dependency installation is needed. For another environment, apply all tracked VTT migrations in timestamp order and retain the existing vtt-assets/vtt-invites/delete-account functions and private storage policies. New frontend files load through the existing buildless `dist/index.html` manifest.

Fog, walls, enforced vision, full combat turns and live character-sheet synchronization are intentionally later phases. Drawing selection supports deletion/erasing, not free transform handles. Cloud drawings currently use whole-drawing conflict guards; competing edits to one drawing or one metadata/details object require review rather than silently merging nested fields. Previously downloaded bytes cannot be removed from another device. Templates are separate account data, not included in campaign backup exports. Existing token/scene/drawing quotas remain enforced; bulk adds are bounded to 50. Very large scenes, complex freehand paths and mobile GPU/memory limits still affect performance.

## Changed files

- Renderer and geometry: `dist/vtt/stage.js`, `dist/vtt/geometry.js`.
- Integration/state: `dist/tabletop.js`, `dist/tabletop.css`, `dist/vtt/core.js`, `dist/vtt/cloud-repository.js`, `dist/vtt/ui.js`, `dist/index.html`.
- Backend: `supabase/migrations/20261111221823_vtt_canvas_layers_drawings.sql`.
- Tests: `tests/vtt-phase3-core.cjs`, `tests/vtt-phase3-db.cjs`, `tests/vtt-db-runner.cjs`, `tests/vtt-live-transport.cjs`.
- Release notes/version: `CHANGELOG.md`, `dist/CHANGELOG.md`, `dist/version.json`, `docs/vtt-phase2.md`, this document.
