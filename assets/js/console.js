/* The machine itself: the dot-matrix screen engine, the state it
   draws from, sound, navigation, input, deep links and the
   cartridge slot. Publishes window.IRZ for the 3D shell to drive.
   Part of IudexRyze. See README.md for how the pieces fit. */

/* A static import, deliberately. Making this a dynamic one to carry the
   cache-busting query across gave console.js a top-level await, and a
   module that awaits does not finish evaluating before the next script
   in the list starts — so device.js read window.IRZ before this file
   had published it and silently fell back to the flat console every
   time. The version reaches content.js through an import map instead;
   see the loader in index.html. */
import { SECTIONS, BASE } from './content.js';
(function(){
'use strict';


/* ── what is on the cartridge ─────────────────────────────────── */


/* ── screen palettes, cycled by the contrast dial ─────────────── */
var PALETTES = [
  /* The panel is not well. Sickly olive, the backlight uneven, the text
     pale enough to read but never bright. DMG is still in the list —
     the contrast dial gets you out of here. */
  { name:'DREAD',    a:'#2A2E1B', b:'#3A3F26', c:'#949F52', d:'#C6D084', glow:'#6F7C39' },
  { name:'DMG',      a:'#9BBC0F', b:'#8BAC0F', c:'#1D4A1A', d:'#0F380F', glow:'#9BBC0F' },
  { name:'POCKET',   a:'#C7CBB4', b:'#AAAF98', c:'#3E4133', d:'#22241C', glow:'#C7CBB4' },
  { name:'AMBER',    a:'#22160A', b:'#4A2E0C', c:'#D9922B', d:'#FFC24B', glow:'#FFB43C' },
  { name:'VANGUARD', a:'#0E1108', b:'#1C2A10', c:'#6FA82C', d:'#8FC93A', glow:'#8FC93A' },
  /* A blue backlit STN panel, the kind a pager or a calculator had: deep
     navy glass and ice-white segments. edge is the colour its corners
     fall away into — the others go to a dark olive, which would muddy
     this one green. */
  { name:'COBALT',   a:'#0A1230', b:'#16295A', c:'#4A86C8', d:'#B8DEFF', glow:'#4F9BFF', edge:'4,9,24' }
];

/* ── the screen ───────────────────────────────────────────────── */

var cv   = document.getElementById('lcd');
var ctx  = cv.getContext('2d');
var CW_PX = cv.width, CH_PX = cv.height;

var G = { cols:60, rows:27, cw:16, ch:32, fs:26 };
var pal = PALETTES[0];

/* The panel font, in one place. setGrid measures the glyph advance with
   it and every draw call sets it, so the two disagreeing would drift the
   whole grid without ever looking like an error. Weight is part of that:
   600 is what carries through a green LCD, and weight changes the advance,
   so it has to be in the measurement too. Monospace is not a style choice
   here — the character grid depends on it. */
var SCREEN_FONT = '600 SIZEpx "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace';
function screenFont(px){ return SCREEN_FONT.replace('SIZE', px); }

function setGrid(cols, rows){
  if (G.cols === cols && G.rows === rows) return;
  G.cols = cols; G.rows = rows;
  G.cw = CW_PX / cols; G.ch = CH_PX / rows;
  // Match the glyph advance to the cell so whole strings sit on the grid,
  // whatever font actually resolved.
  var fs = G.cw / 0.6;
  ctx.font = screenFont(fs);
  var adv = ctx.measureText('MMMMMMMMMM').width / 10;
  if (adv > 0) fs = fs * (G.cw / adv);
  G.fs = fs;
  dirty();
}

/* The grid is chosen from how tall the panel actually is on screen,
   not from the window: a row under about 13 real pixels stops being
   readable however big the browser is. */
var screenPx = 0;
function pickGrid(){
  var px = screenPx || Math.min(window.innerHeight, window.innerWidth * 1.35) * 0.36;
  var rows = Math.max(12, Math.min(24, Math.round(px / 14)));
  setGrid(Math.round(rows * 2.22), rows);
}

function shade(i){ return [pal.a, pal.b, pal.c, pal.d][i]; }

function fillCells(col, row, w, h, s){
  ctx.fillStyle = shade(s);
  ctx.fillRect(Math.round(col*G.cw), Math.round(row*G.ch), Math.ceil(w*G.cw), Math.ceil(h*G.ch));
}

function put(col, row, str, s){
  if (!str) return;
  ctx.fillStyle = shade(s === undefined ? 3 : s);
  ctx.font = screenFont(G.fs);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, col*G.cw, row*G.ch + G.ch*0.74);
}

/* Arrows and cursors are drawn, never typed: a missing glyph would
   throw the whole row off the grid. */
function tri(col, row, dir, s){
  var x = col*G.cw, y = row*G.ch, w = G.cw, h = G.ch;
  var cx = x + w/2, cy = y + h/2, r = Math.min(w, h) * 0.30;
  ctx.fillStyle = shade(s === undefined ? 3 : s);
  ctx.beginPath();
  if (dir === 'r'){ ctx.moveTo(cx-r*0.7, cy-r); ctx.lineTo(cx+r*0.9, cy); ctx.lineTo(cx-r*0.7, cy+r); }
  if (dir === 'l'){ ctx.moveTo(cx+r*0.7, cy-r); ctx.lineTo(cx-r*0.9, cy); ctx.lineTo(cx+r*0.7, cy+r); }
  if (dir === 'u'){ ctx.moveTo(cx-r, cy+r*0.7); ctx.lineTo(cx, cy-r*0.9); ctx.lineTo(cx+r, cy+r*0.7); }
  if (dir === 'd'){ ctx.moveTo(cx-r, cy-r*0.7); ctx.lineTo(cx, cy+r*0.9); ctx.lineTo(cx+r, cy-r*0.7); }
  ctx.closePath(); ctx.fill();
}

function rule(row, s){
  ctx.fillStyle = shade(s === undefined ? 2 : s);
  ctx.fillRect(Math.round(G.cw), Math.round(row*G.ch + G.ch*0.5), Math.round((G.cols-2)*G.cw), Math.max(1, Math.round(G.ch*0.06)));
}

function wrap(text, w){
  var words = String(text).split(/\s+/), out = [], line = '';
  for (var i=0;i<words.length;i++){
    var word = words[i];
    while (word.length > w){                 // a URL longer than the screen
      if (line){ out.push(line); line = ''; }
      out.push(word.slice(0, w)); word = word.slice(w);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= w) line += ' ' + word;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}

function pad(str, n){ str = String(str); return str.length >= n ? str.slice(0,n) : str + Array(n-str.length+1).join(' '); }

/* ── state ────────────────────────────────────────────────────── */

var APP = {
  power: true,
  view: 'boot',          // boot | menu | list | item
  sec: 0,
  item: 0,
  scroll: 0,
  menuSel: 0,
  palIdx: 0,
  sound: true,
  vol: 2,
  bootLong: false,
  offAt: 0,
  bootAt: 0,
  rev: 0
};
var itemMemory = {};     // last item looked at, per section

var needsPaint = true;
function dirty(){ needsPaint = true; }

/* ── what the machine reports ─────────────────────────────────────
   The screen engine is the one place that knows what happened: which
   button went down and from where, which palette the dial landed on,
   where the volume wheel is, what the visitor should be pressing next.
   The 3D shell subscribes to that rather than guessing from its own
   pointer events, which is why a key on a keyboard now moves a cap on
   the machine. Listeners are called in order and a throwing listener
   never takes the screen down with it. */
var listeners = {};
function emit(type, e){
  var l = listeners[type];
  if (!l) return;
  for (var i = 0; i < l.length; i++){ try { l[i](e || {}); } catch(err){} }
}

/* ── composing a screen ───────────────────────────────────────── */

function viewport(){ return { top:2, rows:G.rows - 4 }; }      // row 0 bar, row 1 gap, last row bar

function titleBar(left, right){
  fillCells(0, 0, G.cols, 1, 3);
  ctx.fillStyle = shade(0);
  ctx.font = screenFont(G.fs);
  ctx.fillText(left, G.cw, G.ch*0.74);
  if (right) ctx.fillText(right, (G.cols - 1 - right.length)*G.cw, G.ch*0.74);
}

function footBar(tokens){
  var row = G.rows - 1;
  fillCells(0, row, G.cols, 1, 3);
  var col = 1, i, t;
  for (i=0;i<tokens.length;i++){
    t = tokens[i];
    var width = (t.icon ? 2 : t.key.length) + 1 + t.label.length + 2;
    if (col + width > G.cols) break;
    if (t.icon === 'ud'){ tri(col, row, 'u', 0); tri(col+1, row, 'd', 0); }
    else if (t.icon === 'lr'){ tri(col, row, 'l', 0); tri(col+1, row, 'r', 0); }
    else { put(col, row, t.key, 0); }
    put(col + (t.icon ? 2 : t.key.length) + 1, row, t.label, 0);
    col += width;
  }
}

function scrollbar(top, rows, total, at){
  if (total <= rows) return;
  var col = G.cols - 1;
  var h = Math.max(1, Math.round(rows * rows / total));
  var y = Math.round((rows - h) * at / (total - rows));
  fillCells(col, top, 1, rows, 1);
  fillCells(col, top + y, 1, h, 3);
}

function frame(){
  ctx.fillStyle = shade(0);
  ctx.fillRect(0, 0, CW_PX, CH_PX);
}

/* the faint grid a real dot-matrix panel has */
/* Drawn once per palette and grid and then stamped, because a game on
   the panel repaints sixty times a second and two hundred fillRects a
   frame was a measurable slice of a budget it did not have. */
var gridCache = document.createElement('canvas'), gridKey = '';
gridCache.width = CW_PX; gridCache.height = CH_PX;
function matrix(){
  var key = pal.name + '|' + G.cols + '|' + G.rows;
  if (key !== gridKey){
    var g = gridCache.getContext('2d'), step = G.cw / 2, x;
    g.clearRect(0, 0, CW_PX, CH_PX);
    g.globalAlpha = 0.22;
    g.fillStyle = shade(1);
    for (x = step; x < CW_PX; x += step) g.fillRect(Math.round(x), 0, 1, CH_PX);
    for (x = step; x < CH_PX; x += step) g.fillRect(0, Math.round(x), CW_PX, 1);
    g.globalAlpha = 1;
    gridKey = key;
  }
  ctx.drawImage(gridCache, 0, 0);
  apparition();
  falloff();
  band();
}

/* When the light goes it does not go evenly: one strip of rows holds on
   a moment longer than the rest, the way a driver line on its way out
   looks. Brightness only. It never displaces a glyph and never garbles
   one, because a CV that appears to corrupt its own text does not read
   as atmosphere, it reads as broken. */
var bandY = 0.5;
function band(){
  if (!dip) return;
  var h = CH_PX * 0.055, y = bandY * (CH_PX - h);
  ctx.globalAlpha = 0.11 * dip;
  ctx.fillStyle = shade(3);
  ctx.fillRect(0, Math.round(y), CW_PX, Math.round(h));
  ctx.globalAlpha = 1;
}

/* The backlight is failing, so every so often it fails. Two frames
   down and one back, at a random moment inside a window you cannot
   anticipate, which is the only thing that makes a flicker land — a
   flicker on a timer is a metronome. Only on DREAD: every other
   palette is what a working panel looks like, and the contrast dial
   is the way out of this one.

   It costs three extra paints when it fires and nothing at all when it
   does not, because the menu only repaints when something asks it to. */
var dip = 0;
setInterval(function(){
  if (dip || reduced || !APP.power) return;
  if (pal.name !== 'DREAD') return;
  if (Math.random() > 0.42) return;
  dip = 1; bandY = Math.random(); dirty();
  var seen = Math.random() < 0.20;
  setTimeout(function(){ dip = 0.5; if (seen) face = 0.5; dirty(); }, 60);
  setTimeout(function(){ dip = 0.28; if (seen) face = 0.34; dirty(); }, 118);
  setTimeout(function(){ dip = 0; face = 0; dirty(); }, 190);
}, 2800);

/* ── the thing in the panel ───────────────────────────────────────
   Blood on a case is set dressing. You look at it once and then it is
   furniture. What actually unsettles someone is the object not behaving
   like an object — so once in a while, when the backlight goes, there
   is a face behind it.

   Everything about how it is drawn is doing one job: making you unsure
   you saw it. It is built out of the panel's own four shades, so it
   cannot be brighter than the screen is capable of. It is closest to
   the background shade, not the ink, so it sits at the bottom of the
   contrast range. It lasts two frames. And it only comes at the end of
   a dip that was already going to happen, so the flicker explains
   itself and you are left arguing with your own eyes.

   One in seven dips, which is a couple of minutes of looking. Any more
   often and it becomes a feature of the site rather than a thing that
   happened to you. */
var face = 0;
function apparition(){
  if (!face) return;
  var w = CW_PX, h = CH_PX;
  ctx.save();

  /* The backlight is going, so the content goes with it. Washing the
     panel down first is what buys the whole effect: the menu you were
     reading leaves, and what is left is not the menu. Drawing a face
     THROUGH the text just read as a smudge on the glass. */
  ctx.fillStyle = 'rgba(5,7,3,' + (0.88 * face).toFixed(3) + ')';
  ctx.fillRect(0, 0, w, h);

  ctx.globalAlpha = Math.min(1, face * 2.2);
  var eyeY = h * 0.38, eyeR = w * 0.135, gap = w * 0.225;
  [-1, 1].forEach(function(sgn){
    var cx = w / 2 + sgn * gap;
    /* Lit from behind rather than in front. Whatever this is, it is
       between the backlight and the glass. */
    var gd = ctx.createRadialGradient(cx, eyeY, eyeR * 0.10, cx, eyeY, eyeR * 2.3);
    gd.addColorStop(0, shade(2));
    gd.addColorStop(0.42, shade(1));
    gd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gd;
    ctx.beginPath(); ctx.arc(cx, eyeY, eyeR * 2.3, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgb(5,7,3)';
    ctx.beginPath(); ctx.ellipse(cx, eyeY, eyeR * 0.52, eyeR * 0.70, 0, 0, 7); ctx.fill();
  });

  /* The mouth is a hole, not a shape. No teeth — teeth are a cartoon;
     an opening you cannot see the bottom of is not. */
  var mg = ctx.createRadialGradient(w / 2, h * 0.72, w * 0.01, w / 2, h * 0.72, w * 0.24);
  mg.addColorStop(0, 'rgb(4,6,2)');
  mg.addColorStop(0.62, 'rgba(4,6,2,.72)');
  mg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = mg;
  ctx.beginPath(); ctx.ellipse(w / 2, h * 0.72, w * 0.155, h * 0.115, 0, 0, 7); ctx.fill();

  ctx.restore();
}
/* No LCD is evenly lit. The corners fall away from the viewing angle
   and the reflector never quite reaches the edge of the glass, so an
   even rectangle of colour is the giveaway that it is not a panel. */
function falloff(){
  /* On DREAD the backlight is going: the hot spot is off-centre and the
     corners are much further gone. Every other palette gets an evenly
     lit panel, so the contrast dial is a way out of here. */
  var sick = pal.name === 'DREAD', k = (sick ? 2.2 : 1) * (1 + dip * 2.6);
  var g = ctx.createRadialGradient(
    CW_PX * (sick ? 0.42 : 0.48), CH_PX * (sick ? 0.39 : 0.44),
    Math.min(CW_PX, CH_PX) * (sick ? 0.07 : 0.16),
    CW_PX * 0.50, CH_PX * 0.50,
    Math.max(CW_PX, CH_PX) * (sick ? 0.60 : 0.70));
  var e = pal.edge || '10,14,5';
  g.addColorStop(0,    'rgba(' + e + ',0)');
  g.addColorStop(0.58, 'rgba(' + e + ',' + (0.045 * k).toFixed(3) + ')');
  g.addColorStop(0.85, 'rgba(' + e + ',' + (0.130 * k).toFixed(3) + ')');
  g.addColorStop(1,    'rgba(' + e + ',' + (0.240 * k).toFixed(3) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW_PX, CH_PX);
}

/* ── screens ──────────────────────────────────────────────────── */

function sec(){ return SECTIONS[APP.sec]; }
function item(){ return sec().items[APP.item]; }

function profileProp(key){
  var s = SECTIONS[0], it = s && s.items[0], p = (it && it.props) || [];
  for (var i = 0; i < p.length; i++) if (p[i][0] === key) return p[i][1];
  return '';
}

/* The visitor's own clock, in the corner of the home screen. It is the
   one piece of live state the machine shows without being asked, and
   it is what makes the panel read as running rather than drawn. */
function clock(){
  var d = new Date(), h = d.getHours(), m = d.getMinutes();
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

/* A button's name drawn as the button: a cap with the letter knocked
   out of it. Everywhere the screen tells you what to press it uses
   this, so the panel and the plastic agree on what the thing is. */
function keycap(col, row, label, inverse){
  var w = label.length + 1;
  var x = Math.round(col * G.cw), y = Math.round(row * G.ch + G.ch * 0.10);
  ctx.fillStyle = shade(inverse ? 0 : 3);
  ctx.fillRect(x, y, Math.round(w * G.cw), Math.round(G.ch * 0.80));
  ctx.fillStyle = shade(inverse ? 3 : 0);
  ctx.font = screenFont(G.fs);
  ctx.fillText(label, x + G.cw * 0.5, row * G.ch + G.ch * 0.74);
  return w;
}

function drawMenu(){
  var v = viewport(), i, row = v.top, wide = G.cols >= 40;
  titleBar('IudexRyze', wide ? clock() + '  ' + pal.name : pal.name);

  if (v.rows > 9){
    put(1, row, 'VARUN SAINI', 3);
    var st = profileProp('STATUS').toUpperCase();
    if (wide && st) put(G.cols - 1 - st.length, row, st, 3);
    row++;
    put(1, row, wide ? 'GAME DEVELOPER / TECHNICAL ARTIST' : 'GAME DEV / TECH ART', 2);
    var base = profileProp('BASE').toUpperCase();
    if (wide && base && 36 + base.length < G.cols) put(G.cols - 1 - base.length, row, base, 2);
    row++;
    rule(row, 2); row++;
  }

  // a tall panel gets air between and around the rows rather than a
  // pool of it underneath them
  var left = v.top + v.rows - row;
  var step = left >= SECTIONS.length * 2 ? 2 : 1;
  row += Math.max(0, Math.floor((left - SECTIONS.length * step) / 2));

  for (i = 0; i < SECTIONS.length && row < v.top + v.rows; i++, row += step){
    var on = (i === APP.menuSel), s = SECTIONS[i];
    if (on){ fillCells(1, row, G.cols - 2, 1, 3); tri(1, row, 'r', 0); }
    put(3, row, (i < 9 ? '0' : '') + (i + 1), on ? 0 : 2);
    put(6, row, s.title, on ? 0 : 3);
    /* Until the visitor has opened something, the selected row says
       what opens it, in the button's own shape. After that it goes back
       to being the section's line of copy. */
    if (on && coach.stage === 0 && !reduced && Math.floor(performance.now() / 530) % 2){
      fillCells(6 + s.title.length + 0.6, row + 0.80, 1, 0.13, 0);
    }
    /* Whatever sits at the right of a row gets the room the title leaves
       it and no more: a long gloss is cut back to a whole word rather
       than running into the title, which is what ARCADE used to do. */
    var free = G.cols - 2 - (6 + s.title.length + 2);
    if (on && coach.stage < 2 && free >= 7){
      var cx = G.cols - 2 - 7;
      keycap(cx, row, 'A', true);
      put(cx + 3, row, 'OPEN', 0);
    } else if (wide && free >= 8){
      var gl = s.gloss;
      if (gl.length > free) gl = gl.slice(0, free).replace(/[\s,]+\S*$/, '');
      put(G.cols - 2 - gl.length, row, gl, on ? 0 : 2);
    }
  }
  footBar([{icon:'ud',label:'MOVE'},{key:'A',label:'OPEN'},{key:'SEL',label:'COLOUR'}]);
  say('Main menu. ' + SECTIONS[APP.menuSel].title + ', ' + SECTIONS[APP.menuSel].gloss + '. ' + SECTIONS.length + ' sections.');
  legend('↑↓ move · A open · SELECT colour');
}

/* Solid for a thing that exists in the world — shipped, playable, open
   source — hollow for a thing still being made, and a dot for anything
   that does not claim a status at all. It is the one column you can
   read the whole list by without reading a word. */
function statusMark(col, row, status, on){
  var sz = Math.round(Math.min(G.cw, G.ch) * 0.52);
  var x = Math.round(col * G.cw + (G.cw - sz) / 2), y = Math.round(row * G.ch + (G.ch - sz) / 2);
  var st = String(status || '').toUpperCase();
  ctx.fillStyle = ctx.strokeStyle = shade(on ? 0 : st ? 3 : 2);
  if (!st){ var d = Math.max(2, Math.round(sz * 0.34)); ctx.fillRect(x + (sz - d) / 2, y + (sz - d) / 2, d, d); }
  else if (/DEVELOPMENT/.test(st)){ ctx.lineWidth = Math.max(2, Math.round(sz * 0.2)); ctx.strokeRect(x + 1, y + 1, sz - 2, sz - 2); }
  else ctx.fillRect(x, y, sz, sz);
}

function drawList(){
  var s = sec(), v = viewport(), i;
  titleBar(s.title, (APP.item+1) + '/' + s.items.length);

  var wide = G.cols >= 40;
  // same rule as the menu: a tall panel spaces the rows out rather
  // than leaving a pool of nothing under them
  var step = v.rows >= s.items.length * 2 ? 2 : 1;
  var visible = Math.floor(v.rows / step);
  var start = Math.max(0, Math.min(APP.item - Math.floor(visible/2), s.items.length - visible));
  if (start < 0) start = 0;
  var shown = Math.min(visible, s.items.length);
  var top = v.top + Math.max(0, Math.floor((v.rows - shown * step) / 2));

  for (i=0;i<visible && start+i < s.items.length; i++){
    var it = s.items[start+i], row = top + i*step, on = (start+i === APP.item);
    if (on){ fillCells(1, row, G.cols-3, 1, 3); tri(1, row, 'r', 0); }
    statusMark(3, row, it.status, on);
    var name = it.name.toUpperCase();
    put(5, row, name.slice(0, G.cols-8), on ? 0 : 3);
    if (wide && it.tag){
      var t = it.tag.toUpperCase();
      if (5 + name.length + 2 + t.length < G.cols - 3) put(G.cols - 3 - t.length, row, t, on ? 0 : 2);
    }
  }
  // measured in rows, so a double-spaced list still gets a true thumb
  scrollbar(v.top, v.rows, s.items.length * step, start * step);
  footBar([{icon:'ud',label:'MOVE'},{key:'A',label:'OPEN'},{key:'B',label:'BACK'},{icon:'lr',label:'SECTION'}]);
  say(s.title + ' section. Item ' + (APP.item+1) + ' of ' + s.items.length + ': ' + item().name + (item().tag ? ', ' + item().tag : '') + (item().status ? ', ' + item().status : '') + '.');
  legend('↑↓ move · A open · B back · ←→ section');
}

/* ── pictures on a four-shade panel ───────────────────────────────
   The renders are real work, so the panel shows them rather than
   describing them. Loaded only when the item that holds them is opened,
   dithered once per palette and size, and drawn at the same three
   panel pixels per dot the cartridges use, so a picture and a game on
   this screen are made of the same grain. */
var mediaCache = {};
function mediaImage(src){
  var m = mediaCache[src];
  if (m) return m;
  m = mediaCache[src] = { img:new Image(), ok:false, bad:false, dith:{} };
  m.img.decoding = 'async';
  m.img.onload = function(){ m.ok = true; dirty(); };
  m.img.onerror = function(){ m.bad = true; dirty(); };
  m.img.src = BASE + src;
  return m;
}

var BAYER4 = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5];
function dithered(med, w, h){
  var key = pal.name + '|' + w + 'x' + h;
  if (med.dith[key]) return med.dith[key];
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  var g = c.getContext('2d', { willReadFrequently:true });
  var iw = med.img.naturalWidth, ih = med.img.naturalHeight, k = Math.max(w / iw, h / ih);
  g.imageSmoothingQuality = 'high';
  g.drawImage(med.img, (w - iw * k) / 2, (h - ih * k) / 2, iw * k, ih * k);
  var img = g.getImageData(0, 0, w, h), p = img.data, n = w * h, i, x, y;
  /* A photograph has to come out dark where it was dark on every
     palette, including the two whose background shade is the lightest.
     Games go through the brightness thresholds as they are; a picture
     goes through the palette's shades sorted by how bright they are. */
  var r = ramp().slice().sort(function(a, b){
    return (a[0]*77 + a[1]*151 + a[2]*28) - (b[0]*77 + b[1]*151 + b[2]*28);
  });
  var lum = new Uint8Array(n), hist = new Uint32Array(256);
  for (i = 0; i < n; i++){ lum[i] = (p[i*4]*77 + p[i*4+1]*151 + p[i*4+2]*28) >> 8; hist[lum[i]]++; }
  /* These are rooms lit by one failing source, so most of every picture
     lives in the bottom quarter of the range. Four shades spread evenly
     over 0–255 would put the whole room in the first one. Stretch to
     where the picture actually is, clipping two per cent at each end. */
  var lo = 0, hi = 255, acc = 0;
  for (i = 0; i < 256; i++){ acc += hist[i]; if (acc > n * 0.02){ lo = i; break; } }
  for (acc = 0, i = 255; i >= 0; i--){ acc += hist[i]; if (acc > n * 0.02){ hi = i; break; } }
  var span = Math.max(1, hi - lo);
  for (y = 0; y < h; y++) for (x = 0; x < w; x++){
    i = y * w + x;
    var l = (lum[i] - lo) / span; l = l < 0 ? 0 : l > 1 ? 1 : Math.pow(l, 0.72);
    var s = Math.floor(l * 3 + (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16);
    if (s > 3) s = 3;
    p[i*4] = r[s][0]; p[i*4+1] = r[s][1]; p[i*4+2] = r[s][2]; p[i*4+3] = 255;
  }
  g.putImageData(img, 0, 0);
  return (med.dith[key] = c);
}

function drawMedia(m, topRow, rows, v){
  var med = mediaImage(m.src);
  var x0 = Math.round(G.cw);
  var wPx = Math.floor((G.cols - 3) * G.cw / 3) * 3, hPx = Math.floor(rows * G.ch / 3) * 3;
  var y0 = Math.round(topRow * G.ch);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, v.top * G.ch, CW_PX, v.rows * G.ch); ctx.clip();
  if (med.ok){
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(dithered(med, wPx / 3, hPx / 3), x0, y0, wPx, hPx);
    ctx.imageSmoothingEnabled = true;
  } else {
    ctx.fillStyle = shade(1); ctx.fillRect(x0, y0, wPx, hPx);
    var msg = med.bad ? 'NO SIGNAL' : 'RECEIVING';
    put(Math.floor((G.cols - msg.length) / 2), topRow + Math.floor(rows / 2), msg, 2);
  }
  ctx.strokeStyle = shade(2); ctx.lineWidth = Math.max(1, Math.round(G.cw * 0.12));
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, wPx - 1, hPx - 1);
  ctx.restore();
}

/* an item, laid out as lines, so scrolling is just an offset. The order
   is the order a person reading a spec sheet wants it in: what it is,
   what state it is in, what it does, the evidence, the facts, and then
   what you can do about it. */
function itemLines(it){
  var W = G.cols - 3, lines = [], i, j;
  lines.push({t:it.name.toUpperCase(), s:3});
  var sub = [it.tag, it.status].filter(Boolean).join('  /  ');
  if (sub) lines.push({t:sub.toUpperCase(), s:2});
  lines.push({rule:true});
  for (i=0;i<(it.body||[]).length;i++){
    var w = wrap(it.body[i], W);
    for (j=0;j<w.length;j++) lines.push({t:w[j], s:3});
    lines.push({t:'', s:3});
  }
  if (it.media && it.media.length){
    var rows = Math.max(5, Math.round(W * G.cw * 0.5625 / G.ch));
    for (i=0;i<it.media.length;i++){
      for (j=0;j<rows;j++) lines.push({media:it.media[i], k:j, n:rows, idx:i});
      if (it.media[i].cap) lines.push({t:it.media[i].cap.toUpperCase(), s:2});
      lines.push({t:'', s:3});
    }
  }
  if (it.props && it.props.length){
    lines.push({label:'SPEC'});
    var keyCol = W >= 44 ? 12 : 0;
    for (i=0;i<it.props.length;i++){
      var k = it.props[i][0], v = it.props[i][1];
      if (keyCol){
        var w2 = wrap(v, W - keyCol);
        for (j=0;j<w2.length;j++){
          if (j === 0) lines.push({t:pad(k, keyCol) + w2[j], s:3, keyLen:k.length});
          else lines.push({t:pad('', keyCol) + w2[j], s:3});
        }
      } else {
        lines.push({t:k, s:2});
        var w3 = wrap(v, W - 2);
        for (j=0;j<w3.length;j++) lines.push({t:'  ' + w3[j], s:3});
      }
    }
  }
  var acts = it.actions || [];
  if (acts.length){
    while (lines.length && lines[lines.length-1].t === '') lines.pop();
    lines.push({t:'', s:3});
    lines.push({label: acts.length > 1 ? 'ACTIONS' : 'ACTION'});
    for (i=0;i<acts.length && i<2;i++) lines.push({chip:acts[i], key: i === 0 ? 'A' : 'SEL'});
  }
  while (lines.length && lines[lines.length-1].t === '') lines.pop();
  return lines;
}

function sectionLabel(row, label){
  fillCells(1, row, label.length + 2, 1, 2);
  put(2, row, label, 0);
  ctx.fillStyle = shade(2);
  ctx.globalAlpha = 0.45;
  ctx.fillRect(Math.round((label.length + 4) * G.cw), Math.round(row * G.ch + G.ch * 0.5),
               Math.round((G.cols - label.length - 7) * G.cw), Math.max(1, Math.round(G.ch * 0.06)));
  ctx.globalAlpha = 1;
}

/* What the button will do, said next to the button, including where it
   is going to take you. A link that leaves the site and a game that
   runs on this glass should never look like the same promise. */
function actionChip(row, key, act){
  var w = keycap(1, row, key, false);
  put(1 + w + 1, row, act.label, 3);
  var cfg = act.launch && CARTS[act.launch];
  var tail = act.launch ? (cfg && !cfg.full ? 'RUNS ON THIS SCREEN' : 'OPENS FULL SCREEN')
           : /^mailto:/.test(act.href) ? 'OPENS MAIL' : /^tel:/.test(act.href) ? 'CALLS' : 'OPENS A NEW TAB';
  var col = 1 + w + 1 + act.label.length + 2;
  if (col + tail.length < G.cols - 2) put(col, row, tail, 2);
}

function drawItem(){
  var s = sec(), it = item(), v = viewport();
  var lines = itemLines(it);
  var max = Math.max(0, lines.length - v.rows);
  if (APP.scroll > max) APP.scroll = max;

  titleBar(s.title, (APP.item+1) + '/' + s.items.length);

  var drawn = {};
  for (var i=0;i<v.rows;i++){
    var L = lines[APP.scroll + i]; if (!L) break;
    var row = v.top + i;
    if (L.rule){ rule(row, 2); continue; }
    if (L.label){ sectionLabel(row, L.label); continue; }
    if (L.chip){ actionChip(row, L.key, L.chip); continue; }
    if (L.media){
      if (!drawn[L.idx]){ drawn[L.idx] = true; drawMedia(L.media, row - L.k, L.n, v); }
      continue;
    }
    if (L.keyLen){ put(1, row, L.t.slice(0, L.keyLen), 2); put(1 + L.keyLen, row, L.t.slice(L.keyLen), 3); }
    else put(1, row, L.t, L.s);
  }
  scrollbar(v.top, v.rows, lines.length, APP.scroll);

  var acts = it.actions || [];
  var toks = [];
  if (lines.length > v.rows) toks.push({icon:'ud', label:'SCROLL'});
  if (acts[0]) toks.push({key:'A', label:acts[0].label});
  toks.push({key:'B', label:'BACK'});
  if (acts[1]) toks.push({key:'SEL', label:acts[1].label});
  if (s.items.length > 1) toks.push({icon:'lr', label:'ITEM'});
  footBar(toks);

  var spoken = it.name + '. ' + (it.tag||'') + (it.status ? ', ' + it.status : '') + '. ' + (it.body||[]).join(' ');
  if (it.media) spoken += ' Pictures: ' + it.media.map(function(m){ return m.cap; }).join(', ') + '.';
  if (it.props) spoken += ' ' + it.props.map(function(p){ return p[0] + ': ' + p[1] + '.'; }).join(' ');
  if (acts.length) spoken += ' ' + acts.map(function(a, n){ return (n ? 'Select' : 'A') + ': ' + a.label.toLowerCase() + '.'; }).join(' ');
  say(spoken);
  legend('↑↓ scroll · ←→ item' + (acts[0] ? ' · A ' + acts[0].label.toLowerCase() : '') + ' · B back');
}

/* Switching off. A liquid crystal does not collapse like a tube; it lets
   go. The last picture drains toward the dark and pulls in toward the
   middle row as it goes, which is roughly what a panel losing its bias
   voltage looks like, and it is over in a third of a second. */
function drawOff(){
  var age = performance.now() - APP.offAt;
  ctx.fillStyle = '#1E2119'; ctx.fillRect(0,0,CW_PX,CH_PX);
  if (!reduced && snapValid && age < 380){
    var k = age / 380, sh = CH_PX * (1 - k * k * 0.94);
    ctx.globalAlpha = (1 - k) * (1 - k);
    ctx.drawImage(snap, 0, (CH_PX - sh) / 2, CW_PX, sh);
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = .5; matrix(); ctx.globalAlpha = 1;
  say('The console is switched off. Press the power switch to turn it on.');
  legend('POWER turn on');
}

/* ── boot ─────────────────────────────────────────────────────── */

var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Two things are remembered between visits and nothing else: that this
   browser has seen the long self test, and that it has learned the
   buttons. Neither changes what the portfolio shows. Private windows
   and blocked storage simply get the first visit every time. */
function remembered(key){ try { return localStorage.getItem(key); } catch(e){ return null; } }
function remember(key, val){ try { localStorage.setItem(key, val); } catch(e){} }

function startBoot(long){
  APP.view = 'boot'; APP.bootAt = performance.now(); APP.bootLong = !!long;
  trans = null; dirty();
}
function finishBoot(){
  remember('irz.booted', '1');
  toMenu(true, 'in');
}

function leader(k, v, w){
  var n = Math.max(3, w - k.length - v.length);
  return k + ' ' + Array(n - 1).join('.') + ' ' + v;
}
/* A self test that finds something. The screen has been drawn as a
   failing panel since the first commit — the off-centre hot spot and
   the corners in falloff() are the same fiction — and it may as well
   say so on the way up. It reports honestly: turn the dial off DREAD
   and the next boot passes, because the other palettes are what a
   working panel looks like. */
function postLines(){
  var sick = pal.name === 'DREAD', w = Math.min(G.cols - 4, 32), carts = 0, i;
  for (i = 0; i < SECTIONS.length; i++) if (SECTIONS[i].id === 'arcade') carts = SECTIONS[i].items.length;
  return [
    { t:'IRZ-OS  2.6', s:3 },
    { t:leader('ROM', 'VARUN SAINI', w), s:2 },
    { t:leader('RAM', '64K  OK', w), s:2 },
    { t:leader('CART', carts + ' TITLES', w), s:2 },
    { t:leader('PANEL', sick ? 'FAULT' : 'OK', w), s:sick ? 3 : 2 }
  ];
}

/* The long boot is the first visit's: the backlight comes up on an
   empty panel, the self test types itself out, then the logo. Every
   visit after that the machine comes up the way one you own does, and
   any button gets you straight to the menu either way. */
function drawBoot(t){
  var long = APP.bootLong, POST = long ? 1300 : 0, END = long ? 2700 : 1150;
  frame();
  ctx.save();
  if (t < POST){
    var lines = postLines(), shown = Math.min(lines.length, Math.floor((t - 420) / 150) + 1), i;
    var top = Math.max(1, Math.floor((G.rows - lines.length * 2) / 2));
    for (i = 0; i < shown; i++) put(2, top + i * 2, lines[i].t, lines[i].s);
    if (Math.floor(t / 260) % 2 === 0){
      var last = shown > 0 ? lines[shown - 1] : null;
      fillCells(last ? 2 + last.t.length + 1 : 2, top + Math.max(0, shown - 1) * 2, 1, 1, 3);
    }
  } else {
    var u = t - POST, mid = CH_PX * 0.44;
    var drop = Math.min(1, Math.max(0, u / 620));
    var e = 1 - Math.pow(1 - drop, 3);
    var y = -CH_PX*0.25 + (mid + CH_PX*0.25) * e;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = shade(3);
    ctx.font = Math.round(CW_PX*0.115) + 'px "Rubik Distressed", "IBM Plex Sans Condensed", sans-serif';
    ctx.fillText('IudexRyze', CW_PX/2, y);
    if (u > 640){
      ctx.font = screenFont(Math.round(CW_PX*0.030));
      ctx.fillStyle = shade(2);
      ctx.fillText('P O R T F O L I O   S Y S T E M', CW_PX/2, mid + CH_PX*0.10);
    }
    if (u > 820){
      var sick = pal.name === 'DREAD';
      ctx.font = screenFont(Math.round(CW_PX*0.026));
      ctx.fillStyle = shade(sick ? 3 : 2);
      ctx.fillText(sick ? 'BACKLIGHT   DEGRADED' : 'BACKLIGHT   NOMINAL', CW_PX/2, mid + CH_PX*0.19);
    }
    if (u > 700){
      ctx.font = screenFont(Math.round(CW_PX*0.026));
      ctx.fillStyle = shade(2);
      ctx.fillText('(C) 2026  VARUN SAINI   BANGALORE', CW_PX/2, CH_PX - G.ch);
    }
  }
  ctx.restore();
  matrix();
  /* The backlight, coming up. Squared, because a cold fluorescent does
     nothing for a moment and then arrives. */
  var light = Math.min(1, Math.max(0, (t - 120) / (long ? 520 : 260)));
  if (light < 1){
    ctx.fillStyle = 'rgba(3,4,2,' + (1 - light * light).toFixed(3) + ')';
    ctx.fillRect(0, 0, CW_PX, CH_PX);
  }
  legend('booting · A skip');
  if (t > END) finishBoot();
}

/* ── transitions ──────────────────────────────────────────────────
   A display does not cut between pictures, it redraws them, and the
   direction it redraws in says where you went: deeper sweeps down,
   back sweeps up, sideways slides by whole character cells. All of it
   is under a quarter of a second and none of it holds input — pressing
   again mid-sweep starts the next one from whatever is on the glass.
   Reduced motion gets a plain cut. */
var snap = document.createElement('canvas'); snap.width = CW_PX; snap.height = CH_PX;
var sctx = snap.getContext('2d'), snapValid = false;
var fresh = document.createElement('canvas'); fresh.width = CW_PX; fresh.height = CH_PX;
var fctx = fresh.getContext('2d');
var trans = null;

function transition(kind, fromGlass){
  if (reduced || !APP.power) return;
  if (fromGlass || trans){ sctx.drawImage(cv, 0, 0); snapValid = true; }
  if (!snapValid) return;
  trans = { kind:kind, t0:performance.now(),
            dur: kind === 'palette' ? 260 : (kind === 'left' || kind === 'right') ? 170 : 210 };
  dirty();
}

function composeTransition(){
  if (!trans) return;
  var k = (performance.now() - trans.t0) / trans.dur;
  if (k >= 1){ trans = null; dirty(); return; }
  var e = 1 - Math.pow(1 - k, 3), barY = -1;
  if (trans.kind === 'in' || trans.kind === 'out'){
    // whole rows: a panel refreshes by lines, never by pixels
    var y = Math.round(e * G.rows) * G.ch;
    if (trans.kind === 'in'){
      if (y < CH_PX) ctx.drawImage(snap, 0, y, CW_PX, CH_PX - y, 0, y, CW_PX, CH_PX - y);
      barY = y;
    } else {
      var y2 = CH_PX - y;
      if (y2 > 0) ctx.drawImage(snap, 0, 0, CW_PX, y2, 0, 0, CW_PX, y2);
      barY = y2;
    }
    ctx.globalAlpha = 0.30 * (1 - k);
    ctx.fillStyle = shade(3);
    ctx.fillRect(0, Math.round(barY - G.ch * 0.10), CW_PX, Math.max(2, Math.round(G.ch * 0.20)));
    ctx.globalAlpha = 1;
  } else if (trans.kind === 'left' || trans.kind === 'right'){
    var dir = trans.kind === 'right' ? 1 : -1;
    var off = Math.round(e * G.cols) * G.cw;
    fctx.drawImage(cv, 0, 0);
    ctx.fillStyle = shade(0); ctx.fillRect(0, 0, CW_PX, CH_PX);
    ctx.drawImage(snap, -dir * off, 0);
    ctx.drawImage(fresh, dir * (CW_PX - off), 0);
  } else if (trans.kind === 'palette'){
    /* The dial is turned through the bottom of its contrast range on the
       way to the next profile, so the picture sinks and comes back
       rather than swapping colour in one frame. */
    ctx.globalAlpha = Math.sin(Math.PI * k) * 0.62;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CW_PX, CH_PX);
    ctx.globalAlpha = 1;
  }
}

/* ── the on-screen display ────────────────────────────────────────
   Turning a dial has to show up on the glass, or the dial is a guess.
   An inverse slab near the bottom of the panel, a bar of detents and
   the setting's name, for about a second. One paint to show it and one
   to take it down: it is a still picture in between. */
var osd = null, osdTimer = 0;
function showOSD(label, level, of, text){
  osd = { label:label, level:level, of:of, text:text, until:performance.now() + 1100 };
  clearTimeout(osdTimer); osdTimer = setTimeout(dirty, 1130);
  dirty();
}
function drawOSD(){
  if (!osd) return;
  if (performance.now() > osd.until){ osd = null; return; }
  var w = Math.min(G.cols - 4, 36), x = Math.floor((G.cols - w) / 2), row = G.rows - 4;
  fillCells(x, row - 1, w, 3, 3);
  fillCells(x + 0.25, row - 0.8, w - 0.5, 2.6, 0);
  fillCells(x + 0.5, row - 0.6, w - 1, 2.2, 3);
  put(x + 1, row, osd.label, 0);
  put(x + w - 1 - osd.text.length, row, osd.text, 0);
  if (osd.of > 0){
    var bx = x + 1 + osd.label.length + 1, bw = w - (bx - x) - osd.text.length - 2;
    var cell = bw / osd.of;
    for (var i = 0; i < osd.of; i++){
      ctx.fillStyle = shade(i < osd.level ? 0 : 2);
      ctx.fillRect(Math.round((bx + i * cell) * G.cw + G.cw * 0.15), Math.round(row * G.ch + G.ch * 0.22),
                   Math.max(2, Math.round(cell * G.cw - G.cw * 0.3)), Math.round(G.ch * 0.56));
    }
  }
}

/* ── learning the machine by using it ─────────────────────────────
   Nobody should have to work out a website. Until the visitor has done
   each thing once, the machine lights the control that does the next
   thing — the D-pad and A on the menu, A in a list, B inside an item —
   and says it on the glass in the button's own shape. Once they have
   gone in and come back out, it stops for good. A machine that is off
   always lights its power button, because that is never obvious. */
var coach = { stage: remembered('irz.coach') === 'done' ? 3 : 0 };
var lastHint = '';
function coachHints(){
  if (!APP.power) return ['power'];
  if (coach.stage >= 3 || APP.view === 'boot' || APP.view === 'cart') return [];
  if (APP.view === 'menu') return coach.stage === 0 ? ['down', 'a'] : ['a'];
  if (APP.view === 'list') return coach.stage < 2 ? ['a'] : ['b'];
  return ['b'];
}
function updateHints(){
  var h = coachHints(), key = h.join(',');
  if (key !== lastHint){ lastHint = key; emit('hint', { btns:h }); }
}
function coachNote(btn){
  if (coach.stage >= 3) return;
  if (coach.stage === 0 && /^(up|down)$/.test(btn)) coach.stage = 1;
  if (btn === 'a' && (APP.view === 'menu' || APP.view === 'list')) coach.stage = Math.max(coach.stage, 2);
  if (btn === 'b' && coach.stage >= 2 && (APP.view === 'item' || APP.view === 'list')){
    coach.stage = 3; remember('irz.coach', 'done');
  }
}
setInterval(function(){
  if (coach.stage === 0 && APP.power && APP.view === 'menu' && !reduced) dirty();
}, 530);
// the clock in the corner
setInterval(function(){ if (APP.power && APP.view === 'menu') dirty(); }, 20000);

/* ── paint ────────────────────────────────────────────────────── */

function paint(){
  updateHints();
  if (!APP.power){ drawOff(); APP.rev++; return; }
  if (APP.view === 'boot'){ drawBoot(performance.now() - APP.bootAt); APP.rev++; return; }
  if (APP.view === 'cart'){ drawCart(); APP.rev++; return; }
  frame();
  if (APP.view === 'menu') drawMenu();
  else if (APP.view === 'list') drawList();
  else drawItem();
  drawOSD();
  /* The picture as painted, before the grid and the light go over it, is
     what the next transition leaves from. */
  if (trans) composeTransition();
  else { sctx.drawImage(cv, 0, 0); snapValid = true; }
  matrix();
  APP.rev++;
}

/* Boot, a running game, a transition and a machine powering down all
   animate; everything else waits for dirty(). */
function animating(){
  return APP.view === 'boot' || APP.view === 'cart' || !!trans ||
         (!APP.power && performance.now() - APP.offAt < 420);
}
function tick(){
  if (needsPaint || animating()){
    needsPaint = false;
    if (APP.view === 'cart') stepCursor();
    paint();
  }
  requestAnimationFrame(tick);
}

/* ── speech and the printed legend ────────────────────────────── */

var sayEl = document.getElementById('say'), lastSaid = '';
function say(s){ if (s !== lastSaid){ lastSaid = s; sayEl.textContent = s; } }
var legendEl = document.getElementById('legend'), lastLegend = '';
function legend(s){
  if (s === lastLegend) return; lastLegend = s;
  legendEl.innerHTML = s.split(' · ').map(function(part){
    var m = part.match(/^(\S+)\s+(.*)$/);
    return m ? '<span><em>' + m[1] + '</em>' + m[2] + '</span>' : '<span>' + part + '</span>';
  }).join('');
}

/* ── sound ────────────────────────────────────────────────────── */

/* Each display profile has its own voice. The same beep through a
   different waveform and pitch is the cheapest way to make a palette
   feel like a mode rather than a recolour: DREAD is low and soft and
   slightly wrong, COBALT is a clean high sine, the green ones are the
   square wave a handheld actually had. */
var VOICE = {
  DREAD:    { wave:'triangle', pitch:0.90 },
  DMG:      { wave:'square',   pitch:1.00 },
  POCKET:   { wave:'square',   pitch:1.04 },
  AMBER:    { wave:'triangle', pitch:0.84 },
  VANGUARD: { wave:'square',   pitch:1.12 },
  COBALT:   { wave:'sine',     pitch:1.26 }
};
var VOLS = [0, 0.4, 1, 1.8];
var actx = null;
function tone(freq, dur, type, vol){
  if (!APP.sound || !APP.power) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    var o = actx.createOscillator(), g = actx.createGain();
    var vc = VOICE[pal.name] || VOICE.DMG;
    o.type = type || vc.wave; o.frequency.value = freq * vc.pitch;
    g.gain.setValueAtTime(0.0001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, (vol || 0.045) * VOLS[APP.vol]), actx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur + 0.02);
  } catch(e){}
}
/* ── haptics ──────────────────────────────────────────────────────
   A machine with real buttons should answer in the hand as well as in
   the ear.

   navigator.vibrate is Android only. Safari on iOS has never shipped
   it, and a desktop has nothing to vibrate, so on both of those every
   call below is a no-op that costs nothing and the sound goes on being
   the whole of the feedback. Nothing here is load-bearing.

   It follows the VOLUME dial rather than getting a switch of its own.
   The machine has one control for answer-me and be-quiet, and adding a
   second dial for the same idea would be a worse object.

   Durations are eight to twenty milliseconds — a tick, not a buzz.
   Anything longer under a menu keypress is intolerable inside a minute,
   and holding a direction repeats this every 90ms.

   Chrome logs a warning for every vibrate made before the frame has
   been tapped, and the boot sequence fires sfx() on load, so nothing is
   sent until a real gesture has actually happened. */
