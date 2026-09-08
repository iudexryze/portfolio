Drop the Neoradical file here as neoradical.woff2 (preferred) or
neoradical.ttf.

assets/css/console.css already declares the @font-face and every
display element already asks for it, so nothing else needs changing.

It is deliberately NOT used on the console screen. That is a character
grid: setGrid() measures glyph advance and lays every string on fixed
cells, so the panel font has to be monospace or the layout collapses.

Check the licence on 1001fonts before shipping: this is a public site
and a number of faces there are free for personal use only.
