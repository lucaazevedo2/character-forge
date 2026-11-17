# Party Fund

Party Fund reuses forge_parties, forge_party_members, forge_party_access, and the existing cloud character records. It does not create another party or membership system.

The full install SQL is in supabase/party-fund.sql. It creates only party_fund, party_stash_items, and party_transactions. The migration is already installed in the project's Supabase backend.

Authenticated members can read through RLS. Direct client writes are not granted. The security-definer RPCs explicitly check active account and existing party access; character transfers additionally check ownership, linked membership, and expected save revision. Existing authenticated guest members retain the party system's existing access rules.

forge_party_fund_state returns balances, stash, and 100 newest history records with cursor pagination. forge_party_fund_action locks the existing party row, fund, and acting character in a consistent order. It transfers coins/items and writes history in one transaction. Request nonces prevent duplicate submissions; reused nonces with different payloads are rejected. DM actions check the existing party's DM role. No existing party permissions were changed.

Coin arithmetic uses integer copper and matches ForgeCoinMath, including spending the selected denomination first and making change. Character data is adopted with its committed cloud revision through the existing save adapter. Transfers require connectivity; stale character revisions are rejected rather than overwritten.

Items come from saved character equipment, preserving full JSON metadata. Equipped and attuned state are cleared. Taking items adds them to the acting character and reduces the stash atomically. Undo returns an item only when its original stash entry has not been taken, edited, or removed, so it cannot duplicate items.

The header entry opens a desktop modal or mobile bottom sheet. Equipment pointer dragging exposes the fund drop zone without committing a reorder; the equipment details button provides the keyboard alternative. Party transaction INSERT events trigger refreshes, with a 15-second polling fallback and manual Refresh.

## Verification

Run with Node and @electric-sql/pglite + linkedom available via NODE_PATH:

- tests/party-fund.cjs: SQL permissions, coin parity, atomic transfers, revisions, nonces, ownership, metadata, and Undo.
- tests/party-fund-cloud.cjs: committed revision adoption, subsequent edits, and conflict handling.
- tests/party-fund-drag.cjs: pointer drop, cancellation, and keyboard reordering.
- Existing cloud saves, equipment drag, and coin math regression tests.

Browser fixture checks cover mobile/desktop panel layout, deposit/change, withdrawal, quantity transfers, immediate stash updates, keyboard entry, and native drag-to-fund. Fixtures are excluded from publication. A real two-user realtime session and physical-phone touch test remain manual release checks.