var canBuzz = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
var gestured = false;
/* Capture, not bubble. The machine's own pointerdown handler lives on
   the WebGL canvas, so on the very first press a bubble-phase listener
   here would not have run yet and that press would be the one silent
   one of the session. Capture puts the gate ahead of it. */
['pointerdown', 'keydown'].forEach(function(t){
  window.addEventListener(t, function(){ gestured = true; },
    { once:true, passive:true, capture:true });
});

/* hasBeenActive is the flag the browser itself gates vibrate on, so ask
   it rather than inferring activation from the fact that an event was
   heard — the two come apart for anything synthetic, and the listener
   above cannot tell the difference. It falls back to the flag where the
   property is not implemented. */
function activated(){
  var ua = navigator.userActivation;
  return ua ? ua.hasBeenActive : gestured;
}

var BUZZ = { move:8, open:14, back:10, deny:[16,38,16], boot:[10,70,18], off:22, tick:6 };
function buzz(kind){
  if (!canBuzz || !activated() || reduced || !APP.sound) return;
  var pattern = BUZZ[kind];
  if (pattern) try { navigator.vibrate(pattern); } catch(e){}
}

function sfx(kind){
  buzz(kind);
  if (kind === 'move')  tone(720, 0.05);
  if (kind === 'open')  { tone(560, 0.05); setTimeout(function(){ tone(880, 0.07); }, 55); }
  if (kind === 'back')  tone(340, 0.07);
  if (kind === 'deny')  tone(180, 0.10, 'sawtooth');
  if (kind === 'boot')  { tone(523, 0.10, 'triangle', .06); setTimeout(function(){ tone(1046, 0.22, 'triangle', .06); }, 120); }
  if (kind === 'off')   tone(200, 0.16, 'triangle');
}

