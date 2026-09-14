/* The object, in three dimensions.

   Loaded on its own. If it never arrives, the flat console in the
   markup takes over and nothing is lost but the plastic.
   Part of IudexRyze. See README.md for how the pieces fit. */

const IRZ  = window.IRZ;
const root = document.documentElement;

function fallback(){
  root.classList.add('no3d');
  const w = document.getElementById('warming'); if (w) w.hidden = true;
  // the flat console is the machine now, so the boot can start on it
  if (IRZ && IRZ.ready) IRZ.ready();
  // the flat console sizes its own panel, so tell the screen how big
  // it ended up — otherwise it picks a grid for a device that is not there
  const lcd = document.getElementById('lcd');
  const sync = () => { if (IRZ && lcd.clientHeight) IRZ.fitGrid(lcd.clientHeight); };
  addEventListener('resize', sync);
  requestAnimationFrame(sync);
  setTimeout(sync, 400);
}

function hasWebGL(){
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch(e){ return false; }
}

if (!IRZ || !hasWebGL()){ fallback(); }
else {
  let THREE;
  try {
    THREE = await import('https://cdnjs.cloudflare.com/ajax/libs/three.js/0.185.1/three.module.min.js');
  } catch(e){ fallback(); }
  /* The shell print is painted into a canvas once and used as a texture
     for the life of the page. Canvas silently falls back to the next
     face in the stack if the webfont has not arrived yet, so waiting
     here is the difference between the wordmark being screen-printed
     and it being Plex Condensed forever. */
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch(e){}
  }
  /* The prologue is its own module, fetched only when the console says
     this visit should see it. If it fails to load, the machine is built as
     usual and the console switches itself on. */
  let INTRO = null;
  if (THREE && IRZ.intro && IRZ.intro.planned()){
    try { INTRO = await import('./intro.js'); } catch(e){ INTRO = null; }
  }
  if (THREE) build(THREE, INTRO);
}

function build(THREE, INTRO){
/* ── the machine, in centimetres ──────────────────────────────────
   Not a Game Boy: the same hand, a much larger panel. The screen is
   the whole point of this object, so it gets the room.            */
const W = 9.0, H = 15.4, D = 2.9;
const BEV = 0.18;                               // shell edge round-off
const BZ_W = 7.9, BZ_H = 6.9, BZ_Y = 3.85;      // bezel
const LC_W = 6.0, LC_H = 5.40, LC_Y = 4.30;     // active screen

const SHELL   = 0xAFA893, SHELL_DK = 0x938D7E;
const BEZEL   = 0x2C2C34;
const BUTTON  = 0x8E3350, DARK = 0x2B2B31, GREY = 0x55555C;
const NAVY    = '#2B3B7A', MAROON = '#8E3350';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── shapes ───────────────────────────────────────────────────── */
function roundedRect(w, h, r){
  const s = new THREE.Shape(), x = -w/2, y = -h/2;
  const tl = r.tl||0, tr = r.tr||0, br = r.br||0, bl = r.bl||0;
  s.moveTo(x+bl, y);
  s.lineTo(x+w-br, y);          s.quadraticCurveTo(x+w, y, x+w, y+br);
  s.lineTo(x+w, y+h-tr);        s.quadraticCurveTo(x+w, y+h, x+w-tr, y+h);
  s.lineTo(x+tl, y+h);          s.quadraticCurveTo(x, y+h, x, y+h-tl);
  s.lineTo(x, y+bl);            s.quadraticCurveTo(x, y, x+bl, y);
  return s;
}
function slab(shape, depth, bevel){
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, curveSegments:16, bevelEnabled:true,
    bevelThickness:bevel, bevelSize:bevel, bevelOffset:0, bevelSegments:4
  });
  g.translate(0, 0, -depth/2);
  g.computeVertexNormals();
  return g;
}
function crossShape(arm, len, r){
  const a = arm/2, l = len/2, s = new THREE.Shape();
  s.moveTo(-a, -l); s.lineTo(a, -l); s.lineTo(a, -a); s.lineTo(l, -a);
  s.lineTo(l, a);   s.lineTo(a, a);  s.lineTo(a, l);  s.lineTo(-a, l);
  s.lineTo(-a, a);  s.lineTo(-l, a); s.lineTo(-l, -a); s.lineTo(-a, -a);
  s.closePath(); return s;
}

/* ── textures ─────────────────────────────────────────────────── */
function tex(cv, srgb){
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function pad2d(w, h){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

/* ── engraved control labels ──────────────────────────────────────
   The names used to be printed on the shell beside the controls, where
   a Game Boy puts them, and at the size this thing renders that was not
   enough to tell you what you were about to press. They are cut into
   the buttons now.

   A groove is read entirely from its two inner walls, and the thing
   that sells it is that they are lit the opposite way round from a
   raised letter. The key light sits upper-right, so the wall that FACES
   it — the lower-left one — is the bright edge, and the upper-right
   wall is the one in shadow. Get that backwards and the letter looks
   glued on. A bump map off the same glyph goes on as well, so the baked
   chisel and the real light agree when the machine turns.

   These are decals rather than UV work on the buttons themselves: the
   pills and the D-pad are extrusions whose front-face UVs are in shape
   coordinates, not 0..1, so there is nothing sane to paint into. A
   child plane a thousandth in front of the face is predictable on every
   one of them and moves with the button when it is pressed.        */
function engraved(paint, wWorld, hWorld, opts){
  opts = opts || {};
  const HPX = 256;
  const WPX = Math.max(48, Math.round(HPX * wWorld / hWorld));
  const [c, g]   = pad2d(WPX, HPX);
  const [bc, bg] = pad2d(WPX, HPX);
  const d = Math.max(1, HPX * 0.020);

  const pass = (ctx, fill, dx, dy) => {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.fillStyle = fill;
    paint(ctx, WPX, HPX);
    ctx.restore();
  };

  pass(g, opts.lit  || 'rgba(255,255,255,.46)', -d,  d);   // wall facing the key
  pass(g, opts.dark || 'rgba(0,0,0,.70)',        d, -d);   // wall away from it
  pass(g, opts.core || 'rgba(0,0,0,.52)',        0,  0);   // the floor of the cut

  bg.fillStyle = '#8a8a8a'; bg.fillRect(0, 0, WPX, HPX);
  pass(bg, '#000', 0, 0);

  const m = new THREE.MeshStandardMaterial({
    map: tex(c),
    bumpMap: tex(bc, false),
    bumpScale: opts.bump === undefined ? 0.6 : opts.bump,
    roughness: opts.roughness === undefined ? 0.52 : opts.roughness,
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(wWorld, hWorld), m);
}

/* text, centred, tracked out a little because small caps on a curved
   cap close up otherwise */
function engravedText(text, wWorld, hWorld, opts){
  opts = opts || {};
  const fill = opts.fill || 0.66;
  return engraved(function(ctx, w, h){
    ctx.font = '700 ' + (h * fill) + 'px "IBM Plex Sans Condensed", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.letterSpacing = (h * (opts.tracking || 0)) + 'px';
    ctx.fillText(text, w / 2, h / 2 + h * 0.03);
  }, wWorld, hWorld, opts);
}

/* a solid triangle, for the four arms of the pad */
function engravedArrow(dir, size, opts){
  return engraved(function(ctx, w, h){
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.34;
    const pts = { u:[[0,-1],[.9,.7],[-.9,.7]], d:[[0,1],[.9,-.7],[-.9,-.7]],
                  l:[[-1,0],[.7,.9],[.7,-.9]], r:[[1,0],[-.7,.9],[-.7,-.9]] }[dir];
    ctx.beginPath();
    ctx.moveTo(cx + pts[0][0]*r, cy + pts[0][1]*r);
    ctx.lineTo(cx + pts[1][0]*r, cy + pts[1][1]*r);
    ctx.lineTo(cx + pts[2][0]*r, cy + pts[2][1]*r);
    ctx.closePath(); ctx.fill();
  }, size, size, opts);
}

/* moulded plastic is never perfectly smooth */
function plasticRoughness(){
  const N = 512, [c, g] = pad2d(N, N);
  g.fillStyle = '#9A9A9A'; g.fillRect(0, 0, N, N);

  // slow blotching: the tool and the flow, not the surface
  g.filter = 'blur(22px)';
  for (let i = 0; i < 70; i++){
    const v = Math.random() < 0.5 ? 255 : 0;
    g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.05 + Math.random()*0.07).toFixed(3) + ')';
    g.beginPath();
    g.arc(Math.random()*N, Math.random()*N, 26 + Math.random()*90, 0, 7);
    g.fill();
  }
  g.filter = 'none';

  // fine grain on top
  const img = g.getImageData(0, 0, N, N);
  for (let i = 0; i < img.data.length; i += 4){
    const d = (Math.random()*26|0) - 13;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + d));
    img.data[i+1] = img.data[i+2] = img.data[i];
  }
  g.putImageData(img, 0, 0);

  const t = tex(c, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 5);
  return t;
}

/* Everything printed on the front of the shell, plus the recesses:
   moulded-in dishes are painted, not modelled — at this size the
   shading sells them and the geometry would not. */
const P = {
  dpad:   [-2.55, -3.55],
  b:      [ 1.25, -4.25],
  a:      [ 2.72, -3.58],
  select: [-1.15, -5.95],
  start:  [ 0.85, -5.59],
  spk:    [ 2.50, -6.05],
  lamp:   [ 4.02,  0.22],
  power:  [-3.66, -6.24]
};

