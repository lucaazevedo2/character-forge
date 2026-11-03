# Equipment v1

The Equipment panel uses the existing dark components, currency wallet and equipment shop. Each compact row has a carried checkbox, quantity, editable name, per-item weight and an information toggle. Handles support pointer/touch sorting and up/down keys. Pointer sorting lifts the row under the cursor, animates neighboring rows, and reserves an insertion gap. Escape/pointer cancellation cancels the drag.

## Save compatibility

`equipmentFormatVersion: 1` versions the new `equipmentItems` array independently of the existing `schema_version: 1` local/cloud envelope. No database migration is needed. `migrateEquipment` returns a copy, preserves unknown character fields, creates a stable ID per old inventory entry and keeps names, equipment status and weapon-attack overrides. Catalog entries supply weight, armor and weapon defaults; unknown items default to one carried item, weight zero, and no automatic modifiers. Re-running migration is idempotent; unknown future versions are rejected.

`inventory` remains a string array for older clients, the shop, party operations and exports. `inventoryItemIds` maps each legacy copy to its rich item. Quantities project into individual copies; `equipped` holds the first eligible copy's index. Infusion assignments are remapped using stable IDs. Existing name-array edits are reconciled on the next render/save. New notes, properties and modifiers remain on the character and are included in JSON/cloud payloads.

Migration is lazy on use and explicit at cloud load/save boundaries. It does not rewrite every unopened local or cloud character. Rich item metadata transfer between party accounts is not added to the existing name-based transfer protocol in this release.

## Item shape

An item has `id`, `name`, `catalogId`, `catalogName`, integer `quantity`, per-item `weight`, `carried`, `equipped`, `type`, `properties`, `notes`, `requiresAttunement`, `attuned`, `armor`, `shieldBonus`, `attack`, `resource` and `modifiers`. Names can change without changing linked attack IDs. Optional `legacyAttackOverride` retains the prior weapon override.

- Armor: `baseAC`, `category` (light/medium/heavy), `dexCap`, `strength`, `stealthDisadvantage`.
- Attack: `enabled`, `ability` (str/dex/finesse), `proficient`, `damageDice`, `damageType`, `extraDamage`, `extraDamageType`, `range`, `kind` (melee/ranged), `magicBonus`, `versatile`. Legacy attack/damage flat bonuses are preserved.
- Resource: `enabled`, `current`, `max`, `recharge` (short/long/dawn/manual), `consumeQuantity`. Dawn is an explicit tracker reset, not a real-world scheduled event. Long rests also restore short-rest resources; dawn/manual resources do not automatically reset on rests.
- Modifier: `target`, `operation` (add/minimum/exact), numeric `value`. Quick entry accepts `AC: +1`, `STR: min 19`, and `STR: exact 19`.

## Derived stats

`computeStats(base, items)` is pure. The adapter gathers the existing class, race, feat, proficiency, infusion and manual calculations as base inputs. The result contains `values`, `breakdown`, `warnings`, `attackStats`, linked `attacks`, and active IDs. Base ability/manual values are never changed. Exact/minimum operations run before additive bonuses; item order resolves competing exact settings. Shared check/save modifiers apply once. Attack exact/minimum operations apply to final attack bonuses.

Items require positive quantity and Equipped to contribute. Required attunement must also be active. The default attunement limit is three, increasing to four at Artificer class level 10, five at 14, and six at 18 (including multiclass Artificers). The editor blocks attunements beyond that limit; imported over-limit saves warn and only the first permitted attuned items contribute. Level changes recalculate the limit without removing items or attunement choices. Carried affects weight, separately from Equipped. Multiple body armors/shields warn, and only the first of each applies. Armor fields feed the existing AC rules; Monk/Barbarian unarmored defense and existing bonuses remain supported. Merged Wild Shape equipment contributes no modifiers. Armor Strength/Stealth restrictions are warnings; the Stealth roll mode remains a table decision.

Linked inventory attacks use `inventory:<item id>` and are derived rather than duplicated into `customAttacks`. Finesse chooses the better ability, Versatile can select two-handed dice, Reach supplies 10 ft. for a default melee reach, and Heavy imposes the 2014 Small/Tiny attack disadvantage. Thrown weapons can select ranged attack kind while retaining STR/finesse. The sheet and printable export use the same linked attack records. Generic custom attacks remain separate.

## Validation and manual checks

Run from the repository root:

```
node tests/equipment-acceptance.cjs
node tests/equipment-integration.cjs
node tests/equipment-drag.cjs
```

The integration and drag tests use `linkedom`, also used by the existing DOM suites. Set NODE_PATH to an installed linkedom location if it is not installed in the checkout.

1. Add an item named +1 Shield. Choose Shield, leave its shield bonus at 2, add `AC: +1`, then equip it. AC must increase by 3. Unequip and confirm restoration; hover the highlighted AC for its source breakdown.
2. Add Gauntlets of Ogre Power with `STR: min 19`. Require attunement. Verify no change until both Equipped and Attuned are on; verify unequipping restores the original STR. A starting STR of 19+ stays unchanged.
3. Enable Has an attack on a Longsword. Confirm an inventory-badged entry in Actions. Change its name/damage, then disable the toggle or delete the item and confirm the linked entry disappears.
4. Set quantity to 40 and per-item weight to 0.1. Confirm 4 lb is added. Turn off Carried and confirm it is excluded.
5. Open an old guest character and a cloud character, check inventory/equipped state, export JSON, reload and compare. Test drag sorting, keyboard sorting, quantity edits, shop additions and infusion assignments. The automated tests cover schema/JSON payload compatibility and simulated cloud behavior; a real multi-account signed-in browser round trip remains unverified.

## Duplicate-gear and performance repair (beta.2)

An independent `equipmentStackVersion: 1` repair consolidates identical plain unequipped gear in both legacy and existing equipment-v1 saves. It keeps the first stable ID, sums quantities and maps legacy copy IDs to the surviving stack. Equipped/attuned objects, attacks/resources, modifiers and infusion references stay separate; different notes, weight or other metadata prevent merging. Legacy inventory still contains the same number of individual copies for compatibility.

Collapsed rows contain only compact controls. Detail forms are built on first expansion. The legacy row renderer is skipped for rich equipment, and ordinary gear does not run weapon-bonus calculations. `tests/equipment-performance.cjs` covers the repair and these rendering/cache invariants.