/* ── navigation ───────────────────────────────────────────────── */

function toMenu(silent, kind){
  if (APP.view !== 'menu') transition(kind || 'out', APP.view === 'boot' || APP.view === 'cart');
  APP.view = 'menu'; APP.scroll = 0;
  if (!silent) sfx('back');
  setHash(''); dirty();
}
function openSection(i){
  transition('in');
  APP.sec = i; APP.view = 'list';
  APP.item = itemMemory[sec().id] || 0;
  if (APP.item >= sec().items.length) APP.item = 0;
  APP.scroll = 0; sfx('open'); setHash(sec().id); dirty();
}
function openItem(){
  transition('in');
  APP.view = 'item'; APP.scroll = 0;
  itemMemory[sec().id] = APP.item;
  sfx('open'); setHash(sec().id + '/' + item().id); dirty();
}

function fire(action){
  if (!action) { sfx('deny'); return; }
  if (action.launch){ launch(action.launch); return; }
  sfx('open');
  var w = window.open(action.href, action.href.indexOf('mailto:') === 0 || action.href.indexOf('tel:') === 0 ? '_self' : '_blank', 'noopener');
  if (!w) location.href = action.href;
}

function cyclePalette(){
  transition('palette');
  APP.palIdx = (APP.palIdx + 1) % PALETTES.length;
  pal = PALETTES[APP.palIdx];
  buzz('tick'); tone(880, 0.04, 'triangle');
  emit('palette', { index:APP.palIdx, count:PALETTES.length, step:1, name:pal.name });
  showOSD('CONTRAST', APP.palIdx + 1, PALETTES.length, pal.name);
  dirty();
}

