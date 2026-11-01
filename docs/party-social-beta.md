# Party social beta rollout

The source includes all ten November 1 requests. The Sites interface can ship safely with the existing backend. The social features activate only when the server returns `social_ready: true`.

## Pending explicit backend approval

Apply `supabase/party-social.sql` to project `vrjwaejlqupmkqrhmzra`. Automatic approval review rejected the first attempt; no schema mutation occurred. Do not retry until Luca explicitly approves the live database change.

The migration adds an admin membership flag, unique DM invitation code, private message table, checked chat and transfer RPCs, and updates existing party command/state/list RPCs. It preserves existing characters, memberships and sessions. Existing parties are not forcibly reduced; new player joins enforce ten players excluding the DM. DM invite codes are consumed on use. Admins can invite players and remove ordinary members; ownership, admin grants, DM invitations and disbanding remain organizer-only.

Raw message access is revoked, RLS is enabled, and the chat RPC filters private conversations to their sender/recipient without a DM override. Transfers lock both saved characters, validate current revisions and inventory identity, move one unequipped item or gold, repair equipment indices and record a private receipt. Sender currency converts to equivalent gp/sp/cp change; recipient can receive fractional gp as supported by the wallet. All pending features stay hidden before migration.

## Validation

`tests/party-social.cjs` uses PGlite for role/permission boundaries, DM invitations, whispers invisible to DM/organizer, idempotent messages, item/gold conservation, conflict checks and capacity. `tests/party-social-ui.cjs` uses LinkeDOM for rendering/gating. Dependencies are test-only and not shipped. Existing party regression tests pass with the new migration.

After approval: apply migration, run read-only live schema/advisor checks and rollback-only SQL verification, then verify signed-in multi-account behavior. The current environment has no signed-in test accounts; browser QA checked guest quick dice/help. Phone-width browser QA confirmed the logo/account placement and hamburger open, navigate and close behavior.
