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
  falloff();
}

/* No LCD is evenly lit. The corners fall away from the viewing angle
   and the reflector never quite reaches the edge of the glass, so an
   even rectangle of colour is the giveaway that it is not a panel. */
function falloff(){
  /* On DREAD the backlight is going: the hot spot is off-centre and the
     corners are much further gone. Every other palette gets an evenly
     lit panel, so the contrast dial is a way out of here. */
  var sick = pal.name === 'DREAD', k = sick ? 2.2 : 1;
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
  if (t > 1350){
    ctx.font = screenFont(Math.round(CW_PX*0.026));
    ctx.fillStyle = shade(2);
    ctx.fillText('(C) 2026  VARUN SAINI   BANGALORE', CW_PX/2, CH_PX - G.ch);
  }
  ctx.restore();
  matrix();
  legend('booting');
  if (t > 1900) toMenu(true);
}

/* ── paint ────────────────────────────────────────────────────── */

function paint(){
  if (!APP.power){ drawOff(); APP.rev++; return; }
  if (APP.view === 'boot'){ drawBoot(performance.now() - APP.bootAt); APP.rev++; return; }
  frame();
  if (APP.view === 'menu') drawMenu();
  else if (APP.view === 'list') drawList();
  else drawItem();
  matrix();
  APP.rev++;
}

function tick(){
  if (needsPaint || APP.view === 'boot'){
    if (APP.view !== 'boot') needsPaint = false;
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
function sfx(kind){
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
  tone(880, 0.04, 'triangle');
  dirty();
}

function press(btn){
  if (btn === 'power'){
    APP.power = !APP.power;
    if (APP.power){ APP.view = 'boot'; APP.bootAt = performance.now(); sfx('boot'); }
    else sfx('off');
    dirty(); return;
  }
  if (!APP.power) return;
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

/* ── the cartridge slot: a game, running full frame ───────────── */

var cart = document.getElementById('cart'),
    cartFrame = document.getElementById('cart-frame'),
    cartName = document.getElementById('cart-name'),
    cartOpen = false, cartReturn = null;

function launch(slug){
  var it = null, i, j;
  for (i=0;i<SECTIONS.length;i++) for (j=0;j<SECTIONS[i].items.length;j++)
    if (SECTIONS[i].items[j].id === slug) it = it || SECTIONS[i].items[j];
  cartName.textContent = (it ? it.name : slug).toUpperCase();
  cartFrame.title = (it ? it.name : slug) + ' — playable in the browser';
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
window.addEventListener('keydown', function(e){
  if (cartOpen){ if (e.key === 'Escape'){ e.preventDefault(); eject(); } return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  var btn = null;
  if (e.key === 'Enter' && e.shiftKey) btn = 'start';
  else if (e.key === 'Escape') btn = APP.view === 'menu' ? null : 'b';
  else if (e.key === 'Shift') btn = 'select';
  else if (KEYS[e.key] !== undefined) btn = KEYS[e.key];
  if (e.key === 'p' || e.key === 'P') btn = 'power';
  if (!btn) return;
  e.preventDefault();
  press(btn);
});

var padEl = document.getElementById('pad');
padEl.addEventListener('click', function(e){
  var b = e.target.closest('[data-btn]'); if (!b) return;
  press(b.getAttribute('data-btn'));
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
  rev: function(){ return APP.rev; },
  glow: function(){ return PALETTES[APP.palIdx].glow; },
  powered: function(){ return APP.power; },
  sound: function(){ return APP.sound; },
  fitGrid: function(px){ screenPx = px; pickGrid(); },
  ready: function(){ document.getElementById('warming').hidden = true; }
};
})();