# Character Forge

A browser-based D&D 5e (2014) character creator, interactive character sheet, and spell explorer.

## Live versions

| Version | Address | Purpose |
| --- | --- | --- |
| **Stable** | [characterforge5e.com](https://characterforge5e.com/) | Recommended for regular use. Hosted on Cloudflare Pages. |
| **Beta — GitHub Pages** | [lucaazevedo2.github.io/character-forge](https://lucaazevedo2.github.io/character-forge/) | Experimental features and testing. |
| **Beta — ChatGPT Sites** | [lucas-character-forge.lucaazevedo.chatgpt.site](https://lucas-character-forge.lucaazevedo.chatgpt.site/) | Experimental features and testing. |

The beta sites may change more frequently and may contain unfinished features or bugs. The stable site is updated separately after changes have been reviewed and tested. A GitHub push does not automatically release changes to the stable Cloudflare site.

## Local development

This is a static application with no build step. The entry point is `index.html`; keep the accompanying asset directories beside it.

Run a local web server from the repository root:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000/>. A local server supports features such as printable PDF export that fetch files from the asset directories.

Changes pushed to `main` publish to the GitHub Pages **beta** site. ChatGPT Sites beta and the stable Cloudflare deployment are published separately.

## Character storage and backups

Characters, avatars, favorites, and custom content are saved in your browser. They do not automatically sync across devices or between the stable and beta addresses.

To move a character between versions, use **Export as JSON** on its character sheet, then **Import a character backup** on the destination site's home page. Import custom content used by that character first. Keep JSON backups before testing beta changes.

## Design, assets, and rules

Responsive layouts support phones, tablets, and desktop screens. Images, fonts, PDF assets, and license files are included in the repository's asset directories. Artwork credits and source links are shown in the app; supporting provenance is in `docs/`. Font, icon, and other license notices are preserved in `licenses/`.

Core game content uses the D&D SRD 5.1 (2014 rules) under CC BY 4.0. Supplemental rules link to Wikidot. Character Forge is an unofficial fan tool and does not use the 2024 rules.

## Support

[Buy Luca a coffee](https://buymeacoffee.com/lucaazevedo) to support ongoing development.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for dated feature history and version numbers. Older versions are retrospective milestones; each entry identifies its release channel. The latest documented Sites beta is **0.15.0-beta.1** (October 30, 2026). Documenting newer Sites work does not automatically sync the GitHub app or deploy stable production.
