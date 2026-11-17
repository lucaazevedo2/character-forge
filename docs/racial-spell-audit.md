# Racial spell audit — 2026-11-14

Audited the bundled runtime's 305 race IDs: 243 catalog entries and 62 older saved-character IDs. Of the catalog entries, 87 contain spell metadata (88 packages). The accompanying JSON inventories every ID, original package data, resolved compatibility alias, and default level-20 grants. Choice packages must be interpreted with their listed alternatives; the default grant list is not every possible choice.

## Confirmed defects fixed

- The old integration handled cantrips but omitted innate and leveled racial spells. Racial grants now unlock at total character level, appear for noncasters, and do not spend class spell selections.
- Drow receives Dancing Lights at level 1, Faerie Fire at 3 and Darkness at 5. Older saved Drow IDs work too.
- Racial grants have their own source subtext and count instead of being called subclass grants. Limited spells use existing resource tracking and rest/save flows. Independent racial and feat uses stay independent.
- Fixed ability metadata for MPMM Aasimar (Charisma), Mark of Detection (Wisdom), Blue Merfolk (Intelligence), and retired DMG Eladrin (Intelligence). Siren uses a Charisma fallback; its Friends spell has no save or attack and the source does not explicitly state an ability.
- Restored Warding's Arcane Lock and Storm's Gust of Wind at level 3. Corrected variant Infernal Legacy's second-level Hellish Rebuke.
- Preserved edition-specific rules: cast level, selected ability, class cantrip lists, short/long rest limits, component exceptions, target restrictions, and modern traits' permission to use slots. Mammon's Floating Disk resets on short or long rest; Arcane Lock on long rest.
- Dragonmark expanded lists expand eligible class choices; they do not automatically teach or prepare those spells. Combined optional-variant container records grant nothing until a concrete variant is selected.
- Existing race IDs remain unchanged. Compatibility aliases resolve older saved IDs without rewriting them.

## Verification

- 1,830 race/level cases: every ID at levels 1, 2, 3, 4, 5 and 20.
- 349 spell-package, casting-ability and cantrip-choice cases.
- Focused checks for multiclass total level, slot restrictions, source labels, class budgets, upcasts, resources, rest resets, component exceptions and overlapping feat grants.
- Existing feat-spell and supplied-spell regressions passed after correcting their script loader to execute the actual application script.
- Browser fixture checks confirmed Drow unlocks, separate Darkness use, long-rest restoration, legacy Drow and Fairy's chosen Wisdom DC/slot controls. Fixtures did not save characters and were excluded from publication.

Reproduce with `node scripts/racial-spell-audit.cjs` and `node tests/racial-magic.cjs`.

## Scope and remaining content review

This is an exhaustive audit of the **bundled structured race metadata and its runtime integration**, not independent verification of every paid sourcebook's complete text. All bundled spell references resolve. A scan of records without spell packages found no explicit casting/cantrip trait omitted from structured data. Homebrew prose is not automatically interpreted as grants.

Retired DMG records remain for saved-character compatibility. Existing LFL records and other source/edition inclusion decisions were not expanded or removed; those need a separate catalog-scope review if enforcing a strict 2014-only catalog. Optional source rules remain distinct rather than being silently replaced by another printing.

Official sources spot-checked include:

- [Legacy Tiefling](https://www.dndbeyond.com/species/7-tiefling): Infernal Legacy unlocks, upcast and ability.
- [Legacy Genasi](https://www.dndbeyond.com/species/23-genasi): Elemental Evil legacy grants and exceptions.
- [Official Fairy preview](https://www.dndbeyond.com/posts/1075-sneak-peek-check-out-the-fairy-race-in-the-wild/1000): modern racial free casts, chosen ability and spell slots.
- [Plane Shift: Ixalan](https://media.wizards.com/2018/downloads/magic/plane-shift_ixalan.pdf): Blue/Green Merfolk cantrips and Siren components.
- [Plane Shift: Kaladesh](https://media.wizards.com/2017/downloads/magic/Plane-Shift_Kaladesh.pdf): Vahadar druid cantrip and Wisdom.
- [Plane Shift: Zendikar](https://media.wizards.com/2016/downloads/magic/Plane%20Shift%20Zendikar.pdf): Mul Daya grants.

Publication target: ChatGPT Sites beta only. No stable deployment, GitHub push, version bump or changelog edit.
