# Character Forge — Changelog

A history of the D&D 5e **2014 rules** character builder and sheet.

**Latest release: 0.18.0 — October 30, 2026.**

## How to read this history

- Versions were introduced on October 30, 2026. Versions 0.1.0–0.14.0 below are **retrospective milestone labels**, not previously published tags or exact historical build identifiers.
- Dates use **America/New_York**. Older entries group related changes from accessible project conversations and source/GitHub commit history. Date ranges mean the work spanned multiple updates. This is a reconstruction, not a verbatim export of every chat.
- **Sites beta** and **GitHub beta** can differ. Documenting a Sites feature here does not mean the repository's app or stable website contains it yet. Before 0.15.0, GitHub app source was last synced on October 29 (`da9d6f7`). Release 0.15.0 compiles subsequent Sites beta work for GitHub and stable Cloudflare production.
- Stable production is [characterforge5e.com](https://characterforge5e.com/). Its latest stable release is 0.18.0.
- Repeated visual experiments and small follow-up fixes are consolidated into their final behavior. Planned companion tools, form managers, and the future magic-item catalog are not described as completed.

## 0.18.0 — 2026-10-30

### Stable production — characterforge5e.com

- Promoted the accumulated 0.15.1-beta.1 through 0.18.0-beta.1 features to stable production: editable weapon damage, inline selections, anvil icon, death-save tracking, roll history and dice commands, interactive Wild Shape, and racial-aware recommended ability scores.
- Restored the complete verified Sites HTML after a corrupted GitHub upload caused an empty homepage; verified the production homepage renders correctly.
- Connected Cloudflare Pages to GitHub main and corrected watched paths so pushes trigger deployments.
- Production footer and version.json now identify version 0.18.0 and the production channel. Historical beta entries below retain their original release labels.

## 0.18.0-beta.1 — 2026-10-30

### Recommended ability scores — Sites beta

- Barbarian presets prioritize all three physical abilities over mental-score parity. Standard Human now recommends 16 STR, 16 DEX, 16 CON, 9 INT, 9 WIS, 9 CHA using all 27 points.

- Follow-up: racial-aware recommendations now search valid allocations instead of using a fixed array; verified 128 class/build/racial-bonus combinations, including flexible bonus selections.
- New characters default to Point Buy. Existing characters retain their scoring method and allocation.
- Added Pick for me: editable class-specific builds for all 13 classes, using all 27 points on base scores from 8 to 15. Recommendations account for racial bonuses, favor even final scores, preserve the original build’s modifiers, then spend remaining points in build-priority order, even when that creates an odd final score. Racial bonuses remain separate and apply once.
- Added Strength/Dexterity fighter and ranger choices, plus medium/heavy-armor cleric builds. Heavy-armor clerics receive base Strength 15 and a proficiency reminder.
- Build descriptions show actual class priorities instead of incorrectly suggesting saving-throw proficiencies as ability priorities. Applied-state feedback updates when scores are customized.
- Point-buy controls have accessible names and disable illegal increases/decreases. Standard Array, rolled scores, and Manual remain available; fixed Manual controls being replaced by disabled rolled-score dropdowns.
- Verified every preset's point cost/range, safe class/profile fallback, preservation of racial/manual/other-method state, and browser checks for fighter variants and racial bonuses.

## 0.17.0-beta.1 — 2026-10-30

### Interactive 2014 Wild Shape and death cues — Sites beta

- Added Mark all as seen in the Wild Shape picker; marks the full catalog for this character while preserving level restrictions. Individual seen checkboxes now save immediately.
- Follow-up polish: inset all Wild Shape picker content consistently, and replace active roll popups immediately for every new roll, including beast damage and manual commands.

- Bury pulses after three failed death saves. The cue respects reduced-motion preferences and preserves the existing deletion confirmation.
- Added a searchable, role-filtered picker with 88 SRD forms (84 beasts and four Moon elementals), stat-block previews, locked-form explanations, and a seen-creature confirmation.
- Added recommendations and situational caveats informed by Luca’s supplied RPGBOT 2014 Wild Shape guide. Some non-SRD book options from that guide are outside this catalog.
- Wild Shape consumes the existing resource, enforces druid-level/CR/swim/fly limits, supports Moon CR progression and two-use elemental forms, and supports unlimited uses at druid level 20.
- Transforming temporarily replaces physical scores, AC, HP/Hit Dice, movement, and the Actions tab. Mental scores and applicable proficiencies remain; the higher applicable skill/save bonus is used. The hero’s original scores, HP, equipment and spell choices remain intact.
- Beast Actions, conditional Bonus Actions, Reactions, traits, senses, defenses, attack rolls, damage, critical damage, and secondary save damage are available on the sheet. Beast rolls enter the character’s roll history.
- Revert remains available as a bonus action. At 0 beast HP, duration expiry, or unconsciousness it pulses; ended forms cannot attack or heal. Excess damage is applied once to normal HP immediately, and confirmation returns the normal sheet. Temporary HP is shared normally.
- Added Moon Combat Wild Shape spell-slot healing, component-aware Beast Spells/Archdruid casting restrictions, manually tracked duration, and saved active forms. Merged equipment is inactive; DM-dependent retained features, immunities/resistances, recharge availability, and situational effects remain explicit/manual.
- Validated form eligibility, resource use, scores, HP/temporary HP/overflow/massive damage, restoration, spells, conditional actions, persistence, all prior regression suites, and browser transform/damage/revert/death cues.

## 0.16.0-beta.1 — 2026-10-30

### Roll history and manual dice commands — Sites beta

- Added a compact local chat-style roll history immediately under Passive Perception. It saves the last 100 entries per character, with timestamps, totals, individual dice, typed notes, and a confirmed Clear action.
- Sheet checks, saving throws, initiative, spell/weapon attacks, custom and equipped damage/critical damage, and death saves record their existing result without rolling again.
- Added `/r` and `/roll` commands for dice, arithmetic, parentheses, powers, rounding/math functions, keep/drop, grouped rolls, exploding/compounding/penetrating dice, rerolls, min/max, sorting, critical/fumble markers, success/failure counting, percentile and Fate dice, and inline labels.
- Added Dice help with examples and supported syntax, inline errors, Enter to send, Shift+Enter for notes, and Up to recall the last entry. History stays local to the saved character; multiplayer chat is not included.
- Parser uses no JavaScript evaluation. Pool size, nesting, expression length, total draws, and result limits stop runaway rolls. Unsupported commands fail explicitly.
- Verified deterministic parser/history tests, existing regression checks, and browser checks for manual rolls, sheet rolls, damage, death saves, notes, errors, and persistence after reload.

## 0.15.1-beta.1 — 2026-10-30

### Combat controls and inline selections — Sites beta

- Equipped weapons now have Damage and Critical damage buttons, plus an Edit action for attack/damage modifiers, extra damage dice and types, and critical settings. Character-owned overrides persist and class bonuses remain live.
- Class details, skill choices, and race/source-version details open immediately beneath the selected card.
- Replaced decorative four-point star marks with an anvil icon.
- Death-save counters remain visible with labeled successes/failures, status, manual controls, and reset. Rolls update counters, including natural 1 and 20; rolling stops after stabilization or death. Healing above 0 resets counters, and damage at 0 adds a failure.
- Verified JavaScript syntax and all five regression suites. GitHub and stable Cloudflare production are separate release channels.

## 0.15.0 — 2026-10-30

### Consolidated release — GitHub and stable Cloudflare production

- Compiled the accumulated Sites beta work in milestones 0.11.0–0.15.0-beta.1 into one release.
- Added class-specific choice managers, infusion prerequisite/item validation, full-width infusion references, and the unfinished-choice alert.
- Added inventory stacking, recovery snapshots, and the intermediate-width character-sheet layout fix.
- Added the searchable equipment shop, cart, affordability calculation, five-currency wallet, automatic change, and free Add checkout.
- Refreshed the character sheet and homepage, including the blacksmith silhouette and footer cleanup.
- Added colored rest buttons, conditions/exhaustion tracking, concentration reminders, and quick rules explanations.
- Added the footer release number, dated changelog, and persistent release policy.
- Future minor edits accumulate until a meaningful feature set or GitHub/Cloudflare release; changelog entries and versions are compiled at those milestones instead of on every small edit.

## 0.15.0-beta.1 — 2026-10-30

### Homepage refresh and version history — Sites beta

- Refined the homepage with a lavender/charcoal hero, character cards, favorites, buttons, import controls, and mobile styling.
- Kept feedback beside Buy Me a Coffee with a borderless hover treatment.
- Removed the homepage Recovery snapshots button; recovery remains on the character sheet.
- Removed excess space below the attribution footer.
- Replaced the decorative star/anvil experiments and surrounding rings with a purple blacksmith silhouette based on the supplied reference, without card lettering, badges, or borders.
- Added this dated, versioned changelog to GitHub and linked it from the website footer.
- Added the latest Sites beta version and update date to the website footer.

## 0.14.0 — 2026-10-30

### Sheet styling, rests, conditions and concentration — Sites beta

- Added a unified sheet stylesheet covering character identity, ability/stat cards, skills, sticky tabs, HP, resources, equipment, currency, spells, features, notes, and controls.
- Preserved full-height sheet panels and desktop/tablet/mobile layout behavior.
- Preserved the yellow unfinished-choice alert and available/depleted resource colors.
- Gave Short Rest a teal treatment and Long Rest a purple treatment.
- Added saved tracking for all 14 standard 2014 conditions, with quick explanations and links to full rules.
- Added exhaustion levels 0–6 with cumulative-effect guidance.
- Added concentration on/off tracking, an optional spell/effect name, an End concentration control, and a damage-to-Constitution-save-DC calculator.
- Marking an incapacitating condition or level-6 exhaustion ends tracked concentration. Other condition modifiers remain manual reminders, not automated attack, speed, or HP changes.

## 0.13.0 — 2026-10-30

### Searchable shop, cart and multiple currencies — Sites beta

- Replaced the equipment dropdown with **+ Browse equipment** and a searchable shop dialog.
- Added category filters for weapons, armor/shields, adventuring gear, tools/instruments, ammunition, packs, mounts/vehicles, potions, and magic items.
- Potion/magic categories are ready for future catalog entries; this did not introduce a full magic-item catalog.
- Added a cart with item quantities, removal, total cost, current balance, and the remaining-balance calculation.
- Added green affordability feedback and red insufficient-funds feedback directing users to **Add · free**.
- Added whole-cart Buy and free Add operations. Purchases validate the entire cart before changing inventory or funds.
- Left the separate custom item/treasure input outside the shop unchanged.
- Added CP, SP, EP, GP, and PP fields to the sheet.
- Shop purchases combine denominations, automatically make change, and preview the remaining coin breakdown.
- Used standard 2014 rates: 1 gp = 100 cp = 10 sp = 2 ep; 1 pp = 10 gp.
- Preserved old saves containing fractional GP by representing their value as whole coins.

## 0.12.0 — 2026-10-30

### Class-specific choice managers, phases 1 and 2 — Sites beta

- Added searchable class-choice editors with limits, prerequisite checks, rule details, source labels, saved selections, retraining budgets, and an explicit homebrew override.
- Added a Class choices summary in Features, level-up reminders, and a bright yellow pulsing button for unfinished/invalid selections; reduced-motion preferences are respected.
- Added Artificer infusions, individual Replicate Magic Item choices, active item assignments, attunement counts, and a spell-storing-item selection.
- Added item/type/property/level checks for infusion assignments, including nonmagical objects, ammunition/thrown properties, and the Homunculus gem cost. Invalid assignments no longer grant automatic bonuses.
- Revised infusion cards into full-width entries: title, explicit prerequisite only when specified, item requirement, then paragraphs/bullets. Higher-level options remain visible but locked.
- Applied supported infusion AC/weapon bonuses; other item effects and replicated base-object suitability still require manual adjudication.
- Added Warlock invocation/Pact Boon choices, Tome cantrips, Chain form selection, Blade weapon type, ritual-book selections, and Fiend resistance.
- Added Fighting Styles, Battle Master maneuvers, Rune Knight runes, Arcane Archer shots, Eldritch Knight weapon bonds, and associated choices/resources.
- Added Four Elements disciplines, Kensei weapons/tools, and optional Dedicated Weapon selections.
- Added Rogue/Bard Expertise, Lore skills, Magical Secrets, and related proficiency/spell integration.
- Added Ranger favored enemies, humanoid races, terrain, languages, Canny, optional feature replacements, and Fey Wanderer skills.
- Added Draconic ancestry, Aberrant Mind/Clockwork Soul spell replacements, Storm Sorcery immunity records, selected Cleric domain choices/optional Blessed Strikes, Mastermind tools/languages, and Bladesinger weapon proficiency.
- Preserved the existing Metamagic, Totem, Storm Herald, Hunter, Land, Genie, Divine Soul, and Mystic Arcanum editors.
- Preserved choices across JSON imports/recovery; included class choices in printable feature reference pages.
- Companion combat tools and play-time form/mode managers remain deferred.

## 0.11.0 — 2026-10-29–2026-10-30

### Inventory, recovery and tablet layout — Sites beta

- Stacked identical unequipped inventory items with quantity controls; equipped copies stay separate.
- Kept existing inventory serialization and maintained equipped-item indexes when copies are removed.
- Added local recovery snapshots with preview, JSON export, and restore; restoring also backs up the current state.
- Limited snapshot frequency/count to avoid excessive browser-storage use.
- Fixed intermediate-width sheet layout: abilities and stats above full-width content, preventing sidebar/content overlap before the phone layout activates.

## 0.10.0 — 2026-10-29

### Feature references, feedback and form polish — Sites and GitHub beta

- Added granted feat spells to My spells, including eligible noncasters, separate uses, rest recovery, and component exceptions.
- Added class advancement tables accessible from the class name.
- Expanded class-feature question-mark references and Artificer progression/rules text.
- Added Web3Forms feedback with feedback type, optional reply email, a 1,000-character message limit, and a live counter. Configured the supplied form key after initial setup.
- Placed Send feedback next to Buy Me a Coffee; used an icon, compact borderless styling, and hover feedback.
- Removed nested sheet-panel scrolling while retaining sticky Actions/Spells/Equipment/Features/Notes tabs.
- Styled dropdowns, text/number inputs, textareas, and file controls consistently.
- Revised spacing throughout the sheet, including resources, currency, labels, and toolbars.

GitHub sync evidence: [feature/feedback update](https://github.com/lucaazevedo2/character-forge/commit/f786659e), [page scrolling](https://github.com/lucaazevedo2/character-forge/commit/74b224bc), [form styling/spacing](https://github.com/lucaazevedo2/character-forge/commit/da9d6f7c).

## 0.9.0 — 2026-10-28

### Subclass choices, avatars, favorites and Spell Explorer

- Added subclass selection/review controls, future-feature previews, saved choices, and subclass editing.
- Added Totem Warrior level 3/6/14 choices and related saved subclass selections.
- Added subclass rules popups and Fiend expanded-spell references.
- Added character-avatar upload, ledger portraits, and favorite characters.
- Improved gear-icon alignment.
- Added Spell Explorer, refined spell descriptions/display, and top navigation; excluded UA entries during subsequent cleanup.
- Documented distinct stable production and experimental beta channels.

GitHub evidence: [subclasses/PDF](https://github.com/lucaazevedo2/character-forge/commit/495fe821), [avatars/favorites](https://github.com/lucaazevedo2/character-forge/commit/41774f56), [Spell Explorer](https://github.com/lucaazevedo2/character-forge/commit/f7b24722), [release channels](https://github.com/lucaazevedo2/character-forge/commit/a2137732).

## 0.8.0 — 2026-10-26

### Setting-specific races and printable sheets

- Restored setting-specific races behind an expandable DM opt-in with per-setting controls, filter tags, and source sections.
- Added credited artwork for restored options and updated Vampire artwork credit.
- Added **Export as printable PDF** beside renamed **Export as JSON**.
- Added PDF preview using the standard character-sheet layout, plus feature and overflow/reference pages.
- Fixed the PDF library-loading error.
- Left current HP, coins, and other pencil-tracked play fields intentionally blank in printable sheets, with preview guidance.
- Moved the AC bonus control into Gear → Attributes & HP.

These changes reached Sites first and were included in the October 28 GitHub subclass/PDF sync.

## 0.7.0 — 2026-10-07–2026-10-08

### Branding, artwork and sheet fixes

- Added the supplied anvil logo and Mouldy Cheese wordmark font.
- Added credited race/class artwork and source links; replaced earlier race concept-art presentation where updated artwork was supplied.
- Repaired sheet settings gear rendering/alignment and improved race-choice/source-link spacing.

GitHub evidence: [spacing](https://github.com/lucaazevedo2/character-forge/commit/e0cfe5cb), [gear repair](https://github.com/lucaazevedo2/character-forge/commit/7084a2ce), [branding/artwork](https://github.com/lucaazevedo2/character-forge/commit/6f022012).

## 0.6.0 — 2026-10-05–2026-10-07

### Expanded race sources and custom attacks

- Expanded race source versions, family organization, search, source filters/selectors, and flavor descriptions.
- Added links to view race versions on 5e.tools; preserved existing saved characters while changing catalog organization.
- Excluded 2024/UA content and revised source availability; setting options were later restored as explicit DM opt-ins in 0.8.0.
- Organized race families into Common, Monstrous, and Exotic groups and expanded portraits.
- Added Roll20-style custom attacks with editable names, attack bonuses, two damage components, critical dice, saving throws, ranges, descriptions, and roll controls.

GitHub sync: [race catalog, descriptions and attack editor](https://github.com/lucaazevedo2/character-forge/commit/68e5e614).

## 0.5.0 — 2026-10-04–2026-10-05

### Modern interface and manual spell grants

- Applied a modern dark interface to the GitHub version, followed by Sites updates.
- Added manual spell-access/known-count controls for characters with cantrips or spells outside their normal class progression.
- Restored missing race artwork and handled unavailable artwork gracefully.
- Added previews of newly gained features during level-up.
- Preserved the Mordenkainen Presents: Monsters of the Multiverse Tabaxi option and Chultian language during synchronization.

GitHub evidence: [redesign](https://github.com/lucaazevedo2/character-forge/commit/641c8955), [artwork fallback](https://github.com/lucaazevedo2/character-forge/commit/fa9b1b1f), [spell grants/art/level previews](https://github.com/lucaazevedo2/character-forge/commit/c79f287c).

## 0.4.0 — 2026-10-02

### Feature restoration and content additions

- Restored the expanded feature-complete builder to GitHub: leveling, spells, equipment, homebrew, saves, race previews, subclass explanations, Metamagic, and resources.
- Added the MPMM Tabaxi race option and Chultian language on Sites.
- Explored an alternative modern UI in a separate GitHub test branch before the later consolidated redesign.

GitHub evidence: [feature restoration](https://github.com/lucaazevedo2/character-forge/commit/f0e1e3fe).

## 0.3.0 — 2026-09-17

### Feats, race choices, subclass descriptions and resources

- Added full feat descriptions and feat/ASI progression, including Fighter's additional opportunities.
- Added Fizban dragonborn lineages and expanded race image previews.
- Fixed flexible racial ability-score selectors.
- Allowed removing spells from My Spells.
- Added subclass feature summaries and source references.
- Added Sorcerer Metamagic options and limited-use class resources such as sorcery points and ki.
- Published the GitHub website and refined its responsive character library/builder UI.

GitHub evidence: [initial publication](https://github.com/lucaazevedo2/character-forge/commit/23f73e22), [responsive UI](https://github.com/lucaazevedo2/character-forge/commit/0665fda1). Earlier feature work is also preserved in Sites source commits.

## 0.2.0 — 2026-09-16

### Desktop sheet, expanded choices and rules references

- Added a compact desktop sheet and manual settings editor, retaining a long-scroll mobile layout.
- Separated class, subclass, and racial feature sections with rules-source links.
- Added extra language choices and proficiency editing.
- Disabled accidental mobile double-tap zoom.
- Moved race details below the selected option and expanded the race catalog with portraits.
- Added published feats and feat progression.
- Added a closable spell-picker popup.

## 0.1.0 — 2026-09-15

### Initial Character Forge and spell workspace

- Built the 2014-rules character-creation flow with races, classes, backgrounds, skills, standard array, point buy, and rolled ability scores.
- Added a character ledger, browser-local saves/autosave, rolling, leveling, equipment and armor-class calculations.
- Added spell selection/preparation and homebrew-content imports/editors.
- Reworked spell management into an add/prepare workspace with class/subclass filtering, spell levels, Warlock pact magic/Mystic Arcanum, and controlled creation/respec limits.
- Added temporary-HP controls and XP/level-up notices.

Earliest retained source commit: `5f254bb` (Sites source, September 15 in America/New_York). Chat records describe this initial delivery during September 15 evening / September 16 UTC.

## Maintenance policy

Use `major.minor.patch` for future documented versions, with `-beta.N` for beta builds. Accumulate small edits until a substantial feature set or a requested GitHub/Cloudflare release. Automatically compile one changelog entry at that milestone; increase the patch for a collected fix release and the minor version for a feature release. Keep the displayed footer version and `dist/version.json` synchronized. Retrospective entries above are historical groupings, not a promise that every channel contains every feature. Do not publish private chat excerpts, account identifiers, feedback keys, or user contact details in this file.
