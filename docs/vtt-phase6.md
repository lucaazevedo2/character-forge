# Phase 6 beta integration

The implementation is in dist/vtt/sheets.js. It reads the existing character record and calculation functions, allItems(), SPELLS, FEATURES, SHEET_CONDITIONS and WILD_SHAPE_FORMS. It does not create a parallel item catalog or change catalog IDs.

Character access is restricted to the current account’s loaded characters. The tabletop snapshot and existing command permissions still determine token edit access. The client bridges character changes through storeSet and model changes through ForgeTabletop.change. No entire character record is copied into token details or chat. Chat rolls continue through the Phase 5 server roller.

The bridge records independent sheet/token projections. On concurrent differences it stops and offers a sheet/token choice. On reopening a mismatched pair it also asks, preventing silent overwrites. It runs while the owner has the tabletop open. Automatic offline server mirroring and DM access to other accounts’ full sheets are not included.

The sheet dialog uses native score, skill, save, equipment attack, class resource and spell helpers. Feature text overrides use their existing per-character save format. Spell lists include learned spells from class contexts and feat grants; casting spends the selected context's slot or feature use. Multiclass slot-pool editing, per-class Hit Die pools, custom attack creation and equipment acquisition remain on the main sheet. Other consumable counters remain manual.

The compendium reuses the application’s allItems() results by reference, including custom and magic imports. Item cards include catalog IDs and available descriptions/stat fields. Monster entries reuse the current SRD beasts/elementals and retain the existing CC BY 4.0 provenance. DM additions support average or rolled hit points, action macros, drag/drop and stat-block access. Only catalog references are stored in private token notes.

Movement ruler costs are separate from area geometry: square movement diagonals alternate 5/10; straight squares cost 5. The pure helper accepts an optional previous-diagonal count. Each new ruler gesture begins a new measured path. Hex distance remains the scene's hex distance.

Validation: tests/vtt-diagonals.cjs and tests/vtt-sheets.cjs, plus navigation/selection/core/geometry/chat regressions. Browser checks used disposable local fixtures. Hosted login and physical iOS were not tested this release. Fixtures are removed before publication.
