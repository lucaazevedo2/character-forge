# Campaign covers, DM viewing and phone sheets — beta checks

- Cover image is available on local and cloud gallery cards, and in the tabletop More menu for a DM. The shared editor prepares a 960 × 480 WebP, supports replace/remove, and reports save errors.
- Local covers persist through IndexedDB and remain in versioned backups. Uploading a cloud copy transfers the cover through the existing DM-only RPC. Cloud covers remain outside map revision saves; member-scoped reads load them for backups and subsequent copies.
- DM Tools roster now includes View stats (a non-editable overview) and the existing full-sheet link. Full sheets require a cloud-saved character and the existing owner/assigned-party-DM access check. Guests retain the shared overview and see the cloud-save requirement.
- Phone chat was trapped under the dimmer by the desktop map's isolated stacking context. Phone CSS now removes that isolation and gives the chat a bounded, internally scrolling height. Landscape uses the existing right-side sheet.

## Verification

Browser: local cover prepared, saved and restored after reload; 390 × 844 phone chat/combat controls usable; close and backdrop dismissal; 844 × 390 rotation retained the open sheet and zoom.

Automated checks: cover validation/backup/copy/cache/account isolation; core backups/revision diffs; durable cloud outbox/conflicts/undo/account isolation; map/sidebar state restoration; scene reordering; bidirectional sheet/token stats; local combat commands; resource-copy import; loader; DM stats buttons and immutable overview; PostgreSQL owner/DM sheet access, member revocation, guest restriction and DM-only cover writes.

The hosted database was inspected read-only: cover column and both RPCs are installed; cover reads use campaign membership RLS. No backend schema or policy changes were needed.

Signed-in, concurrent multi-account browser play was not exercised in this pass. Local and cloud campaigns intentionally remain separate copies after upload, rather than becoming automatic mirrors; the same renderer/tools operate over different persistence and access adapters. Local play does not gain online invitations or realtime peers.

Publication: Sites beta only; no GitHub/stable release, version or changelog change.
