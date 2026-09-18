# Character Forge

A browser-based D&D 5e (2014) character creator.

The site is a self-contained static app served from `index.html`. Changes pushed to `main` are deployed automatically with GitHub Pages.

## Local use

Open `index.html` in a browser. No build step is required.

## Public use

The most stable version is maintained here: https://lucas-character-forge.lucaazevedo.chatgpt.site/

The version maintained in this repository is still in development and can be accessed at:
https://lucaazevedo2.github.io/character-forge/.

## Design and assets

Responsive layouts support phones, tablets, and desktop screens. The artwork,
Inter and Cormorant Garamond fonts, and selected Lucide icons are embedded in the
HTML. Font and icon licenses are preserved in `licenses/`.

Landscape photograph: https://images.unsplash.com/photo-1464822759023-fed622ff2c3b

Characters and custom content are saved in the current browser's local storage
when the ChatGPT storage API is unavailable. Data stays specific to that browser
and site address; it does not sync through GitHub.
