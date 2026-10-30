# Class choice managers — 2014 rules

The synchronous `dist/class-choices.js` extension loads after the existing app declarations and before initialization. Saved data lives on each character in `classChoiceData`, keyed by class position, class, and subclass rather than the character ID. This preserves choices when JSON imports assign a fresh character ID. No network request is needed to load the catalogs.

Catalog inputs: https://github.com/5etools-mirror-3/5etools-src/blob/main/data/optionalfeatures.json and `data/items.json`. Option source whitelist: PHB, XGE, TCE, SCAG, ERLW; common replicated items also include DMG item metadata. UA and 2024 option records are excluded. Existing class/subclass descriptions and editors remain in the base app. The source links in option details point to their corresponding Wikidot rule reference.

Managers cover infusions and replicated items, Pact Boons and invocations, Fighting Styles, maneuvers, disciplines, runes, Arcane Shots, Kensei weapon types, Expertise, Magical Secrets, Ranger choices and optional replacements, ancestry, bonus skills/tools/languages, subclass spell replacements, weapon bonds, and related spell choices. The existing Metamagic, Totem, Storm Herald, Hunter, Land, Genie, Divine Soul, and Mystic Arcanum editors are preserved.

Selection limits use class levels. Initial setup supports existing characters. Replacement history is saved per group; subclass spell replacement additionally stores the last sorcerer level used. Incomplete choices can be saved, and are listed as unfinished. Homebrew override is explicit. Spell schools and lists for Clockwork/Aberrant replacement options are filtered independently from normal spells.

Shared resource actions use the existing tracked pools and rest resets. Unconditional Defense and Archery style bonuses and single-weapon Dueling are applied. Equipped Enhanced Defense, Repulsion Shield, Enhanced Weapon, Returning Weapon, and Repeating Shot bonuses are applied; other magic item effects and conditional feature benefits remain described for manual adjudication. Conditional resistance, rerolls, and target-specific limitations are not silently assumed. The optional Ranger and Cleric replacement choices hide their replaced features.

Class choices are included in character JSON/recovery through ordinary character serialization and in printable feature reference pages. Play-time form and companion tools remain separate future work.

Validation: `node tests/feat-spells.cjs`, `node tests/class-choices.cjs`, `node --check dist/class-choices.js`. The new suite covers class and subclass levels, limits, prerequisite filtering, resource spending, spell grants, Bard spell budgets, optional replacements, multiclass isolation, replacement timing, and import persistence. Fighter choice selection/save was exercised in the browser; later preview re-entry was blocked by the browser environment.

Infusion assignments enforce class level, nonmagical status, armor/shield/focus types, ammunition/thrown properties, and the 100 gp Homunculus gem requirement. Invalid saved assignments no longer grant automatic bonuses. Replicated base objects still require manual suitability review; explicit homebrew override remains supported. Requirements are shown on infusion cards.
