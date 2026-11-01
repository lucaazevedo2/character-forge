# Character Forge — Changelog

A history of the D&D 5e **2014 rules** character builder and sheet.

**Latest release: 0.23.0 — November 1, 2026.**

## 0.23.0 — November 1, 2026 (GitHub main and stable release)

Consolidates completed Sites beta work since stable 0.19.0:

- Google sign-in, separate account workspaces, private cloud character/portrait saves, offline retry, revision-conflict handling, guest import, Trash, recovery and account tools.
- Organizer-led parties, optional assigned DMs, live HP/condition/initiative summaries, sessions, combat order, manual NPC tracking, private DM prep notes and read-only character overviews.
- Favorites remain in Favorites and party groups. DM quick dice includes the complete expression reference.
- CSS mobile navigation with an unboxed left hamburger, centered branding and an animated left drawer. Compact party portraits have no surrounding cards; damage tint clips to the portrait.
- A separate DM portrait area between the character and party, account/default avatar fallbacks, and green dots only for the DM Tools page or assigned character sheet. Stale activity expires after 45 seconds.
- Preserve the existing Item Explorer, complete magic-item catalog, source descriptions, performance fixes, printable PDF/JSON exports and all stable character content.
- **Not enabled:** one-use DM invitations, party admins/ownership transfer, private whispers, shared chat/rolls, ten-player enforcement and item/gold transfers. Their prepared source and tests are included, but the separate social database migration remains pending approval and the client hides its controls.
- Release metadata and account redirect paths cover the published stable/GitHub app addresses. Database role/isolation tests and app regression checks passed; real multi-account OAuth/browser checks remain a verification limit.
- The account-deletion function origin update is included as source but was not deployed: automatic approval review requires explicit approval for replacing that production function. Account deletion from the new domains remains a known limitation until approved.

## 0.23.0-beta.2 — November 1, 2026 (Sites beta)

Layout refinement: the DM now has a separate portrait area between the character identity and the party on desktop, with a distinct responsive placement on smaller screens. Avatar, activity indicator and portrait actions remain available.

- Show the assigned DM first, to the left of the other party portraits, with a DM/account-name label. No DM slot appears when none is assigned.
- Use the DM's Google account avatar; anonymous accounts and failed/missing avatars use a neutral default portrait. Party characters without portraits use the same default.
- Add page-specific green activity dots: DM Tools for the DM; the assigned character sheet for players. Hidden/closed pages stop activity, and a lost connection expires within 45 seconds. Independent tab IDs preserve activity when another tab remains open.
- Add a membership-checked presence RPC and transient activity table. No change to party ownership, DM permissions, chat or transfers. Raw presence rows are inaccessible to anonymous and signed-in clients.
- Replace the party settings gear emoji with a consistently sized SVG for mobile.
- Verified page-mode UI logic, avatar fallback, DM ordering, activity expiry, role/membership isolation, multiple tabs, live grants and unauthenticated rejection. Existing dice, cloud-save and sheet-combat checks pass. Browser visual QA uses representative party fixtures; multi-account signed-in browser QA remains outstanding.


## 0.23.0-beta.1 — November 1, 2026 (Sites beta)

Interface refinements: unboxed top-left hamburger, larger centered mobile branding, animated left drawer with navigation icons, backdrop/Escape dismissal and focus handling. Party full cards no longer stretch vertically; compact mode uses bare circular portraits, small names, and damage tint clipped inside each portrait. Luca’s preference for polished CSS interfaces is recorded in project guidance.

- Hide the party dialog’s DM Tools shortcut from players; the assigned DM retains it.
- Show favorites both in Favorites and their party groups.
- Add the sheet’s full dice syntax reference to DM quick dice, including optional `/r` prefixes.
- Display the assigned account as **DM: [username]**.
- Add compact party portraits with red missing-HP tint, a DM icon, and clickable condition badges in both portrait modes. Badge artwork remains provisional.
- Replace mobile navigation with a hamburger menu while retaining home branding and account access.
- **Prepared, tested, but not enabled:** organizer-only one-use DM invitations, party admins/ownership transfer, participant-only whispers, public party rolls/chat, a ten-player limit plus DM, and atomic gold/item transfers. These require `supabase/party-social.sql`; automatic approval review blocked the live database migration pending explicit approval. The client checks the server’s `social_ready` flag and hides these controls on the existing backend.
- Verified with party and social database tests, UI fixtures, dice, combat, cloud-save and condition regression checks. Phone-width browser QA confirmed the header and hamburger behavior. Signed-in browser testing across multiple accounts remains outstanding.
- GitHub and stable Cloudflare publication are separate from this Sites beta.


