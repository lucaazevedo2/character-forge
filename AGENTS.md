# Project Instructions

- Treat `index.html` as the canonical website source.
- Preserve the app as a self-contained static site unless the user requests a different architecture.
- Publish requested website changes to Sites by default. Push to GitHub only when Luca explicitly requests a GitHub push; a general website change request does not authorize one.
- Do not include unrelated user changes in a commit.
- If pushing is blocked by authentication, permissions, or a remote conflict, explain the blocker and leave the verified local commit intact.

## Release channels

- `https://characterforge5e.com/` is the stable production site, hosted on Cloudflare Pages (project `lucas-character-forge`).
- GitHub Pages and ChatGPT Sites are experimental beta sites.
- Continue publishing requested changes to ChatGPT Sites beta by default; push GitHub beta only when Luca explicitly requests it.
- Release to stable Cloudflare production only when Luca explicitly requests a stable/production release. A request to push GitHub or update the beta sites does not authorize a stable deployment.

## Changelog and versions

- Batch small edits into the next substantial release; do not create a version for every cosmetic tweak.
- Automatically compile accumulated user-visible changes and update CHANGELOG.md when publishing a meaningful GitHub/Cloudflare release or shipping a substantial feature set.
- Keep the footer version and version.json synchronized with the release, using America/New_York dates.
- Summarize final behavior and identify the release channel. Preserve separate authorization requirements for GitHub and stable Cloudflare publication.

## Meaning of push to main

- When Luca says "push to main", publish ALL accumulated Sites beta changes to GitHub main and the connected stable Cloudflare site, unless he explicitly narrows the scope. This is explicit production-release authorization.
- Include magic-item and other completed beta features, not only the changes from the latest turn. Update the stable footer, version.json, and consolidated changelog together.
- Continue to make ordinary feature edits on Sites beta only until this release instruction is given.

## Interface styling

- Luca prefers deliberate CSS styling for GUI features. Use CSS freely to polish layouts, controls, hover/focus states, responsive behavior and transitions while preserving the established visual theme.
- Mobile navigation should use an unboxed hamburger at the top left, a larger centered logo, and a left-side drawer.
- Compact party members should have no rectangular card or surrounding box. Clip damage tint precisely to the circular portrait, with a small name beneath it.

- Give the assigned DM a separate portrait area between the main character identity and the party list on desktop; keep it distinct from player portraits on mobile too.
