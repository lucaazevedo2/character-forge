# Organizer-led parties and optional DM Tools — Sites beta

## Party use without a DM

Sign in with Google and open **Organize parties** beside Your characters, a party
heading's gear, or the party gear in a character sheet. Create a party to become
its organizer, or join with an invite code. Choose a cloud-saved character.
The ledger groups characters by party, with unassigned characters in **Not in a
party**. Favorites are first within each group. A character assigned to more than
one party appears in each group, referencing the same saved character.

Parties do not require a DM or session. The sheet strip continues sharing selected
character portraits, current/max HP, temporary HP, conditions, exhaustion and
concentration. The organizer manages invites, membership, disbanding and optional
DM assignment. This role alone does not grant character inspection or session
control. Public party summaries include members' Google display names for role
selection, but not account email addresses.

The organizer may choose **Optional DM & sessions** in party settings to assign any
party member as DM, or leave **No DM · party only**. The DM does not need a selected
character. Changing/removing the DM ends the current session and combat and clears
that DM's private prep notes; the party and characters remain intact. Active
sessions from the previous release retain their owner as assigned DM during the
upgrade. Existing inactive parties and all new parties are organizer-only.

## Optional DM Tools workspace

The **DM Tools** navigation opens a dedicated page, separate from party settings.
The organizer may opt into DM mode there, or appoint another member through the
party gear. The assigned DM explicitly starts a session when desired.

- **PC status:** current/max HP, temp HP, conditions, AC and character summaries.
- **Read-only character overview:** available to the assigned DM during a live
  session. Shows final abilities, AC, initiative bonus, known/granted spell names,
  feature descriptions and equipment. Uses an explicit server allowlist; character
  notes, biography, player email and complete character JSON are excluded. Existing
  characters gain the new rules snapshot on the next save or Sync characters.
- **Encounter tracker:** start combat, accept sheet initiative rolls or manual
  totals, advance turns and rounds, pause initiative for edits, and end combat.
- **Simple NPCs:** manually enter/edit name, initiative, current/max HP and hidden
  status. No monster catalogs or statblocks. NPC HP is DM-only; hidden NPC names
  and initiative are also omitted from players. Zero-HP NPCs remain until removed.
- **HP and condition controls:** explicit changes to current/temp HP, conditions
  and exhaustion during the live session, using the character revision to protect
  concurrent edits. Automatic damage overflow/concentration adjudication is outside
  these controls; players can use their normal sheet for those operations.
- **Private session notes:** up to 12,000 characters, saved explicitly and visible
  only to the assigned DM. Unsaved text is retained in page memory across refreshes
  of the workspace and cleared on account changes or loss of the DM role.
- **Quick dice:** uses the existing bounded dice-expression evaluator, runs locally
  without editing a character, and is available even without a party or sign-in.

Players can still see their shared combat order and enter their own initiative
before turns start. They cannot manage encounters, change another member's
initiative/vitals, inspect rules overviews or read private DM notes. Organizers
who are not the assigned DM have the same session restrictions as players.

## Updates, limits and privacy

Summary updates poll every three seconds while visible, with membership-list
refreshes every 30 seconds and manual refresh controls. Character saves retain the
existing two-second debounce. Offline views pause updates; session mutations are
not queued as successful offline actions. If a request's outcome is uncertain,
refresh before retrying non-idempotent actions such as adding an NPC.

Limits remain: 12 accounts per party, five owned parties, 20 memberships per account,
40 combatants; 64-bit random invite codes and ten join attempts per minute.
Selected portraits use a private Storage policy scoped to current membership and
the owner's selected character/path prefix. Deselecting/deleting a character or
removing a member revokes new downloads. DM overview data and unsaved notes are
cleared from the interface when the account or authorization changes.

## Implementation and validation

- Fresh installs: schema.sql, parties.sql. Existing party deployments:
  party-organizers.sql adds nullable dm_id and private dm_notes, replaces checked
  RPCs and adds a role-change trigger. No characters or memberships are dropped.
- Raw party/member/combatant tables remain client-inaccessible with RLS enabled.
  Checked RPCs enforce organizer and DM permissions, membership, party versions
  and character revisions. Read-only inspection requires the assigned DM and a
  live session and projects only approved fields.
- Local PostgreSQL/PGlite tests cover role separation, outsider denial, optional
  sessions, notes/overview privacy, hidden enemies, portrait scope, DM vitals,
  conflict checks and role revocation. Upgrade tests preserve existing parties
  and active sessions while removing mandatory DM assignment for inactive/new ones.
- A live Supabase transaction exercised organizer-only creation, joining/sharing
  without a session, independent DM assignment, overview privacy, private notes
  and DM removal, then rolled back all synthetic accounts/data.
- Browser QA used a disposable mock to inspect grouped ledger gears, organizer-only
  settings, optional DM activation, the full DM workspace, manual NPC entry and
  read-only PC overviews. The fixture is excluded from publication.
- Existing cloud-save, sheet/combat, conditions and dice regression checks pass.
  A real multi-person play session remains to be exercised.