function shellPrint(){
  const TW = 1024, TH = Math.round(TW * H / W), [c, g] = pad2d(TW, TH);
  const px = x => (x + W/2) / W * TW, py = y => (H/2 - y) / H * TH, u = n => n / H * TH;

  g.clearRect(0, 0, TW, TH);
  g.textBaseline = 'alphabetic';

  // moulded dishes under the controls
  const dish = (x, y, r) => {
    const grad = g.createRadialGradient(px(x), py(y), u(r*0.55), px(x), py(y), u(r));
    grad.addColorStop(0,    'rgba(52,44,32,.16)');
    grad.addColorStop(0.62, 'rgba(46,39,28,.24)');
    grad.addColorStop(0.86, 'rgba(38,32,23,.34)');
    grad.addColorStop(0.95, 'rgba(255,255,255,.26)');
    grad.addColorStop(1,    'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(px(x), py(y), u(r), 0, 7); g.fill();
  };
  dish(P.dpad[0], P.dpad[1], 2.05);
  dish(P.a[0], P.a[1], 1.02);
  dish(P.b[0], P.b[1], 1.02);
  dish(P.power[0], P.power[1], 0.66);

  /* Occlusion where the bezel meets the shell. The bezel stands proud
     of this plane, so light never reaches the millimetre around its
     foot and every real photograph shows a dark seam there. */
  {
    const bw = px(BZ_W/2) - px(-BZ_W/2), bh = py(BZ_Y - BZ_H/2) - py(BZ_Y + BZ_H/2);
    const x0 = px(-BZ_W/2), y0 = py(BZ_Y + BZ_H/2);
    g.save();
    g.filter = 'blur(' + u(0.18).toFixed(1) + 'px)';
    g.strokeStyle = 'rgba(38,32,24,.46)';
    g.lineWidth = u(0.30);
    g.beginPath(); g.roundRect(x0, y0, bw, bh, u(0.50)); g.stroke();
    g.filter = 'none';
    g.restore();
  }

  /* Occlusion into the outer edge: the shell curves away, so the rim
     never faces the light squarely. */
  {
    g.save();
    g.filter = 'blur(' + u(0.34).toFixed(1) + 'px)';
    g.strokeStyle = 'rgba(30,26,20,.30)';
    g.lineWidth = u(0.62);
    g.beginPath();
    g.roundRect(u(0.20), u(0.20), TW - u(0.40), TH - u(0.40), u(0.9));
    g.stroke();
    g.filter = 'none';
    g.restore();
  }

  /* Colour is never even across a panel this size. */
  {
    g.save();
    g.filter = 'blur(' + u(1.1).toFixed(1) + 'px)';
    for (let i = 0; i < 22; i++){
      const warm = Math.random() < 0.55;
      g.fillStyle = warm ? 'rgba(126,104,66,.030)' : 'rgba(206,214,226,.024)';
      g.beginPath();
      g.arc(Math.random()*TW, Math.random()*TH, u(0.7 + Math.random()*2.4), 0, 7);
      g.fill();
    }
    g.filter = 'none';
    g.restore();
  }

  /* A moulding seam runs the height of the shell, and a machine that
     has been picked up has fine scuffs where thumbs land. */
  g.fillStyle = 'rgba(46,40,30,.13)';
  g.fillRect(px(-W/2 + 0.06), 0, Math.max(1, u(0.020)), TH);
  g.fillRect(px(W/2 - 0.08),  0, Math.max(1, u(0.020)), TH);

  /* Grime settles where hands go and where the shell changes angle.
     None of this is symmetrical, because nothing that has been used is. */
  {
    g.save();
    g.filter = 'blur(' + u(0.9).toFixed(1) + 'px)';
    const soil = (x, y, r, a) => {
      g.fillStyle = 'rgba(38,30,18,' + a + ')';
      g.beginPath(); g.arc(px(x), py(y), u(r), 0, 7); g.fill();
    };
    soil(-2.55, -3.55, 2.5, .16);          // around the d-pad
    soil( 2.2,  -3.9,  2.1, .13);          // around A and B
    soil(-3.9,  -6.6,  1.6, .10);
    soil( 3.6,   1.2,  1.4, .09);
    g.filter = 'none';
    g.restore();
  }

  /* Dried, not fresh. It has been there long enough to go brown at the
     edges and to have been half-wiped once, badly. */
  /* ── what happened here ─────────────────────────────────────────
     The previous pass was thirty per cent alpha under a blur, which is
     the recipe for dirt. Blood is not dirt. It is darker than anyone
     expects, nearly black in the middle of a deposit; it dries from the
     outside in, so a droplet keeps a hard rim after the centre has sunk
     and gone matte; and it is directional — every drop points back at
     where it came from, which is the single thing that makes a wall of
     specks read as an event rather than as texture.

     It is placed, not scattered. A cast-off arc across the lower shell
     from something swung, impact spatter thrown up from below left, one
     long run out from under the bezel seam where it soaked in and came
     back out, and — the part that does the work — contact transfer on
     the controls. Somebody held this thing with wet hands. The D-pad and
     the A button are the two places a right hand actually touches, so
     that is where the finger ridges are.                             */
  {
    g.save();
    const CORE  = 'rgba(46,6,8,';     // the middle of a deposit
    const RIM   = 'rgba(22,3,5,';     // dried edge, always darker
    const FRESH = 'rgba(84,10,13,';
    const OLD   = 'rgba(72,32,20,';   // weeks of it, gone brown

    /* One droplet: rim, body, and a sliver of sheen. The sheen is why
       it reads wet — the shell around it is matte plastic and blood is
       the only thing on this object that is not. */
    const drop = (x, y, r, ang, elong, a, col) => {
      const rx = u(r * elong), ry = u(r);
      g.save(); g.translate(px(x), py(y)); g.rotate(ang);
      g.fillStyle = RIM + Math.min(0.95, a * 1.05).toFixed(3) + ')';
      g.beginPath(); g.ellipse(0, 0, rx * 1.12, ry * 1.12, 0, 0, 7); g.fill();
      g.fillStyle = (col || CORE) + a.toFixed(3) + ')';
      g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, 7); g.fill();
      if (r > 0.045){
        g.fillStyle = 'rgba(196,150,150,' + (a * 0.16).toFixed(3) + ')';
        g.beginPath(); g.ellipse(-rx * 0.30, -ry * 0.34, rx * 0.30, ry * 0.26, 0, 0, 7); g.fill();
      }
      g.restore();
    };

    /* Impact: everything radiates from one point and stretches with
       distance, and the big ones throw a tail and a satellite. */
    const spatter = (ox, oy, dir, spread, n, reach, scale) => {
      for (let i = 0; i < n; i++){
        const a = dir + (Math.random() - 0.5) * spread;
        const d = Math.pow(Math.random(), 0.6) * reach;
        const x = ox + Math.cos(a) * d, y = oy + Math.sin(a) * d;
        const r = (0.020 + Math.random() * 0.075) * scale * (1 - d / reach * 0.45);
        const el = 1 + d / reach * 2.2;
        drop(x, y, r, -a, el, 0.62 + Math.random() * 0.33, Math.random() < 0.22 ? OLD : CORE);
        if (r > 0.055 && Math.random() < 0.5){
          drop(x + Math.cos(a) * r * 3.4, y + Math.sin(a) * r * 3.4,
               r * 0.32, -a, 1.6, 0.55 + Math.random() * 0.3);
        }
      }
    };

    /* Cast-off: a swing, so the drops sit along an arc and get bigger
       toward the end of the stroke where the tip was moving fastest. */
    const castOff = (x0, y0, x1, y1, bow, n) => {
      for (let i = 0; i < n; i++){
        const t = i / (n - 1);
        const mx = (x0 + x1) / 2 + bow, my = (y0 + y1) / 2 + bow * 0.6;
        const x = (1-t)*(1-t)*x0 + 2*(1-t)*t*mx + t*t*x1;
        const y = (1-t)*(1-t)*y0 + 2*(1-t)*t*my + t*t*y1;
        const ang = Math.atan2(y1 - y0, x1 - x0);
        const r = (0.030 + Math.random() * 0.055) * (0.5 + t);
        drop(x + (Math.random()-0.5)*0.16, y + (Math.random()-0.5)*0.16,
             r, -ang, 1.5 + t * 1.4, 0.66 + Math.random() * 0.30);
      }
    };

    /* A run. Gravity, a bulb of mass at the leading edge, and a tail
       that thins where it outran its own supply. */
    const run = (x, y, len, w, a) => {
      const steps = 42;
      for (let i = 0; i < steps; i++){
        const t = i / (steps - 1);
        const yy = y - t * len;
        const wob = Math.sin(t * 9 + x) * 0.020;
        const ww = w * (1 - t * 0.55) * (0.8 + Math.sin(t * 17) * 0.2);
        g.fillStyle = CORE + (a * (1 - t * 0.35)).toFixed(3) + ')';
        g.beginPath(); g.ellipse(px(x + wob), py(yy), u(ww), u(len / steps * 1.5), 0, 0, 7); g.fill();
      }
      drop(x + Math.sin(9 + x) * 0.02, y - len, w * 1.9, 0, 0.85, Math.min(0.94, a * 1.15));
    };

    /* Contact transfer. Four ridges and a palm edge, dragged — this is
       a hand that was already wet, not a hand that got splashed. */
    const hand = (cx, cy, rot, s, a) => {
      g.save(); g.translate(px(cx), py(cy)); g.rotate(rot);
      for (let f = 0; f < 4; f++){
        const fx = (f - 1.5) * u(0.30 * s);
        const grad = g.createLinearGradient(fx, -u(0.55*s), fx, u(0.70*s));
        grad.addColorStop(0,   CORE + (a * 0.92).toFixed(3) + ')');
        grad.addColorStop(0.55, CORE + (a * 0.55).toFixed(3) + ')');
        grad.addColorStop(1,   CORE + '0)');
        g.fillStyle = grad;
        g.beginPath();
        g.ellipse(fx, u(0.05*s), u(0.105 * s), u(0.62 * s), 0, 0, 7);
        g.fill();
        // the ridge itself, broken where the skin did not sit down
        for (let k = 0; k < 7; k++){
          if (Math.random() < 0.34) continue;
          g.fillStyle = RIM + (a * (0.5 - k * 0.05)).toFixed(3) + ')';
          g.fillRect(fx - u(0.075*s), -u(0.42*s) + k * u(0.145*s), u(0.15*s), u(0.030*s));
        }
      }
      g.restore();
    };

    // it came from below and to the left, hard
    spatter(-3.15, -6.25, 0.62, 1.55, 90, 5.4, 1.0);
    // and something was swung across the middle of the shell
    castOff(-4.15, -1.35, 3.95, -2.65, 0.85, 22);
    // a second, shorter arc, later, over the top of the first
    castOff(3.60, -5.05, -1.30, -6.85, -0.55, 13);

    // soaked into the bezel seam and came back out of it
    run( 2.42, 0.20, 2.35, 0.055, 0.88);
    run(-1.05, 0.14, 1.10, 0.036, 0.74);
    run( 3.88, 0.06, 3.30, 0.042, 0.80);
    // and off the bottom of the speaker grille
    run( 1.62, -6.95, 0.85, 0.030, 0.66);

    // the two places a right hand actually holds this
    hand(P.a[0] + 0.10, P.a[1] + 0.35, -0.28, 1.0, 0.62);
    hand(P.dpad[0] - 0.15, P.dpad[1] + 0.55, 0.34, 1.15, 0.52);

    // pooled where the mould dishes let it collect
    [[P.a[0], P.a[1], 1.02], [P.b[0], P.b[1], 1.02], [P.dpad[0], P.dpad[1], 2.05]].forEach(([x, y, r]) => {
      const gd = g.createRadialGradient(px(x), py(y), u(r * 0.72), px(x), py(y), u(r));
      gd.addColorStop(0, RIM + '0)');
      gd.addColorStop(0.82, RIM + '.30)');
      gd.addColorStop(1, RIM + '.52)');
      g.fillStyle = gd;
      g.beginPath(); g.arc(px(x), py(y), u(r), 0, 7); g.fill();
    });

    // a thumbprint on the glass side of the bezel seam, half wiped
    drop(-3.72, -3.05, 0.20, 0.4, 1.35, 0.58, OLD);
    drop(-3.55, -3.32, 0.13, 0.4, 1.20, 0.48, OLD);
    g.restore();
  }

  g.save();
  g.lineCap = 'round';
  for (let i = 0; i < 26; i++){
    const x = Math.random()*TW, y = Math.random()*TH, a = Math.random()*Math.PI;
    const len = u(0.12 + Math.random()*0.55);
    g.strokeStyle = 'rgba(255,255,255,' + (0.05 + Math.random()*0.07).toFixed(3) + ')';
    g.lineWidth = Math.max(1, u(0.010));
    g.beginPath();
    g.moveTo(x - Math.cos(a)*len, y - Math.sin(a)*len);
    g.lineTo(x + Math.cos(a)*len, y + Math.sin(a)*len);
    g.stroke();
  }
  g.restore();

  // speaker: thirty-six holes, on the tilt
  {
    const rot = -28*Math.PI/180, cs = Math.cos(rot), sn = Math.sin(rot);
    for (let r=0;r<6;r++) for (let col=0;col<6;col++){
      const lx = (col - 2.5) * 0.38, ly = (2.5 - r) * 0.38;
      const x = P.spk[0] + lx*cs - ly*sn, y = P.spk[1] + lx*sn + ly*cs;
      g.fillStyle = 'rgba(46,40,30,.62)';
      g.beginPath(); g.arc(px(x), py(y), u(0.115), 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,.18)';
      g.beginPath(); g.arc(px(x), py(y) + u(0.05), u(0.115), 0.9, 2.3); g.fill();
    }
  }

  // hairline across the shell, just under the bezel
  g.fillStyle = 'rgba(0,0,0,.13)';
  g.fillRect(px(-W/2+0.60), py(-1.62), px(W/2-0.60)-px(-W/2+0.60), Math.max(1, u(0.013)));

  // the wordmark
  g.fillStyle = '#4A463C';
  g.font = u(0.28) + 'px "IBM Plex Sans Condensed", sans-serif';
  g.letterSpacing = u(0.06) + 'px';
  g.fillText('VARUN SAINI', px(-3.62), py(0.06));
  g.letterSpacing = '0px';
  g.fillStyle = NAVY;
  g.font = u(1.06) + 'px "Rubik Distressed", "IBM Plex Sans Condensed", sans-serif';
  g.fillText('IudexRyze', px(-3.68), py(-0.98));
  const wmw = g.measureText('IudexRyze').width;
  g.font = u(0.22) + 'px "IBM Plex Sans Condensed", sans-serif';
  g.fillText('TM', px(-3.68) + wmw + u(0.08), py(-0.62));

  // battery lamp label, right-aligned into the lamp
  g.textAlign = 'right';
  g.fillStyle = '#5A554A';
  g.font = u(0.21) + 'px "IBM Plex Mono", monospace';
  g.fillText('BATT', px(P.lamp[0] - 0.30), py(P.lamp[1] - 0.07));

  /* the front power button says what it is; the glyph on its face is
     unambiguous but small, and this is the corner of a machine nobody
     has used before */
  g.textAlign = 'center';
  g.fillStyle = '#4A463D';
  g.font = '600 ' + u(0.22) + 'px "IBM Plex Sans Condensed", sans-serif';
  g.letterSpacing = u(0.06) + 'px';
  g.fillText('POWER', px(P.power[0]), py(P.power[1] - 0.78));
  g.letterSpacing = '0px';
  g.textAlign = 'right';

  /* A, B, SELECT and START used to be printed here, on the shell
     beside each control. They are cut into the buttons themselves now
     — see engraved() — so printing them here as well would only say
     everything twice in the smallest part of the frame. */
  g.textAlign = 'center';
  return tex(c);
}