/* The volume wheel has four detents rather than a mute switch: off,
   and three levels that actually differ. It sits where it was left and
   rolls back to its stop when it wraps, and the glass says where it is. */
function cycleVolume(){
  APP.vol = (APP.vol + 1) % VOLS.length;
  APP.sound = APP.vol > 0;
  buzz('tick');
  if (APP.sound) tone(760, 0.06, 'triangle');
  emit('volume', { level:APP.vol, levels:VOLS.length - 1 });
  showOSD('VOLUME', APP.vol, VOLS.length - 1, ['MUTE', 'LOW', 'MID', 'HIGH'][APP.vol]);
  say(APP.sound ? 'Volume ' + ['', 'low', 'medium', 'high'][APP.vol] + '.' : 'Sound off.');
}

function press(btn){
  if (btn === 'power'){
    if (SLOT.on) ejectPanel(true);
    if (APP.power){
      sfx('off');                               // before the power goes, or it never sounds
      sctx.drawImage(cv, 0, 0); snapValid = true;
      APP.power = false; APP.offAt = performance.now(); trans = null; osd = null;
    } else {
      APP.power = true; sfx('boot'); startBoot(false);
    }
    emit('power', { on:APP.power });
    dirty(); return;
  }
  if (!APP.power) return;

  /* The dials belong to the machine in every state, including while it
     boots and while a game has the rest of the buttons. */
  if (btn === 'volume'){ cycleVolume(); dirty(); return; }
  if (btn === 'contrast'){ cyclePalette(); return; }

  /* A cartridge is on the panel. START and SELECT still belong to the
     machine — turning the contrast while a game runs is half the point
     of having a dial — and everything else belongs to the game, which
     is driven from cartHold() so that a held button stays held. */
  if (APP.view === 'cart'){
    if (btn === 'start'){ ejectPanel(); return; }
    if (btn === 'select'){ cyclePalette(); return; }
    return;
  }

  if (APP.view === 'boot'){ finishBoot(); return; }
  if (btn === 'select' && APP.view !== 'item'){ cyclePalette(); return; }
  if (btn === 'start'){ if (APP.view !== 'menu') toMenu(); else sfx('deny'); return; }

  if (APP.view === 'menu'){
    if (btn === 'up'){ APP.menuSel = (APP.menuSel + SECTIONS.length - 1) % SECTIONS.length; sfx('move'); dirty(); }
    else if (btn === 'down'){ APP.menuSel = (APP.menuSel + 1) % SECTIONS.length; sfx('move'); dirty(); }
    else if (btn === 'a' || btn === 'right') openSection(APP.menuSel);
    else if (btn === 'b') sfx('deny');
    return;
  }

  if (APP.view === 'list'){
    var n = sec().items.length;
    if (btn === 'up'){ APP.item = (APP.item + n - 1) % n; sfx('move'); dirty(); }
    else if (btn === 'down'){ APP.item = (APP.item + 1) % n; sfx('move'); dirty(); }
    else if (btn === 'left'){ transition('left'); APP.menuSel = APP.sec = (APP.sec + SECTIONS.length - 1) % SECTIONS.length; APP.item = 0; sfx('move'); setHash(sec().id); dirty(); }
    else if (btn === 'right'){ transition('right'); APP.menuSel = APP.sec = (APP.sec + 1) % SECTIONS.length; APP.item = 0; sfx('move'); setHash(sec().id); dirty(); }
    else if (btn === 'a') openItem();
    else if (btn === 'b'){ APP.menuSel = APP.sec; toMenu(); }
    return;
  }

  // item
  var it = item(), acts = it.actions || [], m = sec().items.length;
  if (btn === 'up'){ if (APP.scroll > 0){ APP.scroll--; sfx('move'); dirty(); } return; }
  if (btn === 'down'){ APP.scroll++; sfx('move'); dirty(); return; }
  if (btn === 'left'){ transition('left'); APP.item = (APP.item + m - 1) % m; APP.scroll = 0; itemMemory[sec().id] = APP.item; sfx('move'); setHash(sec().id + '/' + item().id); dirty(); return; }
  if (btn === 'right'){ transition('right'); APP.item = (APP.item + 1) % m; APP.scroll = 0; itemMemory[sec().id] = APP.item; sfx('move'); setHash(sec().id + '/' + item().id); dirty(); return; }
  if (btn === 'a'){ fire(acts[0]); return; }
  if (btn === 'select'){ acts[1] ? fire(acts[1]) : cyclePalette(); return; }
  if (btn === 'b'){ transition('out'); APP.view = 'list'; APP.scroll = 0; sfx('back'); setHash(sec().id); dirty(); return; }
}

