# Ground // Zero

Varun Saini's portfolio — one static page, plus the arcade it serves.

Live at **https://iudexryze.github.io/portfolio/**

The page carries no accent colour of its own. Its palette is a single
value ramp from a cold blue-black up to a warm bone, so every hue a
visitor sees belongs to a render or to a running game. Introducing a
brand colour would take the light off the work, which is the only thing
the page is for.

```
index.html              the whole site: markup, styles, script
console/index.html      the same portfolio as a handheld you operate
play/
  bt-7274n/             terminal roguelike        typed, better with keys
  drift-lander/         physics lander            any device
  circuit-breaker/      routing puzzle            any device
  overclock/            arena dodger              any device
  disco-race/           rhythm racer              any device
  refactor/             planarity puzzle          any device
  heap/                 precision stacker         any device
  mutex/                timing game               any device
.nojekyll               so GitHub Pages serves play/ verbatim
```

Five of the eight have standalone repositories: `disco-race`, `refactor`,
`heap` and `mutex` under `iudexryze/`, plus `architectus` elsewhere. The copy
under `play/` is always what the site actually serves.

No build step, no dependencies, no package manager. Open `index.html` and it
works; push to `main` and Pages serves it.

## Running it locally

Games are loaded into an `<iframe>`, so `file://` will not do — serve the
folder over HTTP:

```sh
npx serve .          # or: python -m http.server 8000
```

The hero is an iframe too, so over `file://` the front page loses its
opening shot as well as the arcade.

## The front page

Three things carry the design, and each of them is load-bearing rather
than decorative.

**The name leads.** This is a portfolio, so the largest thing on the
page by a wide margin is *Varun Saini*, followed by the role, the
positioning line, and the three facts anyone checks first — where he is,
who he is with, and whether he is available — then the contact links.
Everything else on the page is subordinate to that block.

**A real game runs behind it, quietly.** The backdrop is
`play/drift-lander/` loaded with `?demo=1`, which hands the controls to
an autopilot inside the game and suppresses its modal panels. The
autopilot writes the same keys a player would hold, so it is bound by
every rule a player is: one thruster, a tank that does not refill, and
the same landing tolerances. It crosses to the pad at altitude, holds
above the tallest ground in between, and only starts the descent once
the pad is underneath — descending on a diagonal is what puts a lander
in the dirt short of the mark. It lands about 97% of the time across
window shapes and takes roughly six seconds a level.

It is deliberately hard to notice. The stage runs at half opacity under
a heavy scrim, stops well short of the copy, and is pulled up past the
top edge (`inset: -78px 0 42% 0`, and `-86px`/`44%` on a narrow screen)
so that the game's own telemetry row is clipped away — that HUD is the
loudest thing in the picture and the part that made the page read as an
arcade rather than a portfolio. A one-line footnote at the bottom of the
hero says what it is and offers the controls.

The iframe is only loaded while it is on screen, and is dropped when a
visitor opens a game or scrolls away — a canvas game left running behind
something else keeps a rAF loop and a fan going for nobody. Under
`prefers-reduced-motion` it is never loaded at all; a still of the same
scene stands in, and the copy stops claiming anything is running.

**Two typefaces, one of them variable.** Archivo carries every heading
and all UI, and its width axis carries the hierarchy: the larger the
type, the wider it is set, and metadata is compressed. Newsreader sets
the prose. Nothing is set in capitals anywhere on the page. The nav
marks the current section by *widening* its label rather than
recolouring it, and an invisible copy of each label at the widest
setting reserves the space so the bar never reflows as you scroll.

**Hierarchy is spatial, and the arcade is not the point.** A shipped
title gets a two-column spread; the seven editor tools get one dense
list with disclosures, because they are a body of practice rather than
seven products; the eight playables get small tiles with a single line
each, because they are side projects and the page says so. The renders
run at their own aspect ratios rather than being cropped into a uniform
grid — two are vertical and one is a letterbox, and that unevenness is
the rhythm of the section.

If you are editing this page, the standing rule is that nothing may
out-weigh the hero block. Growing the arcade is the easiest way to break
it, which is exactly how it broke the first time.

## The console

`console/index.html` is the same portfolio presented as a physical object:
a handheld called **IudexRzye**, built in Three.js, where every control is on
the machine. The D-pad moves and scrolls, A opens, B goes back, START returns
to the menu, SELECT fires an item's second action or cycles the screen palette,
the contrast dial cycles palettes, the volume dial mutes, and the power switch
genuinely turns it off. Keyboard mirrors all of it (arrows or WASD, Z/Enter,
X/Esc, Shift, P), and the buttons are real focusable `<button>` elements for
anyone driving it by keyboard or screen reader.

It is one self-contained file like everything else here. The only dependency is
Three.js, imported as a pinned ES module from cdnjs.

Three things are worth knowing before editing it:

- **Content lives in one `SECTIONS` array** at the top of the first script.
  Every section is a list of items; an item is `{id, name, tag, status, body,
  props, actions}`, and an action is either `{label, href}` or `{label, launch}`
  where `launch` is an arcade slug. Adding an entry needs nothing else.
- **The screen is a character grid drawn to a canvas**, used as a texture on the
  screen mesh. Arrows and cursors are drawn as triangles rather than typed,
  because one missing glyph would throw a whole row off the grid. The grid size
  is chosen from how many *real pixels* the panel occupies on screen, not from
  the window — `fit()` measures it and calls `IRZ.fitGrid()`. A row under about
  13 pixels stops being readable however large the browser is.
- **The flat fallback is not a placeholder.** If WebGL is missing or the Three.js
  import fails, the page adds `.no3d` and the same engine drives a CSS console
  with the same buttons. That path is worth testing when you change the layout:

  ```sh
  # any Chromium, with the CDN blackholed
  chrome --host-resolver-rules="MAP cdnjs.cloudflare.com 127.0.0.1" \
         http://localhost:8000/console/
  ```