/* the bezel carries the model line, and the four stripes */
function bezelPrint(){
  const TW = 1024, TH = Math.round(TW * BZ_H / BZ_W), [c, g] = pad2d(TW, TH);
  const u = n => n / BZ_H * TH;
  g.clearRect(0, 0, TW, TH);

  // stripes, bottom left, leaning
  const stripe = (x, col) => {
    g.save(); g.translate(u(x), TH - u(0.42)); g.rotate(-24*Math.PI/180);
    g.fillStyle = col; g.fillRect(0, -u(0.26), u(0.10), u(0.52)); g.restore();
  };
  stripe(0.52, MAROON); stripe(0.74, MAROON); stripe(0.96, NAVY); stripe(1.18, NAVY);

  g.fillStyle = '#A9A59C';
  g.font = '600 ' + u(0.21) + 'px "IBM Plex Sans Condensed", sans-serif';
  g.letterSpacing = u(0.05) + 'px';
  g.fillText('DOT MATRIX  ·  STEREO SOUND', u(1.62), TH - u(0.32));
  g.letterSpacing = '0px';
  return tex(c);
}

/* a soft diagonal sheen for the cover glass — a hint, not a wash */
function glassSheen(){
  const [c, g] = pad2d(256, 256);
  /* Weighted into the top-left corner and away from the middle rows,
     because a bar of glare across the text is a rendering flourish
     that costs you the one thing the screen is for. */
  const grad = g.createLinearGradient(0, 256, 256, 0);
  grad.addColorStop(0,    'rgba(255,255,255,0)');
  grad.addColorStop(0.74, 'rgba(255,255,255,0)');
  grad.addColorStop(0.87, 'rgba(255,255,255,.20)');
  grad.addColorStop(1,    'rgba(255,255,255,.34)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);

  /* Nothing anyone has owned has a perfectly clean cover. */
  g.save();
  g.filter = 'blur(7px)';
  g.fillStyle = 'rgba(255,255,255,.05)';
  g.beginPath(); g.ellipse(178, 96, 40, 24, -0.5, 0, 7); g.fill();
  g.beginPath(); g.ellipse(74, 188, 30, 17, 0.3, 0, 7); g.fill();
  g.filter = 'none';
  for (let i = 0; i < 26; i++){
    g.fillStyle = 'rgba(255,255,255,' + (0.05 + Math.random()*0.11).toFixed(3) + ')';
    g.beginPath(); g.arc(Math.random()*256, Math.random()*256, 0.5 + Math.random()*0.9, 0, 7); g.fill();
  }
  g.restore();
  return tex(c);
}

/* ── scene ────────────────────────────────────────────────────── */
const canvas   = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, powerPreference:'high-performance', preserveDrawingBuffer:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.94;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
/* Nothing here animates on its own once it has settled, so the shadow
   map is re-rendered only on the frames that actually move. */
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 200);
camera.position.set(0, 0, 40);

// a studio sky, so the plastic has something to reflect
{
  /* A three-stop gradient gives plastic nothing to reflect but a smear.
     Real product photography puts shaped sources in the room, and it is
     the edges of those shapes travelling across a curve that read as
     "shiny thing in a studio" rather than "material with a specular
     value". */
  const EW = 1024, EH = 512, [c, g] = pad2d(EW, EH);
  const sky = g.createLinearGradient(0, 0, 0, EH);
  sky.addColorStop(0,    '#3E4650');
  sky.addColorStop(0.40, '#1A1F25');
  sky.addColorStop(0.50, '#0E1216');
  sky.addColorStop(0.52, '#0A0D10');
  sky.addColorStop(1,    '#040506');
  g.fillStyle = sky; g.fillRect(0, 0, EW, EH);

  g.filter = 'blur(30px)';
  g.fillStyle = 'rgba(214,222,228,.55)';                       // the one lamp
  g.fillRect(EW*0.50, EH*0.06, EW*0.15, EH*0.17);
  g.fillStyle = 'rgba(120,150,178,.20)';                       // whatever is left
  g.fillRect(EW*0.09, EH*0.16, EW*0.10, EH*0.12);
  g.filter = 'none';

  const env = tex(c); env.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(env).texture;
  scene.environmentIntensity = 0.42;
  pmrem.dispose(); env.dispose();
}

/* The rig was lit for mood and the controls paid for it: the bottom
   third of the shell — which is the half you actually operate — sat a
   stop and a half under the screen end. Everything below lifts the
   lower half and the silhouette without touching what makes it feel
   like a room with one bad light in it. */
