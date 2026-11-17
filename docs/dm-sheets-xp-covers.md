# DM sheet inspection, XP awards, and campaign covers (Sites beta)

## Private character inspection

The party and DM rosters link cloud characters to `/view/<cloud-character-id>` in a new tab. This route skips the normal cloud-save bootstrap and routing, never loads anyone into the owner's ledger, and replaces the rendered sheet controls with static values. All sections are visible, including full spell descriptions, item details, features, attacks, notes, biography, and optional raw saved data. Refresh rechecks access. Signed-out visitors see instructions to sign in in the main site.

The SQL uses existing parties/membership. `forge_character_view` is an invoker RPC over `forge_dm_private.view_characters`. This private security-barrier view is owned by a non-login, non-bypass-RLS, SELECT-only role. A narrowly scoped characters RLS policy for that role allows the owner or the currently assigned DM who is still in the character's party. It does not allow other players, organizers, or former DMs. Authenticated guest characters are excluded from DM viewing. The existing authenticated owner-only table policy remains unchanged, preserving older stable clients' character lists. The updated save adapter also explicitly filters by owner.

The view is outside the exposed public schema. Anonymous roles have no read privilege on it; authenticated roles have no write privilege. No link grants access by itself. Private helper functions check caller identity before returning owner display names.

## XP awards

Award XP is available to the assigned DM whenever a party is selected, whether or not a session/combat is active. The cart supports a raw amount, monster XP with editable quantities, and multiple custom entries. The existing 334-creature 2014 catalog is unchanged except for showing XP beside CR in search results. A complete CR-to-XP fallback is available for entries without an explicit XP value.

All eligible cloud characters start checked. Totals and each character's share update as inputs change. Whole XP is conserved: characters sorted by cloud ID receive any remainder one point at a time. No encounter difficulty multiplier is applied to awarded XP, and leveling remains the player's choice.

`forge_party_award_xp` checks assigned-DM membership, validates the current recipients and cart, locks the party and selected characters, updates their current XP/revisions, and logs one structured party-chat receipt in the same transaction. A bad recipient/XP total rolls the whole operation back. Request nonces prevent a retried request from awarding twice. Existing revision/conflict handling protects pending player edits. Party polling refreshes owners' sheets. The receipt is highlighted and recipients with the party open receive a 4.5-second popup (named for their awarded character when another sheet or screen is open). Old receipts do not replay on opening chat.

## Campaign covers

Cloud campaign cards have a Cover image button for DMs. PNG/JPEG/WebP input is cropped to a 960×480 WebP preview, with a 10 MB input limit and 280,000-character stored limit. Save/remove uses a DM-checked RPC; read access follows existing campaign-membership RLS. The new cover column is independent of map snapshots and map revision saves, so a background map save does not overwrite it. Local campaign cards are unchanged.

## Backend and checks

Full install SQL: `supabase/dm-sheet-xp-covers.sql`. It has already been applied to the shared backend. No existing party membership or organizer permissions were broadened. Expected advisor warnings for authenticated security-definer XP/cover RPCs are intentional: these are authenticated APIs with explicit role/membership checks, no anonymous execute access, and fixed search paths. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

Automated checks cover owner/DM RLS, nonmember and former-DM denial, guest restrictions, preservation of base owner-only reads, atomic XP split/remainder/rollback, nonce retries, notes/item preservation, DM-only cover changes, cloud saves, gift/XP notifications, party UI, monster catalog, and lazy tabletop loading.

Browser fixtures verified all five sheet panels and notes with zero editable fields, phone widths without horizontal overflow, monster/custom XP totals and recipient selection, successful award receipts, and actual image compression/preview/card update/removal with mocked persistence. The native file chooser test timed out; fixture-supplied PNG input exercised the same image-change handler successfully. No real characters were awarded test XP. Live two-account delivery and physical-phone checks remain manual beta checks.

The separate to-do list is in `docs/TO-DO.md`; its monster expansion, tabletop polish, TV presentation window, and racial spell audit are not implemented in this change.
