# Ground // Zero

Varun Saini's portfolio — one static page, plus the arcade it serves.

Live at **https://iudexryze.github.io/portfolio/**

The front door is a machine. `index.html` is **IudexRyze**, a handheld
console built in Three.js that you operate with its own D-pad and
buttons; the portfolio is what is on its screen. `page.html` is the same
work as an ordinary scrolling document, for anyone who would rather read
than press A.

```
index.html              the console — markup only, about 5 KB
page.html               the same work as plain text, linked from the console
console/index.html      a redirect, so old /console/ links still land
assets/css/
  console.css           the page around the machine
  page.css              the reading version
assets/js/
  content.js            EVERYTHING THE SITE SAYS — edit this one
  console.js            screen engine, state, sound, navigation, input
  device.js             the machine in three dimensions (Three.js)
  haunt.js              the part of the machine that is not well
  intro.js              the prologue: where the machine was found
  page.js               the text version's arcade and scroll spy
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

No build step and no package manager. The console needs Three.js, pinned
from cdnjs, and everything else is self-contained. Serve the folder over
HTTP and it works; push to `main` and Pages serves it.

## Running it locally

Games are loaded into an `<iframe>`, so `file://` will not do — serve the
folder over HTTP:

```sh
npx serve .          # or: python -m http.server 8000
```

## The console

`index.html` is the portfolio presented as a physical object: a handheld
called **IudexRyze**, built in Three.js, where every control is on
the machine. The D-pad moves and scrolls, A opens, B goes back, START returns
to the menu, SELECT fires an item's second action or cycles the screen palette,
the contrast dial cycles palettes, the volume dial steps through four levels,
and the power switch genuinely turns it off. The machine starts on COBALT, a
working blue panel, and the reading version is set in the same colours;
DREAD, the failing panel, is one turn of the contrast dial away. Keyboard mirrors all of it (arrows or WASD, Z/Enter,
X/Esc, Shift, P), and the buttons are real focusable `<button>` elements for
anyone driving it by keyboard or screen reader.

The only dependency is Three.js, imported as a pinned ES module from cdnjs.

The console used to be one 84 KB file holding markup, styles, the screen
engine, the content and the whole 3D scene. It is now split along the seams
that actually exist, because they are different jobs with different reasons
to change:

| file | what changes it |
| --- | --- |
| `assets/js/content.js` | you shipped something, or a link moved |
| `assets/js/console.js` | how the screen draws or the controls behave |
| `assets/js/device.js` | how the object looks |
| `assets/js/haunt.js` | how the machine misbehaves |
| `assets/js/intro.js` | how the machine is found |
| `assets/css/console.css` | the page around the machine |
| `index.html` | almost never — it is markup and two script tags |

`content.js` also owns `BASE`, the one constant saying where the rest of
the site is relative to the page, because the content builds its links off
it and the cartridge slot loads games from it.

**The games under `play/` are deliberately NOT split.** A game being one
file is the whole premise: a folder is a complete runnable copy, splitting
one into its own repository is a one-command job, and the arcade copy
promises each is short enough to read in an afternoon. Do not tidy those.

Three more things worth knowing before editing:

- **Content lives in one `SECTIONS` array** in `content.js`. Every section
  is a list of items; an item is `{id, name, tag, status, body, media, props,
  actions}`, `media` is a list of `{src, cap}` pictures from `assets/art`
  that the panel dithers onto its four shades, and an action is either `{label, href}` or `{label, launch}`
  where `launch` is an arcade slug. Adding an entry needs nothing else,
  anywhere.
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
         http://localhost:8000/
  ```

Sections and items deep-link: `#arcade`, `#work/echolocate`.

### One input, every hand

Every button — keyboard, the flat console, the 3D render, a finger — goes
down and comes up through one function, `input(btn, down)` in
`console.js`. The screen engine is the only thing that knows what actually
happened, so it reports it (`IRZ.on('hold' | 'palette' | 'volume' | 'hint'
| 'focus' | 'power' | 'anomaly', fn)`) and `device.js` only listens. That is
why a key on a keyboard moves the cap on the machine, why a held button
stays down, and why a lander can have thrust and a turn held by two
fingers at once.

Controls in the render are damped springs toward where the hand is putting
them: pressed, they stay down; released, they come back past rest and
settle. The dials turn by detents that match what they set. Springs go to
sleep once they arrive, and under reduced motion they are critically
damped.

The hidden `<button>`s behind the render are real and focusable. Keyboard
focus lights the control it belongs to on the machine.

### The panel's own shader

