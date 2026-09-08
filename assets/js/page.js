/* The arcade manifest, the game overlay, the outline rail and the
   scroll spy that drives the tabs and the status bar.
   Part of Varun Saini's portfolio. The console at index.html is the
   front door; this is the same work as a plain document. */

(function () {
  'use strict';

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Cabinet boot log ────────────────────────────────────────
     The single piece of non-interactive motion on the page. It
     runs once, then stops. */
  var LOG = [
    'neural link  <b>handshake ok</b>',
    'pilot        <i>JACK COOPER</i>',
    'titan        BT-7274, vanguard class',
    'protocol     3 &mdash; <i>protect the pilot</i>',
    'combat net   <b>standing by</b>'
  ];

  var logEl = document.querySelector('[data-log]');
  if (logEl) {
    if (reduced) {
      logEl.innerHTML = LOG.join('<br>');
    } else {
      var i = 0;
      (function step() {
        logEl.innerHTML = LOG.slice(0, i + 1).join('<br>') + '<span class="cur"></span>';
        if (++i < LOG.length) setTimeout(step, 260);
      })();
    }
  }

  /* ── The arcade ──────────────────────────────────────────────
     One record per playable, and everything else — the overlay
     chrome, the deep link, the counts in the status bar — reads
     from here. Adding a game is this object plus a card. */
  /* input  — 'keyboard' still works by touch but wants real keys.
     shape  — 'fluid' reflows to any window; 'fixed' would letterbox.
     Together these decide what the overlay says up front, and the badge
     printed on the card so nobody finds out only after tapping. Every
     game here reflows now, so the only remaining advice is about BT's
     typed command line. */
  var GAMES = {
    'bt-7274n': {
      name: 'BT-7274 // VANGUARD NEURAL LINK',
      title: 'BT-7274N — playable terminal roguelike',
      src: 'play/bt-7274n/index.html',
      source: 'https://github.com/iudexryze/portfolio/tree/main/play/bt-7274n',
      input: 'keyboard', shape: 'fluid', minWidth: 0
    },
    'drift-lander': {
      name: 'DRIFT LANDER // DESCENT',
      title: 'Drift Lander — playable physics lander',
      src: 'play/drift-lander/index.html',
      source: 'https://github.com/iudexryze/portfolio/tree/main/play/drift-lander',
      input: 'touch', shape: 'fluid', minWidth: 0
    },
    'circuit-breaker': {
      name: 'CIRCUIT BREAKER // ROUTING',
      title: 'Circuit Breaker — playable routing puzzle',
      src: 'play/circuit-breaker/index.html',
      source: 'https://github.com/iudexryze/portfolio/tree/main/play/circuit-breaker',
      input: 'touch', shape: 'fluid', minWidth: 0
    },
    'overclock': {
      name: 'OVERCLOCK // ARENA',
      title: 'Overclock — playable arena dodger',
      src: 'play/overclock/index.html',
      source: 'https://github.com/iudexryze/portfolio/tree/main/play/overclock',
      input: 'touch', shape: 'fluid', minWidth: 0
    },
    'disco-race': {
      name: 'DISCO RACE // 124 BPM',
      title: 'Disco Race — playable rhythm lane racer',
      src: 'play/disco-race/index.html',
      source: 'https://github.com/iudexryze/disco-race',
      input: 'touch', shape: 'fluid', minWidth: 0
    },
    'refactor': {
      name: 'REFACTOR // PLANARITY',
      title: 'Refactor — playable graph untangling puzzle',
      src: 'play/refactor/index.html',
      source: 'https://github.com/iudexryze/refactor',
      input: 'touch', shape: 'fluid', minWidth: 0
    },
    'heap': {
      name: 'HEAP // STACK',
      title: 'Heap — playable precision stacking game',
      src: 'play/heap/index.html',
      source: 'https://github.com/iudexryze/heap',
      input: 'touch', shape: 'fluid', minWidth: 0
    },
    'mutex': {
      name: 'MUTEX // CRITICAL SECTION',
      title: 'Mutex — playable timing game',
      src: 'play/mutex/index.html',
      source: 'https://github.com/iudexryze/mutex',
      input: 'touch', shape: 'fluid', minWidth: 0
    }
  };

  /* Coarse pointer is the honest test for "no keyboard attached" —
     screen width is not, since a small window on a laptop is still a
     laptop, and a tablet with a keyboard is not a phone. */
  var coarse = matchMedia('(pointer: coarse)').matches;

  function problems(game) {
    var out = [];
    if (game.input === 'keyboard' && coarse) {
      out.push('Every order is typed at a command line. It works on a phone keyboard, but it is slow going next to real keys.');
    }
    if (game.shape === 'fixed' && innerHeight > innerWidth && coarse) {
      out.push('It lays out in landscape. Turn your phone sideways and it will fill the screen.');
    }
    if (game.minWidth && innerWidth < game.minWidth) {
      out.push('It wants about ' + game.minWidth + 'px of width; this window is ' + innerWidth + 'px.');
    }
    return out;
  }

  function bestOn(game) {
    if (game.input === 'keyboard') return { cls: 'desk', label: 'Better on desktop' };
    if (game.shape === 'fixed') return { cls: 'wide', label: 'Landscape' };
    return { cls: 'any', label: 'Any device' };
  }

  /* ── Launcher ────────────────────────────────────────────────
     The iframe stays on about:blank until asked, so nothing loads
     and nothing steals focus for a visitor who never plays. */
  var launcher  = document.querySelector('[data-launcher]');
  var frame     = document.querySelector('[data-frame]');
  var app       = document.querySelector('.app');
  var nameEl    = document.querySelector('[data-launcher-name]');
  var tabLink   = document.querySelector('[data-launcher-tab]');
  var noticeWhat = document.querySelector('[data-notice-what]');
  var noticeList = document.querySelector('[data-notice-list]');
  var noticeSrc  = document.querySelector('[data-notice-source]');
  var lastFocus = null, currentSlug = null, overridden = false;

  function evaluate() {
    if (!currentSlug) return;
    var game = GAMES[currentSlug];
    var list = overridden ? [] : problems(game);
    launcher.setAttribute('data-notice', list.length ? 'true' : 'false');
    if (!list.length) return;

    noticeWhat.textContent = game.title.split(' \u2014 ')[0] +
      ' runs fine here, but this is not the device it is best on.';
    noticeList.innerHTML = '';
    list.forEach(function (line) {
      var li = document.createElement('li');
      li.textContent = line;
      noticeList.appendChild(li);
    });
  }

  function openGame(slug, trigger) {
    var game = GAMES[slug];
    if (!game) return;

    lastFocus = trigger || document.activeElement;
    currentSlug = slug;
    overridden = false;

    nameEl.textContent = game.name;
    frame.setAttribute('title', game.title);
    tabLink.setAttribute('href', game.src);
    noticeSrc.setAttribute('href', game.source);

    evaluate();
    /* Reload even when it is the same game, so "play again" restarts
       rather than resuming whatever state the last session left. */
    frame.setAttribute('src', game.src);

    launcher.setAttribute('data-open', 'true');
    app.inert = true;
    document.querySelector('[data-close]').focus();
    history.replaceState(null, '', '?play=' + slug);
  }

  function closeGame() {
    app.inert = false;
    launcher.setAttribute('data-open', 'false');
    /* Drop the iframe: a canvas game left running behind an invisible
       overlay keeps a rAF loop and a fan spinning for no one. */
    frame.setAttribute('src', 'about:blank');
    currentSlug = null;
    if (document.fullscreenElement) document.exitFullscreen();
    history.replaceState(null, '', location.pathname);
    if (lastFocus && lastFocus.isConnected) lastFocus.focus();
  }

  document.querySelectorAll('[data-launch]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openGame(btn.getAttribute('data-launch'), btn);
    });
  });
  document.querySelector('[data-close]').addEventListener('click', closeGame);

  document.querySelector('[data-fullscreen]').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (launcher.requestFullscreen) launcher.requestFullscreen();
  });

  /* The notice is advice, not a gate: anyone who wants to try it on a
     phone anyway is allowed to, and the choice lasts until they leave. */
  document.querySelector('[data-anyway]').addEventListener('click', function () {
    overridden = true;
    evaluate();
  });
  document.querySelector('[data-close-notice]').addEventListener('click', closeGame);

  /* Turning the phone sideways should clear the orientation warning by
     itself, without anyone having to back out and tap again. */
  addEventListener('resize', evaluate);
  addEventListener('orientationchange', function () { setTimeout(evaluate, 250); });

  /* Print each game's badge from the same record the warning reads, so
     the card and the overlay can never claim different things. */
  document.querySelectorAll('.game-screen[data-launch]').forEach(function (btn) {
    var game = GAMES[btn.getAttribute('data-launch')];
    if (!game) return;
    var fit = bestOn(game);
    var tag = document.createElement('span');
    tag.className = 'fits ' + fit.cls;
    tag.textContent = fit.label;
    btn.parentNode.insertBefore(tag, btn.nextSibling);
  });

  /* Esc closes. While the game has focus inside the iframe it owns
     its own keys, so the click-out and the button are the reliable
     exits; this covers the case where focus is still on the chrome. */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && launcher.getAttribute('data-open') === 'true') closeGame();
  });

  /* ?play=<slug> boots straight into a game, so a single link can be
     handed to someone who only wants to see the thing run. */
  var wanted = (location.search.match(/[?&]play=([\w-]+)/) || [])[1];
  if (wanted && GAMES[wanted]) openGame(wanted, null);

  /* ── Rail groups ─────────────────────────────────────────── */
  document.querySelectorAll('.rail-head').forEach(function (head) {
    head.addEventListener('click', function () {
      head.setAttribute('aria-expanded', head.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
    });
  });

  /* ── Tool disclosures ────────────────────────────────────── */
  document.querySelectorAll('.tool-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      document.getElementById(btn.getAttribute('aria-controls')).hidden = open;
    });
  });

  /* ── Scroll spy: drives the tabs, the rail and the status bar ─ */
  var content   = document.querySelector('.content');
  var sections  = [].slice.call(document.querySelectorAll('.section'));
  var tabs      = [].slice.call(document.querySelectorAll('.tab'));
  var railLinks = [].slice.call(document.querySelectorAll('.rail-link'));
  var targets   = [].slice.call(document.querySelectorAll('.entry[id], .tool[id], .game[id], .repo[id], .cabinet[id]'));
  var statusEl  = document.querySelector('[data-status-section]');

  var LABEL = {
    top: 'Top', work: 'Work', arcade: 'Arcade', tools: 'Editor tools',
    art: 'Art & other', code: 'Code', about: 'About', contact: 'Contact'
  };

  /* Counted from the page rather than typed into it, so the footer
     cannot drift out of date the next time a game is added. */
  function count(sel) { return document.querySelectorAll(sel).length; }
  var counts = {
    play: Object.keys(GAMES).length,
    tools: count('.tool'),
    repos: count('.repo')
  };
  Object.keys(counts).forEach(function (k) {
    var el = document.querySelector('[data-count-' + k + ']');
    if (el) el.textContent = counts[k];
  });

  /* A section counts as current once you have entered it. */
  function currentSection() {
    var best = sections[0], bestY = Infinity;
    sections.forEach(function (el) {
      var y = el.getBoundingClientRect().top - 90;
      if (y <= 0 && Math.abs(y) < bestY) { bestY = Math.abs(y); best = el; }
    });
    return best;
  }

  /* A rail entry is the one sitting nearest the top of the column,
     above or below — otherwise the rail lags a section behind. */
  function currentEntry() {
    var best = null, bestY = Infinity;
    targets.forEach(function (el) {
      var d = Math.abs(el.getBoundingClientRect().top - 110);
      if (d < bestY) { bestY = d; best = el; }
    });
    return best;
  }

  var ticking = false;
  function sync() {
    ticking = false;

    var sec = currentSection();
    var id  = sec ? sec.id : 'top';
    tabs.forEach(function (t) {
      t.setAttribute('aria-current', t.getAttribute('data-tab') === id ? 'true' : 'false');
    });
    if (statusEl) statusEl.textContent = LABEL[id] || 'Top';

    var item = currentEntry();
    var href = item ? '#' + item.id : null;
    railLinks.forEach(function (l) {
      l.setAttribute('aria-current', l.getAttribute('href') === href ? 'true' : 'false');
    });
  }

  content.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(sync); }
  }, { passive: true });
  sync();

  /* In-page links scroll the content column rather than the document,
     and open a tool's panel when the target is a collapsed tool. */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href').slice(1);
      var el = id && document.getElementById(id);
      if (!el) return;
      e.preventDefault();

      if (el.classList.contains('tool')) {
        var btn = el.querySelector('.tool-btn[aria-expanded="false"]');
        if (btn) btn.click();
      }

      var y = el.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop - 16;
      content.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
      history.replaceState(null, '', '#' + id);
    });
  });

  /* Deep link on load — after webfonts land. Measuring before Plex
     swaps in lands the scroll short, because the whole column
     reflows underneath it. */
  function goToHash() {
    if (!location.hash) { sync(); return; }
    var target = document.getElementById(location.hash.slice(1));
    if (!target) { sync(); return; }
    if (target.classList.contains('tool')) {
      var tb = target.querySelector('.tool-btn[aria-expanded="false"]');
      if (tb) tb.click();
    }
    /* Jump, do not animate: smooth scrolling applies to programmatic
       scrollTop as well, and a deep link should arrive, not travel. */
    content.style.scrollBehavior = 'auto';
    content.scrollTop += target.getBoundingClientRect().top - content.getBoundingClientRect().top - 16;
    content.style.scrollBehavior = '';
    sync();
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(goToHash);
  } else {
    addEventListener('load', goToHash);
  }

  /* Back/forward and externally set hashes land too. The in-page links
     handle their own scrolling, so this only fires for navigation the
     page did not originate. */
  addEventListener('hashchange', goToHash);
})();
