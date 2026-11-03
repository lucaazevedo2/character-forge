# Character Forge — Changelog

A history of the D&D 5e **2014 rules** character builder and sheet.

**Latest stable release: 1.0.1 — November 2, 2026.**

## 1.0.1 — November 2, 2026 (Stable production)

- Stop the Add a spell popup from automatically focusing search when opening or adding spells. Keep keyboard focus on a non-text control after button actions, preserve popup scroll, and retain search focus only when the user is actively using it.
- Clear search focus on touch button taps before rebuilding the picker, preventing the mobile keyboard from reopening after each selection. Apply to character creation and sheet spell management.

## 1.0.0 — November 2, 2026 (Stable production)

First 1.0 release, promoting the current approved beta build to GitHub main and characterforge5e.com.

- Ship automatic magic-item properties, equipped/attuned bonuses, base weapon/armor variants, charge tracking, recharge rules, and saved per-item edits.
- Improve spell-search responsiveness and remaining-selection counters, retain wizard spellbook additions after creation, and provide a manual spell-selection limit override.
- Add dedicated URLs for references, characters, creation, custom content, DM Tools, licensing, and the graveyard, with browser history and direct-link support.
- Add a searchable Feats explorer with prerequisites and ability-increase filters. Add, configure, edit, and remove feats for a selected character while preserving lineage locks.
- Simplify level-up to ASI — Recommended or Feat. Keep ability selections unset; choose level-up feats through the explorer, stage changes until confirmation, and highlight/scroll to unfinished choices.
- Polish all 87 full feat descriptions while preserving their wording. Add racial/background help icons and preserve character-local feature text edits.
- Add chat/roll portraits, redesigned member actions, and verified active/idle/offline presence with multiple-tab aggregation, authenticated tab-close keepalive requests, and a 90-second force-kill timeout.
- Preserve deceased characters in the Graveyard through the existing Bury action. Add a glowing Resurrect action with named confirmation, and move deleted memorials to recoverable 30-day Trash.
- Preserve Google/cloud saves, party administration, conditions, class choices, printable PDF/JSON exports, recovery snapshots, and existing artwork/licensing.
- Synchronize the footer and version metadata at 1.0.0 and publish all accumulated beta changes together.

## 0.30.0-beta.2 — 2026-11-02 (Sites beta)

- Reflow full feat descriptions into readable paragraphs, named benefit headings, and benefit lists without altering wording. Remove nested description scrolling and correct disclosure spacing.
- Simplify level-up to ASI — Recommended (the default) or Feat, leaving individual ASI abilities unset. Choose eligible level-up feats through the shared explorer, then configure their choices in the level-up dialog. Keep all changes staged until Apply level. On unfinished choices, shake and briefly redden Apply level, highlight/shake the missing dropdowns, show a red error beside the choices, and scroll/focus the first missing choice. Respect reduced-motion preferences.
- Rename the graveyard restore action to Resurrect, style it with ivory/gold/sky-blue radiance, and require a named confirmation with matching divine emphasis. Remove the duplicate top Back to ledger button.
- Open the Feats explorer from the sheet’s feat edit action instead of the large feat dropdown modal, with the current character already selected.
- Add feats directly to a selected saved character from the explorer. Reuse ability, skill, proficiency, and spell choice validation; prevent duplicates and preserve lineage locks. Allow editing and removing non-lineage feats and returning to the character sheet.
- Filter feats by Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma, any ability increase, or no ability increase. Combine these with search and prerequisite filters.

## 0.30.0-beta.1 — 2026-11-02 (Sites beta)

