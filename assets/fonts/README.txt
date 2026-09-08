Nothing needs to live here.

The display face is Rubik Distressed, loaded from Google Fonts (OFL)
alongside the others in index.html. To swap in a different display
face, add an @font-face here and put it first in --f-display in
assets/css/console.css, and first in the two canvas font strings:
  assets/js/device.js  — the wordmark screened on the shell
  assets/js/console.js — the boot line

Do NOT put a display face on the panel. That is a character grid:
setGrid() measures glyph advance and lays every string on fixed cells,
so the screen font has to be monospace or the layout collapses.