/* ── the cartridge slot ────────────────────────────────────────────
   There are two ways to run a game here and the controls decide which.

   Most of them run ON THE PANEL. The real game loads into a hidden
   same-origin iframe and keeps running as it always did; every frame
   its canvas is posterised to the four shades this screen actually has
   and blitted up. It is not a video of a game: it is the game, on the
   panel, in the panel's colours, driven by the D-pad.

   The dot grid is 320×288 and the slot is rendered at 320×288, which is
   deliberate on both counts. The panel is 960×864, exactly three times
   that in both axes, so every game pixel lands on three whole panel
   pixels and nothing resamples on the way up. And the game is not
   downsampled at all — the first cut of this ran the slot at 480 and
   squeezed it into a 160×144 handheld frame, which was a lovely idea
   and completely unreadable: these games size their own type off the
   box they are given, and a third of 480 turns a label into two pixels
   of mush. Rendering at the size it is displayed keeps the type the
   size the game drew it.

   Two of them do not. BT-7274N is typed, and Overclock wants an axis
   held to a precision four discrete directions cannot give. Those keep
   the full frame, where a real keyboard is in reach. Squeezing them
   onto the pad would not be a port, it would just be a worse way to
   play them.                                                        */

/* Per cartridge: which console button becomes which key inside the
   game, or — for the two that are driven by pointing at something —
   what the A button does with the crosshair. */