- Keep spell search input mounted while updating results after a short typing pause. Cache spell eligibility/grants per render and filter names before expensive character checks.
- Show remaining cantrip and spell selections inside Add a spell, distinguish wizard spellbook entries from prepared spells, preserve post-creation wizard additions, and add an explicit unlimited-selection switch in Sheet settings → Spellcasting.
- Add left-aligned portraits to local rolls and notes, and normalize party chat/roll portrait layout.
- Add path-based navigation for spells, items, feats, custom content, characters, creation, DM Tools, licensing, and the graveyard, with history navigation and single-page hosting fallback.
- Add feature help icons to racial and background features and a dedicated searchable Feats explorer with prerequisite filters.
- Redesign member actions with a portrait header and separate Whisper, Give Gold, and Give Item action rows.
- Change the existing Bury action to preserve characters in a Character Graveyard. Keep sheets viewable, allow returning to the ledger, and move deleted memorials through the existing 30-day cloud Trash. Guest characters get a local recoverable Trash.
- Require explicit ability selections for both level-up ASI increases instead of defaulting to Strength.
- Send authenticated keepalive departure requests when a tab closes, suppress closing-page heartbeats, and re-clear a late in-flight heartbeat. Resume presence after back/forward-cache restoration. Mobile force-kills fall back to the 90-second heartbeat expiry.
- Enable isolated beta-only active/idle/offline presence tracking with multiple-tab aggregation, heartbeats, and grey offline indicators. The approved `supabase/beta-presence.sql` setup is installed and verified for active, idle, offline, multiple-tab precedence, and access restrictions. Stable presence data and RPC stay unchanged.

## 0.29.0-beta.1 — 2026-11-02 (Sites beta)

- Automatically populate magic-item equipment defaults from the supplied property and charge mappings. Preserve existing inventory edits.
- Add base-equipment and variant selection, equipped/attuned stat bonuses, capped abilities, level-scaled HP, movement modifiers, and situational-effect switches.
- Fill charge pools and retain recharge instructions; Recharge rolls dice instead of refilling every pool. Figurine duration hours remain notes.
- Keep permanent manuals/tomes as one-time-use instructions rather than equipped bonuses. Complex nonnumeric effects remain rules notes.

## 0.28.0-beta.5 — November 2, 2026 (Sites beta)

- Ask for a base weapon or armor when acquiring generic +1/+2/+3 magic equipment. Derive the enhancement from the selected catalog rarity, preserve base properties, and save a distinct inventory item with its configured effects.
- Apply weapon enhancements to both attack and damage rolls while equipped; armor and shields gain their enhancement through AC modifiers. Verify all nine enhancement/type combinations and save round trips.
- Give long spell casting times a flexible, wider desktop column so reaction triggers remain readable.

## 0.28.0-beta.4 — November 2, 2026 (Sites beta)

- Fix Artificer attunement limits: 4 items at class level 10, 5 at 14, and 6 at 18. Use the same limit for the counter, editor validation, warnings, item modifiers and linked attacks.
- Recalculate active equipment when crossing a threshold in either direction, preserving saved items and attunement choices. Multiclass characters use Artificer levels rather than total level.

## 0.28.0-beta.3 — November 2, 2026 (Sites beta)

- Add a small reset link beneath Armor Class that clears manual AC adjustments and restores automatic tracking, preserving equipped armor, shields and item modifiers.
- Add Undo level beside Level up. New level-ups retain up to 20 compact, persisted undo records for the fields they changed, including ASI, feat, subclass, HP-roll and Metamagic choices. Undo preserves inventory, notes and XP and adjusts HP to the restored maximum.
- Older levels without undo records use Remove level with a review dialog and explicit feat/ASI reversal choices when applicable. Save a recovery snapshot before reductions; level 1 cannot be reduced. The controls affect the main class, matching the existing Level up control.
- Invalidate cached derived stats when total level changes so HP and other level-based values recalculate during a level-up transaction.
- Verify AC reset scope, retained item effects, serialized undo, ASI/feat/Metamagic restoration, unrelated-state preservation and existing equipment regressions. Browser checks cover AC reset, level 3→4→3 with STR/HP restoration, and older-level removal with HP recalculation.
- Sites beta only.

## 0.28.0-beta.2 — November 2, 2026 (Sites beta)

- Repair duplicate plain gear in both old and already-upgraded equipment saves: 20 identical crossbow bolts now appear as one row with quantity 20. Keep equipped/attuned items, weapons, resources, modifiers, infusion references and different metadata separate.
- Avoid rendering the discarded legacy inventory and build rich detail forms only when expanded. Reuse cached stats before inventory comparisons and skip weapon-bonus calculations for inactive weapons and ordinary gear. Invalidate stats on creation-screen renders as well as sheet renders.
- Verify legacy/v1 stack repair, quantities and distinct notes, cached stat reads, 100 collapsed rows with zero eagerly created detail inputs, on-demand detail opening, and existing equipment/combat regressions. Browser fixture confirms one 20-bolt row and working lazy details.
- Sites beta only.