Sections and items deep-link: `console/#arcade`, `console/#work/echolocate`.

`index.html` is still the front door. To make the console the front door
instead, move it to the root and change its one `BASE` constant from `'../'`
to `'./'`.

## The arcade

Each game is a single self-contained HTML file: markup, styles and code in one
document, no imports beyond the IBM Plex webfont. A folder under `play/` is a
complete, runnable copy of that game.

The site reads them from one manifest, `GAMES`, near the bottom of
`index.html`:

```js
'drift-lander': {
  name:     'DRIFT LANDER // DESCENT',                 // overlay title bar
  title:    'Drift Lander — playable physics lander',  // iframe title, a11y
  src:      'play/drift-lander/index.html',
  source:   'https://github.com/.../play/drift-lander',
  input:    'touch',   // 'keyboard' still works by touch but wants real keys
  shape:    'fluid',   // 'fluid' reflows to any window; 'fixed' would letterbox
  minWidth: 0
}
```

Every game deep-links: `?play=drift-lander` boots straight into it.

### Device fit

`input` and `shape` do two jobs from one record, so the card and the overlay
can never contradict each other:

- The badge on each arcade card — **Any device** or **Better on desktop** — is
  derived from them at load.
- The overlay checks them against the actual window and says so up front when
  the fit is poor. Coarse pointer is the test for "no keyboard attached";
  window width is not, because a small window on a laptop is still a laptop.

Every game reflows now, so the only advice left is about BT-7274N's typed
command line. It is a notice, never a wall — **Play anyway** is always there,
and a resize or rotation re-evaluates it without anyone backing out.

### Adding a game

1. Drop `play/<slug>/index.html` in.
2. Add an entry to `GAMES`, including `input`, `shape` and `minWidth`.
3. Add a card to the `.arcade` grid in the `#arcade` section, with
   `data-launch="<slug>"` on the `.game-screen` button.
4. Add a row to `#source` and a link in the top nav.

Tile art is a hand-drawn SVG diagram of the mechanic, set in the page's
greys — never a screenshot. A drawing cannot pretend to be footage, and
the colour arriving only when the real game loads is the point.

### Writing one that works on a phone

Every canvas game uses the same viewport rule. The logical world keeps a
**constant area** and takes the aspect of the frame it is given:

```js
var k = Math.sqrt(AREA / (cw * ch));   // AREA is 960 * 600
W = cw * k;  H = ch * k;               // logical size
pxScale = 1 / k;                       // logical -> device
UI = clamp(k, 0.85, 1.75);             // counter-scale for HUD text
ctx.setTransform(dpr * pxScale, 0, 0, dpr * pxScale, 0, 0);
```

A phone held upright therefore gets a tall narrow world rather than a
letterboxed strip, and because one logical pixel is worth about the same in
either shape, the speeds, gravity and tolerances survive the reshape without
retuning. `UI` exists because the opposite is true of text: on a small screen
the HUD has to *grow* in logical units to stay the same physical size.

Anything already on the board is in logical pixels, so each game carries its
own state across a reshape rather than letting a rotation teleport things.
Drift Lander keeps the cell count and rescales the heightfield, so the pads
stay flat and stay put mid-descent; Disco Race re-derives lane positions and
car sizes from the new lane width; Overclock scales every entity.

HUDs are anchored to the two edges and one proportional column rather than laid
out from fixed offsets, which is what used to run them off the side of a narrow
screen, and overlay copy wraps to the measured width.

BT-7274N is not canvas: it is a CSS grid that collapses to one column under
900 px, with the terminal first at a definite height and the readouts scrolling
beneath it. Its command line is a real `<input>`, so the on-screen keyboard
works and it is genuinely playable by thumb — just slower than with real keys,
which is exactly what its badge says.

## Keeping a vendored game in step with its own repository

`disco-race`, `refactor`, `heap` and `mutex` each have a repository of their
own, and `play/<slug>/` here is a copy of it. Since a game is a single file
with no build step, syncing is a copy:

```sh
cp ../refactor/index.html play/refactor/index.html
```

To make that automatic instead, convert the folder to a subtree once — after
the standalone repo has been pushed:

```sh
git rm -r play/refactor && git commit -m "drop vendored refactor"
git subtree add  --prefix=play/refactor git@github.com:iudexryze/refactor.git Dev --squash
git subtree pull --prefix=play/refactor git@github.com:iudexryze/refactor.git Dev --squash
```

## Splitting a game into its own repository

A game folder has no ties to this repo, so it can be lifted out with history
intact. `git subtree split` gives a branch containing only that folder's
commits, rooted at the folder:

```sh
git subtree split --prefix=play/drift-lander -b split-drift-lander

gh repo create iudexryze/drift-lander --public
git push git@github.com:iudexryze/drift-lander.git split-drift-lander:main
git branch -D split-drift-lander
```

Then, in the new repo, turn on Pages (Settings → Pages → deploy from `main`,
root) and it is playable at `iudexryze.github.io/drift-lander/`.

Point the portfolio at the standalone repo by changing that game's `source` in
`GAMES` and the matching row in the `#code` section. Leave `src` pointing at
`play/<slug>/` — the copy here is what the site actually serves, so the arcade
keeps working whether or not a standalone repo exists.

To keep the two in sync afterwards:

```sh
git subtree pull --prefix=play/drift-lander \
  git@github.com:iudexryze/drift-lander.git main --squash
```

## Licence and attribution

BT-7274N is an unofficial fan project set in the Titanfall universe. It is not
affiliated with or endorsed by Respawn Entertainment or EA. See
`play/bt-7274n/LICENSE`.