## 0.22.0-beta.1 — 2026-11-01

### Organizer-led parties and optional DM Tools — Sites beta

- Parties now have an organizer and no mandatory DM. HP, portraits and conditions continue sharing without a session. Organizers manage invites/membership and may optionally assign any party member as DM.
- Replaced Party navigation with a dedicated DM Tools page. Party settings now open through the sheet's party gear, grouped ledger headings, or Organize parties beside Your characters.
- Grouped signed-in characters by party, with unassigned characters in Not in a party. Favorites stay first within each group; a character in multiple parties appears in each relevant group.
- Moved optional session/encounter controls into DM Tools, with a PC status column, initiative/round controls, simple named monsters/NPCs with manual HP/initiative, private session notes and a local dice roller. No monster statblocks added.
- Added read-only PC combat/rules overviews for the assigned DM during a live session: abilities, AC, known/granted spells, feature summaries and equipment. Player notes, biography, email and complete character JSON are excluded.
- Organizer and DM permissions are separate and server-enforced. Changing/removing the DM ends the optional session/combat and clears private DM notes while preserving the party and characters. Existing active sessions retain their assigned owner as DM during migration; inactive parties become organizer-only.
- Validated organizer/DM separation, optional sessions, role revocation, overview/notes privacy, upgrade preservation and existing cloud/combat behavior. Browser QA exercised grouped ledger settings, optional DM activation, sessions/combat, manual NPC entry and read-only PC inspection with a disposable fixture.
- Sites beta only; no GitHub push or stable Cloudflare deployment.


## 0.21.0-beta.1 — 2026-11-01

### Shared parties, live sessions and DM combat — Sites beta

- Added Party navigation, persistent parties, random invite codes, member removal/code rotation and character selection per account.
- Added a responsive party strip beside the character-sheet identity: character portraits, HP/max HP, temporary HP, conditions, exhaustion/concentration, initiative and current-turn highlighting.
- Added persistent parties with separate live sessions and combats. The DM can add monsters/NPCs, enter/edit initiative, advance turns and rounds, and adjust party characters' HP/conditions during a session.
- Existing sheet initiative rolls feed into the active combat order before turns begin. Manual totals remain available. Player views omit NPC HP and hidden NPCs' identities/initiative.
- Party summaries exclude private notes, inventory and complete sheets. Membership and DM permissions are enforced by checked database RPCs. Portrait sharing is scoped to currently selected characters; DM vitals edits preserve character revision/conflict protection.
- Status refreshes every three seconds while visible; offline updates pause. This release uses near-live polling rather than persistent Realtime subscriptions.
- Validated database authorization and conflict behavior locally and with rolled-back synthetic accounts in Supabase; visually checked the strip, party manager and DM controls with a disposable browser fixture. A multi-player session with real Google accounts remains to be tested.
- Sites beta only; no GitHub push or stable Cloudflare publication. Details and limits: docs/shared-parties.md.


## 0.20.0-beta.1 — 2026-11-01

### Google login and private cloud saves integration — Sites beta

- Account menu polish: Google profile photo replaces the Account text button, with an initials fallback. Redesigned the dialog with a profile header, sync badge, icon-based action rows, separate sign-out/delete controls, and a compact close button.

- Follow-up: replaced the large homepage cloud panel with a compact, white Google sign-in button in the top-right header. Narrow screens use the circular Google icon; account tools move into a dialog.

- Preserved Sites version 113 / source `cf0042dfe9852e2c947bb4251af4654876ee8a8f` as the pre-account rollback point (see docs/cloud-rollback.md).
- Added optional Google login through Supabase, with a separate account workspace and explicit, checkbox-based guest imports. Guest mode and JSON/PDF exports remain available.
- Added immediate local persistence plus debounced cloud writes, offline retry, save status, revision-checked conflict choices, duplicate-import IDs, and account/tab-separated caches and recovery.
- Added versioned JSON envelopes and an owner-protected SQL schema with atomic save RPCs, data-size limits, Trash/30-day expiry, and a per-account character limit.
- Added private cloud portrait upload/download using existing compression. Portable JSON keeps embedded images; built-in race/class artwork stays hosted as before.
- Added Trash restore, bulk JSON backup/import, explicit sign-out cache clearing with an unsynced-edit warning, and server function sources for permanent account deletion and expired-trash maintenance.
- **Google sign-in enabled on Sites beta:** verified Google provider availability and the authorization redirect to accounts.google.com with the correct Supabase callback. Supabase project character-forge is now connected with private tables/portraits, deployed account-deletion and Trash functions, and daily cleanup. Live PostgreSQL isolation/conflict checks passed. Google OAuth provider is configured and cloud saves are enabled. A first real-account sign-in and cross-device portrait/save check remains pending.
- Validated sync behavior with a simulated backend and executed the SQL schema/access policies under local PostgreSQL (PGlite). Real OAuth, Storage API, server functions and scheduled maintenance still require the connected project.
- Sites beta only; no GitHub push or stable Cloudflare deployment in this release.