## 0.28.0-beta.1 — November 2, 2026 (Sites beta)

- Redesign Equipment as compact carried/quantity/name/per-item-weight rows with expandable item details, custom items, confirmed deletion, weight totals and STR-based capacity. Keep the existing wallet and shop.
- Add stable equipment IDs, equipment-format v1 and a lossless legacy migration/compatibility projection. Preserve guest/cloud envelopes, unknown character fields, old weapon overrides and infusion links across sorting.
- Add equipped/attunement-gated modifiers, armor/shield fields, structured and quick-entry modifiers, live derived stats and source tooltips. Preserve manual bases, class AC and inactive merged Wild Shape equipment. Block fourth-item attunement; warn about multiple armors/shields.
- Add inventory-linked attacks with stable IDs, editable combat fields, property-aware logic and printable export support. Resource trackers support short/long/dawn/manual recovery or quantity consumption.
- Lift dragged rows under the cursor, animate neighboring rows and show an insertion gap. Support pointer cancellation, reduced motion and keyboard ordering.
- All five requested acceptance cases pass, plus rendered linked attacks, stat purity, class AC, Wild Shape, infusion remapping, save round trips, shared checks/saves, exact attack bonuses and animated-drop DOM checks. Browser checks confirm live shield AC, source breakdowns, linked attack removal, pointer sorting and keyboard sorting. Compact and expanded controls fit a 375px phone viewport without horizontal overflow.
- Live signed-in multi-account cloud browser QA remains unverified. Existing party transfers retain their name-based item protocol; rich metadata sharing is outside this release. Details and testing guide: docs/equipment.md.
- Sites beta only; no GitHub or stable Cloudflare publication.

## 0.27.0-beta.1 — November 2, 2026 (Sites beta)

- Remove the redundant underlined Feats text-edit link while preserving existing character overrides and the feat manager. Selecting a feat in Add or edit a feat now shows its summary and expandable full description before applying it.

- Add full supplied class/subclass rules behind the existing question-mark controls while preserving current subclass summaries and all mechanical data. Support named variants, future-feature previews, spell-list wording and invocation references.
- Add full reference text for all 87 enabled published feats, with question-mark controls on the sheet and expandable full descriptions in feat previews. Preserve the existing feat selection and source exclusions.
- Keep character-local feature edits authoritative. Supplied text is escaped and stored separately from summaries; plain-text table lines remain intact.
- Verify all indexed subclass references, feat coverage, summary/mechanics preservation, aliases, text escaping, and combat/spell/class regressions. Browser fixture confirms the original subclass summary and independently expandable full wording.
- Sites beta only; GitHub and stable Cloudflare production remain separate releases.

## 0.26.0-beta.1 — November 2, 2026 (Sites beta)

- Import the supplied full text for all 574 existing spell records, filling 255 previously empty descriptions. Spell Explorer and character spell details now show the supplied effects, higher-level rules, material requirements and source books.
- Refresh casting details, ritual/concentration flags and class lists from the upload. Preserve stable spell IDs, attack/damage metadata and subclass grants so saved characters keep their spell references.
- Keep Unearthed Arcana excluded from normal spell choices and Spell Explorer. No GitHub or stable Cloudflare publication in this release.

## Unreleased — Sites beta

- Add the 2014 paladin Divine Smite resource from paladin level 2. Select and expend a real spell slot, including multiclass shared or pact slots, with depleted-slot protection and damage-dice previews for undead/fiends and critical hits. Existing rest/slot trackers remain authoritative.

## 0.25.1 — November 1, 2026 (Sites beta; stable release prepared)

- Preserve login sessions when token renewal temporarily hits HTTP 429 rate limits. Back off renewal requests using Retry-After (one minute by default) without weakening invalid-token or explicit sign-out handling.
- Publish the fix to Sites beta; the identical stable fix is prepared pending GitHub release authorization. Existing cleared sessions require signing in again.
- Verified against the pinned Supabase SDK: rate limits retain session storage without SIGNED_OUT, cooldown suppresses repeat requests, and invalid refresh tokens still remove the session. Cloud-save regressions pass.

