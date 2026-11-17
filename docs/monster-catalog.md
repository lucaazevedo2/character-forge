# Monster catalog and DM combat import (Sites beta)

- Ships all 334 creature stat blocks returned by the 2014 SRD API catalog, downloaded November 13, 2026. Source: https://www.dnd5eapi.co/api/2014/monsters . Licensed SRD 5.1 text; see dist/licenses/SRD-5.1.txt. Not a complete collection of creatures from paid books.
- Monster Explorer searches name/type, challenge rating and creature type, with full attributes, defenses, traits, spellcasting, actions, reactions and legendary actions present in the source.
- DM Tools → running combat → Add monster / NPC → Browse / import monster. Selection fills name and average maximum HP, rolls d20 + Dexterity modifier for initiative, and previews the full stat block. Review values, then Add to combat. Manual NPC entry remains available.
- Existing combat writes use the same checked add_npc/edit_npc RPCs and hidden-player rules. Reopening an NPC with an exact catalog name shows its original stat block. Custom-renamed NPCs can browse the catalog again; no new server metadata field is introduced.
- VTT compendium and campaign creature imports use the shared full catalog. Wild Shape retains its existing 88 forms and restrictions.
- Data is bundled locally and fetched only when the explorer or tabletop opens; ordinary character sheets do not fetch the monster JSON. No third-party API request is needed at runtime.

Validation: every catalog ID matches the API index, all 334 convert through the existing creature validator, stat-block rendering escapes HTML, loader and creature regressions pass. Browser checks covered Lich search/stat block, legendary sections, and the actual DM form importer in a local fixture (Goblin → HP 7, d20 fixture roll 7 + DEX 2 = initiative 9; checked add_npc payload). Live authenticated party import has not been exercised.
