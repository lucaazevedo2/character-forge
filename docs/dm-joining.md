# Separate DM joining

The organizer opens a saved character sheet → Party settings → Invite a DM. This generates a DM-only code, separate from the player code. It is consumed after joining. The invite endpoint is organizer-only and the join endpoint rate limits invalid attempts.

The recipient opens DM Tools, enters the code and joins without a character. Visitors can supply a display name for a browser-bound guest DM identity. Existing authenticated accounts reuse their session. A member already playing in this party must leave before joining as DM. A DM cannot select a party character. Personal saved characters may still exist outside the DM role.

Existing DM memberships keep their role but their party character selection is cleared; the character itself remains in its owner’s library. Current-character assignment and self-enable controls are removed. The organizer can remove the DM role; the DM can leave from party settings in DM Tools.

## Player invitations and Rolls & chat

The assigned DM can copy the **player** code from Invite players in DM Tools or party settings. This grants player access only; the separate organizer-issued DM invitation is still required for DM access. Resetting player codes remains an organizer/admin action. The DM party view has no character picker.

DM Tools and character sheets share the Rolls & chat composer and feed. `/r d20+3`, `/roll`, `/w DM message`, `/w "Character name" message`, and `/me waves` are supported. The recipient selector also sends whispers. Public messages and rolls appear to every member; whispers are fetched only for their sender and recipient. The last 100 visible messages are loaded. Automatic sheet rolls remain shared with the party, while standalone DM quick rolls use their existing share checkbox. The As selector permits the caller’s own character/account only; the backend verifies the speaker and identifies DM messages as GM.

Applied `dm_player_invites_and_chat_speakers` to the shared backend. Verified DM player-code access, ordinary-player code privacy, speaker attribution, public rolls and whisper isolation with disposable data inside a rolled-back transaction.


## Player invitation links and replacement

DM Tools → Invite players provides a direct link and the existing player code. Links use a URL fragment (`#party-invite=…`) so the credential is not sent as a request path/query or referrer. Following a link opens a character choice; joining and sharing require pressing Join party. A new visitor creates/imports a character first and then reopens the invitation. Signed-in users and guest players use the existing checked join/character-sharing flow. Pasting a link into the normal player join form also works.

Replace link & code rotates the same player credential atomically, invalidating all old player links/codes while preserving existing members. An assigned DM, organizer or admin may rotate it; ordinary members and outsiders may not. DM-only invitations remain separate. The assigned DM does not gain organizer/admin member-removal powers. Version conflicts require trying again against fresh state.

Backend migration: `supabase/migrations/20261112024535_dm_player_invite_rotation.sql`, applied after the existing party social/DM setup. It narrowly patches the checked command's rotate permission and retains its version guards, other actions and grants. Verified with `tests/party-social.cjs` and `tests/party-invite-links.cjs`.
