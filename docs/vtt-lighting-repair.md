# Lighting repair and DM workspace — alpha.6

November 12, 2026, America/New_York. Sites experimental beta only.

## Cause and correction

The ray caster mixed endpoint angles in −π…π with uniform rays in 0…2π. Sorting those numbers directly caused the filled polygon to wind across itself. Ray endpoints were individually clipped, so the original endpoint-only tests passed while wedge-shaped regions behind walls could still be filled. Normalize every angle into one circular interval before sorting. Dense interior samples and real Canvas pixel tests now check the filled result.

The existing server line-segment checks are independent of this rendering bug and remain in force. No database schema or permission changes are included in this repair.

## Editing

Choose **Layer → lighting** to edit wall and map-light objects. Click one or Shift-click several; drag a box to select multiple. Drag a selection to move it, drag a selected wall’s square handles to adjust its corners, or use arrow keys to nudge it. Delete/Backspace, contextual Delete, and Erase objects all use the same checked environment save path. Undo/Redo continues to operate on the campaign model.

These are editor guides visible only to the DM on the Lighting layer. Returning to Tokens restores normal token selection and transform handles. Standard doors still use the existing proximity/lock-checked toggle RPC; editing their properties is DM-only. Public light-source components, private token properties and cloud permissions are unchanged.

## Sidebar behavior

Scene, Tokens, Lighting and Layers are separate tab panels with accessible tab labels and keyboard navigation. Only the active panel is visible; its contents scroll beneath a fixed header. Selected-object properties appear before creation tools, which collapse while an object is selected. Close and Controls hide/reopen the sidebar. Mobile creation tools dismiss the drawer so the map is available; tapping a lighting object opens its properties. The player layout does not acquire these DM controls.

DM overview deliberately shows obscured map regions dimly. Player preview masks the map according to the chosen/assigned tokens. The two states are labeled explicitly, and preview omits lighting guides and secret-door labels. Unchanged visibility masks are cached; animation schedules later frames rather than relying on incidental pointer events. Reduced-motion preferences suppress flicker/pulse.

## Verification

- `node tests/vtt-phase4-geometry.cjs`: 78,660 interior polygon samples, including the wraparound regression, opposite wall sides, corners, diagonals and one-way walls; existing fog/senses/light/diff checks and a 500-wall timing sample.
- `node tests/vtt-lighting-render.cjs` (requires `@napi-rs/canvas`, available in the primary runtime): real pixel checks for light and vision clipping, successive frames, open/closed doors, windows, movement barriers, darkvision, no vision and manual fog. Also checks animation scheduling/reduced motion.
- `NODE_PATH=/tmp/forge-editor-qa/node_modules node tests/vtt-lighting-editor.cjs` (`linkedom@0.18.12`): real DOM pointer/key events for layer isolation, wall movement and corner editing, light nudge/delete, marquee multi-delete, one active sidebar view and player guards. The select-value shim supplies Linkedom’s missing native setter.
- Existing core, Phase 3, Stage selection, navigation, cloud repository, invitation and Phase 4 PostgreSQL checks pass, including server-hidden entities/portraits, walls/doors and private exploration.
- Browser QA using actual app scripts/CSS in temporary isolated fixtures: desktop wall and torch deletion, Undo, movement, marquee multi-delete, erase, light-property Save, player preview, return to token selection; 390 px DM/player layouts, fixed mobile drawer, drawing with automatic drawer dismissal and tapping the new wall to edit it. Physical Safari/iOS hardware was not available.

Temporary fixtures are removed before publication. Tests mutate only isolated fixture/local test data.
