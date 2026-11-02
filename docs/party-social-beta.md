# Party social features — active

Luca authorized the live backend rollout on November 1, 2026. Applied `activate_party_social_preserving_dm_invites` to project `vrjwaejlqupmkqrhmzra`. The backend now returns `social_ready: true`, enabling the already-published social controls on stable/GitHub and Sites. The existing separate `forge_party_dm_invite` / `forge_party_join_dm` flow is preserved, including consumed single-use codes and no player character for DMs.

## Permissions and behavior

- Organizers grant/revoke party admin and transfer ownership to another registered member. The former organizer remains an admin. Admins invite players, reset the player code and remove ordinary members; organizers retain admin, ownership, DM and disband controls.
- Party chat and shared sheet rolls are available. Whispers and transfer receipts are returned only to their sender/recipient; DM/organizer roles do not override that filter. Raw table access is denied.
- Transfers lock both saved characters in stable order, require both current revisions, validate inventory identity, reject equipped items, repair equipment indices and use a retry identifier to prevent duplicate transfers. Gold is accounted for to the copper.
- New player joins enforce ten players excluding the separately assigned DM. Existing parties are not truncated. Registered-account creation, guest joins, presence and death/portrait fields are preserved.
- Sites beta also provides visible Whisper/Give actions on ordinary member-portrait clicks, in-page ownership confirmation and optional shared DM quick rolls. Private DM quick rolls remain the default.

## Verification

Local SQL and UI tests pass. Rollback-only live tests pass for separate DM invites, admin boundaries, ownership handoff, shared rolls, whispers hidden from DM/organizer, duplicate-safe gold, stale/missing revisions, equipped item rejection, item/gold conservation, ten-player capacity and denied outsider/raw/anonymous access. Synthetic data was rolled back.

Account-deletion function version 3 accepts the Sites, stable and GitHub origins, retains server-side user validation and DELETE confirmation, denies other origins, and rejects unauthenticated deletion. Preflight and unauthenticated-request checks passed; no real account was deleted.

Advisors report the intentional checked authenticated SECURITY DEFINER RPCs and deny-all raw tables; the message table has RLS enabled and no client grants. Full signed-in multi-account browser testing remains unverified.