const hemi = new THREE.HemisphereLight(0x5C6C78, 0x141216, 0.34);
scene.add(hemi);

/* Something sickly and low, off to one side, that should not be on. */
const wrong = new THREE.PointLight(0x8FB55A, 13, 20, 2);
wrong.position.set(-7.5, -9.5, 5.0); scene.add(wrong);

const key = new THREE.DirectionalLight(0xD8E2E6, 1.38);
key.position.set(6, 10.5, 17); key.castShadow = true;
/* The frustum was more than twice the size of the thing casting into
   it, so every texel covered a lot of world and the result was a hard
   rectangle. Fit it to the device and the same map goes four times
   further. */
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -8;  key.shadow.camera.right = 8;
key.shadow.camera.top = 11;   key.shadow.camera.bottom = -11;
key.shadow.camera.near = 1;   key.shadow.camera.far = 46;
key.shadow.radius = 7; key.shadow.blurSamples = 24;
key.shadow.bias = 0; key.shadow.normalBias = 0.03;
scene.add(key);

/* Two edges, not one. A single rim left the right-hand side of the
   case dissolving into a background that is nearly the same value. */
const rim = new THREE.DirectionalLight(0x4A6E96, 1.95);
rim.position.set(-12, 5, -4); scene.add(rim);

const rim2 = new THREE.DirectionalLight(0x6E86A8, 0.85);
rim2.position.set(13, 2, -6); scene.add(rim2);

/* Low and in front, on the controls alone. Short range so it dies well
   before the bezel and never flattens the screen end. */
const hands = new THREE.PointLight(0xDCD5C6, 62, 26, 2);
hands.position.set(0.8, -8.6, 9.5); scene.add(hands);

const fill = new THREE.PointLight(0xC8B49A, 70, 44, 2);
fill.position.set(-9.5, -7.5, 10); scene.add(fill);

/* The near source that actually shapes the face. */
const shaper = new THREE.PointLight(0xE8ECEA, 175, 42, 2);
shaper.position.set(7.5, 8.5, 12); scene.add(shaper);

/* A pool of light behind the device. On a wide screen the machine is a
   portrait object in a landscape frame, and without this the space
   either side is dead rather than composed. */
function sweep(){
  const [c, g] = pad2d(512, 512);
  g.fillStyle = '#040506'; g.fillRect(0, 0, 512, 512);
  /* One failing source overhead and nothing else. The pool is tighter
     and colder than a studio would ever light it, and it dies to black
     well before the edge of frame. */
  const grad = g.createRadialGradient(256, 206, 12, 256, 240, 128);
  grad.addColorStop(0,    '#2E3739');
  grad.addColorStop(0.34, '#1B2223');
  grad.addColorStop(0.66, '#0C1112');
  grad.addColorStop(1,    '#030405');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 512);

  /* Damp on the wall behind. Nothing you can name, which is the point. */
  g.filter = 'blur(26px)';
  for (let i = 0; i < 14; i++){
    g.fillStyle = 'rgba(30,26,18,' + (0.05 + Math.random()*0.09).toFixed(3) + ')';
    g.beginPath();
    g.ellipse(120 + Math.random()*272, 150 + Math.random()*240,
              18 + Math.random()*54, 12 + Math.random()*40, Math.random()*3, 0, 7);
    g.fill();
  }
  g.filter = 'none';

  /* Marks on the wall, inside the pool of light where they can just be
     made out. Four parallel scratches, low and to the left, deeper at
     the top where the pressure was and trailing off; and a hand that was
     dragged down the wall to the right of the machine. Nothing on it is
     bright enough to read as a picture of something: it reads as the
     wall. */
  g.save();
  g.lineCap = 'round';
  for (let k = 0; k < 4; k++){
    const x0 = 132 + k * 9, y0 = 268 + k * 3, len = 64 - k * 6;
    for (let j = 0; j < 14; j++){
      const t0 = j / 14, t1 = (j + 1) / 14;
      g.strokeStyle = 'rgba(0,0,0,' + (0.40 * (1 - t0 * 0.8)).toFixed(3) + ')';
      g.lineWidth = 2.2 * (1 - t0 * 0.6);
      g.beginPath();
      g.moveTo(x0 + t0 * 14, y0 + t0 * len);
      g.lineTo(x0 + t1 * 14, y0 + t1 * len);
      g.stroke();
    }
    g.strokeStyle = 'rgba(150,160,160,.07)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0 + 1.5, y0); g.lineTo(x0 + 15.5, y0 + len * 0.9); g.stroke();
  }
  g.filter = 'blur(1.4px)';
  const palmX = 372, palmY = 212;
  g.fillStyle = 'rgba(14,10,8,.30)';
  g.beginPath(); g.ellipse(palmX, palmY, 13, 16, 0.15, 0, 7); g.fill();
  for (let k = 0; k < 4; k++){
    const fx = palmX - 12 + k * 8, top = palmY - 30 + Math.abs(k - 1.5) * 4;
    g.beginPath(); g.ellipse(fx, top, 3, 9, 0, 0, 7); g.fill();
  }
  // the drag: the fingers kept contact on the way down
  for (let k = 0; k < 4; k++){
    const fx = palmX - 12 + k * 8;
    const drag = g.createLinearGradient(0, palmY, 0, palmY + 120);
    drag.addColorStop(0, 'rgba(14,10,8,.26)');
    drag.addColorStop(1, 'rgba(14,10,8,0)');
    g.fillStyle = drag;
    g.fillRect(fx - 2 + k * 0.6, palmY, 3.4, 120 - k * 14);
  }
  g.filter = 'none';
  g.restore();
  return tex(c);
}
const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 70),
  new THREE.MeshBasicMaterial({ map:sweep(), toneMapped:false, depthWrite:false })
);
backdrop.position.z = -13; backdrop.renderOrder = -1; scene.add(backdrop);

/* ── someone in the room ──────────────────────────────────────────
   Standing behind the machine, off its right shoulder: on a wide screen
   they are beside it, on a phone the head clears its top edge. Always
   darker than the wall and never lit, so it is a shape where the light
   should be rather than a figure you look at. haunt.js decides when; it
   only ever changes while the room light is out. */
function figureTexture(){
  const [c, g] = pad2d(256, 400);
  g.clearRect(0, 0, 256, 400);
  g.filter = 'blur(5px)';
  g.fillStyle = '#000';
  g.save(); g.translate(128, 74); g.rotate(-0.12);       // the head is not quite level
  g.beginPath(); g.ellipse(0, 0, 30, 40, 0, 0, 7); g.fill();
  g.restore();
  g.fillRect(112, 104, 30, 30);
  g.beginPath();
  g.moveTo(40, 150); g.quadraticCurveTo(128, 112, 216, 150);
  g.lineTo(206, 400); g.lineTo(50, 400); g.closePath(); g.fill();
  g.filter = 'none';
  // gone into the dark below the chest
  g.globalCompositeOperation = 'destination-out';
  const fade = g.createLinearGradient(0, 210, 0, 400);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = fade; g.fillRect(0, 0, 256, 400);
  return tex(c);
}
const figure = new THREE.Mesh(
  new THREE.PlaneGeometry(6.4, 10),
  new THREE.MeshBasicMaterial({ map:figureTexture(), transparent:true, opacity:0.66, depthWrite:false, toneMapped:false })
);
figure.position.set(7.4, 6.6, -12.4); figure.visible = false; scene.add(figure);

/* A shadow crossing the light, as if someone walked between the lamp and
   the wall. A tall soft band, left to right, under two seconds. */
