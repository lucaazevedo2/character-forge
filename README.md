# Character Forge

A browser-based D&D 5e (2014) character creator, interactive character sheet, and spell explorer.

## Live versions

| Version | Address | Purpose |
| --- | --- | --- |
| **Stable** | [characterforge5e.com](https://characterforge5e.com/) | Recommended for regular use. Hosted on Cloudflare Pages. |
| **Beta — GitHub Pages** | [lucaazevedo2.github.io/character-forge](https://lucaazevedo2.github.io/character-forge/) | Experimental features and testing. |
| **Beta — ChatGPT Sites** | [lucas-character-forge.lucaazevedo.chatgpt.site](https://lucas-character-forge.lucaazevedo.chatgpt.site/) | Experimental features and testing. |

The beta sites may change more frequently and may contain unfinished features or bugs. The stable site is updated separately after changes have been reviewed and tested. The main branch now deploys to stable Cloudflare production after release verification.

## Local development

This is a static application with no build step. The entry point is `index.html`; keep the accompanying asset directories beside it.

Run a local web server from the repository root:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000/>. A local server supports features such as printable PDF export that fetch files from the asset directories.

Changes pushed to `main` publish the matching GitHub Pages build and the stable Cloudflare Pages site. Ordinary feature work stays on the separate ChatGPT Sites beta until a production release is authorized.

## Character storage and backups

Guest characters stay in their browser. Sign in with Google to use an account workspace with private cloud saves across devices; importing guest characters is an explicit choice. JSON/PDF backups remain available.

To move a character between versions, use **Export as JSON** on its character sheet, then **Import a character backup** on the destination site's home page. Import custom content used by that character first. Keep JSON backups before testing beta changes.

## Design, assets, and rules

Responsive layouts support phones, tablets, and desktop screens. Images, fonts, PDF assets, and license files are included in the repository's asset directories. Artwork credits and source links are shown in the app; supporting provenance is in `docs/`. Font, icon, and other license notices are preserved in `licenses/`.

Core game content uses the D&D SRD 5.1 (2014 rules) under CC BY 4.0. Supplemental rules link to Wikidot. Character Forge is an unofficial fan tool and does not use the 2024 rules.

## Support

[Buy Luca a coffee](https://buymeacoffee.com/lucaazevedo) to support ongoing development.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for dated feature history and version numbers. Older versions are retrospective milestones; each entry identifies its release channel. The latest consolidated release is **1.0.0** (November 2, 2026), promoting the approved current build to GitHub main and stable Cloudflare production. Small edits are batched into meaningful changelog updates at release milestones.

## 2.0.0 virtual tabletop

[Release audit and known limits](docs/vtt-2.0.0-release-audit.md) · [Changelog](CHANGELOG.md). The root index.html and accompanying assets are the canonical static build. SQL migrations and Edge functions are in supabase; acceptance tests are in tests. Apply migrations in timestamp order when provisioning a separate environment.