var CARTS = {
  'bt-7274n':        { full:true },
  'overclock':       { full:true },
  'drift-lander':    { keys:{ left:'ArrowLeft', right:'ArrowRight', up:'ArrowUp', a:'Space', b:'KeyR' } },
  'disco-race':      { keys:{ left:'ArrowLeft', right:'ArrowRight', down:'ArrowDown', a:'Space', b:'KeyR' } },
  'circuit-breaker': { keys:{ left:'ArrowLeft', right:'ArrowRight', up:'ArrowUp', down:'ArrowDown', a:'Space', b:'Backspace' } },
  'heap':            { keys:{ a:'Space', b:'KeyR' } },
  'mutex':           { cursor:'tap',  grab:'a', keys:{ b:'KeyR' } },
  /* Refactor grabs with B, not A, because its title screen and its
     between-levels screen both want a plain start and the crosshair had
     taken the only button that could give them one. */
  'refactor':        { cursor:'drag', grab:'b', keys:{ a:'Space' } }
};

/* ── on the panel ─────────────────────────────────────────────── */

var DOT_W = 320, DOT_H = 288;
var dot = document.createElement('canvas');
dot.width = DOT_W; dot.height = DOT_H;
var dctx = dot.getContext('2d', { willReadFrequently:true });

/* A panel this bad does not clear a pixel, it lets go of it. Holding a
   third of the previous frame under the current one gives every moving
   thing a tail, which is exactly what these screens did and is also the
   quiet reason a game on here feels like it is being watched through
   something. It decays as 0.34^n, so it is gone in three frames and
   never accumulates.

   It is held as brightness, before the four shades are chosen, and that
   is the whole point. The first cut kept the previous frame as the
   finished, posterised picture and blended that back in — so the panel's
   own colours were fed back through the brightness thresholds. On DMG
   and POCKET, where the background shade is the brightest of the four,
   a pixel near a threshold was pushed over it by its own ghost, then
   pulled back by the next one, and flipped shade every single frame:
   the static title screen of a game shimmered. Brightness in, brightness
   out, and a still pixel settles instead of oscillating on any palette. */
var persist = new Float32Array(DOT_W * DOT_H);

/* ── the panel's own shader ───────────────────────────────────────
   Posterising a game on the CPU meant reading its pixels back off the
   GPU every frame, and that readback was the whole cost of a game on
   this screen: measured with every canvas call timed, getImageData was
   26 ms a frame and nothing else was over a third of a millisecond.

   So the same three steps — brightness, persistence, four shades — run
   as two fragment passes on a small WebGL2 canvas of its own. The game's
   canvas goes up as a texture, the persistence lives in a pair of
   framebuffers that swap every frame, and the result is a canvas the
   panel draws like any other image. No pixel goes near the CPU.

   Made the first time a cartridge goes in, so nobody who never plays
   pays for a second context. Where WebGL2 is missing, or the context is
   lost, the CPU path below still does the job, just slower. */