function passingTexture(){
  const [c, g] = pad2d(128, 256);
  const grad = g.createRadialGradient(64, 128, 4, 64, 128, 64);
  grad.addColorStop(0, 'rgba(0,0,0,.9)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.scale(1, 2); g.fillStyle = grad; g.fillRect(0, 0, 128, 128); g.restore();
  return tex(c);
}
const passing = new THREE.Mesh(
  new THREE.PlaneGeometry(12, 60),
  new THREE.MeshBasicMaterial({ map:passingTexture(), transparent:true, opacity:0.55, depthWrite:false, toneMapped:false })
);
passing.position.set(-60, 6, -12.3); passing.visible = false; scene.add(passing);

/* The overhead light stutters rather than blinking: dark, back, half,
   nearly, dark, back, over about a quarter of a second. It is the wall
   and the key light that go, never the panel. */
const FLICKER = [[0, 0.32], [60, 1], [130, 0.5], [175, 0.86], [235, 0.28], [290, 1]];
const ROOM = { flickerT:0, passT:0, k:1 };
function stepRoom(dt){
  let awake = false;
  if (ROOM.flickerT){
    ROOM.flickerT += dt;
    const ms = ROOM.flickerT * 1000;
    let k = 1;
    for (const [at, v] of FLICKER) if (ms >= at) k = v;
    if (ms > 320){ ROOM.flickerT = 0; k = 1; }
    ROOM.k = k;
    backdrop.material.color.setScalar(k);
    applyLights();
    awake = true;
  }
  if (ROOM.passT){
    ROOM.passT += dt;
    const u = ROOM.passT / 1.8;
    if (u >= 1){ ROOM.passT = 0; passing.visible = false; }
    else {
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      passing.position.x = -34 + 68 * e;
      passing.visible = true;
    }
    awake = true;
  }
  return awake;
}

/* The shadow catcher rides just in front of the sweep so the darkening
   reads as contact rather than as a shape cut out of the wall. */
const shadowCatcher = new THREE.Mesh(
  new THREE.PlaneGeometry(140, 96),
  new THREE.ShadowMaterial({ opacity:0.26, depthWrite:false })
);
shadowCatcher.position.z = -6.4; shadowCatcher.receiveShadow = true; scene.add(shadowCatcher);

/* ── the device ───────────────────────────────────────────────── */
const device = new THREE.Group();
scene.add(device);

const rough = plasticRoughness();
/* Moulded ABS has a thin, slightly rough lacquer-like top layer. It is
   what puts a sheen on the rim of a curve at grazing angles, and it is
   the difference between "plastic" and "a solid colour with a specular
   highlight". */
const shellMat = new THREE.MeshPhysicalMaterial({
  color:SHELL, roughness:0.66, metalness:0.0, roughnessMap:rough,
  clearcoat:0.34, clearcoatRoughness:0.58
});
const darkMat  = new THREE.MeshPhysicalMaterial({
  color:DARK, roughness:0.52, metalness:0.0,
  clearcoat:0.44, clearcoatRoughness:0.38
});
const greyMat  = new THREE.MeshPhysicalMaterial({
  color:GREY, roughness:0.56, metalness:0.0,
  clearcoat:0.30, clearcoatRoughness:0.48
});
const btnMat   = new THREE.MeshPhysicalMaterial({
  color:BUTTON, roughness:0.38, metalness:0.0,
  clearcoat:0.62, clearcoatRoughness:0.22
});

const CORNERS = {tl:0.55, tr:0.55, br:2.50, bl:0.55};

const body = new THREE.Mesh(slab(roundedRect(W, H, CORNERS), D, BEV), shellMat);
body.castShadow = body.receiveShadow = true;
device.add(body);

// back half, a shade darker so the seam reads
const back = new THREE.Mesh(
  slab(roundedRect(W - 0.02, H - 0.02, CORNERS), D * 0.46, 0.14),
  new THREE.MeshPhysicalMaterial({ color:SHELL_DK, roughness:0.68, roughnessMap:rough,
                                   clearcoat:0.28, clearcoatRoughness:0.62 })
);
back.position.z = -D * 0.30; device.add(back);

// The flat front face sits past the bevel, not at D/2 — anything
// printed or mounted below this line disappears inside the shell.
const FRONT = D/2 + BEV;

const shellDecal = new THREE.Mesh(
  new THREE.PlaneGeometry(W, H),
  new THREE.MeshStandardMaterial({ map:shellPrint(), transparent:true, roughness:0.55, roughnessMap:rough, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2 })
);
shellDecal.position.z = FRONT + 0.004; device.add(shellDecal);

// bezel
const BZ_D = 0.26, BZ_BEV = 0.05;
const bezel = new THREE.Mesh(
  slab(roundedRect(BZ_W, BZ_H, {tl:0.34, tr:0.34, br:1.25, bl:0.34}), BZ_D, BZ_BEV),
  new THREE.MeshPhysicalMaterial({ color:BEZEL, roughness:0.34, metalness:0.04,
                                   clearcoat:0.70, clearcoatRoughness:0.18 })
);
bezel.position.set(0, BZ_Y, FRONT + 0.01);
bezel.castShadow = true; device.add(bezel);
const BZ_FRONT = FRONT + 0.01 + BZ_D/2 + BZ_BEV;

const bezelDecal = new THREE.Mesh(
  new THREE.PlaneGeometry(BZ_W, BZ_H),
  new THREE.MeshStandardMaterial({ map:bezelPrint(), transparent:true, roughness:0.4, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2 })
);
bezelDecal.position.set(0, BZ_Y, BZ_FRONT + 0.002); device.add(bezelDecal);

// the screen
const lcdTex = new THREE.CanvasTexture(IRZ.canvas);
lcdTex.colorSpace = THREE.SRGBColorSpace;
lcdTex.anisotropy = 8;
lcdTex.minFilter = THREE.LinearMipmapLinearFilter;

const screen = new THREE.Mesh(
  new THREE.PlaneGeometry(LC_W, LC_H),
  new THREE.MeshBasicMaterial({ map:lcdTex, toneMapped:false })
);
screen.position.set(0, LC_Y, BZ_FRONT + 0.004); device.add(screen);

/* The panel sits under the glass, not in it. A display that is flush
   with its own bezel reads as a sticker, so the edge of the active
   area falls into shadow the way the lip of a window does — heaviest
   along the top, where the bezel is between it and the key light. */
function recessTexture(){
  const [c, g] = pad2d(512, Math.round(512 * LC_H / LC_W));
  const w = c.width, h = c.height;
  g.clearRect(0, 0, w, h);
  g.filter = 'blur(9px)';
  g.strokeStyle = 'rgba(0,0,0,.80)'; g.lineWidth = 22;
  g.strokeRect(0, 0, w, h);
  g.filter = 'blur(2px)';
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 5;
  g.strokeRect(0, 0, w, h);
  g.filter = 'none';
  const lip = g.createLinearGradient(0, 0, 0, h * 0.12);
  lip.addColorStop(0, 'rgba(0,0,0,.38)');
  lip.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = lip; g.fillRect(0, 0, w, h * 0.12);
  return tex(c);
}
const recess = new THREE.Mesh(
  new THREE.PlaneGeometry(LC_W, LC_H),
  new THREE.MeshBasicMaterial({ map:recessTexture(), transparent:true, depthWrite:false, toneMapped:false })
);
recess.position.set(0, LC_Y, BZ_FRONT + 0.007); device.add(recess);

/* Backlight bleed. An edge-lit panel leaks at its own border, so the
   bezel immediately around the glass picks up the screen's colour and
   loses it within a few millimetres. It follows the palette and the
   backlight, so DREAD's failing light takes its halo down with it. */
function bleedTexture(){
  const [c, g] = pad2d(512, 512);
  const mx = 512 * 0.5 / (LC_W + 1.0), my = 512 * 0.5 / (LC_H + 1.0);
  g.clearRect(0, 0, 512, 512);
  g.filter = 'blur(16px)';
  g.fillStyle = '#fff';
  g.fillRect(mx, my, 512 - mx * 2, 512 - my * 2);
  g.filter = 'none';
  return tex(c);
}
const bleedMat = new THREE.MeshBasicMaterial({
  map:bleedTexture(), color:0x9BBC0F, transparent:true, opacity:0.0,
  blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false
});
const bleed = new THREE.Mesh(new THREE.PlaneGeometry(LC_W + 1.0, LC_H + 1.0), bleedMat);
bleed.position.set(0, LC_Y, BZ_FRONT + 0.003); device.add(bleed);

const glass = new THREE.Mesh(
  new THREE.PlaneGeometry(LC_W + 0.14, LC_H + 0.14),
  new THREE.MeshBasicMaterial({ map:glassSheen(), transparent:true, opacity:0.10, blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false })
);
glass.position.set(0, LC_Y, BZ_FRONT + 0.02); device.add(glass);

/* The cover glass reflects the room, and the room moves when the
   machine does. Additive, so it can only ever put light ON the panel —
   a reflection that darkened the text would be the one flourish here
   that cost the thing it is laid over. */
const reflection = new THREE.Mesh(
  new THREE.PlaneGeometry(LC_W + 0.14, LC_H + 0.14),
  new THREE.MeshStandardMaterial({ color:0x000000, metalness:1, roughness:0.48,
    transparent:true, opacity:0.26, blending:THREE.AdditiveBlending, depthWrite:false, envMapIntensity:1.0 })
);
reflection.position.set(0, LC_Y, BZ_FRONT + 0.022); device.add(reflection);

/* Something standing behind you, in the glass. It is only ever a
   darker shape in a reflection — over a shoulder, never facing — and
   it is gone before the eye can settle on it. The console decides
   when; nothing here runs unless it is asked to. */
function watcherTexture(){
  const [c, g] = pad2d(256, 256);
  g.clearRect(0, 0, 256, 256);
  g.filter = 'blur(13px)';
  g.fillStyle = '#000';
  g.beginPath(); g.ellipse(176, 104, 30, 40, 0.08, 0, 7); g.fill();
  g.fillRect(162, 136, 30, 30);
  g.beginPath(); g.ellipse(178, 262, 92, 84, 0, Math.PI, 0); g.fill();
  g.filter = 'none';
  return tex(c);
}
const watcher = { t:0, mesh:new THREE.Mesh(
  new THREE.PlaneGeometry(LC_W, LC_H),
  new THREE.MeshBasicMaterial({ map:watcherTexture(), transparent:true, opacity:0, depthWrite:false, toneMapped:false })
)};
watcher.mesh.position.set(0, LC_Y, BZ_FRONT + 0.012); watcher.mesh.visible = false; device.add(watcher.mesh);
function stepWatcher(dt){
  if (!watcher.t) return false;
  watcher.t += dt;
  const k = watcher.t / 1.7;
  if (k >= 1){ watcher.t = 0; watcher.mesh.visible = false; return true; }
  const a = Math.sin(Math.PI * k);
  watcher.mesh.material.opacity = 0.22 * a * a;
  watcher.mesh.visible = true;
  return true;
}

const screenLight = new THREE.PointLight(0x9BBC0F, 14, 11, 2);
screenLight.position.set(0, LC_Y, BZ_FRONT + 1.3); device.add(screenLight);

/* Layer 1 is the glass stack: the panel itself and the layers that sit
   directly on it. A frame where only the picture changed draws layer 1
   alone, into the screen's rectangle, over what is already there — see
   the render loop. The bleed is deliberately not on it: it is additive
   over the bezel, and drawn again without a clear it would brighten a
   little more every frame. It only changes when the palette or the
   backlight does, and those are full frames. */
const GLASS_LAYER = 1;
[screen, recess, glass, reflection, watcher.mesh].forEach(m => m.layers.enable(GLASS_LAYER));

// battery lamp
const lampMat = new THREE.MeshStandardMaterial({ color:0xE04038, emissive:0xE04038, emissiveIntensity:1.8, roughness:0.28 });
const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.07, 20), lampMat);
lamp.rotation.x = Math.PI/2; lamp.position.set(P.lamp[0], P.lamp[1], FRONT + 0.03); device.add(lamp);

/* ── controls ─────────────────────────────────────────────────── */
const hitboxes = [];