## 0.27.0 — November 2, 2026

- Add supplied full class and subclass rules behind the question-mark controls while preserving current subclass summaries, spell references and all mechanical metadata.
- Add full descriptions for all 87 enabled published feats. The feat manager shows the selected feat's summary immediately and an expandable full description before applying it; feat sheets also have question-mark references.
- Remove the redundant underlined Feats text-edit link. Preserve existing character-local text overrides and the separate feat manager.
- Keep existing catalog exclusions, character data and custom feature behavior. Escape supplied reference text and preserve its plain-text table lines.
- Verify indexed subclass coverage, all feat references, summary/mechanics preservation, aliases, custom edits, text escaping, and spell/combat/class regressions. Browser fixtures confirm separate summary/full subclass wording and dropdown feat previews.
- Publish accumulated Sites beta changes to GitHub main and stable Cloudflare production.

## 0.26.0 — November 2, 2026

- Publish the supplied full text for all 574 existing spell records, filling 255 previously empty descriptions. Spell Explorer and character spell details include effects, higher-level rules, material requirements and source books.
- Refresh casting details, ritual/concentration flags and class lists from the upload. Preserve stable spell IDs, combat metadata and subclass grants so saved characters retain their spell references.
- Keep Unearthed Arcana excluded from normal spell choices and Spell Explorer (524 published spells, 50 excluded UA records).
- Verify complete description rendering, source books, material/scaling details, spell aliases, UA filtering, combat, class choices, feat spells, catalog caching and Divine Smite regressions.
- Release to GitHub main and connected stable Cloudflare production.

## 0.25.2 — November 2, 2026

- Add Divine Smite to paladin resources from level 2. Select and expend an actual spell slot, with shared multiclass and pact slot support and depleted-slot protection.
- Preview 2014 radiant damage dice, including the base damage cap, undead/fiend bonus and critical-hit doubling. Existing spell-slot and rest trackers remain authoritative.
- Verify slot expenditure, multiclass pools in both directions, persistence, level gating, damage dice and combat regressions.

## 0.25.1 — November 1, 2026; Bug fixes.

- Preserve login sessions when token renewal temporarily hits HTTP 429 rate limits. Back off renewal requests using Retry-After (one minute by default) without weakening invalid-token or explicit sign-out handling.
- Apply the same fix to stable and Sites beta. Existing cleared sessions require signing in again.
- Verified against the pinned Supabase SDK: rate limits retain session storage without SIGNED_OUT, cooldown suppresses repeat requests, and invalid refresh tokens still remove the session. Cloud-save regressions pass.


## 0.25.0 — November 1, 2026

- Release all accumulated party social updates: admins and ownership transfer, shared rolls/chat, private whispers, safe item/gold transfers, and ten-player capacity excluding the DM.
- Add NPC chat speakers and portraits, whisper autocomplete, animated speech/typing bubbles, notification audio, and confirmed DM/organizer chat clearing.
- Scope sheet party settings to the open character; add confirmed home-party leave/disband actions without deleting characters.
- Restyle and reorder inventory with drag handles; add six bio fields and custom note sections.
- Add character-only feature text editing and custom features with a centered editor.
- Include backend migration sources and account-deletion origin support already applied to the shared backend. Preserve existing DM invitations and character data.
- UI, dice, combat, cloud-save, inventory and feature-edit checks pass; live authorization/privacy checks used rollback-only test data. Full signed-in multi-account browser testing remains unverified.

## 0.25.0-beta.4 — November 1, 2026 (Sites beta)

- Center the feature editor in the viewport with a scrollable field list, fixed header/footer controls, phone sizing and a close button.
- Add small purple underlined edit links to class, subclass, racial, background and feat sections. Edit feature names/text or add new entries for that character only; catalog rules and game calculations remain unchanged. Save/cancel and character isolation checks pass.
- Restyle inventory stacks as compact cards with drag handles, mouse/touch sorting and keyboard arrows. Reordering preserves equipment indices and quantities. Add Personality traits, Ideals, Bonds, Flaws, Allies & organizations, Treasure and editable custom note sections, saved on the character.
- Verified browser drag ordering, equipped indices, duplicate quantities, journal persistence and existing-note preservation. Combat and cloud-save regression checks pass.

