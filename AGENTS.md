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