Games on the panel are posterised to its four shades with a two-pass
WebGL2 shader (brightness held against the previous frame, then the
palette), on a small canvas of its own. The CPU version read the game's
pixels back off the GPU every frame, and that one `getImageData` was 26 ms
of a 16 ms budget. The CPU path is still there for browsers without
WebGL2 and for a lost context.

### Only the glass

The drawing buffer is kept between frames. A frame whose only change is
the picture on the panel draws just the glass stack — the screen and the
layers lying on it, on camera layer 1 — scissored to the screen's own
rectangle, without a clear. Anything that changes the room is still a full
frame: the machine moving, a glow on a control, the palette, the backlight
dipping, the power. On the test machine this took a game on the panel from
42 to 55 frames a second.

### Loading

Shader programs were three and a half seconds of main thread on ANGLE,
compiled one after another. `renderer.compileAsync` hands them to the
driver's parallel compile, and the intro starts on the first real frame.
Three.js and the core module it imports are `modulepreload`ed. The boot
sequence waits for the machine to be on screen rather than playing behind
WARMING UP.

### The prologue

The portfolio begins before the machine appears. On a first visit the
visitor finds it: a low camera moving through a wet forest at night, fog
between the trees, a catch of moonlight on the glass of something lying in
the leaves. They pick it up, the camera follows the screen in until the dark
panel fills the view, and when it pulls back the machine is in their hands,
in its room, switched off. They switch it on, and the self test that follows
is the one the portfolio has always had — with two lines it only prints the
first time: `BACKLIGHT DEGRADED` and `OWNER NOT FOUND`.

It lives in `assets/js/intro.js` and follows these decisions:

- **One console.** The prologue poses, lights and frames the device
  `device.js` already built and hands it back exactly where the normal
  presentation expects it. There is no second model and no second loop:
  `device.js` calls `intro.update(dt)` from its own frame.
- **No recompile at the handoff.** Adding lights or fog to the console's
  materials would change their shader programs and force a hitch when the
  forest goes. So the moon is the machine's existing rim light, moved and
  recoloured, and every console material is marked `fog: false` before the
  forest is added. Only the forest's materials fog.
- **It hides the load rather than adding to it.** The forest is built and
  compiled behind WARMING UP together with the machine.
- **The cut hides in the dark.** The device rises and turns to face the
  camera while the camera goes in after the screen; at full occlusion, under
  a short fade, the forest is removed and disposed, the room, lights, camera
  range and pixel ratio are restored, and the pull-back starts from exactly
  the framing the forest left. Going through the screen is going inside.
- **The console decides whether it plays.** `console.js` knows about deep
  links and what this browser has seen: a first visit with no hash, or
  `?intro=1`. It holds the machine switched off, takes every button through
  an input gate while the prologue has the camera, and cancels itself —
  switching the machine on the ordinary way — if the prologue never starts
  (no WebGL, no Three.js, the module failed).
- **Found, not presented.** The glass catches the moon twice, the dead panel
  shows a faint wash and once a single dot, and for about a second there is
  someone far back in the trees, arriving and leaving behind a sheet of fog.
  `haunt.js` is told the machine was found, which moves it a little further
  in and lets the figure behind the machine come sooner. It was already
  wrong when you found it.
- **Nobody has to work it out.** One line says what to do at each step. If
  the visitor does not switch the machine on, it switches itself on. ESC or
  the SKIP button go straight to power-on at any point.
- **Adaptive resolution.** The forest is a soft picture, so it renders a
  little under native resolution and steps down if the first frames are slow
  (measured: 42 fps native, 50 at 0.75, 55 at 0.6 on the test machine). The
  machine goes back to full resolution the moment it is in your hands.
- **Reduced motion** gets a still frame, the prompt and a cut, with no camera
  movement, rain, fog drift or figure. Nothing is drawn while it waits.
- **Sound** is made in code — wind, insects, the lift, the click, a hum — and
  starts only on the first interaction, at the console's volume.
- **It leaves nothing behind.** When the lights are up the forest has been
  disposed, the page layer removed, the audio context closed, and the machine
  is back to drawing only when something changes.

Return visits go straight to the machine. It plays again on any reload of
the page (the browser does not tell a hard refresh from F5), returning to
wherever the address pointed once the boot is done, and it can be replayed
from the DIAGNOSTICS screen (A) or with `?intro=1`.

### What it remembers

Three `localStorage` keys, all optional — a private window simply gets a
first visit every time:

| key | meaning |
| --- | --- |
| `irz.booted` | the long self test has been seen; later boots are short |
| `irz.coach` | the visitor has learned the buttons; the machine stops lighting them |
| `irz.visits` | how many sessions there have been, for `haunt.js` |
| `irz.introSeen` | the prologue has been seen; later visits go straight to the machine |