## How to read this history

- Versions were introduced on October 30, 2026. Versions 0.1.0–0.14.0 below are **retrospective milestone labels**, not previously published tags or exact historical build identifiers.
- Dates use **America/New_York**. Older entries group related changes from accessible project conversations and source/GitHub commit history. Date ranges mean the work spanned multiple updates. This is a reconstruction, not a verbatim export of every chat.
- **Sites beta** and **GitHub beta** can differ. Documenting a Sites feature here does not mean the repository's app or stable website contains it yet. Before 0.15.0, GitHub app source was last synced on October 29 (`da9d6f7`). Release 0.15.0 compiles subsequent Sites beta work for GitHub and stable Cloudflare production.
- Stable production is [characterforge5e.com](https://characterforge5e.com/). Its latest stable release is 0.23.0.
- Repeated visual experiments and small follow-up fixes are consolidated into their final behavior. Planned companion tools, form managers, and future item-effect automation are not described as completed.

## 0.19.0 — 2026-10-31

### Item Explorer and magic items

- Added a full-page Item Explorer with alphabetical sorting, compact rows, 50 items per page, search, rarity/source filters, and setting-specific items hidden until explicitly enabled.
- Added 912 magic-item rarity records, with 830 supplied descriptions covering rarity variants, expandable rules, tables, and source links. Added supplied equipment descriptions for 71 mundane entries.
- Magic items have no purchase price and bypass the cart through a rarity-confirmed Add to sheet action; ownership does not automate bonuses, charges, or attunement. Stack increases also require confirmation.
- Applied distinct rarity colors throughout the catalog and inventory, animated teal/magenta Artifact and red/orange Unique gradients with reduced-motion support, and darker gray mundane names.
- Browse Equipment lists purchasable gear only, with standard Potion of Healing at 50 gp as its sole magic-item exception. Added an Item Explorer shortcut.
- Named healing potions Healing, Greater Healing, Superior Healing, and Supreme Healing; legacy names continue to resolve without changing quantities.

### Performance

- Cache the combined item catalog, indexed name/legacy lookups, spell catalog, and spell ID lookups; homebrew imports refresh the caches.
- Render item and spell descriptions only when expanded; reuse sorted item lists while filtering.
- Skip eligibility scans for the closed Add Spell picker when opening or updating a character sheet.
- Controlled benchmarks reduced 2,000 item lookups from approximately 447 ms to 2 ms and level-12 cleric spell-panel generation from approximately 17 ms to 3 ms. These are component benchmarks, not end-to-end load guarantees.
- Verified catalog protections, legacy healing names, homebrew cache invalidation, spell grants, class choices, combat, Wild Shape, and browser character-opening/description/picker flows.

## 0.18.2 — 2026-10-31

### Performance — stable production

- Cache equipment catalogs and name/alias lookups instead of rebuilding the list repeatedly during sheet calculations.
- Cache spell catalogs and ID lookups; homebrew library replacement and added records refresh both caches.
- Skip the full eligibility scan for the closed Add Spell picker when opening or updating a character.
- Generate owned and picker spell descriptions only when expanded; preserve currently open descriptions on updates.
- This release includes performance changes only. Item Explorer and magic-item features remain on Sites beta.

## 0.18.1 — 2026-10-30

### Stable production polish

- Metamagic choices use compact left-aligned checkboxes beside names, costs, and descriptions in creation, editing, and level-up views; selected cards are highlighted.
- Recommended heavy-armor builds keep base Dexterity at 8 and spend the full 27-point budget on other abilities. Racial bonuses remain separate.
- Heavy-armor proficiency from classes, supported cleric domains, and Armorer artificers informs recommendations.
- Clerics can explicitly select Medium armor without the dropdown snapping back to Heavy; medium builds can invest in Dexterity.
- Verified heavy-armor allocations and explicit cleric preset switching. Promoted the tested Sites beta changes to production.

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
