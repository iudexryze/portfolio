/* Everything the cartridge holds.

   One array. A section is {id, title, gloss, items}; an item is
   {id, name, tag, status, body, props, actions}; an action is either
   {label, href} or {label, launch} where launch is an arcade slug.
   Adding an entry needs nothing else, anywhere.
   Part of IudexRzye. See README.md for how the pieces fit. */

/* Where the rest of the site sits relative to this page. The content
   below builds links off it, and the cartridge slot loads games from
   it, so it lives here with the things that use it. */
export const BASE = './';

export const SECTIONS = [
{ id:'about', title:'ABOUT', gloss:'who is holding the pen', items:[
  { id:'profile', name:'Profile', tag:'Varun Saini',
    body:[
      'Game developer and technical artist in Bangalore, currently at Gameberry Labs building games at scale. Before that, ZVKY Design Studio, where I shipped two commercial slot games solo: gameplay systems, shader graphs and the whole delivery pipeline.',
      'The work I care about sits between code and craft. C# during the day, Blender at night. When a project stalls on something unglamorous, a build that got too big or a dependency graph nobody can read, I go and build the tool that answers it. That is where the seven editor windows came from.',
      'Most of my own time now goes into Project Phantom Parry, an eldritch horror game where I own the story, the design, the code and the sound.'],
    props:[['NOW','Gameberry Labs'],['BASE','Bangalore, India'],['STATUS','Open to work']],
    actions:[{label:'EMAIL', href:'mailto:varun2002saini19@gmail.com'}] },
  { id:'track', name:'Track', tag:'Where the time went',
    body:['Three entries, most recent first. The slot titles are the ones with a release date on them; everything else on this cartridge is either internal or mine.'],
    props:[
      ['MAR 2026','Gameberry Labs. Game developer.'],
      ['PRIOR','ZVKY Design Studio. Game developer, two slot titles shipped solo.'],
      ['DEGREE','REVA University. B.Tech, Electronics and Computer Engineering.']] },
  { id:'stack', name:'Stack', tag:'What I reach for',
    body:['Unity is the day job and Blender is the evening one. The third row is what university and side work left behind, in rough order of how recently I used it.'],
    props:[
      ['ENGINE','Unity, C#, shader graph, Addressables, editor tooling, animation systems'],
      ['3D','Blender, environment design, geometry nodes, shading and lookdev, modelling'],
      ['ALSO','C and C++, Java and Kotlin, PostgreSQL, TypeScript and React, sound design']] }
]},

{ id:'work', title:'WORK', gloss:'five games and titles', items:[
  { id:'mega-bank-2', name:'Mega Bank 2', tag:'Game', status:'SHIPPED',
    body:['A commercial slot game built and shipped solo at ZVKY Design Studio. I owned the whole pipeline: gameplay systems, UI, shader effects, animation and build delivery, from first commit to live release.'],
    props:[['ROLE','Solo developer'],['STACK','Unity, C#, shader graph'],['STUDIO','ZVKY Design Studio'],['SCOPE','Gameplay, UI, VFX, animation, release builds']] },
  { id:'cash-hog', name:'Cash Hog', tag:'Game', status:'SHIPPED',
    body:['A second commercial slot title at ZVKY, same solo ownership. Shipping two of these back to back is where most of what I know about release discipline came from: art budgets, platform builds, and the difference between a feature being done and being shippable.'],
    props:[['ROLE','Solo developer'],['STACK','Unity, C#, shader graph'],['STUDIO','ZVKY Design Studio']] },
  { id:'phantom-parry', name:'Project Phantom Parry', tag:'Game', status:'IN DEVELOPMENT',
    body:['An eldritch horror game I own end to end: story, design, code and sound. Built to be atmospheric first. The systems exist to make a place feel wrong, not to fill a feature list.'],
    props:[['ROLE','Solo. Writing, game design, development, sound design'],['STACK','Unity, C#, Blender, shader graph'],['STATUS','In active development. Devlog not public yet.']] },
  { id:'echolocate', name:'EchoLocate', tag:'Game', status:'IN DEVELOPMENT',
    body:[
      'A stealth game about escaping a district in the dark, played by a protagonist who has been blind since birth. You tap to send out an echolocation pulse; whatever it touches lights up and decays, and you build a map of a place you cannot see out of what came back.',
      'The whole design hangs off one trade: the pulse is both how you see and how you are seen. Everything hunting you hears it too, so every look costs you position. Decoys exist because without them the correct play was to stand still and make no noise, and a stealth game whose optimal move is to do nothing is not a game.'],
    props:[['ROLE','Solo. Design, systems, code, shaders, audio'],['STACK','Unity 6000.5.5f1, URP, C#'],['SYSTEMS','Pulse echolocation and highlight shader, sight and hearing split, three enemy archetypes, BSP and MST level generation, four-part dynamic weather'],['SCOPE','Twelve levels, PC, keyboard and gamepad'],['PROGRESS','109 commits across 18 PRs since 27 July 2026']],
    actions:[{label:'DEVLOG', href:BASE+'devlog/echolocate/'}] },
  { id:'bt-7274n', name:'BT-7274N', tag:'Game', status:'PLAYABLE NOW',
    body:[
      'A turn-based terminal roguelike. You type combat commands, the enemy answers, and the waves keep coming: twelve commands across attack, defence and support, all balanced against four competing resources you can never quite afford to spend.',
      'The interesting problem was making a text interface feel like combat. Every command resolves into a readable console beat, wave modifiers change the rules rather than just the numbers, and a battery minigame runs alongside the fight so there is always a second decision competing for your attention.'],
    props:[['ROLE','Solo. Design, systems, code, interface, copy'],['STACK','Vanilla JavaScript, canvas, no dependencies'],['BUILD','One self-contained HTML file, about 93 KB'],['NOTE','Unofficial fan project set in the Titanfall universe. Not affiliated with Respawn Entertainment or EA.']],
    actions:[{label:'PLAY', launch:'bt-7274n'},{label:'SOURCE', href:'https://github.com/iudexryze/portfolio/tree/main/play/bt-7274n'}] }
]},

{ id:'tools', title:'TOOLS', gloss:'seven Unity editor windows', items:[
  { id:'vanguard', name:'Vanguard', tag:'Addressables integrity',
    body:['Validates Addressables from four angles at once: GUID and address health, hard references leaking into scenes, the same asset living in multiple groups, and addressables that end up bundled as direct prefab dependencies. Exports the whole audit as Markdown or CSV with size breakdowns.'],
    props:[['PASSES','Addressable validator, scene reference checker, duplicate finder, prefab reference checker'],['OUTPUT','Markdown or CSV report with per-asset size']] },
  { id:'viper', name:'Viper', tag:'Unreferenced asset finder',
    body:['Walks the full dependency graph and surfaces every asset with no reference from code, scenes or other assets. Results come back filterable and sortable with file sizes, per-row accent bars for reference state, and a dismiss-filtered action. Scan results persist between sessions, so a long audit survives a restart.'],
    props:[['METHOD','Full AssetDatabase dependency graph'],['UI','IMGUI, filterable and sortable, persistent results']] },
  { id:'jemiah', name:'Jemiah', tag:'Addressables auditor',
    body:['Detects implicit dependency duplication across Addressable groups, and finds orphaned addresses never invoked anywhere in code by regex-scanning every .cs file. Promote to Shared moves duplicates into a shared group in one click; Purge Orphans clears dead registry entries.'],
    props:[['DETECTS','Implicit duplication across groups, orphaned addresses'],['FIXES','Promote to shared group, purge orphan entries'],['OUTPUT','CSV export, per-group size breakdown']] },
  { id:'eson', name:'Eson', tag:'Missing reference scanner',
    body:['Scans every prefab and ScriptableObject for broken serialized references: missing MonoBehaviour scripts and object references pointing at deleted assets. Loads prefabs safely through PrefabUtility rather than instantiating them, catches both missing scripts and null instance ID references, and pings straight to the asset on click.'],
    props:[['DETECTS','Missing scripts, null instance ID references'],['BUILT ON','SerializedProperty traversal, PrefabUtility']] },
  { id:'nezarr', name:'Nezarr', tag:'Build report reader',
    body:['Parses the build report Unity writes into Editor.log after every build, then breaks asset mass down by category with proportional size bars and lists every included asset by size with type-coloured badges and percentage share. Locates Editor.log automatically on macOS, Windows and Linux.'],
    props:[['SOURCE','Editor.log build report, auto-located per platform'],['SHOWS','Category mass breakdown, per-asset size and share, build date']] },
  { id:'hargen', name:'Hargen', tag:'Texture import auditor',
    body:['Flags every Texture2D in the project for the import mistakes that quietly cost memory: Read/Write left enabled, which doubles runtime cost; uncompressed formats; anything over 2K; and missing mipmaps on non-UI textures. Selected rows can be fixed in batch with automatic reimport.'],
    props:[['FLAGS','Read/Write enabled, uncompressed format, over 2K, missing mipmaps'],['FIXES','Batch fix and compress, with auto-reimport']] },
  { id:'oneg', name:'Oneg', tag:'Two-way dependency browser',
    body:['Pick any asset and see both directions at once: everything it pulls in, and everything that pulls it in, side by side. Direct dependencies sit at full opacity and indirect ones drop back. Double-click any row to drill into that asset’s own web, with a recursive and direct toggle and independent search per panel.'],
    props:[['SHOWS','Forward and reverse dependencies, direct against indirect'],['NAVIGATION','Double-click to drill in, per-panel search, recursive toggle']] }
]},

{ id:'art', title:'ART', gloss:'the night half of the job', items:[
  { id:'architectus', name:'Architectus', tag:'Extension', status:'OPEN SOURCE',
    body:['A VS Code extension that rebuilds the editor as a cyberpunk workstation: a control panel sidebar, glitch effects on keypress, per-token syntax glow, custom cursors and scanline overlays, all injected live into the running editor.'],
    props:[['ROLE','Solo'],['STACK','JavaScript, VS Code API, live CSS injection']],
    actions:[{label:'SOURCE', href:'https://github.com/iudexryze/architectus'}] },
  { id:'final-boss', name:'Final Boss', tag:'3D art', status:'CHALLENGE ENTRY',
    body:['An entry for the Pwnisher community challenge, a global 3D art event run to a shared brief. Built with Aman Singh: a high-fidelity boss scene pushed as far as real-time rendering would take it.'],
    props:[['ROLE','Co-creator with Aman Singh'],['STACK','Blender, shaders, environment art']],
    actions:[{label:'ARTSTATION', href:'https://www.artstation.com/artwork/1xaKn2'}] },
  { id:'renders', name:'Environment work', tag:'3D art', status:'ONGOING',
    body:[
      'An ongoing body of 3D work: environment design, shader experiments, and procedural scenes driven by geometry nodes. This is where most of what I know about lighting and material response actually got learned.',
      'Fifty-two pieces so far. Spatial Ruins, Horror in Space Station, Asylum Escape, Escaping the Dead, Witch House, Cannibal Cave, Open Area in Backrooms, Ruins, Ancient Spell Book.'],
    props:[['STACK','Blender, geometry nodes, shader editor'],['SUBJECTS','Environment design, procedural scenes, material studies'],['BODY','52 pieces, 2023 to 2024']],
    actions:[{label:'ARTSTATION', href:'https://www.artstation.com/notryze'}] }
]},

{ id:'arcade', title:'ARCADE', gloss:'eight games, playable here', items:[
  { id:'bt-7274n', name:'BT-7274N', tag:'Terminal roguelike',
    body:['Type combat commands and the enemy answers. Twelve commands across attack, defence and support, four competing resources, wave modifiers that change the rules rather than the numbers, and a battery minigame running alongside the fight.'],
    props:[['INPUT','Typed. Wants a real keyboard.'],['BUILD','One HTML file, no dependencies']],
    actions:[{label:'PLAY', launch:'bt-7274n'},{label:'SOURCE', href:'https://github.com/iudexryze/portfolio/tree/main/play/bt-7274n'}] },
  { id:'drift-lander', name:'Drift Lander', tag:'Physics arcade',
    body:['Procedural terrain, a fuel budget that never covers the descent, and pads that pay more the narrower they get. Fixed-timestep physics, so a 144 Hz panel plays the same as a laptop.'],
    props:[['INPUT','Touch or keyboard'],['FITS','Reflows to any window']],
    actions:[{label:'PLAY', launch:'drift-lander'},{label:'SOURCE', href:'https://github.com/iudexryze/portfolio/tree/main/play/drift-lander'}] },
  { id:'circuit-breaker', name:'Circuit Breaker', tag:'Routing puzzle',
    body:['Rotate every segment until the board goes live. Boards come out of a randomised spanning tree, so there is always a solution and never an unreachable corner, and the shuffle itself sets the par.'],
    props:[['INPUT','Touch or keyboard'],['FITS','Reflows to any window']],
    actions:[{label:'PLAY', launch:'circuit-breaker'},{label:'SOURCE', href:'https://github.com/iudexryze/portfolio/tree/main/play/circuit-breaker'}] },
  { id:'overclock', name:'Overclock', tag:'Arena dodger',
    body:['Scoring is the thing that speeds the arena up. Every packet raises the clock everything hunting you runs on, and the throttle that saves you is paid for out of the same clock.'],
    props:[['INPUT','Touch or keyboard'],['FITS','Reflows to any window']],
    actions:[{label:'PLAY', launch:'overclock'},{label:'SOURCE', href:'https://github.com/iudexryze/portfolio/tree/main/play/overclock'}] },
  { id:'disco-race', name:'Disco Race', tag:'Rhythm racer',
    body:['A lane racer with a metronome under it. Steering keeps you alive; tapping on the beat is the only thing that makes you fast, so the two demands pull against each other at speed.'],
    props:[['INPUT','Touch or keyboard'],['TEMPO','124 BPM']],
    actions:[{label:'PLAY', launch:'disco-race'},{label:'SOURCE', href:'https://github.com/iudexryze/disco-race'}] },
  { id:'refactor', name:'Refactor', tag:'Graph puzzle',
    body:['Drag the nodes until no edge crosses another. Boards are generated at a layout that is already flat and then scrambled, so a solution is known to exist rather than hoped for.'],
    props:[['INPUT','Drag'],['FITS','Reflows to any window']],
    actions:[{label:'PLAY', launch:'refactor'},{label:'SOURCE', href:'https://github.com/iudexryze/refactor'}] },
  { id:'heap', name:'Heap', tag:'Precision stacker',
    body:['A block slides across the top of the tower; tap to drop it. Whatever hangs over is cut off for good, so only a dead-centre landing ever buys any width back.'],
    props:[['INPUT','One tap'],['FITS','Reflows to any window']],
    actions:[{label:'PLAY', launch:'heap'},{label:'SOURCE', href:'https://github.com/iudexryze/heap'}] },
  { id:'mutex', name:'Mutex', tag:'Timing game',
    body:['Runners lap rings that overlap, and where two rings cross only one may pass. Tap to hold one back, but a held runner is spending patience, so the lock is the scarce thing.'],
    props:[['INPUT','One tap'],['FITS','Reflows to any window']],
    actions:[{label:'PLAY', launch:'mutex'},{label:'SOURCE', href:'https://github.com/iudexryze/mutex'}] }
]},

{ id:'code', title:'CODE', gloss:'ten repositories', items:[
  { id:'portfolio', name:'portfolio', tag:'This site', body:['The whole page, the arcade it serves, and this machine. One static file each, no build step, no package manager.'], props:[['LANG','HTML, CSS, JavaScript']], actions:[{label:'OPEN', href:'https://github.com/iudexryze/portfolio'}] },
  { id:'r-bt', name:'bt-7274n', tag:'Terminal roguelike', body:['Turn-based combat at a command line. Vendored under play/ in the portfolio repository.'], props:[['LANG','Vanilla JavaScript']], actions:[{label:'OPEN', href:'https://github.com/iudexryze/portfolio/tree/main/play/bt-7274n'}] },
  { id:'r-lander', name:'drift-lander', tag:'Physics lander', body:['Procedural terrain and a fixed-timestep descent.'], props:[['LANG','Canvas, vanilla JavaScript']], actions:[{label:'OPEN', href:'https://github.com/iudexryze/portfolio/tree/main/play/drift-lander'}] },
  { id:'r-circuit', name:'circuit-breaker', tag:'Routing puzzle', body:['Spanning-tree board generation, so every board is solvable.'], props:[['LANG','Canvas, vanilla JavaScript']], actions:[{label:'OPEN', href:'https://github.com/iudexryze/portfolio/tree/main/play/circuit-breaker'}] },
  { id:'r-overclock', name:'overclock', tag:'Arena dodger', body:['One clock drives the difficulty and the only defence you have.'], props:[['LANG','Canvas, vanilla JavaScript']], actions:[{label:'OPEN', href:'https://github.com/iudexryze/portfolio/tree/main/play/overclock'}] },
  { id:'r-disco', name:'disco-race', tag:'Rhythm racer', body:['Standalone repository. The copy under play/ is what the site serves.'], props:[['LANG','Canvas, vanilla JavaScript']], actions:[{label:'OPEN', href:'https://github.com/iudexryze/disco-race'}] },
  { id:'r-refactor', name:'refactor', tag:'Graph puzzle', body:['Standalone repository. Planarity, scrambled from a known-flat layout.'], props:[['LANG','Canvas, vanilla JavaScript']], actions:[{label:'OPEN', href:'https://github.com/iudexryze/refactor'}] },
  { id:'r-heap', name:'heap', tag:'Precision stacker', body:['Standalone repository. One tap, one block, no forgiveness.'], props:[['LANG','Canvas, vanilla JavaScript']], actions:[{label:'OPEN', href:'https://github.com/iudexryze/heap'}] },
  { id:'r-mutex', name:'mutex', tag:'Timing game', body:['Standalone repository. Mutual exclusion as an arcade loop.'], props:[['LANG','Canvas, vanilla JavaScript']], actions:[{label:'OPEN', href:'https://github.com/iudexryze/mutex'}] },
  { id:'r-architectus', name:'architectus', tag:'VS Code extension', body:['Live CSS injection that turns the editor into a cyberpunk workstation.'], props:[['LANG','JavaScript, VS Code API']], actions:[{label:'OPEN', href:'https://github.com/iudexryze/architectus'}] }
]},

{ id:'contact', title:'CONTACT', gloss:'the fastest ways in', items:[
  { id:'email', name:'Email', tag:'varun2002saini19@gmail.com', body:['The fastest way to reach me. Open to game development and technical art roles, and to collaborations.'], actions:[{label:'COMPOSE', href:'mailto:varun2002saini19@gmail.com'}] },
  { id:'linkedin', name:'LinkedIn', tag:'linkedin.com/in/varun-saini', body:['Roles, history and the formal version of everything on this cartridge.'], actions:[{label:'OPEN', href:'https://linkedin.com/in/varun-saini'}] },
  { id:'github', name:'GitHub', tag:'github.com/iudexryze', body:['Ten repositories. The arcade, this site, and the VS Code extension.'], actions:[{label:'OPEN', href:'https://github.com/iudexryze'}] },
  { id:'artstation', name:'ArtStation', tag:'artstation.com/notryze', body:['Fifty-two pieces of environment and shader work, 2023 to 2024.'], actions:[{label:'OPEN', href:'https://www.artstation.com/notryze'}] },
  { id:'phone', name:'Phone', tag:'+91 99010 98611', body:['Bangalore, India. IST, so mind the offset.'], actions:[{label:'CALL', href:'tel:+919901098611'}] }
]}
];
