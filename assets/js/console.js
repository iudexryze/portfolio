/* The machine itself: the dot-matrix screen engine, the state it
   draws from, sound, navigation, input, deep links and the
   cartridge slot. Publishes window.IRZ for the 3D shell to drive.
   Part of IudexRzye. See README.md for how the pieces fit. */

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
  { name:'VANGUARD', a:'#0E1108', b:'#1C2A10', c:'#6FA82C', d:'#8FC93A', glow:'#8FC93A' }
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
  bootAt: 0,
  rev: 0
};
var itemMemory = {};     // last item looked at, per section

var needsPaint = true;
function dirty(){ needsPaint = true; }

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
function matrix(){
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = shade(1);
  var step = G.cw / 2, x;
  for (x = step; x < CW_PX; x += step) ctx.fillRect(Math.round(x), 0, 1, CH_PX);
  for (x = step; x < CH_PX; x += step) ctx.fillRect(0, Math.round(x), CW_PX, 1);
  ctx.globalAlpha = 1;
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
   flicker on a timer is a metronome. Only on DREAD: the other four
   palettes are what a working panel looks like, and the contrast dial
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
  g.addColorStop(0,    'rgba(10,14,5,0)');
  g.addColorStop(0.58, 'rgba(10,14,5,' + (0.045 * k).toFixed(3) + ')');
  g.addColorStop(0.85, 'rgba(9,13,4,'  + (0.130 * k).toFixed(3) + ')');
  g.addColorStop(1,    'rgba(8,12,4,'  + (0.240 * k).toFixed(3) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW_PX, CH_PX);
}

/* ── screens ──────────────────────────────────────────────────── */

function sec(){ return SECTIONS[APP.sec]; }
function item(){ return sec().items[APP.item]; }

function drawMenu(){
  var v = viewport(), i, row = v.top;
  titleBar('IudexRzye', PALETTES[APP.palIdx].name);

  var wide = G.cols >= 40;
  if (wide && v.rows > 9){
    put(1, row, 'VARUN SAINI', 3); row++;
    put(1, row, 'GAME DEVELOPER / TECHNICAL ARTIST', 2); row++;
    rule(row, 2); row++;
  }

  // a tall panel gets air between and around the rows rather than a
  // pool of it underneath them
  var left = v.top + v.rows - row;
  var step = left >= SECTIONS.length * 2 ? 2 : 1;
  row += Math.max(0, Math.floor((left - SECTIONS.length * step) / 2));

  for (i=0;i<SECTIONS.length && row < v.top + v.rows; i++, row += step){
    var on = (i === APP.menuSel);
    if (on){ fillCells(1, row, G.cols-2, 1, 3); tri(1, row, 'r', 0); }
    put(3, row, SECTIONS[i].title, on ? 0 : 3);
    if (wide){
      var g = SECTIONS[i].gloss;
      put(G.cols - 2 - g.length, row, g, on ? 0 : 2);
    }
  }
  footBar([{icon:'ud',label:'MOVE'},{key:'A',label:'OPEN'},{key:'SEL',label:'COLOUR'}]);
  say('Main menu. ' + SECTIONS[APP.menuSel].title + ', ' + SECTIONS[APP.menuSel].gloss + '. ' + SECTIONS.length + ' sections.');
  legend('↑↓ move · A open · SELECT colour');
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
    var name = it.name.toUpperCase();
    put(3, row, name.slice(0, G.cols-6), on ? 0 : 3);
    if (wide && it.tag){
      var t = it.tag.toUpperCase();
      if (3 + name.length + 2 + t.length < G.cols - 3) put(G.cols - 3 - t.length, row, t, on ? 0 : 2);
    }
  }
  // measured in rows, so a double-spaced list still gets a true thumb
  scrollbar(v.top, v.rows, s.items.length * step, start * step);
  footBar([{icon:'ud',label:'MOVE'},{key:'A',label:'OPEN'},{key:'B',label:'BACK'},{icon:'lr',label:'SECTION'}]);
  say(s.title + ' section. Item ' + (APP.item+1) + ' of ' + s.items.length + ': ' + item().name + (item().tag ? ', ' + item().tag : '') + '.');
  legend('↑↓ move · A open · B back · ←→ section');
}

