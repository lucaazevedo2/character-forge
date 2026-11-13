# Phase 5 — campaign play

Released on the experimental Sites beta as 2.0.0-alpha.7. Stable GitHub and Cloudflare publication remain separate.

## Use

Open **Chat & combat** at the bottom of the map. The drawer closes to leave the map unobstructed, and adapts to phone widths. Chat and combat have independent scrolling content.

- `/r 2d20kh1+5`, `/gmroll 1d20`, `/adv 1d20`, `/dis 1d20`, `/me action`, `/w "Player Name" message`, `/as "Token Name" message`, `/image https://…`.
- Inline rolls: `Attack [[1d20+[STR]+[PROF]]]`. Groups: `Hit:1d20+5;Damage:1d8+3`.
- References use numeric **custom token stats**: STR, DEX, CON, INT, WIS, CHA, PROF; `[@token.hp]`, `[@token.maxhp]`, `[@token.ac]`, `[@token.speed]`. Missing standard modifiers default to zero; enter modifiers rather than ability scores. Automatic sheet synchronization belongs to Phase 6.
- Dice support keep/drop (`kh`, `kl`, `dh`, `dl`), explosions (`!`, `!!`), repeated or once-only rerolls (`r<2`, `ro=1`), arithmetic, parentheses and multiple groups. Rolls are bounded to eight labeled formulas, 400 generated faces per formula, 100 dice per group and 500 formula characters.
- Macros have formulas, an optional chat template (`{{Hit}}`, `{{Damage}}`, `{{total}}`), a token action and a hotbar slot. Drag macros from the macro dialog or between slots; use keys 1–9 outside form fields.
- DM combat controls add individual tokens with manual initiative, or roll selected/all tokens. Right-click token initiative uses the same trusted service in cloud play. Players may roll their owned token; adding to the shared tracker is a DM action.
- Edit a combatant to configure HP/status, AC and condition visibility, initiative or timed conditions. Start/Next/Previous manage turn history and rounds. Timer is optional; zero turns it off. Ready and Delay are available to the current token's controller or DM.
- HP changes use the existing token command path and create controller/DM log entries. Concentration prompts show max(10, floor(damage/2)); the roll uses the token's configured CON modifier. Temporary HP absorbed also counts as damage.

## Persistence and security

The play RPC checks active, regular campaign membership. Spectators are read-only. Private helper functions are not publicly executable. Chat SELECT policies restrict audience and token readability; DM access does not include unrelated player-to-player whispers. Raw combat JSON is DM-only; the play snapshot builds a filtered player view. Personal macros are owner-only, and token macros require control.

The `vtt-roll` Edge Function authenticates bearer tokens with Auth.getUser, resolves permitted token references, generates cryptographic dice faces with rejection sampling, then calls a service-role-only gateway. User-supplied results never produce an attested roll. Normal messages cannot set the verified bit. Request IDs prevent duplicate messages/combat operations; revision checks prevent stale combat mutations. The gateway performs membership/controller checks again when committing.

`forge_vtt_play_events` contains only campaign ID and sequence. Realtime notifies members to reload a filtered snapshot; five-second polling provides fallback. Campaign/user changes discard stale responses. A failed send retains its draft rather than guessing that it succeeded.

Local play keeps messages, macros and combat in the local campaign. Local results are unverified; imported backup results are also unverified. Token IDs are remapped for imported macros/combat. Campaign Undo leaves play history intact. Cloud chat and personal macros are separate campaign records; use the chat/roll log export for the visible loaded transcript. A normal map backup does not copy all members' private chat/macros into another cloud campaign.

## Deployment and validation

Migrations:

- `20261112093011_vtt_chat_rolls_combat.sql`
- `20261112100310_vtt_combat_condition_visibility.sql`

Deploy `supabase/functions/vtt-roll/{index.ts,dice.js}` together. Gateway JWT preverification is disabled because the body performs Auth.getUser verification; do not remove that body check. Existing site origins are preserved.

Run `vtt-dice`, `vtt-play-core`, `vtt-play-edge`, `vtt-workspace-state` and `vtt-phase5-db` tests plus the established navigation/lighting/cloud regression tests. Hosted HTTP tests accept only disposable vtt-qa accounts on hidden stdin and clean those accounts afterward. The rollback-only hosted SQL test leaves no accounts or campaigns. Browser QA checks actual scrolling, keyboard focus, token selection, macro cards, combat, mobile layout and exit behavior. Physical iOS remains a manual follow-up.