var gpu;
function panelShader(){
  if (gpu !== undefined) return gpu;
  gpu = null;
  var c = document.createElement('canvas'); c.width = DOT_W; c.height = DOT_H;
  var gl = null;
  try {
    gl = c.getContext('webgl2', { alpha:false, antialias:false, depth:false, stencil:false,
      premultipliedAlpha:false, preserveDrawingBuffer:true, powerPreference:'low-power' });
  } catch(e){}
  if (!gl) return gpu;

  try {
    var VS = '#version 300 es\n' +
      'in vec2 p; out vec2 uv;\n' +
      'void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
    /* Pass one: brightness, held against the previous frame. The box is
       the letterboxed game rectangle in top-left dot coordinates; outside
       it the panel is black, as it was when the CPU filled it. */
    var FS_LUM = '#version 300 es\n' +
      'precision highp float;\n' +
      'in vec2 uv; out vec4 o;\n' +
      'uniform sampler2D game; uniform sampler2D prev; uniform vec4 box; uniform float keep;\n' +
      'void main(){\n' +
      '  vec2 d = vec2(uv.x * ' + DOT_W + '.0, (1.0 - uv.y) * ' + DOT_H + '.0);\n' +
      '  vec2 g = (d - box.xy) / box.zw;\n' +
      '  float y = 0.0;\n' +
      '  if (g.x >= 0.0 && g.y >= 0.0 && g.x <= 1.0 && g.y <= 1.0)\n' +
      '    y = dot(texture(game, g).rgb, vec3(0.30078, 0.58984, 0.10938));\n' +
      '  float v = y + (texture(prev, uv).r - y) * keep;\n' +
      '  if (abs(v - y) < 1.5 / 255.0) v = y;\n' +
      '  o = vec4(v, v, v, 1.0);\n' +
      '}';
    /* Pass two: the same three thresholds the CPU used, onto the four
       shades the dial has selected. */
    var FS_OUT = '#version 300 es\n' +
      'precision highp float;\n' +
      'in vec2 uv; out vec4 o;\n' +
      'uniform sampler2D lum; uniform vec3 ramp[4];\n' +
      'void main(){\n' +
      '  float y = texture(lum, uv).r * 255.0;\n' +
      '  int s = y < 26.0 ? 0 : y < 84.0 ? 1 : y < 168.0 ? 2 : 3;\n' +
      '  o = vec4(ramp[s], 1.0);\n' +
      '}';

    var compile = function(type, src){
      var sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    var program = function(fs){
      var pr = gl.createProgram();
      gl.attachShader(pr, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(pr, 0, 'p');
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      return pr;
    };
    var pLum = program(FS_LUM), pOut = program(FS_OUT);

    // one triangle that covers the viewport
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    var texture = function(filter){
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    var gameTex = texture(gl.LINEAR);
    var lums = [0, 1].map(function(){
      var t = texture(gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, DOT_W, DOT_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      var fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return { tex:t, fb:fb };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    var u = function(pr, name){ return gl.getUniformLocation(pr, name); };
    var U = {
      game:u(pLum, 'game'), prev:u(pLum, 'prev'), box:u(pLum, 'box'), keep:u(pLum, 'keep'),
      lum:u(pOut, 'lum'), ramp:u(pOut, 'ramp')
    };
    var rampData = new Float32Array(12), front = 0;

    var clear = function(){
      gl.clearColor(0, 0, 0, 1);
      for (var i = 0; i < 2; i++){ gl.bindFramebuffer(gl.FRAMEBUFFER, lums[i].fb); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
    clear();

    gpu = {
      reset: clear,
      run: function(src, box, r){
        if (gl.isContextLost()) throw new Error('context lost');
        gl.viewport(0, 0, DOT_W, DOT_H);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, gameTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);

        var read = lums[front], write = lums[1 - front];
        gl.useProgram(pLum);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, read.tex);
        gl.uniform1i(U.game, 0); gl.uniform1i(U.prev, 1);
        gl.uniform4f(U.box, box.ox, box.oy, box.w, box.h);
        gl.uniform1f(U.keep, 0.34);
        gl.bindFramebuffer(gl.FRAMEBUFFER, write.fb);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        front = 1 - front;

        for (var i = 0; i < 4; i++){
          rampData[i*3] = r[i][0] / 255; rampData[i*3+1] = r[i][1] / 255; rampData[i*3+2] = r[i][2] / 255;
        }
        gl.useProgram(pOut);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, write.tex);
        gl.uniform1i(U.lum, 1);
        gl.uniform3fv(U.ramp, rampData);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return c;
      }
    };
  } catch(err){
    gpu = null;
  }
  return gpu;
}

var slot = null;
var SLOT = { on:false, slug:'', cfg:null, gcv:null, held:{}, cur:null, t0:0, back:null,
             box:{ ox:0, oy:0, w:DOT_W, h:DOT_H } };

/* The four shades as raw bytes, rebuilt only when the dial is turned. */
var rampCache = null, rampFor = null;
function ramp(){
  if (rampFor === pal) return rampCache;
  rampCache = [pal.a, pal.b, pal.c, pal.d].map(function(h){
    return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  });
  rampFor = pal;
  return rampCache;
}

function gameCanvas(){
  if (SLOT.gcv && SLOT.gcv.isConnected) return SLOT.gcv;
  try {
    var d = slot && slot.contentDocument;
    SLOT.gcv = d ? d.querySelector('canvas') : null;
  } catch(e){ SLOT.gcv = null; }
  return SLOT.gcv;
}

function cartTitle(slug){
  var i, j;
  for (i=0;i<SECTIONS.length;i++) for (j=0;j<SECTIONS[i].items.length;j++)
    if (SECTIONS[i].items[j].id === slug) return SECTIONS[i].items[j].name;
  return slug;
}
function cartLegend(cfg){
  var parts = [];
  if (cfg.cursor){
    parts.push('+ aim');
    parts.push((cfg.grab || 'A').toUpperCase() + ' ' + (cfg.cursor === 'drag' ? 'grab' : 'tap'));
    if (cfg.keys && cfg.keys.a === 'Space') parts.push('A start');
    if (cfg.keys && cfg.keys.b === 'KeyR')  parts.push('B reset');
    parts.push('START eject');
    return parts.join(' · ');
  }
  if (cfg.keys && (cfg.keys.left || cfg.keys.up)) parts.push('+ move');
  if (cfg.keys && cfg.keys.a) parts.push('A play');
  if (cfg.keys && cfg.keys.b) parts.push('B reset');
  parts.push('START eject');
  return parts.join(' · ');
}

function insert(slug){
  var cfg = CARTS[slug] || {};
  transition('in', true);
  SLOT.back = { view:APP.view, sec:APP.sec, item:APP.item, scroll:APP.scroll };
  slot = document.createElement('iframe');
  slot.className = 'slot';
  slot.setAttribute('aria-hidden', 'true');
  slot.setAttribute('tabindex', '-1');
  /* Every game calls window.focus() on load, which took the keyboard
     into the frame: after that every key went straight to the game past
     the console's mapping, so Z did nothing and START could not eject.
     Real keys inside the frame are now caught before the game sees them
     and handed back to the machine, which sends the game the key it
     actually wants. */
  slot.addEventListener('load', function(){
    try {
      var w = slot.contentWindow;
      w.addEventListener('keydown', function(e){ if (!e.isTrusted) return; e.stopImmediatePropagation(); onKeyDown(e); }, true);
      w.addEventListener('keyup', function(e){ if (!e.isTrusted) return; e.stopImmediatePropagation(); onKeyUp(e); }, true);
    } catch(err){}
  });
  slot.src = BASE + 'play/' + slug + '/index.html';
  document.body.appendChild(slot);
  SLOT.on = true; SLOT.slug = slug; SLOT.cfg = cfg; SLOT.gcv = null;
  SLOT.held = {}; SLOT.cur = { x:0.5, y:0.5, down:false }; SLOT.t0 = performance.now();
  persist.fill(0);
  if (panelShader()) gpu.reset();
  APP.view = 'cart';
  sfx('open');
  say(cartTitle(slug) + ' is running on the console screen. Play it with the D-pad and A. START ejects the cartridge.');
  legend(cartLegend(cfg));
  dirty();
}

function ejectPanel(silent){
  if (!SLOT.on) return;
  if (!silent) transition('out', true);
  if (SLOT.cur && SLOT.cur.down) sendPointer('pointerup');
  if (slot && slot.parentNode) slot.parentNode.removeChild(slot);
  slot = null; SLOT.on = false; SLOT.gcv = null; SLOT.held = {};
  var b = SLOT.back || { view:'list', sec:APP.sec, item:APP.item, scroll:0 };
  APP.view = b.view === 'cart' ? 'list' : b.view;
  APP.sec = b.sec; APP.item = b.item; APP.scroll = b.scroll;
  if (!silent) sfx('back');
  dirty();
}

/* Four shades chosen by how bright the game drew the pixel. The colour
   is not lost by accident: the panel has four shades and no hue, so a
   game running on the panel has four shades and no hue. */
function posterise(){
  var img = dctx.getImageData(0, 0, DOT_W, DOT_H), p = img.data, r = ramp(), i, j, y, s;
  for (i = 0, j = 0; i < p.length; i += 4, j++){
    y = (p[i]*77 + p[i+1]*151 + p[i+2]*28) >> 8;
    /* Snapped once it is within half a level. Decay alone only ever
       approaches, so a still pixel sitting exactly on a threshold would
       creep up to it for half a second and then change shade, late,
       for no visible reason. */
    s = y + (persist[j] - y) * 0.34;
    y = persist[j] = (s - y < 0.5 && y - s < 0.5) ? y : s;
    s = y < 26 ? 0 : y < 84 ? 1 : y < 168 ? 2 : 3;
    p[i] = r[s][0]; p[i+1] = r[s][1]; p[i+2] = r[s][2]; p[i+3] = 255;
  }
  dctx.putImageData(img, 0, 0);
}

function drawCursor(){
  var b = SLOT.box, w = CW_PX / DOT_W;                     // one game pixel
  var x = (b.ox + SLOT.cur.x * b.w) * w;
  var y = (b.oy + SLOT.cur.y * b.h) * (CH_PX / DOT_H);
  var r = w * (SLOT.cur.down ? 5 : 7);
  ctx.save();
  ctx.strokeStyle = shade(3);
  ctx.lineWidth = Math.max(2, w);
  ctx.beginPath();
  ctx.moveTo(x-r, y); ctx.lineTo(x-r*0.34, y);
  ctx.moveTo(x+r*0.34, y); ctx.lineTo(x+r, y);
  ctx.moveTo(x, y-r); ctx.lineTo(x, y-r*0.34);
  ctx.moveTo(x, y+r*0.34); ctx.lineTo(x, y+r);
  ctx.stroke();
  if (SLOT.cur.down){ ctx.fillStyle = shade(3); ctx.fillRect(x-w, y-w, w*2, w*2); }
  ctx.restore();
}

function drawSlotWait(){
  frame();
  var t = performance.now() - SLOT.t0, name = cartTitle(SLOT.slug).toUpperCase();
  var n = 14, filled = Math.min(n, Math.floor(t / 60));
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = shade(3);
  ctx.font = screenFont(Math.round(CW_PX * 0.046));
  ctx.fillText(name, CW_PX / 2, CH_PX * 0.42);
  var bw = CW_PX * 0.5, bx = (CW_PX - bw) / 2, by = CH_PX * 0.49, cell = bw / n;
  for (var i = 0; i < n; i++){
    ctx.fillStyle = shade(i < filled ? 3 : 1);
    ctx.fillRect(Math.round(bx + i * cell + cell * 0.12), Math.round(by),
                 Math.round(cell * 0.76), Math.round(CH_PX * 0.034));
  }
  ctx.fillStyle = shade(2);
  ctx.font = screenFont(Math.round(CW_PX * 0.027));
  ctx.fillText('READING CARTRIDGE', CW_PX / 2, CH_PX * 0.61);
  ctx.restore();
  drawOSD();
  if (trans) composeTransition();
  matrix();
}

function drawCart(){
  var g = gameCanvas();
  if (!g || !g.width || !g.height){ drawSlotWait(); return; }

  /* Letterboxed, never stretched. Every one of these games sizes its
     canvas to whatever box it is given but clamps to a 240 px floor, so
     the shape that comes back is close to the slot's and not always
     equal to it. A game squashed by two percent looks wrong in a way
     nobody can name; a black bar looks like a cartridge. */
  var k = Math.min(DOT_W / g.width, DOT_H / g.height);
  var w = Math.round(g.width * k), h = Math.round(g.height * k);
  var ox = (DOT_W - w) >> 1, oy = (DOT_H - h) >> 1;
  /* Cleared every frame on either path, not only when letterboxed:
     anything the game leaves transparent would otherwise show last
     frame's picture through it. */
  SLOT.box = { ox:ox, oy:oy, w:w, h:h };
  var out = null;
  if (panelShader()){
    try { out = gpu.run(g, SLOT.box, ramp()); }
    catch(e){ gpu = null; }                         // lost or failed: the CPU carries on
  }
  if (!out){
    dctx.fillStyle = '#000'; dctx.fillRect(0, 0, DOT_W, DOT_H);
    dctx.imageSmoothingEnabled = true;
    dctx.drawImage(g, 0, 0, g.width, g.height, ox, oy, w, h);
    posterise();
    out = dot;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(out, 0, 0, DOT_W, DOT_H, 0, 0, CW_PX, CH_PX);
  ctx.imageSmoothingEnabled = true;
  if (SLOT.cfg.cursor) drawCursor();
  drawOSD();
  if (trans) composeTransition();
  matrix();
}

/* ── driving it ───────────────────────────────────────────────── */

var KEYNAME = {
  Space:' ', Enter:'Enter', Backspace:'Backspace', KeyR:'r',
  ArrowLeft:'ArrowLeft', ArrowRight:'ArrowRight', ArrowUp:'ArrowUp', ArrowDown:'ArrowDown'
};
function sendKey(code, down){
  var w = slot && slot.contentWindow;
  if (!w) return;
  try {
    w.dispatchEvent(new w.KeyboardEvent(down ? 'keydown' : 'keyup', {
      code:code, key:KEYNAME[code] || code, bubbles:true, cancelable:true
    }));
  } catch(e){}
}
function sendPointer(type){
  var w = slot && slot.contentWindow, g = gameCanvas();
  if (!w || !g) return;
  var r = g.getBoundingClientRect();
  try {
    g.dispatchEvent(new w.PointerEvent(type, {
      pointerId:1, pointerType:'mouse', isPrimary:true, button:0,
      buttons:type === 'pointerup' ? 0 : 1, bubbles:true, cancelable:true,
      clientX:r.left + SLOT.cur.x * r.width,
      clientY:r.top  + SLOT.cur.y * r.height
    }));
  } catch(e){}
}

/* The crosshair moves while a direction is held, and at the panel's own
   aspect, so up feels exactly as fast as left. */
function stepCursor(){
  if (!SLOT.on || !SLOT.cfg.cursor) return;
  var h = SLOT.held;
  var dx = (h.right ? 1 : 0) - (h.left ? 1 : 0);
  var dy = (h.down ? 1 : 0) - (h.up ? 1 : 0);
  if (!dx && !dy) return;
  var k = 0.0085, b = SLOT.box;
  SLOT.cur.x = Math.max(0, Math.min(1, SLOT.cur.x + dx * k));
  SLOT.cur.y = Math.max(0, Math.min(1, SLOT.cur.y + dy * k * (b.w / b.h)));
  if (SLOT.cur.down) sendPointer('pointermove');
}

/* Called on the way down AND on the way up, which is the whole reason
   it exists: a lander needs thrust held, not tapped. While a cartridge
   is in, press() keeps only the system buttons and every other button
   belongs to the game. */
function cartHold(btn, down){
  if (!SLOT.on) return;
  /* On the way down only. The release is not a button press and should
     not feel like one. */
  if (down) buzz('tick');
  var cfg = SLOT.cfg;
  if (cfg.cursor && /^(up|down|left|right)$/.test(btn)){ SLOT.held[btn] = down; return; }
  if (cfg.cursor && btn === (cfg.grab || 'a')){
    if (!down) return;
    if (cfg.cursor === 'drag'){
      SLOT.cur.down = !SLOT.cur.down;
      sendPointer(SLOT.cur.down ? 'pointerdown' : 'pointerup');
    } else { sendPointer('pointerdown'); sendPointer('pointerup'); }
    return;
  }
  var code = cfg.keys && cfg.keys[btn];
  if (code) sendKey(code, down);
}

/* ── full frame, for the two that need a keyboard ─────────────── */

var cart = document.getElementById('cart'),
    cartFrame = document.getElementById('cart-frame'),
    cartName = document.getElementById('cart-name'),
    cartOpen = false, cartReturn = null;

function launch(slug){
  var cfg = CARTS[slug];
  if (cfg && !cfg.full){ insert(slug); return; }
  /* The two that need a keyboard leave the panel. The machine says so
     before the page changes under the visitor, so the overlay arrives
     as something the device did rather than something that happened
     to the website. */
  sfx('open');
  showOSD('LINK', 0, 0, 'EXTERNAL DISPLAY');
  setTimeout(function(){ openOverlay(slug); }, reduced ? 0 : 380);
}
function openOverlay(slug){
  cartName.textContent = cartTitle(slug).toUpperCase();
  cartFrame.title = cartTitle(slug) + ' — playable in the browser';
  cartFrame.src = BASE + 'play/' + slug + '/index.html';
  cart.setAttribute('data-open', '');
  cartOpen = true; cartReturn = document.activeElement;
  releaseAll();
  document.getElementById('cart-eject').focus();
}
function eject(){
  if (!cartOpen) return;
  cart.removeAttribute('data-open');
  cartFrame.src = 'about:blank';
  cartOpen = false; sfx('back');
  if (cartReturn && cartReturn.focus) cartReturn.focus();
}
document.getElementById('cart-eject').addEventListener('click', eject);

/* ── input ────────────────────────────────────────────────────── */

var KEYS = {
  ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
  w:'up', s:'down', a:'left', d:'right', W:'up', S:'down', A:'left', D:'right',
  z:'a', Z:'a', x:'b', X:'b', Enter:'a', ' ':'a', Backspace:'b', Escape:'b',
  Shift:'select', Tab:null
};
function btnFor(e){
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return null;
  /* A focused button's own activation keys belong to that button. Enter
     on a focused SELECT used to press A, because Enter was mapped
     globally and the handler got there first. */
  if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.closest && e.target.closest('#pad [data-btn], #cart-eject')) return null;
  if (e.key === 'Enter' && e.shiftKey) return 'start';
  if (e.key === 'Escape') return APP.view === 'menu' ? null : 'b';
  if (e.key === 'Shift') return 'select';
  if (e.key === 'p' || e.key === 'P') return 'power';
  return KEYS[e.key] !== undefined ? KEYS[e.key] : null;
}

/* Every button, from every source — the keyboard, the flat console, the
   3D render, a finger — goes down and comes up through here. That is
   what lets the render animate a keypress, a game see how long a button
   was held, and a held D-pad repeat without the OS's own key repeat
   also opening things twice. A second "down" for a button that is
   already down is a repeat, and only directions repeat. */
var heldBtn = {}, keyBtn = {};
var SYSTEM_BTN = { start:1, select:1, power:1, contrast:1, volume:1 };
function input(btn, isDown){
  if (!btn) return;
  if (isDown){
    if (heldBtn[btn]){
      if (APP.view !== 'cart' && /^(up|down|left|right)$/.test(btn)) press(btn);
      return;
    }
    heldBtn[btn] = true;
    emit('hold', { btn:btn, down:true });
    coachNote(btn);
    if (APP.view === 'cart' && !SYSTEM_BTN[btn]) cartHold(btn, true);
    else press(btn);
  } else {
    if (!heldBtn[btn]) return;
    delete heldBtn[btn];
    emit('hold', { btn:btn, down:false });
    if (APP.view === 'cart' && !SYSTEM_BTN[btn]) cartHold(btn, false);
  }
}
function releaseAll(){
  keyBtn = {};
  for (var b in heldBtn) input(b, false);
}

function onKeyDown(e){
  if (cartOpen){ if (e.key === 'Escape'){ e.preventDefault(); eject(); } return; }
  if (APP.view === 'cart' && e.key === 'Escape'){ e.preventDefault(); ejectPanel(); return; }
  var btn = btnFor(e);
  if (!btn) return;
  e.preventDefault();
  var k = e.code || e.key;
  if (keyBtn[k] && keyBtn[k] !== btn) input(keyBtn[k], false);
  keyBtn[k] = btn;
  input(btn, true);
}
function onKeyUp(e){
  var k = e.code || e.key, btn = keyBtn[k];
  if (!btn) return;
  delete keyBtn[k];
  input(btn, false);
}
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
/* A key released while the window did not have focus never sends its
   keyup, and a lander would thrust for ever. */
window.addEventListener('blur', function(){
  /* Focus going into our own cartridge frame is not the visitor leaving:
     the keys keep arriving, forwarded from inside it. */
  setTimeout(function(){ if (!(slot && document.activeElement === slot)) releaseAll(); }, 0);
});

var padEl = document.getElementById('pad'), padPtr = {}, padRepeat = {};
padEl.addEventListener('pointerdown', function(e){
  var b = e.target.closest('[data-btn]'); if (!b) return;
  var btn = b.getAttribute('data-btn'), id = e.pointerId;
  padPtr[id] = btn;
  input(btn, true);
  if (/^(up|down|left|right)$/.test(btn)){
    padRepeat[id] = setTimeout(function rep(){
      if (padPtr[id] !== btn) return;
      input(btn, true);
      padRepeat[id] = setTimeout(rep, 90);
    }, 380);
  }
});
function padUp(e){
  var btn = padPtr[e.pointerId];
  if (!btn) return;
  clearTimeout(padRepeat[e.pointerId]);
  delete padPtr[e.pointerId];
  input(btn, false);
}
padEl.addEventListener('pointerup', padUp);
padEl.addEventListener('pointercancel', padUp);
padEl.addEventListener('pointerleave', padUp);
/* Enter or Space on a focused button arrives as a click with no pointer
   behind it. A pointer's own click has already been handled on the way
   down. */
padEl.addEventListener('click', function(e){
  if (e.detail !== 0) return;
  var b = e.target.closest('[data-btn]'); if (!b) return;
  var btn = b.getAttribute('data-btn');
  input(btn, true); input(btn, false);
});
/* In 3D these buttons are clipped out of sight, so focus has to show up
   on the machine instead: the control it belongs to lights up. */
padEl.addEventListener('focusin', function(e){
  var b = e.target.closest('[data-btn]');
  emit('focus', { btn: b ? b.getAttribute('data-btn') : null });
});
padEl.addEventListener('focusout', function(){
  setTimeout(function(){
    if (!padEl.contains(document.activeElement)) emit('focus', { btn:null });
  }, 0);
});

/* ── deep links ───────────────────────────────────────────────── */

var writingHash = false;
function setHash(h){
  writingHash = true;
  var next = h ? '#' + h : ' ';
  if (h) history.replaceState(null, '', '#' + h);
  else history.replaceState(null, '', location.pathname + location.search);
  writingHash = false;
}
function readHash(){
  var h = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!h) return false;
  var parts = h.split('/'), i, j;
  for (i=0;i<SECTIONS.length;i++){
    if (SECTIONS[i].id !== parts[0]) continue;
    APP.sec = APP.menuSel = i; APP.view = 'list'; APP.item = 0;
    if (parts[1]) for (j=0;j<SECTIONS[i].items.length;j++)
      if (SECTIONS[i].items[j].id === parts[1]){ APP.item = j; APP.view = 'item'; }
    return true;
  }
  return false;
}

/* ── go ───────────────────────────────────────────────────────── */

pickGrid();
window.addEventListener('resize', function(){ pickGrid(); });

/* The hash was only ever read once, on the way in, so a deep link
   pasted into the bar of a page that was already open did nothing and
   the back button walked through hashes without moving the machine.
   writingHash guards the ones we set ourselves. */
window.addEventListener('hashchange', function(){
  if (writingHash) return;
  if (SLOT.on) ejectPanel();
  if (readHash()){ APP.scroll = 0; sfx('open'); dirty(); }
  else toMenu(true);
});

/* A deep link arrives rather than boots, reduced motion goes straight
   to the menu, and everyone else gets the self test once and the short
   boot after that. */
var deep = readHash();
if (deep){ /* readHash has already put the machine where the link points */ }
else if (reduced){ APP.view = 'menu'; }
else {
  startBoot(!remembered('irz.booted'));
  /* The boot is a thing to watch, so it does not start until there is a
     machine to watch it on. It used to run from the moment this script
     evaluated, which on a cold load meant the whole self test played out
     behind WARMING UP while Three.js was still downloading. ready()
     starts the clock; if the render never arrives, this does. */
  APP.bootAt = Infinity;
  setTimeout(function(){ if (APP.view === 'boot' && APP.bootAt === Infinity){ APP.bootAt = performance.now(); dirty(); } }, 6000);
}
dirty(); tick();

if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){
  G.cols = 0; pickGrid(); dirty();
});

/* what the 3D module needs from in here */
window.IRZ = {
  canvas: cv,
  press: press,
  /* The one way in for a button, down and up, from anywhere. */
  input: input,
  /* Subscribe to what the machine reports: hold, palette, volume, hint,
     focus, power. State that a late subscriber needs to start from —
     where the volume wheel is, what should be lit — is handed over on
     subscription, so the render never starts out of step with the
     screen. */
  on: function(type, fn){
    (listeners[type] || (listeners[type] = [])).push(fn);
    try {
      if (type === 'hint') fn({ btns:coachHints() });
      if (type === 'volume') fn({ level:APP.vol, levels:VOLS.length - 1 });
    } catch(e){}
  },
  /* Kept for anything still calling it: the edges of a held button, for
     a cartridge. input() is the thing to use. */
  hold: function(btn, down){ if (APP.view === 'cart') cartHold(btn, down); },
  rev: function(){ return APP.rev; },
  glow: function(){ return PALETTES[APP.palIdx].glow; },
  /* How far the backlight is down right now, 0..1. The 3D shell pulls
     its own lights down by the same amount, so the failure reads as
     the room and not as the toy. */
  dip: function(){ return dip; },
  powered: function(){ return APP.power; },
  sound: function(){ return APP.sound; },
  volume: function(){ return APP.vol; },
  fitGrid: function(px){ screenPx = px; pickGrid(); },
  ready: function(){
    document.getElementById('warming').hidden = true;
    if (APP.view === 'boot' && APP.bootAt === Infinity){ APP.bootAt = performance.now(); dirty(); }
  }
};
})();