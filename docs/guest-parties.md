# Guest party joining

Sites beta 0.24.0-beta.1 adds a deliberate Join as guest action. It creates a Supabase anonymous identity only on submit, reusing the browser's auth persistence. A random identity is required for existing owner/membership policies; invite codes remain the join gate. Guests are authenticated to the backend but have not signed in with Google.

The display name is public party metadata. Only the selected local character is copied into the guest workspace. Future local edits are mirrored into the original guest library, preserving unselected characters. The UI warns that clearing browser storage or ending the session loses that identity; JSON backups remain portable. Switching to Google opens a separate account workspace and does not automatically transfer membership. No account linking or merge was enabled.

`supabase/guest-parties.sql` adds an anonymous create-party denial to the current command function without replacing its other operations. Anonymous guests retain their own character access and join-by-invite permissions, and remain subject to existing DM/organizer checks. The future social migration contains the same organizer guard. Existing Google sessions and stable-page source are unchanged.

Anonymous Auth has its existing provider rate limits. Sessions are not created for every page visit. No guest password, email, external provider or CAPTCHA integration is introduced. Anonymous identities do not have an automatic cleanup job in this change.

Tests: cloud-saves.cjs covers selected-only upload, required character selection, local mirroring and registered-account protection. guest-parties.cjs covers organizer creation, anonymous joins, privilege denial, private summary data and revoked membership. Existing party/presence and cloud checks are retained.

A saved character is required for guest joining. With no local characters, the form explains that a character must be created or imported and disables submission. The guest session adapter also rejects missing selections before starting anonymous authentication.

The party portal is available only from a saved character sheet. Home ledger entry points are removed. Both existing-account and new-guest joins use the current saved sheet; existing-account joins sync and select that character automatically.