function hit(x, y, w, h, btn, z, d){
  // Drawn but written to nothing: an invisible mesh can be skipped by
  // the raycaster, and these have to stay clickable.
  //
  // z and d default to a slab standing proud of the front face, which is
  // right for everything ON that face and wrong for anything that is
  // not. A box 0.3 in front of the shell is nearer the camera than the
  // shell is, so under perspective it covers more of the frame than the
  // control does — which is how the power switch, up on the top edge,
  // ended up catching clicks aimed at the top of the screen.
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d === undefined ? 1.6 : d),
    new THREE.MeshBasicMaterial({ colorWrite:false, depthWrite:false, transparent:true, opacity:0 })
  );
  box.position.set(x, y, z === undefined ? FRONT + 0.3 : z);
  box.userData = { btn };
  device.add(box); hitboxes.push(box);
}

/* ── how a control moves ──────────────────────────────────────────
   Every control is a damped spring toward wherever the hand is putting
   it. Held, it stays down for as long as it is held; let go, it comes
   back up a little past rest and settles. That is the difference
   between a button and a picture of a button playing an animation.

   The keyboard drives the same springs as the pointer: the console
   reports every press and release from any source, and this module
   only ever listens. So Z on a keyboard pushes the A cap in, which it
   never used to.

   Springs go to sleep once they arrive, so an idle machine is still a
   still image and still zero draw calls. Under reduced motion they are
   critically damped: the cap still goes down and comes back, it just
   never bounces. */
const springs = [];
function spring(k, c){
  const s = { x:0, v:0, to:0, k, c: reduced ? 2 * Math.sqrt(k) : c };
  springs.push(s); return s;
}
function stepSprings(dt){
  let awake = false;
  for (const s of springs){
    if (s.x === s.to && s.v === 0) continue;
    let t = dt;
    while (t > 0){
      const h = Math.min(1 / 240, t); t -= h;
      s.v += (s.k * (s.to - s.x) - s.c * s.v) * h;
      s.x += s.v * h;
    }
    if (Math.abs(s.to - s.x) < 1e-4 && Math.abs(s.v) < 2e-3){ s.x = s.to; s.v = 0; }
    else awake = true;
  }
  return awake;
}

const PUSH = {};
/* Seen from the front, a cap travelling straight away from the camera
   barely moves, so a press also takes a few per cent off the cap's face
   — the rim of the dish around it shows, which is what a pressed button
   actually looks like from above. cyl marks the caps that are cylinders
   stood on end, whose face is their local x and z. */
function pushable(btn, mesh, depth, cyl){
  PUSH[btn] = { mesh, restZ:mesh.position.z, depth, cyl:!!cyl, s:spring(1500, 30) };
}

// D-pad
const DP = new THREE.Group();
DP.position.set(P.dpad[0], P.dpad[1], FRONT + 0.03);
const cross = new THREE.Mesh(slab(crossShape(1.20, 3.30), 0.32, 0.07), darkMat);
cross.castShadow = true; DP.add(cross);
{
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.24, 20), new THREE.MeshStandardMaterial({ color:0x1D1D21, roughness:0.65 }));
  dot.position.z = 0.236; DP.add(dot);
  /* The pad is near-black, so a dark cut would read as nothing at all.
     These are moulded proud rather than sunk: light core, shadow under.
     It is the one place on the machine where that is the honest choice,
     and it is also the only one where you cannot guess the control from
     its shape alone. */
  const arrow = (dir, x, y) => {
    const a = engravedArrow(dir, 0.62, {
      core:'rgba(226,229,214,.44)', lit:'rgba(255,255,255,.34)',
      dark:'rgba(0,0,0,.62)', bump:-0.5
    });
    a.position.set(x, y, 0.238); DP.add(a);
  };
  arrow('u', 0, 1.06); arrow('d', 0, -1.06);
  arrow('l', -1.06, 0); arrow('r', 1.06, 0);
}
device.add(DP);
/* A rocker, not four switches: it pivots on the centre, so pressing
   an arm tips that arm in and lifts the opposite one, and holding a
   diagonal tips it into the corner. */
const DPAD = { restZ:DP.position.z, rx:spring(1100, 26), ry:spring(1100, 26), z:spring(1400, 30), held:{} };
function dpadTargets(){
  const h = DPAD.held;
  DPAD.rx.to = 0.10 * ((h.down ? 1 : 0) - (h.up ? 1 : 0));
  DPAD.ry.to = 0.10 * ((h.right ? 1 : 0) - (h.left ? 1 : 0));
  DPAD.z.to  = (h.up || h.down || h.left || h.right) ? -0.035 : 0;
}
hit(P.dpad[0] - 1.15, P.dpad[1], 1.25, 1.25, 'left');
hit(P.dpad[0] + 1.15, P.dpad[1], 1.25, 1.25, 'right');
hit(P.dpad[0], P.dpad[1] + 1.15, 1.25, 1.25, 'up');
hit(P.dpad[0], P.dpad[1] - 1.15, 1.25, 1.25, 'down');

// A and B
function roundButton(pos, btn, name){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.69, 0.34, 36), btnMat);
  m.rotation.x = Math.PI/2; m.position.set(pos[0], pos[1], FRONT + 0.13);
  m.castShadow = true; device.add(m);
  const lab = engravedText(name, 0.80, 0.80, { fill:0.74, lit:'rgba(255,225,232,.50)' });
  lab.rotation.x = -Math.PI/2; lab.position.y = 0.172;   // the cap, in cylinder space
  m.add(lab);
  hit(pos[0], pos[1], 1.55, 1.55, btn);
  pushable(btn, m, 0.11, true);
  return m;
}
roundButton(P.b, 'b', 'B');
roundButton(P.a, 'a', 'A');

// start and select
function pill(pos, btn, name){
  const m = new THREE.Mesh(slab(roundedRect(1.40, 0.44, {tl:0.22, tr:0.22, br:0.22, bl:0.22}), 0.20, 0.05), greyMat);
  m.position.set(pos[0], pos[1], FRONT + 0.07); m.rotation.z = -25 * Math.PI/180;
  m.castShadow = true; device.add(m);
  /* Six characters across 1.4 units is tight, so the cut is shallower
     and tracked out — a deep chisel at this size fills its own counters
     and the word closes up into a smudge. */
  const lab = engravedText(name, 1.16, 0.29, {
    fill:0.72, tracking:0.05, bump:0.4,
    core:'rgba(14,14,17,.62)', lit:'rgba(255,255,255,.58)'
  });
  lab.position.z = 0.156; m.add(lab);
  /* The pill is a thumb-width tall at most, and on a phone that was a
     target you had to aim for. The box is taller than the cap. */
  hit(pos[0], pos[1], 1.75, 1.15, btn);
  pushable(btn, m, 0.07);
  return m;
}
pill(P.select, 'select', 'SELECT');
pill(P.start,  'start',  'START');

/* Power, on the front, where a hand already is.
   The slider on the top edge stays — it is the only thing that shows
   which way the machine is set, and watching it travel is half of what
   makes the machine feel like an object. But it is on a face you cannot
   see from in front, which made the only way to switch this thing off
   an invisible box floating over the top of the screen. So the control
   comes down here with the others and the slider goes back to being
   what it always really was: the indicator. */
{
  const pw = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 0.42, 0.24, 28), greyMat);
  pw.rotation.x = Math.PI/2;
  pw.position.set(P.power[0], P.power[1], FRONT + 0.09);
  pw.castShadow = true;
  device.add(pw);

  /* The IEC mark rather than the word: it fits on a 0.8-unit cap at a
     size you can actually read, and it is the one symbol on the whole
     object that needs no caption. */
  const glyph = engraved(function(ctx, w, h){
    const cx = w/2, cy = h/2, r = Math.min(w, h) * 0.27;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = Math.min(w, h) * 0.10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.10, r, -Math.PI/2 + 0.62, -Math.PI/2 - 0.62 + Math.PI*2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 1.20); ctx.lineTo(cx, cy + r * 0.02);
    ctx.stroke();
  }, 0.52, 0.52, { bump:0.5 });
  glyph.rotation.x = -Math.PI/2;
  glyph.position.y = 0.122;
  pw.add(glyph);

  hit(P.power[0], P.power[1], 1.30, 1.30, 'power');
  pushable('power', pw, 0.06, true);
}

// power switch, on the top edge. It slides, and it means it.
const SW_OFF = -3.24, SW_ON = -2.56;
const powerSwitch = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.5, 0.62), greyMat);
{
  const guard = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.34, 0.52), new THREE.MeshStandardMaterial({ color:SHELL_DK, roughness:0.6 }));
  guard.position.set(-2.62, H/2 + 0.08, 0.35); device.add(guard);
  powerSwitch.position.set(SW_ON, H/2 + 0.14, 0.35);
  powerSwitch.castShadow = true; device.add(powerSwitch);
  /* Hugging the switch, at the switch's own depth. It still works —
     it is the thing that shows you which way the machine is set — but
     it no longer reaches out over the screen. */
  hit(-2.90, H/2 + 0.18, 1.45, 0.60, 'power', 0.35, 0.85);
}

/* Side dials: contrast on the left, volume on the right. They turn by
   detents that match what they set — the contrast wheel advances one
   notch per palette, the volume wheel sits at the level it is at and
   rolls back to its stop when it wraps — so the dial is a readout, not
   an ornament that spins whenever it is touched. */
const DIAL = {};
function dial(x, y, btn){
  const g = new THREE.Group();
  g.position.set(x, y, -0.12); g.rotation.z = Math.PI/2;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.78, 28), greyMat);
  m.castShadow = true;
  // a knurled rib, so a spin is visible from the front
  const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.04, 6, 24), greyMat);
  ridge.rotation.x = Math.PI/2; ridge.position.y = 0.20; m.add(ridge);
  g.add(m); device.add(g);
  hit(x, y, 1.45, 1.7, btn);
  DIAL[btn] = { mesh:m, s:spring(320, 16) };
  return m;
}
dial(-W/2 - 0.06, 3.6, 'contrast');
dial( W/2 + 0.06, 2.4, 'volume');
const DETENT = 0.9;