## 0.25.0-beta.3 — November 1, 2026 (Sites beta; shared backend live)

- Character-sheet party settings show only the open character’s party, or join/create instructions. Remove the account party dropdown and DM Tools shortcut from this dialog.
- Replace the redundant DM chat shortcut with an NPC manager. Add names and resized uploaded portraits; choose party NPCs in the chat speaker selector. Only the assigned DM can manage or speak as them; message portraits are retained.
- Add clickable whisper name suggestions with arrow, Tab and Enter selection.
- Allow the assigned DM or organizer to clear party chat history after confirmation, including rolls and whispers. Characters, NPCs and transfer retry protection remain intact; other members/admins cannot clear it.
- Add confirmed Disband & remove (organizer) and Leave & remove (member/DM) actions to every home party heading, including empty parties. Characters remain saved and regroup under Not in a party.
- The DM party portrait follows the selected NPC chat speaker for every member; selecting DM restores the Google avatar. Only the assigned DM can select a speaker from that party.
- Smooth speech bubbles by preserving DOM nodes and typing-dot animations across polling, skipping unchanged portrait redraws, and expiring each message independently.
- Show temporary clickable portrait speech bubbles, animated typing dots, fade transitions and the supplied new-message notification sound. Initial history does not trigger notifications; audio starts after browser interaction. Whisper typing and message previews are restricted to participants.
- Verify shared chat UI and dice regressions, plus rollback-only live NPC authorization and private typing checks. Full signed-in multi-account browser QA remains outstanding.

## 0.25.0-beta.2 — November 1, 2026 (Sites beta; shared backend live)

- Remove the party character picker and sharing explanation entirely for the assigned DM, rather than relying on a hidden attribute overridden by layout styles.
- Add the same **Rolls & chat** panel to DM Tools and character sheets: public messages, shared rolls with dice breakdowns, and the caller’s own whispers in one feed. The DM never receives whispers between other members.
- Support `/r`, `/roll`, `/w DM`, `/w "Character name"`, `/me` and `/em`, a recipient selector, and speaking as your own character or account. Server-side speaker names come from the caller’s membership; DM messages are identified as GM.
- Let the assigned DM copy the player invite code from DM Tools or party settings. Organizer/admin reset and ownership permissions remain unchanged; ten-player capacity still excludes the DM.
- Preserve unsent drafts during polling, avoid jumping the feed while reading earlier messages, and clear party content/composer recipients when changing parties or accounts.
- Verified with shared sheet/DM UI tests, social SQL regressions, dice checks and rollback-only live permissions/privacy tests. Browser layout QA uses representative fixtures; full multi-account browser testing remains unverified.
- Frontend published to Sites beta only. The invitation and speaker RPC update is shared by all connected clients.

## 0.25.0-beta.1 — November 1, 2026 (Sites beta; shared backend live)

- Activate party admins and organizer transfer, public party chat and shared dice, participant-only whispers, retry/revision-safe item and gold transfers, and a ten-player cap excluding the DM.
- Preserve the existing separate DM invitation flow, guest restrictions and portrait/death behavior while applying the social backend migration. Existing parties are not reduced.
- Add visible Whisper/Give actions to member portrait dialogs, in-page ownership confirmation, and an opt-in sharing control for DM quick rolls on Sites beta.
- Deploy the account-deletion origin update for Sites, stable and GitHub addresses. Require authenticated user validation and typed DELETE confirmation as before.
- Local SQL/UI and rollback-only live backend tests pass. Origin preflight/unauthenticated deletion checks pass. No real account was deleted; full signed-in multi-account browser QA remains unverified.
- Backend activation applies to already-published clients; these latest frontend refinements are Sites beta only until the next explicit main release.

## 0.24.0-beta.1 — November 1, 2026 (Sites beta)

