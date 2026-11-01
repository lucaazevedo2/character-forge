# Page-specific party presence

`supabase/party-presence.sql` was applied separately from the still-pending social migration. It adds only activity and account-avatar display. It does not enable invitations, admins, chat, whispers or transfers.

The client reports an ephemeral tab UUID and one of `sheet`, `dmtools`, or `away`. The server validates party membership and the assigned character or DM role. Heartbeats refresh at most every ten seconds; dots expire after 45 seconds. Hidden pages, navigation and page exit report `away`; page exit is best effort and timeout handles lost connections. Closing one tab does not remove another tab's activity. This reports active page presence, not identity authentication or attendance proof.

The activity RPC returns online flags and account avatar metadata only to current party members. Raw table grants are revoked, RLS is enabled, and the exposed security-definer RPC checks membership before reading/writing. Advisor notices for its intentional authenticated RPC and server-only table are expected. Avatar metadata is used only for display, never authorization. The client accepts Google HTTPS avatar hosts, sends no referrer and falls back to the bundled SVG on failure. Anonymous-account avatars are suppressed.

Validation: `tests/party-presence.cjs` (PGlite) tests login/away, role checks, assigned-sheet checks, isolation, independent tabs, expiration and guest metadata. The party UI fixtures test ordering, hidden/no-DM behavior, portrait fallback and page-specific dots. Live verification confirmed RLS and grants and denied unauthenticated RPC use.