/* ── light where a hand should go ─────────────────────────────────
   A ring of backlight around a control, out of the palette's own
   colour warmed toward white. Three jobs, one mesh: a hint (a slow
   breath, only until the control has been used), keyboard focus (on,
   steady, for as long as a real <button> behind the render has focus —
   otherwise tabbing through the machine had no visible focus at all)
   and a flash on press. */
function haloTexture(){
  const [c, g] = pad2d(256, 256);
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0.00, 'rgba(255,255,255,0)');
  grad.addColorStop(0.52, 'rgba(255,255,255,0)');
  grad.addColorStop(0.68, 'rgba(255,255,255,.90)');
  grad.addColorStop(0.82, 'rgba(255,255,255,.30)');
  grad.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  return tex(c);
}
const haloMap = haloTexture();
const HALO = {};
function halo(key, x, y, r, stretch, rot){
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(r * 2 * (stretch || 1), r * 2),
    new THREE.MeshBasicMaterial({ map:haloMap, color:0xFFF1D0, transparent:true, opacity:0,
      blending:THREE.AdditiveBlending, depthWrite:false, toneMapped:false })
  );
  m.position.set(x, y, FRONT + 0.012); m.rotation.z = rot || 0; m.visible = false;
  device.add(m);
  HALO[key] = { m, flash:0, focus:false, hint:false, held:false, lit:false };
}
halo('dpad',   P.dpad[0],   P.dpad[1],   2.30);
halo('a',      P.a[0],      P.a[1],      1.28);
halo('b',      P.b[0],      P.b[1],      1.28);
halo('select', P.select[0], P.select[1], 0.62, 1.85, -25 * Math.PI/180);
halo('start',  P.start[0],  P.start[1],  0.62, 1.85, -25 * Math.PI/180);
halo('power',  P.power[0],  P.power[1],  0.80);
const haloKey = b => /^(up|down|left|right)$/.test(b) ? 'dpad' : b;
const haloTint = new THREE.Color(), WARM = new THREE.Color(0xFFF1D0);

let hintClock = 0;
function stepHalos(dt){
  let awake = false;
  hintClock += dt;
  for (const k in HALO){
    const h = HALO[k];
    if (h.flash > 0){ h.flash = Math.max(0, h.flash - dt * 3.4); awake = true; }
    let lv = h.flash * 0.50;
    if (h.focus) lv = Math.max(lv, 0.72);
    if (h.held) lv = Math.max(lv, 0.36);
    if (h.hint){
      lv = Math.max(lv, reduced ? 0.50 : 0.26 + 0.34 * (0.5 + 0.5 * Math.sin(hintClock * 3.6)));
      if (!reduced) awake = true;
    }
    const lit = lv > 0.004;
    if (lit !== h.lit){ h.lit = lit; h.m.visible = lit; awake = true; }
    h.m.material.opacity = lv;
  }
  return awake;
}

/* ── input ────────────────────────────────────────────────────── */
const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
let hovered = null;

function pickAt(cx, cy){
  const r = canvas.getBoundingClientRect();
  ptr.x = ((cx - r.left) / r.width) * 2 - 1;
  ptr.y = -((cy - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObjects(hitboxes, false);
  return hits.length ? hits[0].object : null;
}

/* Everything goes through the console's one input function, which is
   what lets a keyboard, the flat console and this render all animate
   the same caps. The fallback is only for a console old enough not to
   have it. */
const input = (btn, down) => {
  if (IRZ.input) IRZ.input(btn, down);
  else { if (down) IRZ.press(btn); if (IRZ.hold) IRZ.hold(btn, down); }
};
const listen = (type, fn) => { if (IRZ.on) IRZ.on(type, fn); };

/* One entry per finger. A lander wants thrust and a turn at the same
   time, and a single "held" slot meant the second thumb cancelled the
   first. */
const DIRS = /^(up|down|left|right)$/;
const fingers = new Map();
function grab(id, btn){
  const f = { btn, timer:null };
  fingers.set(id, f);
  input(btn, true);
  if (!DIRS.test(btn)) return;
  f.timer = setTimeout(function rep(){
    if (fingers.get(id) !== f) return;
    input(btn, true);                      // a repeat: the console knows it is still down
    f.timer = setTimeout(rep, 90);
  }, 380);
}
function letGo(id){
  const f = fingers.get(id); if (!f) return;
  clearTimeout(f.timer); fingers.delete(id);
  input(f.btn, false);
}

canvas.addEventListener('pointerdown', e => {
  if (introCtl && introCtl.pointer(e)){ e.preventDefault(); return; }
  const obj = pickAt(e.clientX, e.clientY);
  if (!obj) return;
  e.preventDefault();
  try { canvas.setPointerCapture(e.pointerId); } catch(err){}
  grab(e.pointerId, obj.userData.btn);
});
canvas.addEventListener('pointerup', e => letGo(e.pointerId));
canvas.addEventListener('pointercancel', e => letGo(e.pointerId));
canvas.addEventListener('lostpointercapture', e => letGo(e.pointerId));

let px = 0, py = 0, tx = 0, ty = 0;
canvas.addEventListener('pointermove', e => {
  const r = canvas.getBoundingClientRect();
  tx = ((e.clientX - r.left) / r.width) * 2 - 1;
  ty = ((e.clientY - r.top) / r.height) * 2 - 1;
  /* A thumb rolls across a D-pad rather than lifting between arms. */
  const f = fingers.get(e.pointerId);
  if (f && DIRS.test(f.btn)){
    const obj = pickAt(e.clientX, e.clientY), b = obj && obj.userData.btn;
    if (b && b !== f.btn && DIRS.test(b)){ letGo(e.pointerId); grab(e.pointerId, b); }
  }
  if (e.pointerType === 'mouse'){
    const obj = pickAt(e.clientX, e.clientY);
    if (obj !== hovered){ hovered = obj; canvas.style.cursor = obj ? 'pointer' : 'default'; }
  }
});
canvas.addEventListener('pointerleave', () => { if (!fingers.size){ tx = ty = 0; } });

/* What the console reports, from any source. */
listen('hold', e => {
  const b = e.btn;
  if (DIRS.test(b)){ DPAD.held[b] = e.down; dpadTargets(); }
  else if (PUSH[b]) PUSH[b].s.to = e.down ? -PUSH[b].depth : 0;
  const hk = HALO[haloKey(b)];
  if (hk){
    if (e.down) hk.flash = 1;
    const dp = DPAD.held;
    hk.held = DIRS.test(b) ? !!(dp.up || dp.down || dp.left || dp.right) : e.down;
  }
  invalidate();
});
listen('palette', e => { DIAL.contrast.s.to += DETENT * (e.step || 1); invalidate(); });
listen('volume',  e => { DIAL.volume.s.to = DETENT * e.level; invalidate(); });
listen('hint', e => {
  for (const k in HALO) HALO[k].hint = false;
  (e.btns || []).forEach(b => { const h = HALO[haloKey(b)]; if (h) h.hint = true; });
  invalidate();
});
listen('focus', e => {
  for (const k in HALO) HALO[k].focus = false;
  const h = e.btn && HALO[haloKey(e.btn)];
  if (h) h.focus = true;
  invalidate();
});
listen('anomaly', e => {
  if (introCtl && introCtl.ownsCamera()) return;           // the room is not here yet
  if (e.kind === 'watcher' && !watcher.t){ watcher.t = 0.0001; invalidate(); }
  if (reduced) return;
  if (e.kind === 'roomflicker' && !ROOM.flickerT){ ROOM.flickerT = 0.0001; invalidate(); }
  if (e.kind === 'figure-on'){ figure.visible = true; invalidate(); }
  if (e.kind === 'figure-off'){ figure.visible = false; invalidate(); }
  if (e.kind === 'passing' && !ROOM.passT){ ROOM.passT = 0.0001; invalidate(); }
});

let lastNow = 0, lastGlowFrame = 0;
function applyControls(){
  for (const b in PUSH){
    const p = PUSH[b], k = Math.max(0, Math.min(1.2, -p.s.x / p.depth)), sc = 1 - 0.045 * k;
    p.mesh.position.z = p.restZ + p.s.x;
    if (p.cyl) p.mesh.scale.set(sc, 1, sc); else p.mesh.scale.set(sc, sc, 1);
  }
  DP.rotation.x = DPAD.rx.x; DP.rotation.y = DPAD.ry.x; DP.position.z = DPAD.restZ + DPAD.z.x;
  DIAL.contrast.mesh.rotation.y = DIAL.contrast.s.x;
  DIAL.volume.mesh.rotation.y = DIAL.volume.s.x;
}

/* ── fit and run ──────────────────────────────────────────────── */
let introCtl = null, homeZ = 40;
function fit(){
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  camera.aspect = w / h;
  // The face is nearer the camera than the body centre, so it draws
  // bigger than the body does: frame against the front plane.
  /* Room for the corner chrome and no more. This is the whole site,
     so the machine should fill the frame rather than sit in it. */
  /* The switch and the dials stand proud of the shell, so the margin
     has to clear more than H. */
  const margin = h < 620 ? 1.3 : 1.75;
  const vFov = camera.fov * Math.PI / 180;
  const need = FRONT + Math.max(
    ((H + margin) / 2) / Math.tan(vFov / 2),
    ((W + 1.8) / 2) / Math.tan(vFov / 2) / camera.aspect
  );
  homeZ = need;
  if (!(introCtl && introCtl.ownsCamera())) camera.position.z = need;
  camera.updateProjectionMatrix();

  // Tell the screen how many real pixels it has to work with, so the
  // dot matrix can pick a grid a person can actually read.
  const worldH = 2 * Math.tan(vFov / 2) * (need - BZ_FRONT);
  IRZ.fitGrid(LC_H / worldH * h);
}
addEventListener('resize', fit);
fit();

let lastRev = -1, started = false;
let lastGlow = null, lastDip = -1, lastOn = null, fullRender = true;

/* Every light that answers to something — the backlight dipping, the
   power, the room's own flicker, and the prologue bringing the room up
   with the panel — is set here, so no two places disagree about it.
   studioK scales the lights that belong to the room the machine sits in;
   the rim lights and the sky are the prologue's to move and restore. */
let studioK = 1, envK = 1, bleedIdle = 0;
function applyLights(){
  const d = lastDip > 0 ? lastDip : 0, on = IRZ.powered();
  key.intensity    = 1.38 * (1 - d * 0.62) * (0.55 + 0.45 * ROOM.k) * studioK;
  shaper.intensity = 175  * (1 - d * 0.55) * studioK;
  hands.intensity  = 62   * (1 - d * 0.70) * studioK;
  fill.intensity   = 70   * studioK;
  wrong.intensity  = 13   * (1 + d * 1.30) * studioK;
  screenLight.intensity = on ? 8 * (1 - d * 0.80) : 0;
  bleedMat.opacity = on ? 0.22 * (1 - d * 0.85) : bleedIdle;
  lampMat.emissiveIntensity = on ? 1.6 : 0.05;
  lampMat.color.set(on ? 0xE04038 : 0x6A3230);
  scene.environmentIntensity = 0.42 * envK;
}
let t0 = performance.now();

/* ── Render on demand ────────────────────────────────────────────
   A handheld sitting still is a still image. Drawing it sixty times a
   second regardless costs a laptop its battery and a phone its
   thermal headroom for no visible gain, so a frame is only drawn when
   something has actually changed. Everything that can change calls
   invalidate(). */
let needsRender = true;
function invalidate(){ needsRender = true; fullRender = true; }

/* ── only the glass, when only the glass changed ──────────────────
   A game on the panel changes one rectangle of this frame sixty times a
   second, and the whole lit scene was being redrawn for it: measured,
   stubbing the render out took a game from 42 to 60 frames a second.
   The drawing buffer is kept between frames, so when the only thing that
   changed is the picture on the panel, the render is scissored to the
   screen's own footprint — the panel, the glass over it and the few
   millimetres of bezel its backlight bleeds onto. Everything else on
   the frame is already correct from last time.

   Anything that changes the room is still a full frame: the machine
   moving, a glow on a control, the palette changing the light the panel
   throws, the backlight dipping, the power going. */
const rectV = new THREE.Vector3();
const rectSize = new THREE.Vector2();
function screenRect(){
  const size = renderer.getSize(rectSize);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  /* Inside the panel's own edge, never past it: nothing is cleared in
     these frames, so the rectangle must be covered completely by the
     opaque screen plane or the previous frame would show at its rim. */
  const hw = LC_W / 2, hh = LC_H / 2;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]){
    rectV.set(sx * hw, sy * hh, 0);
    screen.localToWorld(rectV).project(camera);
    const px = (rectV.x + 1) / 2 * size.x, py = (1 - rectV.y) / 2 * size.y;
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
  }
  x0 = Math.max(0, Math.ceil(x0) + 1); y0 = Math.max(0, Math.ceil(y0) + 1);
  x1 = Math.min(size.x, Math.floor(x1) - 1); y1 = Math.min(size.y, Math.floor(y1) - 1);
  return { x:x0, y:size.y - y1, w:x1 - x0, h:y1 - y0 };
}
addEventListener('resize', invalidate);
document.addEventListener('visibilitychange', () => { if (!document.hidden) invalidate(); });