- Guests can join a party with a display name and invite code, without Google sign-in. Joining explicitly starts a browser-bound anonymous session; ordinary solo guests are not automatically registered.
- Choose one local character to copy for party play, or join without a character. Unselected characters stay local. Guest-session edits are mirrored back to local character storage, and the existing cloud revision/portrait checks remain in place.
- Guest session tools explain browser-only recovery and offer backup export, ending the session, and switching to a separate Google workspace. No automatic Google-account merge or membership transfer is claimed.
- Registered accounts create parties; guests can join, select their own character and use permitted party features. Existing invite/member/DM authorization still applies. Anonymous sign-ins are enabled and the create-party RPC checks the server-side anonymous account flag.
- Validated guest snapshots/backups, observer joins, registered-account isolation, invite membership, organizer/DM escalation denial, private notes and leave/revocation with adapter and SQL tests.
- Beta only; no GitHub or stable Cloudflare source publication.

## 0.23.0-beta.2 — November 1, 2026 (Sites beta)

Navigation polish: desktop/tablet links stay in one aligned row; intermediate widths move navigation together below the logo/account instead of stranding DM Tools.

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

## How to read this history

- Versions were introduced on October 30, 2026. Versions 0.1.0–0.14.0 below are **retrospective milestone labels**, not previously published tags or exact historical build identifiers.
- Dates use **America/New_York**. Older entries group related changes from accessible project conversations and source/GitHub commit history. Date ranges mean the work spanned multiple updates. This is a reconstruction, not a verbatim export of every chat.
- **Sites beta** and **GitHub beta** can differ. Documenting a Sites feature here does not mean the repository's app or stable website contains it yet. Before 0.15.0, GitHub app source was last synced on October 29 (`da9d6f7`). Release 0.15.0 compiles subsequent Sites beta work for GitHub and stable Cloudflare production.
- Stable production is [characterforge5e.com](https://characterforge5e.com/). Its release is managed separately; 0.15.0 is the consolidated stable-production release.
- Repeated visual experiments and small follow-up fixes are consolidated into their final behavior. Planned companion tools, form managers, and the future magic-item catalog are not described as completed.

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

- Beta guest recovery: leaving/disbanding parties and burying characters use in-page confirmation dialogs so embedded browsers cannot silently suppress the action. Existing characterless memberships can still leave.

- Party portal access now requires opening a saved character sheet. Removed home-screen party controls and automatically selects that sheet when an existing account joins.

- Burying a selected party character now removes its owner from that party; restoration does not rejoin. Repairs memberships linked to previously buried characters. Organizer removal transfers ownership to the oldest remaining member, or removes an empty party.

- Own sheet portrait now fills with damage, clipped to the portrait. Dead characters (zero HP and three failed death saves) show greyscale portraits and a red X on the sheet and party strip.

- Other party members now show an explicit Dead label alongside the red X and greyscale portrait in both compact and full party views. Party assets refresh to load the death indicators.

- Zero HP automatically applies incapacitated and prone and ends concentration, including DM edits. Healing removes only automatically added incapacitated; prone remains until stood up. Shared party death state includes failed-save count and refreshed assets.

- Party death portraits use an explicit SVG cross and image filter. New asset filenames force refreshed party rendering in browsers retaining earlier scripts.

- DM Tools now accepts an organizer-issued DM-only invite code, with characterless Google or guest joining. Players cannot be assigned as DM; DM members cannot select a character. Codes are single-use and existing player memberships must leave first.

## 0.24.0-beta.2 — 2026-11-01

Separate DM joining from character sheets: organizer-issued DM codes, characterless guest or Google DM sessions, and server enforcement of player/DM separation. Legacy DM character selections are detached without deleting characters.

- DM Tools layout follows the party-first reference: full-width roster with persistent compact/full toggle, circular portraits with clipped damage/death overlays and condition icons, encounter below, notes and dice at the bottom.

- DM roster stretches across the workspace and centers members in equal columns. Cards and portraits scale to available column width and wrap for larger parties or smaller screens. Fixes flex alignment collapsing the roster into a narrow stack.

- Custom transparent PNG condition icons replace party/DM abbreviations and decorate sheet condition controls. Includes all conditions, exhaustion, concentration, bloodied and dying status artwork, with 32px/64px UI exports and 1024px masters.

- Revised Exhaustion to a slumped figure, Incapacitated to a slack drooling face, and Concentrating to a purple brain. Refreshed PNG masters, UI exports and download pack.

- Condition explanations now use the exact supplied descriptions, bullet lists and Roll20 links, including the full six-level exhaustion table.
