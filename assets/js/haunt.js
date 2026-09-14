/* The part of the machine that is not well.

   Everything unsettling this site does lives in this file, so it can be
   read, tuned or switched off in one place, and so none of it is
   tangled into the code that shows the portfolio.

   The rules it keeps:
   - It never takes a button away, never hides a word of the portfolio
     for longer than a glance, never flashes, and never pretends to be
     the browser or the operating system.
   - It escalates slowly. A disturbance score rises with time on the
     page (much faster on the DREAD panel, which is the one that is
     failing), with repeat visits, with the darker work, with power
     cycles. Most visitors see nothing at all in the first minute.
   - Visual faults belong to DREAD. The other palettes are what a working
     panel looks like, so turning the contrast dial is always a way out.
   - Under reduced motion anything that moves or fades is dropped; what
     is left is words that are slightly wrong.
   - The only thing it remembers between visits is how many there have
     been.

   It is handed an api by console.js and draws through it; it never
   reaches into the console's state on its own.
   Part of IudexRyze. See README.md for how the pieces fit. */

export function createHaunt(api){
  'use strict';
  var reduced = api.reduced;

  var visits = parseInt(api.remembered('irz.visits'), 10) || 0;
  api.remember('irz.visits', String(visits + 1));

  /* A returning visitor starts a little further in, but never past the
     second level on visits alone: the rest has to happen in the room. */
  var score = Math.min(40, visits * 6);
  /* ?haunt=0..4 starts the page at that level, for tuning. Waiting eight
     minutes on the DREAD panel to check one effect is not a workflow. */
  var forced = location.search.match(/[?&]haunt=([0-4])/);
  if (forced) score = [0, 12, 30, 60, 100][+forced[1]];
  var LEVELS = ['NOMINAL', 'DRIFTING', 'UNSTABLE', 'COMPROMISED', 'AWARE'];
  function level(){ return score < 12 ? 0 : score < 30 ? 1 : score < 60 ? 2 : score < 100 ? 3 : 4; }
  function sick(){ return api.pal().name === 'DREAD'; }

  /* Time is the slowest pressure. On DREAD a level is a few minutes;
     on a healthy panel it is most of a quarter of an hour. */
  setInterval(function(){
    if (document.hidden || !api.power()) return;
    score += sick() ? 1 : 0.35;
    maybe();
  }, 5000);

  /* The work that is about something wrong weighs more than the rest. */
  var WEIGHT = { 'work/phantom-parry':8, 'work/echolocate':5, 'art/renders':5, 'art/final-boss':3 };
  var seenItems = {};

  /* What a section's line of copy says for the length of a glance.
     Atmosphere, not a claim about the work: none of them states a fact. */
  var ALT = {
    about:'who is holding you', work:'five games and a name', tools:'seven windows, one facing in',
    art:'the half that stays awake', arcade:'nobody finishes the ninth',
    code:'do not open the last one', contact:'the fastest ways out'
  };

  var gloss = null, titleSwap = null, stuck = null;
  var lastGloss = 0, lastWatcher = 0, lastInput = performance.now();
  var idleShown = false, hiddenAt = 0, returned = false;
  var nineOnBoot = Math.random() < 0.05;

  function later(ms){ setTimeout(api.dirty, ms + 20); }

  function maybe(){
    var now = performance.now(), L = level();

    /* Nobody idles into a flicker: the message only arrives while the
       machine sits on its home screen, untouched, on the failing panel. */
    if (L >= 4 && sick() && api.view() === 'menu' && !idleShown && now - lastInput > 45000){
      idleShown = true; api.dirty();
    }

    if (api.view() !== 'menu' || api.transitioning()) return;

    if (L >= 1 && now - lastGloss > 70000 && Math.random() < 0.22){
      lastGloss = now;
      var secs = api.sections(), i = Math.floor(Math.random() * secs.length), alt = ALT[secs[i].id];
      if (alt){
        var hold = reduced ? 1400 : 700;
        gloss = { i:i, text:alt, until:now + hold };
        api.dirty(); later(hold);
      }
    }
    if (L >= 2 && sick() && !titleSwap && Math.random() < 0.08){
      titleSwap = { text:'USERS 2', until:now + 450 };
      api.dirty(); later(450);
      setTimeout(function(){ titleSwap = null; }, 470);
    }
    /* One dot that has stopped answering. It stays for the session, and
       only shows on the panel that is failing. */
    if (L >= 2 && !stuck){
      stuck = { x:40 + Math.floor(Math.random() * 240), y:30 + Math.floor(Math.random() * 220) };
    }
  }

  /* ↑↑↓↓←→←→ B A. Of course. */
  var KONAMI = ['up','up','down','down','left','right','left','right','b','a'], kpos = 0;

  function note(type, d){
    var now = performance.now();
    if (type === 'input'){
      lastInput = now;
      if (idleShown){ idleShown = false; api.dirty(); }
      kpos = d === KONAMI[kpos] ? kpos + 1 : (d === KONAMI[0] ? 1 : 0);
      if (kpos === KONAMI.length){ kpos = 0; score += 15; return 'diagnostics'; }
      return null;
    }
    if (type === 'view' && d && d.item){
      var key = d.sec + '/' + d.item;
      if (!seenItems[key]){ seenItems[key] = true; score += WEIGHT[key] || 0.6; }
    }
    if (type === 'menu') score += 0.5;
    if (type === 'power') score += d ? 2 : 6;
    if (type === 'cart') score += 3;
    if (type === 'palette' && d === 'DREAD') score += 2;
    /* The figure in the glass only ever comes at the end of a dip that
       was going to happen anyway, so the flicker explains itself. */
    if (type === 'dipEnd' && level() >= 3 && sick() && !reduced &&
        now - lastWatcher > 80000 && Math.random() < 0.3){
      lastWatcher = now;
      api.emit('anomaly', { kind:'watcher' });
    }
    /* Very rarely a move is answered twice, the second one quieter, as
       if something else pressed the pad a moment after you did. */
    if (type === 'sfx' && d === 'move' && level() >= 2 && sick() && api.soundOn() && Math.random() < 0.035){
      setTimeout(function(){ api.tone(600, 0.05, 'triangle', 0.016); }, 380 + Math.random() * 120);
    }
    return null;
  }

  document.addEventListener('visibilitychange', function(){
    if (document.hidden){ hiddenAt = performance.now(); return; }
    var away = hiddenAt ? performance.now() - hiddenAt : 0;
    hiddenAt = 0;
    if (!returned && away > 20000 && level() >= 4 && sick() && api.power()){
      returned = true;
      var s = Math.round(away / 1000), m = Math.floor(s / 60), r = s % 60;
      api.osd('', 0, 0, 'YOU WERE GONE ' + (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r);
    }
  });

  function two(n){ return (n < 10 ? '0' : '') + n; }

  return {
    level: level,
    note: note,

    gloss: function(i, text){
      return gloss && gloss.i === i && performance.now() < gloss.until ? gloss.text : text;
    },

    title: function(text){
      if (titleSwap && performance.now() < titleSwap.until) return titleSwap.text;
      /* The clock is right, nearly always. */
      if (level() >= 1 && /^\d\d:\d\d/.test(text) && Math.random() < 0.004) return '03:33' + text.slice(5);
      return text;
    },

    footer: function(){
      return idleShown && api.view() === 'menu' ? 'STILL THERE?' : null;
    },

    faceChance: function(){ return level() >= 3 ? 0.34 : 0.20; },

    overlay: function(ctx){
      if (!stuck || !sick()) return;
      ctx.fillStyle = api.shade(3);
      ctx.fillRect(stuck.x * 3, stuck.y * 3, 6, 6);          // two dots square: one is below what the eye resolves at this size
    },

    /* The self test knows a few things it should not. */
    post: function(lines, t, leader, w){
      var out = lines.slice(), h = new Date().getHours();
      if (nineOnBoot && t < 1050){
        out[3] = { t:out[3].t.replace(/\d+ TITLES/, function(m){ return (parseInt(m, 10) + 1) + ' TITLES'; }), s:out[3].s };
      }
      if (h < 5) out.push({ t:leader('CLOCK', 'IT IS LATE', w), s:3 });
      else if (visits >= 5) out.push({ t:leader('OBSERVER', '1', w), s:2 });
      return out;
    },

    /* A panel that has held one picture for too long keeps a ghost of it
       after the power goes. What it keeps is not the menu. */
    afterimage: function(ctx, age, CW, CH){
      if (level() < 3 || !sick() || reduced || age > 1400) return;
      var a = 0.24 * (1 - age / 1400);                  // blurred, so it has to be stronger to be there at all
      ctx.save();
      ctx.filter = 'blur(' + Math.round(CW * 0.02) + 'px)';   // a ghost has no edges
      ctx.fillStyle = 'rgba(2,3,1,' + a.toFixed(3) + ')';
      [-1, 1].forEach(function(sg){
        ctx.beginPath(); ctx.ellipse(CW / 2 + sg * CW * 0.225, CH * 0.38, CW * 0.07, CW * 0.095, 0, 0, 7); ctx.fill();
      });
      ctx.beginPath(); ctx.ellipse(CW / 2, CH * 0.72, CW * 0.15, CH * 0.11, 0, 0, 7); ctx.fill();
      ctx.restore();
    },

    /* ── DIAGNOSTICS ────────────────────────────────────────────────
       A real readout, not a costume. Everything on it is measured from
       the machine as it runs: how many draw calls the last frame took —
       which drops to a handful while a game plays, because only the
       glass is being redrawn — how many shader programs the scene
       compiled, which GPU is doing it, how fast the panel is painting.
       The last line is the only one that is not measuring hardware. */
    diagnostics: (function(){
      var frames = [];
      return function(){
        var now = performance.now(), G = api.G();
        frames.push(now);
        while (frames.length && now - frames[0] > 1000) frames.shift();

        var dev = window.__irzDevice, info = dev && dev.renderer.info, gpuName = 'NONE';
        try {
          var gl = dev && dev.renderer.getContext();
          if (gl){
            var ext = gl.getExtension('WEBGL_debug_renderer_info');
            gpuName = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
          }
        } catch(e){}
        /* "ANGLE (AMD, AMD Radeon(TM) Graphics (0x1636) Direct3D11 vs_5_0 ...)"
           is the card, the device id and the translation layer. The card
           is the part worth a line on a small screen. */
        gpuName = String(gpuName).replace(/^ANGLE \(/, '').replace(/\s*\(0x[0-9a-f]+\).*$/i, '')
          .replace(/,\s*(Direct3D|D3D|OpenGL|Vulkan|Metal).*$/i, '').replace(/^([^,]+),\s*\1\b/i, '$1')
          .replace(/\s+/g, ' ').trim().toUpperCase();

        var up = Math.floor(now / 1000);
        var W = G.cols - 13;
        var rows = [
          ['UPTIME',    two(Math.floor(up / 3600)) + ':' + two(Math.floor(up / 60) % 60) + ':' + two(up % 60)],
          ['PANEL',     G.cols + 'X' + G.rows + ' CELLS  960X864'],
          ['PAINTS',    frames.length + ' PER SECOND'],
          ['PALETTE',   api.pal().name],
          ['GPU',       gpuName],
          ['LAST FRAME', info ? info.render.calls + ' DRAWS  ' + info.render.triangles + ' TRIS' : 'FLAT CONSOLE'],
          ['PROGRAMS',  info ? String(info.programs ? info.programs.length : '-') : '-'],
          ['TEXTURES',  info ? String(info.memory.textures) : '-'],
          ['PIXELS',    'DPR ' + (Math.round(devicePixelRatio * 100) / 100)],
          ['MOTION',    reduced ? 'REDUCED' : 'FULL'],
          ['SESSIONS',  String(visits + 1)],
          ['STABILITY', LEVELS[level()]]
        ];

        api.titleBar('DIAGNOSTICS', 'IRZ-OS 2.6');
        var v = api.viewport(), step = v.rows >= rows.length * 2 ? 2 : 1;
        var top = v.top + Math.max(0, Math.floor((v.rows - rows.length * step) / 2));
        for (var i = 0; i < rows.length && i * step < v.rows; i++){
          var row = top + i * step, val = rows[i][1];
          api.put(1, row, rows[i][0], 2);
          api.put(12, row, val.length > W ? val.slice(0, W) : val, i === rows.length - 1 && level() >= 3 ? 3 : 3);
        }
        api.footBar([{ key:'B', label:'EXIT' }]);
      };
    })()
  };
}