function frame(now){
  requestAnimationFrame(frame);
  if (document.hidden) return;

  // screen contents
  const rev = IRZ.rev();
  if (rev !== lastRev){
    lastRev = rev;
    lcdTex.needsUpdate = true;
    needsRender = true;
    const on = IRZ.powered();
    const glowNow = IRZ.glow(), dipNow = IRZ.dip ? IRZ.dip() : 0;
    if (glowNow !== lastGlow || dipNow !== lastDip || on !== lastOn){
      fullRender = true; lastGlow = glowNow; lastDip = dipNow; lastOn = on;
    }
    screenLight.color.set(IRZ.glow());
    bleedMat.color.set(IRZ.glow());
    haloTint.set(IRZ.glow()).lerp(WARM, 0.55);
    for (const k in HALO) HALO[k].m.material.color.copy(haloTint);
    /* When the backlight goes, the room goes with it. A panel that
       flickers on its own is a broken panel; a panel that takes the key
       light and the near source down with it is a building with
       something wrong in it, which is a different feeling entirely. The
       sickly green is the one thing that gets brighter. */
    lastDip = dipNow;
    applyLights();
  }

  const dt = lastNow ? Math.min(1 / 30, Math.max(0, (now - lastNow) / 1000)) : 0;
  lastNow = now;

  /* The prologue, while there is one. It poses the machine and moves the
     camera until the machine is in the visitor's hands; after that it only
     brings the lights up, and then it is gone and this loop is exactly
     what it was before. */
  let introAwake = false, introCam = false;
  if (introCtl){
    introAwake = introCtl.update(dt);
    introCam = introCtl.ownsCamera();
    if (introCtl.done()){
      introCtl = null; introCam = false;
      t0 = now - 5000;                      // the settle happened in the forest
      renderer.shadowMap.needsUpdate = true; needsRender = true; fullRender = true;
    }
  }

  // the one piece of motion nobody asked for: settling into place
  const t = (now - t0) / 1000;
  let introRunning = false, parallaxMoving = false;
  if (!introCam){
    let intro = reduced ? 1 : Math.min(1, t / 1.3);
    introRunning = intro < 1;
    intro = 1 - Math.pow(1 - intro, 4);

    /* Exponential easing never actually arrives, so snap it once it is
       under a pixel of travel — otherwise the scene is "still moving"
       forever and never stops redrawing. */
    px += (tx - px) * 0.06;
    py += (ty - py) * 0.06;
    if (Math.abs(tx - px) < 0.0004) px = tx;
    if (Math.abs(ty - py) < 0.0004) py = ty;
    parallaxMoving = px !== tx || py !== ty;
    device.rotation.y = (-0.30 * (1 - intro)) + px * 0.20 * intro;
    device.rotation.x = (0.16 * (1 - intro)) + py * 0.13 * intro;
    device.position.z = -7 * (1 - intro);
    device.position.y = 0.5 * (1 - intro);
  }

  // the controls, wherever the hands have put them
  const ctrlAwake = stepSprings(dt);
  applyControls();
  const glowAwake = stepHalos(dt);
  const ghostAwake = stepWatcher(dt);
  const roomAwake = stepRoom(dt);

  // the switch holds wherever it was left
  const swTarget = IRZ.powered() ? SW_ON : SW_OFF;
  const swGap = swTarget - powerSwitch.position.x;
  powerSwitch.position.x += swGap * 0.35;
  if (Math.abs(swGap) < 0.0008) powerSwitch.position.x = swTarget;
  const switchMoving = powerSwitch.position.x !== swTarget;

  const moving = introRunning || parallaxMoving || switchMoving || ctrlAwake;
  /* A hint that breathes is a slow sine, and on its own it does not need
     sixty full frames a second to look smooth: about fifteen will do.
     Anything else that moves still gets every frame. */
  let glowDue = glowAwake;
  if (glowAwake && !moving && !roomAwake && !introAwake){
    if (now - lastGlowFrame < 66) glowDue = false; else lastGlowFrame = now;
  }
  if (moving || glowDue || roomAwake || introAwake){ needsRender = true; fullRender = true; }
  else if (ghostAwake) needsRender = true;

  if (needsRender){
    needsRender = false;
    /* Re-shadow only when the geometry under the light actually moved. */
    if (moving && !introCam) renderer.shadowMap.needsUpdate = true;
    if (fullRender){
      fullRender = false;
      renderer.render(scene, camera);
    } else {
      const r = screenRect();
      renderer.setScissor(r.x, r.y, r.w, r.h);
      renderer.setScissorTest(true);
      renderer.autoClear = false;
      camera.layers.set(GLASS_LAYER);
      renderer.render(scene, camera);
      camera.layers.set(0);
      renderer.autoClear = true;
      renderer.setScissorTest(false);
    }
  }

  if (!started && t > 0.15){ started = true; IRZ.ready(); }
}
/* The handles a profiler, and the machine's own diagnostics screen, need to
   reach. Reading them costs nothing; nothing here writes through them. */
window.__irzDevice = { renderer, lcdTex, scene, camera, invalidate };

/* Shader programs are the slowest thing this page does. Profiled from
   navigation to the machine appearing, 3.4 seconds of main thread went to
   one synchronous program link inside Three.js on ANGLE, against well
   under a tenth of a second for every texture painted here. compileAsync
   hands the programs to the driver's parallel compile where the extension
   exists, so they build side by side instead of one after another. Where
   it does not exist it is the same compile as before. The intro clock
   starts when the first frame is actually drawn, so the settle still
   plays instead of having finished behind WARMING UP. */
/* ── the prologue ─────────────────────────────────────────────────
   Built here, before the programs are compiled, so the forest compiles
   behind WARMING UP alongside the machine instead of after it. */
if (INTRO){
  try {
    introCtl = INTRO.createIntro({
      THREE, renderer, scene, camera, device, IRZ, reduced,
      lights:{ key, rim, rim2, hemi },
      room:[ backdrop, shadowCatcher, figure, passing ],
      dims:{ W, H, D, LC_W, LC_H, LC_Y, BZ_FRONT },
      homeZ:() => homeZ,
      studio:(k, env) => { studioK = k; envK = env; applyLights(); },
      bleedIdle:(v) => { bleedIdle = v; applyLights(); },
      input:(btn, down) => input(btn, down),
      invalidate
    });
    applyLights();
  } catch(err){ introCtl = null; }
}
const begin = () => {
  t0 = performance.now();
  if (introCtl){ try { introCtl.start(); } catch(err){ introCtl = null; } }
  requestAnimationFrame(frame);
};
if (renderer.compileAsync) renderer.compileAsync(scene, camera).then(begin, begin);
else begin();
}