/* an item, laid out as lines, so scrolling is just an offset */
function itemLines(it){
  var W = G.cols - 3, lines = [], i, j;
  var head = it.name.toUpperCase();
  lines.push({t:head, s:3});
  var sub = [it.tag, it.status].filter(Boolean).join('  ');
  if (sub) lines.push({t:sub.toUpperCase(), s:2});
  lines.push({rule:true});
  for (i=0;i<(it.body||[]).length;i++){
    var w = wrap(it.body[i], W);
    for (j=0;j<w.length;j++) lines.push({t:w[j], s:3});
    lines.push({t:'', s:3});
  }
  if (it.props && it.props.length){
    lines.push({rule:true});
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
      lines.push({t:'', s:3});
    }
  }
  while (lines.length && lines[lines.length-1].t === '') lines.pop();
  return lines;
}

function drawItem(){
  var s = sec(), it = item(), v = viewport();
  var lines = itemLines(it);
  var max = Math.max(0, lines.length - v.rows);
  if (APP.scroll > max) APP.scroll = max;

  titleBar(s.title, (APP.item+1) + '/' + s.items.length);

  for (var i=0;i<v.rows;i++){
    var L = lines[APP.scroll + i]; if (!L) break;
    var row = v.top + i;
    if (L.rule){ rule(row, 2); continue; }
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

  var spoken = it.name + '. ' + (it.tag||'') + '. ' + (it.body||[]).join(' ');
  if (it.props) spoken += ' ' + it.props.map(function(p){ return p[0] + ': ' + p[1] + '.'; }).join(' ');
  say(spoken);
  legend('↑↓ scroll · ←→ item' + (acts[0] ? ' · A ' + acts[0].label.toLowerCase() : '') + ' · B back');
}

function drawOff(){
  ctx.fillStyle = '#1E2119'; ctx.fillRect(0,0,CW_PX,CH_PX);
  ctx.globalAlpha = .5; matrix(); ctx.globalAlpha = 1;
  say('The console is switched off. Press the power switch to turn it on.');
  legend('the machine is off');
}

/* ── boot ─────────────────────────────────────────────────────── */

var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function drawBoot(t){
  frame();
  var mid = CH_PX * 0.44;
  var drop = Math.min(1, Math.max(0, (t - 200) / 800));
  var e = 1 - Math.pow(1 - drop, 3);
  var y = -CH_PX*0.25 + (mid + CH_PX*0.25) * e;

  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = shade(3);
  ctx.font = Math.round(CW_PX*0.115) + 'px "Rubik Distressed", "IBM Plex Sans Condensed", sans-serif';
  ctx.fillText('IudexRzye', CW_PX/2, y);
  if (t > 1050){
    ctx.font = screenFont(Math.round(CW_PX*0.030));
    ctx.fillStyle = shade(2);
    ctx.fillText('P O R T F O L I O   S Y S T E M', CW_PX/2, mid + CH_PX*0.10);
  }
  /* A self test that finds something. The screen has been drawn as a
     failing panel since the first commit — the off-centre hot spot and
     the corners in falloff() are the same fiction — and it may as well
     say so on the way up. It reports honestly: turn the dial off DREAD
     and the next boot passes, because the other palettes are what a
     working panel looks like. */
  if (t > 1250){
    ctx.font = screenFont(Math.round(CW_PX*0.026));
    ctx.fillStyle = shade(2);
    ctx.fillText('PANEL SELF TEST', CW_PX/2, mid + CH_PX*0.19);
  }
  if (t > 1620){
    var sick = pal.name === 'DREAD';
    ctx.font = screenFont(Math.round(CW_PX*0.026));
    ctx.fillStyle = shade(sick ? 3 : 2);
    ctx.fillText(sick ? 'BACKLIGHT   DEGRADED' : 'BACKLIGHT   NOMINAL', CW_PX/2, mid + CH_PX*0.245);
  }
  if (t > 1350){
    ctx.font = screenFont(Math.round(CW_PX*0.026));
    ctx.fillStyle = shade(2);
    ctx.fillText('(C) 2026  VARUN SAINI   BANGALORE', CW_PX/2, CH_PX - G.ch);
  }
  ctx.restore();
  matrix();
  legend('booting');
  if (t > 2150) toMenu(true);
}

/* ── paint ────────────────────────────────────────────────────── */

function paint(){
  if (!APP.power){ drawOff(); APP.rev++; return; }
  if (APP.view === 'boot'){ drawBoot(performance.now() - APP.bootAt); APP.rev++; return; }
  if (APP.view === 'cart'){ drawCart(); APP.rev++; return; }
  frame();
  if (APP.view === 'menu') drawMenu();
  else if (APP.view === 'list') drawList();
  else drawItem();
  matrix();
  APP.rev++;
}

/* Boot animates and a running game animates, so neither can sit and
   wait for dirty() the way a menu does. */
function tick(){
  var live = APP.view === 'boot' || APP.view === 'cart';
  if (needsPaint || live){
    if (!live) needsPaint = false;
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

var actx = null;
function tone(freq, dur, type, vol){
  if (!APP.sound || !APP.power) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(vol || 0.045, actx.currentTime + 0.008);
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

function toMenu(silent){
  APP.view = 'menu'; APP.scroll = 0;
  if (!silent) sfx('back');
  setHash(''); dirty();
}
function openSection(i){
  APP.sec = i; APP.view = 'list';
  APP.item = itemMemory[sec().id] || 0;
  if (APP.item >= sec().items.length) APP.item = 0;
  APP.scroll = 0; sfx('open'); setHash(sec().id); dirty();
}
function openItem(){
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
  APP.palIdx = (APP.palIdx + 1) % PALETTES.length;
  pal = PALETTES[APP.palIdx];
  buzz('tick'); tone(880, 0.04, 'triangle');
  dirty();
}

function press(btn){
  if (btn === 'power'){
    if (SLOT.on) ejectPanel();
    APP.power = !APP.power;
    if (APP.power){ APP.view = 'boot'; APP.bootAt = performance.now(); sfx('boot'); }
    else sfx('off');
    dirty(); return;
  }
  if (!APP.power) return;

  /* A cartridge is on the panel. The dials and the switches still belong
     to the machine — turning the contrast while a game runs is half the
     point of having a dial — and everything else belongs to the game,
     which is driven from hold() rather than here so that a held button
     stays held. */
  if (APP.view === 'cart'){
    if (btn === 'start'){ ejectPanel(); return; }
    if (btn === 'contrast' || btn === 'select'){ cyclePalette(); return; }
    if (btn === 'volume'){
      APP.sound = !APP.sound;
      if (APP.sound) tone(760, 0.06, 'triangle');
      say(APP.sound ? 'Sound on.' : 'Sound off.');
      return;
    }
    return;
  }

  if (APP.view === 'boot'){
    if (btn === 'a' || btn === 'start' || btn === 'b') toMenu(true);
    return;
  }
  if (btn === 'contrast' || (btn === 'select' && APP.view !== 'item')){ cyclePalette(); return; }
  if (btn === 'volume'){
    APP.sound = !APP.sound;
    if (APP.sound) tone(760, 0.06, 'triangle');
    say(APP.sound ? 'Sound on.' : 'Sound off.');
    return;
  }
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
    else if (btn === 'left'){ APP.menuSel = APP.sec = (APP.sec + SECTIONS.length - 1) % SECTIONS.length; APP.item = 0; sfx('move'); setHash(sec().id); dirty(); }
    else if (btn === 'right'){ APP.menuSel = APP.sec = (APP.sec + 1) % SECTIONS.length; APP.item = 0; sfx('move'); setHash(sec().id); dirty(); }
    else if (btn === 'a') openItem();
    else if (btn === 'b'){ APP.menuSel = APP.sec; toMenu(); }
    return;
  }

  // item
  var it = item(), acts = it.actions || [], m = sec().items.length;
  if (btn === 'up'){ if (APP.scroll > 0){ APP.scroll--; sfx('move'); dirty(); } return; }
  if (btn === 'down'){ APP.scroll++; sfx('move'); dirty(); return; }
  if (btn === 'left'){ APP.item = (APP.item + m - 1) % m; APP.scroll = 0; itemMemory[sec().id] = APP.item; sfx('move'); setHash(sec().id + '/' + item().id); dirty(); return; }
  if (btn === 'right'){ APP.item = (APP.item + 1) % m; APP.scroll = 0; itemMemory[sec().id] = APP.item; sfx('move'); setHash(sec().id + '/' + item().id); dirty(); return; }
  if (btn === 'a'){ fire(acts[0]); return; }
  if (btn === 'select'){ acts[1] ? fire(acts[1]) : cyclePalette(); return; }
  if (btn === 'b'){ APP.view = 'list'; APP.scroll = 0; sfx('back'); setHash(sec().id); dirty(); return; }
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
   never accumulates. */
var ghost = document.createElement('canvas');
ghost.width = DOT_W; ghost.height = DOT_H;
var gctx = ghost.getContext('2d');

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
  SLOT.back = { view:APP.view, sec:APP.sec, item:APP.item, scroll:APP.scroll };
  slot = document.createElement('iframe');
  slot.className = 'slot';
  slot.setAttribute('aria-hidden', 'true');
  slot.setAttribute('tabindex', '-1');
  slot.src = BASE + 'play/' + slug + '/index.html';
  document.body.appendChild(slot);
  SLOT.on = true; SLOT.slug = slug; SLOT.cfg = cfg; SLOT.gcv = null;
  SLOT.held = {}; SLOT.cur = { x:0.5, y:0.5, down:false }; SLOT.t0 = performance.now();
  gctx.clearRect(0, 0, DOT_W, DOT_H);
  APP.view = 'cart';
  sfx('open');
  say(cartTitle(slug) + ' is running on the console screen. Play it with the D-pad and A. START ejects the cartridge.');
  legend(cartLegend(cfg));
  dirty();
}

function ejectPanel(){
  if (!SLOT.on) return;
  if (SLOT.cur && SLOT.cur.down) sendPointer('pointerup');
  if (slot && slot.parentNode) slot.parentNode.removeChild(slot);
  slot = null; SLOT.on = false; SLOT.gcv = null; SLOT.held = {};
  var b = SLOT.back || { view:'list', sec:APP.sec, item:APP.item, scroll:0 };
  APP.view = b.view === 'cart' ? 'list' : b.view;
  APP.sec = b.sec; APP.item = b.item; APP.scroll = b.scroll;
  sfx('back'); dirty();
}

/* Four shades chosen by how bright the game drew the pixel. The colour
   is not lost by accident: the panel has four shades and no hue, so a
   game running on the panel has four shades and no hue. */
function posterise(){
  var img = dctx.getImageData(0, 0, DOT_W, DOT_H), p = img.data, r = ramp(), i, y, s;
  for (i = 0; i < p.length; i += 4){
    y = (p[i]*77 + p[i+1]*151 + p[i+2]*28) >> 8;
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
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = shade(2);
  ctx.font = screenFont(Math.round(CW_PX*0.036));
  var n = 1 + (Math.floor((performance.now() - SLOT.t0) / 360) % 3);
  ctx.fillText('READING CARTRIDGE' + Array(n+1).join('.'), CW_PX/2, CH_PX*0.5);
  ctx.restore();
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
  if (ox || oy){ dctx.fillStyle = '#000'; dctx.fillRect(0, 0, DOT_W, DOT_H); }
  SLOT.box = { ox:ox, oy:oy, w:w, h:h };
  dctx.imageSmoothingEnabled = true;
  dctx.drawImage(g, 0, 0, g.width, g.height, ox, oy, w, h);
  dctx.globalAlpha = 0.34; dctx.drawImage(ghost, 0, 0); dctx.globalAlpha = 1;
  posterise();
  gctx.clearRect(0, 0, DOT_W, DOT_H); gctx.drawImage(dot, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(dot, 0, 0, DOT_W, DOT_H, 0, 0, CW_PX, CH_PX);
  ctx.imageSmoothingEnabled = true;
  if (SLOT.cfg.cursor) drawCursor();
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
  cartName.textContent = cartTitle(slug).toUpperCase();
  cartFrame.title = cartTitle(slug) + ' — playable in the browser';
  cartFrame.src = BASE + 'play/' + slug + '/index.html';
  cart.setAttribute('data-open', '');
  cartOpen = true; cartReturn = document.activeElement;
  document.getElementById('cart-eject').focus();
  sfx('open');
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
  if (e.key === 'Enter' && e.shiftKey) return 'start';
  if (e.key === 'Escape') return APP.view === 'menu' ? null : 'b';
  if (e.key === 'Shift') return 'select';
  if (e.key === 'p' || e.key === 'P') return 'power';
  return KEYS[e.key] !== undefined ? KEYS[e.key] : null;
}

/* A game needs to know when a button was let go, so while a cartridge
   is on the panel the keyboard drives hold() at both edges instead of
   press(). Escape is the way out either way. */
var downKeys = {};
window.addEventListener('keyup', function(e){
  if (!downKeys[e.key]) return;
  var btn = downKeys[e.key]; delete downKeys[e.key];
  if (APP.view === 'cart') cartHold(btn, false);
});
window.addEventListener('keydown', function(e){
  if (cartOpen){ if (e.key === 'Escape'){ e.preventDefault(); eject(); } return; }
  if (APP.view === 'cart'){
    if (e.key === 'Escape'){ e.preventDefault(); ejectPanel(); return; }
    var cb = btnFor(e);
    if (!cb) return;
    e.preventDefault();
    if (cb === 'start' || cb === 'power' || cb === 'contrast' || cb === 'select' || cb === 'volume'){
      if (!downKeys[e.key]) press(cb === 'select' ? 'contrast' : cb);
      downKeys[e.key] = cb;
      return;
    }
    if (downKeys[e.key]) return;        // the OS repeating a held key
    downKeys[e.key] = cb;
    cartHold(cb, true);
    return;
  }
  var btn = btnFor(e);
  if (!btn) return;
  e.preventDefault();
  press(btn);
});

var padEl = document.getElementById('pad');
padEl.addEventListener('click', function(e){
  var b = e.target.closest('[data-btn]'); if (!b) return;
  press(b.getAttribute('data-btn'));
});
/* A click is one event with no duration, which is fine for a menu and
   useless for a lander. Track the press itself as well. */
var padHeld = null;
padEl.addEventListener('pointerdown', function(e){
  var b = e.target.closest('[data-btn]'); if (!b) return;
  padHeld = b.getAttribute('data-btn');
  if (APP.view === 'cart') cartHold(padHeld, true);
});
function padRelease(){
  if (!padHeld) return;
  if (APP.view === 'cart') cartHold(padHeld, false);
  padHeld = null;
}
padEl.addEventListener('pointerup', padRelease);
padEl.addEventListener('pointercancel', padRelease);
padEl.addEventListener('pointerleave', padRelease);

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

var deep = readHash();
if (deep || reduced){ APP.view = deep ? APP.view : 'menu'; }
else { APP.view = 'boot'; APP.bootAt = performance.now(); }
dirty(); tick();

if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){
  G.cols = 0; pickGrid(); dirty();
});

/* what the 3D module needs from in here */
window.IRZ = {
  canvas: cv,
  press: press,
  /* The machine's own buttons, on the way down and on the way up. Only
     a cartridge cares about the difference, so it is a separate entry
     point rather than a change to press(). */
  hold: function(btn, down){ if (APP.view === 'cart') cartHold(btn, down); },
  rev: function(){ return APP.rev; },
  glow: function(){ return PALETTES[APP.palIdx].glow; },
  /* How far the backlight is down right now, 0..1. The 3D shell pulls
     its own lights down by the same amount, so the failure reads as
     the room and not as the toy. */
  dip: function(){ return dip; },
  powered: function(){ return APP.power; },
  sound: function(){ return APP.sound; },
  fitGrid: function(px){ screenPx = px; pickGrid(); },
  ready: function(){ document.getElementById('warming').hidden = true; }
};
})();