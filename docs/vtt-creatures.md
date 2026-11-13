# Creature preparation and media allowances

Release 2.0.0-alpha.10, ChatGPT Sites experimental beta only.

Campaign tools now groups documents under Handouts and uses the former Journal tab for Monsters & NPCs. Existing journals are retained and use their original access/editing rules.

## Pictures

Handouts and creature templates share the same upload, drop, preview, remove and library-thumbnail component. New files go through the existing authenticated media gateway; the editor keeps its draft while the asset snapshot refreshes. Uploads accept PNG/JPEG/WebP up to 20 MB. Selecting a thumbnail reuses its asset ID.

## Creature records

`creature` resources contain a validated `statBlock` and optional `imageAssetId`. The server permits DM-only saves and reads; players cannot create, edit or receive the private record or an otherwise-unshared portrait. Generated map tokens intentionally have their public portrait/name, with private controller details enforced by the existing token rules.

`monsters-core.js` defines the model, validates imports, adapts the existing 88 SRD creatures and creates map token copies. `monsters.js` supplies the collapsible editor and stat block display. The existing compendium is reused, with source IDs and attribution preserved. No catalog data is edited. Action descriptions preserve full original mechanics, including multiattack, multiple damage types and usage restrictions; optional roll fields support additive dice/fixed damage. Templates support all requested action categories plus mythic actions, spell slots, innate spells, regional effects and DM notes. Editing a template does not rewrite independent map-token HP.

Creature references in token notes, resource IDs and portraits are remapped during backup restoration. Local-to-cloud copies upload portraits before creature records. The resource API enforces shape, field lengths/ranges, revisions and asset ownership/type checks.

The editor follows the 2014 monster-statistics structure. Design references reviewed:

- https://www.dndbeyond.com/sources/dnd/basic-rules-2014/monsters
- https://www.dndbeyond.com/sources/dnd/basic-rules-2014/monster-stat-blocks-l (spellcasting and legendary-action examples)
- https://www.dndbeyond.com/monsters/16771-adult-red-dragon (legacy lair actions and regional effects)

These references informed fields; the update does not copy their full monster entries into the compendium.

## Storage allowance

Migration `20261113003817_vtt_creatures_and_storage_allowances.sql` adds a private, deny-all entitlement table keyed to `auth.users.id`. Only the explicitly requested verified account receives 214,748,364,800 bytes (displayed as 200 GB). All other accounts retain 500 MB account/uploader and 250 MB campaign defaults. Owned campaign and account totals still count all files, including trash. Co-DMs do not inherit the elevated uploader allowance.

Both `forge_vtt_private.api` image reservations and the resource-media reservation API consult the same server-owned limits. Clients cannot write entitlements or set them through user metadata. Snapshots return capacities for the usage display. This changes the application's allowance, without changing the Supabase subscription or allocating a prepaid storage purchase. The 20 MB per-file limit remains.

## Validation

Run `vtt-creatures.cjs`, `vtt-picture-upload.cjs` (with linkedom available), and the database runner with `./vtt-creatures-db.cjs`. Existing media, backup, save and workspace tests also passed.

Hosted `vtt-creatures-remote.sql` runs in a rolled-back transaction, testing creature persistence/privacy, spell/legendary fields, default/elevated quotas, both reservation paths and entitlement ACLs. Live readback confirmed exactly one elevated account. No persistent test accounts are created.

Desktop browser checks passed imported Brown Bear editing, saving and token creation. A 390px iframe check opened the new editor. The file-chooser automation stalled; selection through the native picker and physical iOS remain unverified. Actual DOM tests passed image drag/drop, local byte persistence, draft retention, attachment, library reuse, and custom NPC/bonus-action/spell-slot saving.
