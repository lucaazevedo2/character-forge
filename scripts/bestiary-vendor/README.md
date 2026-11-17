# Offline 5etools copy resolver

`parser.js`, `utils.js`, `render.js`, and `template.json` were retrieved from
https://github.com/5etools-mirror-3/5etools-src/tree/main on 2026-11-16.
The upstream package identifies version 2.41.0 and licenses its code under MIT;
see LICENSE.md. These files run only in the offline import script. The website
remains a self-contained static app with no build step or upstream requests.

The MIT license covers upstream code, not the imported monster text or artwork.
Monster records and tokens came from Luca's supplied bestiary archives. Source
book identifiers and page references remain attached to their respective entries.
No assertion is made that the expanded dataset is SRD or Creative Commons.

The importer resolves nested `_copy` references, array/text/spell modifications,
and racial templates before converting the records. Embedded named versions and
variant implementations are expanded with the same upstream resolver. Original exports remain
unchanged. `scripts/bestiary-legacy.json` preserves the previous SRD catalog IDs.
Run the Python token importer, then the Node record importer, with the directory
containing bestiary-part1.zip and bestiary-part2.zip. Pillow is needed only for
this one-time image conversion. All generated assets are committed.

Import counts, entries without combat stats, and missing referenced legendary
groups are recorded in `dist/monster-import-report.json`.