### The part that is not well

Everything unsettling lives in `assets/js/haunt.js`, which draws only
through the api `console.js` hands it. A disturbance score rises slowly —
with time on the page, much faster on the DREAD panel, with repeat visits,
with the darker work and with power cycles — through five levels, and the
effects escalate with it: a line of copy that says something else for a
glance, a clock that is nearly always right, a second user, one dot that
has stopped answering, a click that is answered twice, a figure in the
glass at the end of a backlight dip, an afterimage when the power goes, a
question if you leave the machine alone.

The rules it keeps are written at the top of the file: it never takes a
button away, never hides the portfolio for longer than a glance, never
flashes, never imitates the browser; visual faults belong to DREAD, so the
contrast dial is always a way out; under reduced motion only the words
remain.

`?haunt=0` to `?haunt=4` starts a page at a level, for tuning.

The room behind the machine keeps its own, gentler clock, because it belongs
to every palette. The overhead light stutters every so often; after a minute
a shadow can cross it; after a couple of minutes someone may be standing
behind the machine, and they only ever arrive or leave in the dark between
two frames of a flicker. There are marks on the wall that are always there.
The reading version does the same in its own way: the page's failing light
sometimes has someone in it, and a shadow crosses now and then. None of the
moving part runs under reduced motion.

There is also a DIAGNOSTICS screen with a live readout of the render —
draw calls in the last frame, shader programs, the GPU, paint rate. It is
behind the obvious code.


### It costs nothing while nobody is using it

A handheld sitting still is a still image, so the scene is drawn only on
frames where something actually changed. Everything that can change — a
keypress, a button animation, the intro settling, the pointer parallax,
the power switch sliding, any repaint of the screen — calls
`invalidate()`, and `frame()` returns without touching the GPU
otherwise. Two details make that real rather than merely plausible:

- **Easing has to actually arrive.** Exponential smoothing approaches its
  target forever, so the parallax and the power switch snap once they are
  within a fraction of a pixel. Without that the scene is always "still
  moving" and never stops redrawing.
- **The shadow map is manual.** `shadowMap.autoUpdate` is off, and the map
  is re-rendered only on frames where the geometry under the light moved.

Measured with the WebGL draw calls hooked, after boot and intro settle:
**zero draw calls over four seconds idle**, and about 33 for one keypress
and the animation that follows it.

Two things break that on purpose, both small. Until a first-time visitor
has pressed anything, the selected menu row keeps a cursor blinking, which
is two panel paints a second and stops at the first press. And the clock
on the home screen repaints the panel every twenty seconds. A game on the
panel is a paint every frame, but those frames draw the glass only.

### Lighting notes

Two things here were worth getting right, and both were counter-intuitive:

- **`PCFSoftShadowMap` ignores `shadow.radius`.** The shadow was a
  hard-edged rectangle, and raising the map size only sharpened it.
  `VSMShadowMap` blurs the shadow map itself and is the only built-in type
  that gives a genuinely soft edge here.
- **A flat slab lit from well off-axis throws its whole silhouette
  sideways**, which reads as a second object rather than as depth. The key
  light therefore sits closer to the camera than it looks like it should,
  so most of the shadow tucks behind the machine and only the halo shows.

The backdrop is a radial sweep sized to the band the camera can actually
see. A gradient scaled to the whole plane is mostly off-screen, and what
is left on screen reads as a flat grey wall.

## The arcade

Each game is a single self-contained HTML file: markup, styles and code in one
document, no imports beyond the IBM Plex webfont. A folder under `play/` is a
complete, runnable copy of that game.

The text version reads them from one manifest, `GAMES`, in
`assets/js/page.js`. The console carries the same slugs in `content.js`
and loads them through `BASE`:

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
3. Add an item to the ARCADE section of `SECTIONS` in `assets/js/content.js`,
   with an action of `{label:"PLAY", launch:"<slug>"}`. That is all the console needs.
4. In `page.html`, add a card to the `.arcade` grid with `data-launch="<slug>"`
   on the `.game-screen` button, a row to `#code`, and a link in the rail.

The status-bar counts in `page.html` read from the DOM, so they keep
themselves honest.

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

The code in this repository is licensed under the Apache License 2.0; see
`LICENSE`. The renders in `assets/art/`, the portfolio's written content and
the IudexRyze and Varun Saini names are all rights reserved and are not covered
by that licence. `NOTICE` has the details and the third-party credits.

BT-7274N is an unofficial fan project set in the Titanfall universe. It is not
affiliated with or endorsed by Respawn Entertainment or EA. See
`play/bt-7274n/LICENSE`.
