/* The prologue: where the machine was found.

   The portfolio does not begin when the console appears. It begins in a
   wet forest at night, low to the ground, when something on the forest
   floor catches the moonlight. The camera finds it, the visitor picks it
   up, the screen fills the view, and when the camera pulls back the
   machine is in their hands — in the room it has always been in. They
   switch it on, and the thing they found is the portfolio.

   What this file is careful about:
   - It is not a second console. It poses, lights and frames the one
     device.js already built, and hands it back exactly where the normal
     presentation expects it.
   - It adds no lights and no fog to the console's own materials: either
     would change their shader programs and force a recompile at the
     handoff. The moon is the machine's existing rim light, moved; the
     forest's materials are the only ones that fog.
   - It is built and compiled behind WARMING UP together with the machine,
     so the forest is the thing that hides the startup cost rather than a
     thing that adds to it.
   - It runs inside device.js's frame loop and owns no animation frame of
     its own. When it is done the forest is removed and disposed, every
     timer is cleared, the audio context is closed, and the machine is back
     to drawing only when something changes.
   - Deep links, return visits, missing WebGL and a failed load never see
     it. Reduced motion gets a still frame and a cut. ESC skips.

   Part of IudexRyze. See README.md for how the pieces fit. */

export function createIntro(h){
  'use strict';
  const { THREE, renderer, scene, camera, device, IRZ } = h;
  const L = h.lights, ROOMS = h.room, M = h.dims;
  const reduced = !!h.reduced;
  const small = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
  const root = document.documentElement;

  /* Composed, not rolled: the forest is seeded, so the same trees stand in
     the same places for everyone and nothing ever blocks the shot. */
  let seed = 90214;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const range = (a, b) => a + (b - a) * rnd();
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd() * 0.999)) * Math.cos(6.2832 * rnd());
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const easeSine = k => (1 - Math.cos(Math.PI * clamp01(k))) / 2;
  const easeCubic = k => { k = clamp01(k); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };

  /* ── before anything is added: the console keeps its own programs ── */
  scene.traverse(o => {
    const m = o.material; if (!m) return;
    (Array.isArray(m) ? m : [m]).forEach(x => { x.fog = false; });
  });

  function canvas2d(w, hgt){ const c = document.createElement('canvas'); c.width = w; c.height = hgt; return [c, c.getContext('2d')]; }
  const textures = [];
  function tex(c, srgb, repeat){
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    if (repeat){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
    t.anisotropy = 4;
    textures.push(t);
    return t;
  }

  /* ── textures, all painted here ───────────────────────────────────── */
  function groundTexture(){
    const N = small ? 256 : 512, u = N / 512, [c, g] = canvas2d(N, N);
    g.fillStyle = '#14181a'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 700; i++){
      const x = rnd() * N, y = rnd() * N, r = range(3, 30) * u, v = rnd();
      const col = v < 0.45 ? '6,8,8,' : v < 0.82 ? '40,35,26,' : '58,62,48,';
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(' + col + range(0.15, 0.42).toFixed(2) + ')');
      gr.addColorStop(1, 'rgba(' + col + '0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const litter = ['#3b2c1c', '#2d2418', '#4b3a24', '#232a1d', '#52422a'];
    for (let i = 0; i < 1500; i++){
      g.globalAlpha = range(0.25, 0.75);
      g.fillStyle = litter[i % litter.length];
      g.beginPath(); g.ellipse(rnd() * N, rnd() * N, range(1, 3.8) * u, range(0.6, 1.6) * u, rnd() * 3, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    return tex(c, true, 22);
  }
  /* Wet is a roughness map, not a colour: the puddles are where the moon
     comes back off the ground. */
  function wetTexture(){
    const N = 256, [c, g] = canvas2d(N, N);
    g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 60; i++){
      const x = rnd() * N, y = rnd() * N, r = range(6, 34);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(40,40,40,.85)'); gr.addColorStop(1, 'rgba(40,40,40,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return tex(c, false, 22);
  }
  function barkTexture(){
    const [c, g] = canvas2d(128, 512);
    g.fillStyle = '#2a2f2e'; g.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 90; i++){
      const x = rnd() * 128;
      g.strokeStyle = rnd() < 0.5 ? 'rgba(8,10,10,.55)' : 'rgba(70,78,72,.25)';
      g.lineWidth = range(1, 4);
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= 512; y += 32) g.lineTo(x + range(-3, 3), y);
      g.stroke();
    }
    const moss = g.createLinearGradient(0, 512, 0, 300);
    moss.addColorStop(0, 'rgba(46,64,40,.65)'); moss.addColorStop(1, 'rgba(46,64,40,0)');
    g.fillStyle = moss; g.fillRect(0, 300, 128, 212);
    return tex(c, true);
  }
  function leafTexture(){
    const [c, g] = canvas2d(64, 64);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(4, 32); g.quadraticCurveTo(32, 6, 60, 32); g.quadraticCurveTo(32, 58, 4, 32); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(4, 32); g.lineTo(60, 32); g.stroke();
    return tex(c, true);
  }
  /* A frond is a tapering stem with leaflets that are longest in the
     middle and lean toward the tip. Drawn as filled shapes rather than
     lines, so it thins out at distance instead of turning into a comb. */
  function fernTexture(){
    const [c, g] = canvas2d(256, 256);
    g.fillStyle = '#fff';
    for (let f = 0; f < 6; f++){
      const bend = range(-0.8, 0.8), len = range(140, 232), steps = 26;
      let x = 128 + range(-12, 12), y = 256, ang = -Math.PI / 2 + bend * 0.55;
      for (let s = 0; s < steps; s++){
        const k = s / steps;
        const nx = x + Math.cos(ang) * len / steps, ny = y + Math.sin(ang) * len / steps;
        g.beginPath(); g.ellipse((x + nx) / 2, (y + ny) / 2, 1.5 * (1 - k * 0.7), len / steps * 0.62, ang + Math.PI / 2, 0, 7); g.fill();
        const leaf = 19 * Math.sin(Math.PI * Math.min(1, k * 1.05 + 0.1)) + 2;
        for (const side of [-1, 1]){
          const la = ang + side * (1.0 + k * 0.35);
          g.beginPath();
          g.ellipse(nx + Math.cos(la) * leaf * 0.5, ny + Math.sin(la) * leaf * 0.5, leaf * 0.5, 2.8 * (1 - k * 0.5), la, 0, 7);
          g.fill();
        }
        x = nx; y = ny; ang += bend * 0.05;
      }
    }
    return tex(c, true);
  }
  function softTexture(){
    const [c, g] = canvas2d(256, 256);
    for (let i = 0; i < 9; i++){
      const x = range(70, 186), y = range(90, 166), r = range(50, 110);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,.34)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    }
    return tex(c, true);
  }
  function shaftTexture(){
    const [c, g] = canvas2d(32, 256);
    const across = g.createLinearGradient(0, 0, 32, 0);
    across.addColorStop(0, 'rgba(255,255,255,0)'); across.addColorStop(0.5, 'rgba(255,255,255,1)'); across.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = across; g.fillRect(0, 0, 32, 256);
    g.globalCompositeOperation = 'destination-in';
    const down = g.createLinearGradient(0, 0, 0, 256);
    down.addColorStop(0, 'rgba(0,0,0,.2)'); down.addColorStop(0.35, 'rgba(0,0,0,1)'); down.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = down; g.fillRect(0, 0, 32, 256);
    return tex(c, true);
  }
  function dotTexture(){
    const [c, g] = canvas2d(32, 32);
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    return tex(c, true);
  }
  function glintTexture(){
    const [c, g] = canvas2d(64, 64);
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(2, 32); g.lineTo(62, 32); g.moveTo(32, 8); g.lineTo(32, 56); g.stroke();
    return tex(c, true);
  }
  function branchTexture(){
    const [c, g] = canvas2d(512, 256);
    g.strokeStyle = '#fff'; g.lineCap = 'round';
    const limb = (x, y, ang, w, depth) => {
      for (let s = 0; s < 14 && w > 0.6; s++){
        const nx = x + Math.cos(ang) * 22, ny = y + Math.sin(ang) * 22;
        g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
        if (depth < 3 && rnd() < 0.28) limb(nx, ny, ang + range(-0.9, 0.9), w * 0.6, depth + 1);
        x = nx; y = ny; ang += range(-0.22, 0.22); w *= 0.9;
      }
    };
    limb(0, 40, 0.12, 16, 0); limb(0, 150, -0.08, 11, 0);
    return tex(c, true);
  }
  function figureTexture(){
    const [c, g] = canvas2d(128, 320);
    g.fillStyle = '#fff';
    g.save(); g.translate(64, 56); g.rotate(-0.14);
    g.beginPath(); g.ellipse(0, 0, 15, 20, 0, 0, 7); g.fill(); g.restore();
    g.fillRect(58, 72, 11, 18);
    g.beginPath(); g.moveTo(24, 118); g.quadraticCurveTo(38, 84, 64, 82); g.quadraticCurveTo(90, 84, 104, 118);
    g.lineTo(98, 320); g.lineTo(30, 320); g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createLinearGradient(0, 180, 0, 320);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade; g.fillRect(0, 0, 128, 320);
    return tex(c, true);
  }

  /* ── the forest ───────────────────────────────────────────────────── */
  const forest = new THREE.Group();
  scene.add(forest);

  const FOG_COLOR = 0x15222a;
  const saved = {
    fog: scene.fog, background: scene.background,
    rimPos: L.rim.position.clone(), rimCol: L.rim.color.clone(), rimI: L.rim.intensity,
    rim2Pos: L.rim2.position.clone(), rim2Col: L.rim2.color.clone(), rim2I: L.rim2.intensity,
    hemiSky: L.hemi.color.clone(), hemiGround: L.hemi.groundColor.clone(), hemiI: L.hemi.intensity,
    near: camera.near, far: camera.far, fov: camera.fov,
    dpr: renderer.getPixelRatio(),
    room: ROOMS.map(o => o.visible)
  };

  /* The camera's route through the trees. Everything that needs detail is
     placed against this line, and nothing is allowed to stand on it. */
  const PATH = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-150, 15, 780),
    new THREE.Vector3(-112, 17, 560),
    new THREE.Vector3(-70, 21, 350),
    new THREE.Vector3(-36, 30, 180),
    new THREE.Vector3(-12, 42, 88)
  ], false, 'centripetal');
  const pathPts = PATH.getSpacedPoints(48);
  const LOOKS = [
    [0.0, new THREE.Vector3(-40, 40, -140)],
    [2.4, new THREE.Vector3(-8, 16, 0)],
    [5.0, new THREE.Vector3(0, 7, 0)],
    [7.0, new THREE.Vector3(0, 3.5, 0)]
  ];
  const T_PATH = 7.0, T_PROMPT = 6.4, T_AUTO = 11.5, T_STILL = 7.0;
  const T_PICK = 1.55, T_PULL = 1.35;
  const FIG = new THREE.Vector3(150, 0, -780);          // where the one thing that should not be there stands

  function nearPath(x, z, pad){
    for (const pt of pathPts){ const dx = pt.x - x, dz = pt.z - z; if (dx * dx + dz * dz < pad * pad) return true; }
    return false;
  }
  function segDist(px, pz, ax, az, bx, bz){
    const vx = bx - ax, vz = bz - az, t = clamp01(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz));
    return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
  }

  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), eu = new THREE.Euler();
  const tint = new THREE.Color();

  // ground: one plane, wet where the roughness map says so
  const groundMat = new THREE.MeshStandardMaterial({ map:groundTexture(), roughnessMap:wetTexture(), roughness:1, metalness:0, color:0xb8c0bd });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), groundMat);
  ground.rotation.x = -Math.PI / 2; forest.add(ground);

  // trunks: one instanced draw. Fog does the rest of the forest.
  const TREES = small ? 52 : 104;
  const barkMat = new THREE.MeshStandardMaterial({ map:barkTexture(), roughness:0.96, metalness:0, color:0x9aa3a0 });
  const trunkGeo = new THREE.CylinderGeometry(0.6, 1, 1, 9, 1, true); trunkGeo.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, TREES + 8);
  let placed = 0;
  const plant = (x, z, r, hgt, lean) => {
    eu.set(lean, rnd() * 6.28, lean * 0.7); q.setFromEuler(eu); sc.set(r, hgt, r); ps.set(x, -30, z);
    mtx.compose(ps, q, sc); trunks.setMatrixAt(placed++, mtx);
  };
  // the ones that frame the clearing are placed by hand
  [[-215, -150, 27], [195, -70, 23], [110, 250, 19], [-275, 170, 31], [270, -390, 35], [-130, -430, 29], [-330, 470, 24], [40, -610, 30]]
    .forEach(([x, z, r]) => plant(x, z, r, range(1600, 2200), range(-0.05, 0.05)));
  for (let guard = 0; placed < TREES + 8 && guard < 6000; guard++){
    const a = rnd() * Math.PI * 2, d = 220 + Math.pow(rnd(), 0.85) * 2900;
    const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.85 - 250;
    if (Math.hypot(x, z) < 180 || nearPath(x, z, 100)) continue;
    if (segDist(x, z, -70, 350, FIG.x, FIG.z) < 70) continue;      // a clear line to the thing in the trees
    plant(x, z, range(11, 36), range(1300, 2300), range(-0.045, 0.045));
  }
  trunks.count = placed; trunks.frustumCulled = false;
  forest.add(trunks);

  // rocks, one of them under the top end of the machine
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  {
    /* The icosahedron is unindexed, so a corner is several vertices in
       the same place. Displacing each one on its own tore the rock open
       along every edge; displace by position and the corners stay shut. */
    const pos = rockGeo.attributes.position, byCorner = new Map();
    for (let i = 0; i < pos.count; i++){
      const key = pos.getX(i).toFixed(3) + ',' + pos.getY(i).toFixed(3) + ',' + pos.getZ(i).toFixed(3);
      let k = byCorner.get(key);
      if (k === undefined){ k = 0.8 + rnd() * 0.32; byCorner.set(key, k); }
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.72, pos.getZ(i) * k);
    }
    rockGeo.computeVertexNormals();
  }
  const rockMat = new THREE.MeshStandardMaterial({ color:0x3a4541, roughness:0.88, metalness:0, flatShading:true });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 12);
  let rockN = 0;
  const rock = (x, z, s) => { eu.set(0, rnd() * 6.28, 0); q.setFromEuler(eu); sc.set(s, s, s * 1.1); ps.set(x, s * 0.25, z); mtx.compose(ps, q, sc); rocks.setMatrixAt(rockN++, mtx); };
  rock(1.5, -7.5, 6.5);
  rock(-30, 22, 6); rock(38, 14, 5); rock(-64, -38, 10); rock(84, -60, 13); rock(-120, 96, 9);
  rock(-96, 300, 16); rock(-44, 520, 20); rock(-210, 640, 14); rock(60, 120, 6); rock(22, -110, 9); rock(-160, -20, 14);
  rocks.count = rockN; rocks.frustumCulled = false;
  forest.add(rocks);

  // leaf litter, heaviest around the machine and along the way in
  const LEAVES = small ? 240 : 520;
  const leafGeo = new THREE.PlaneGeometry(3.4, 2.1); leafGeo.rotateX(-Math.PI / 2);
  const leafMat = new THREE.MeshStandardMaterial({ map:leafTexture(), alphaTest:0.5, side:THREE.DoubleSide, roughness:0.62, metalness:0 });
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, LEAVES);
  const LEAF = ['#4a3622', '#3b2a1a', '#5a4326', '#2e2618', '#433a22', '#3a3a1e'];
  for (let i = 0; i < LEAVES; i++){
    let x, z;
    if (i < LEAVES * 0.65){ x = gauss() * 48; z = gauss() * 48; }
    else { const pt = pathPts[Math.floor(rnd() * pathPts.length)]; x = pt.x + range(-60, 60); z = pt.z + range(-60, 60); }
    eu.set(range(-0.25, 0.25), rnd() * 6.28, range(-0.25, 0.25)); q.setFromEuler(eu);
    const s = range(0.7, 1.7); sc.set(s, s, s); ps.set(x, range(0.18, 0.5), z);
    mtx.compose(ps, q, sc); leaves.setMatrixAt(i, mtx);
    leaves.setColorAt(i, tint.set(LEAF[i % LEAF.length]).multiplyScalar(range(0.55, 1.05)));
  }
  leaves.instanceColor.needsUpdate = true; leaves.frustumCulled = false;
  forest.add(leaves);

  // ferns: the vegetation the camera looks through, and a ring around the clearing
  const FERNS = small ? 64 : 140;
  const fernGeo = new THREE.PlaneGeometry(1, 1); fernGeo.translate(0, 0.5, 0);
  const fernMat = new THREE.MeshStandardMaterial({ map:fernTexture(), alphaTest:0.4, side:THREE.DoubleSide, roughness:0.9, metalness:0, color:0x86a07a });
  const ferns = new THREE.InstancedMesh(fernGeo, fernMat, FERNS);
  const toCam = Math.atan2(88, -12);                        // the direction the camera arrives from
  for (let i = 0; i < FERNS; i++){
    let x, z;
    const pick = rnd();
    if (i < 10){                                            // the ones in the opening shot, close and dark
      const pt = pathPts[1 + (i % 6)]; const side = i % 2 ? 1 : -1;
      x = pt.x + side * range(34, 78); z = pt.z - range(30, 90);
    } else if (pick < 0.45){
      const pt = pathPts[4 + Math.floor(rnd() * 40)]; const side = rnd() < 0.5 ? -1 : 1;
      x = pt.x + side * range(40, 150); z = pt.z + range(-30, 30);
    } else {
      const a = rnd() * 6.28, d = range(45, 160);
      if (Math.abs(Math.atan2(Math.sin(a - toCam), Math.cos(a - toCam))) < 0.55) continue;
      x = Math.cos(a) * d; z = Math.sin(a) * d;
    }
    const s = i < 10 ? range(22, 38) : range(18, 46);
    eu.set(0, rnd() * 6.28, range(-0.12, 0.12)); q.setFromEuler(eu);
    sc.set(s * range(0.8, 1.25), s, s); ps.set(x, -1, z);
    mtx.compose(ps, q, sc); ferns.setMatrixAt(i, mtx);
    ferns.setColorAt(i, tint.setHSL(range(0.22, 0.31), range(0.16, 0.3), range(0.2, 0.34)));
  }
  ferns.instanceColor.needsUpdate = true; ferns.frustumCulled = false;
  forest.add(ferns);

  // branches over the opening shot: silhouettes, not lit
  const branches = [];
  const branchMat = new THREE.MeshBasicMaterial({ map:branchTexture(), color:0x020303, alphaTest:0.35, side:THREE.DoubleSide, fog:false });
  [[-138, 78, 690, 230, 115, 0.35], [-60, 118, 520, 280, 140, -0.3]].forEach(([x, y, z, w, hh, ry]) => {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), branchMat);
    b.position.set(x, y, z); b.rotation.set(0.25, ry, -0.1); forest.add(b); branches.push(b);
  });

  // moonlight through the trees
  const shaftMat = new THREE.MeshBasicMaterial({ map:shaftTexture(), color:0xa6c0d8, transparent:true, opacity:0.07,
    blending:THREE.AdditiveBlending, depthWrite:false, fog:false, side:THREE.DoubleSide });
  const shafts = [];
  [[-120, -260, 0.26, 150, 0.08], [70, -420, 0.2, 110, 0.06], [-10, -40, 0.3, 90, 0.05], [230, -620, 0.18, 170, 0.05]].forEach(([x, z, lean, w, o]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 2000), shaftMat.clone());
    m.material.opacity = o; m.position.set(x, 900, z); m.rotation.set(0, -0.2, lean);
    shafts.push(m); forest.add(m);
  });

  // a pale patch where the moon reaches the ground, and the darkness under the machine
  const soft = softTexture();
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(240, 240),
    new THREE.MeshBasicMaterial({ map:soft, color:0x8fa6b6, transparent:true, opacity:0.12, blending:THREE.AdditiveBlending, depthWrite:false, fog:false }));
  patch.rotation.x = -Math.PI / 2; patch.position.set(-6, 0.6, -10); forest.add(patch);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(22, 30),
    new THREE.MeshBasicMaterial({ map:soft, color:0x000000, transparent:true, opacity:0.9, depthWrite:false, fog:false }));
  contact.rotation.set(-Math.PI / 2, 0, 0.35); contact.position.set(0, 0.7, -1); forest.add(contact);

  // fog that moves, a few large soft sheets facing the camera
  const FOGS = small ? 6 : 10;
  const fogGeo = new THREE.PlaneGeometry(1, 1);
  const fogs = [];
  for (let i = 0; i < FOGS; i++){
    const m = new THREE.Mesh(fogGeo, new THREE.MeshBasicMaterial({ map:soft, color:0x9fb2bd, transparent:true,
      opacity:range(0.08, 0.2), depthWrite:false, fog:false }));
    const s = range(260, 640);
    m.scale.set(s, s * 0.42, 1);
    m.position.set(range(-420, 320), range(8, 70), i < 3 ? range(-60, 140) : range(-520, 720));
    m.userData.drift = range(4, 13) * (rnd() < 0.5 ? -1 : 1);
    fogs.push(m); forest.add(m);
  }
  // one sheet that crosses in front of the thing in the trees while it is there
  const veil = new THREE.Mesh(fogGeo, new THREE.MeshBasicMaterial({ map:soft, color:0x9fb2bd, transparent:true, opacity:0.0, depthWrite:false, fog:false }));
  veil.scale.set(520, 240, 1); veil.position.set(-80, 70, -520); forest.add(veil);

  // a fine rain, only where the camera is
  const DROPS = reduced ? 0 : small ? 260 : 700;
  const rainPos = new Float32Array(Math.max(1, DROPS) * 3), rainV = new Float32Array(Math.max(1, DROPS));
  for (let i = 0; i < DROPS; i++){
    rainPos[i * 3] = range(-260, 220); rainPos[i * 3 + 1] = range(0, 260); rainPos[i * 3 + 2] = range(-80, 820);
    rainV[i] = range(70, 120);
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ map:dotTexture(), color:0x9fb2bf, size:1.8,
    transparent:true, opacity:0.3, depthWrite:false }));
  rain.frustumCulled = false; rain.visible = DROPS > 0;
  forest.add(rain);

  // the thing in the trees
  const stranger = new THREE.Mesh(new THREE.PlaneGeometry(70, 185),
    new THREE.MeshBasicMaterial({ map:figureTexture(), color:0x020405, transparent:true, opacity:0, depthWrite:false }));
  stranger.position.set(FIG.x, 92, FIG.z); forest.add(stranger);

  // a catch of light on the glass: how it is found
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map:glintTexture(), color:0xd6ecff, transparent:true,
    blending:THREE.AdditiveBlending, depthWrite:false, fog:false }));
  glint.position.set(M.LC_W / 2 - 0.9, M.LC_Y + M.LC_H / 2 - 0.7, M.BZ_FRONT + 0.12);
  glint.scale.set(0.001, 0.001, 1);
  device.add(glint);

  /* ── the scene as the first frame will see it ───────────────────────
     Configured here, before device.js compiles, so the programs compiled
     behind WARMING UP are the ones the forest actually draws with. */
  /* The forest is a soft picture - fog, rain, backlit leaves - and it loses
     very little drawn under native resolution, while the frames it buys are
     the difference between a shot and a slideshow. Measured on the test
     machine: the same forest at 42 frames a second native, 50 at 0.75 and
     55 at 0.6. So it starts a little under native and steps down if the
     first frames say the GPU is struggling. The console goes back to full
     resolution the moment it is in your hands. */
  const quality = { ratio:Math.min(devicePixelRatio, 1.5) * (small ? 0.75 : 0.85), ema:1 / 60, frames:0, floor:0.55 };
  function adapt(dt){
    if (reduced || !dt) return;
    quality.ema += (dt - quality.ema) * 0.08;
    if (++quality.frames % 40 === 0 && quality.ema > 1 / 50 && quality.ratio > quality.floor){
      quality.ratio = Math.max(quality.floor, quality.ratio * 0.82);
      renderer.setPixelRatio(quality.ratio);
    }
  }

  const LIE = { pos:new THREE.Vector3(0, 3.6, 0), rx:-1.32, ry:-0.35, rz:0.08 };
  function poseForest(){
    scene.fog = new THREE.FogExp2(FOG_COLOR, small ? 0.00125 : 0.0011);
    scene.background = new THREE.Color(FOG_COLOR);
    forest.visible = true;
    ROOMS.forEach(o => { o.visible = false; });
    L.rim.position.set(-500, 900, -1100); L.rim.color.set(0xa9bfd8); L.rim.intensity = 1.4;
    L.rim2.position.set(700, 260, -420);  L.rim2.color.set(0x2c4150); L.rim2.intensity = 0.45;
    L.hemi.color.set(0x42596a); L.hemi.groundColor.set(0x090b0a); L.hemi.intensity = 0.9;
    h.studio(0.05, 0.3);
    device.rotation.order = 'YXZ';
    device.position.copy(LIE.pos); device.rotation.set(LIE.rx, LIE.ry, LIE.rz);
    camera.near = 1; camera.far = 6000; camera.fov = 40;
    camera.position.copy(PATH.getPointAt(reduced ? 1 : 0));
    camera.lookAt(reduced ? LOOKS[3][1] : LOOKS[0][1]);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(quality.ratio);
  }
  poseForest();

  /* ── the page around it ───────────────────────────────────────────── */
  const ui = document.createElement('div');
  ui.className = 'intro-layer';
  ui.innerHTML =
    '<div class="intro-bars"></div>' +
    '<div class="intro-fade" style="opacity:1"></div>' +
    '<div class="intro-ui"><p class="intro-cue"></p><p class="intro-sub"></p></div>' +
    '<button type="button" class="intro-skip">SKIP <em>ESC</em></button>';
  const bars = ui.querySelector('.intro-bars'), fadeEl = ui.querySelector('.intro-fade');
  const cueEl = ui.querySelector('.intro-cue'), subEl = ui.querySelector('.intro-sub'), skipEl = ui.querySelector('.intro-skip');
  function cue(text, sub){
    cueEl.innerHTML = text; subEl.innerHTML = sub || '';
    cueEl.classList.toggle('on', !!text); subEl.classList.toggle('on', !!sub);
  }

  /* ── sound, made here ─────────────────────────────────────────────────
     Nothing plays until the visitor has touched something, because the
     browser will not allow it and because a page that starts making noise
     on its own is a page people close. It follows the console's volume. */
  let actx = null, master = null, amb = null;
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const VOL = [0, 0.35, 0.8, 1.3];
  function noise(sec){
    const b = actx.createBuffer(1, Math.floor(actx.sampleRate * sec), actx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++){ last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = last * 6; }
    return b;
  }
  function audioStart(){
    if (actx || (IRZ.sound && !IRZ.sound())) return;
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){ actx = null; return; }
    master = actx.createGain();
    master.gain.value = 0.55 * VOL[IRZ.volume ? IRZ.volume() : 2];
    master.connect(actx.destination);
    if (state === 'forest' || state === 'pickup') ambience();
  }
  function ambience(){
    const now = actx.currentTime;
    const wind = actx.createBufferSource(); wind.buffer = noise(4); wind.loop = true;
    const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.5;
    const g = actx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.16, now + 1.4);
    const lfo = actx.createOscillator(); lfo.frequency.value = 0.09;
    const lg = actx.createGain(); lg.gain.value = 0.06; lfo.connect(lg); lg.connect(g.gain);
    wind.connect(bp); bp.connect(g); g.connect(master);
    wind.start(); lfo.start();
    amb = { g, stop:[wind, lfo] };
    (function insects(){
      if (!amb || !actx) return;
      const t = actx.currentTime + 0.05, n = 3 + Math.floor(Math.random() * 4), f = 4200 + Math.random() * 1400;
      for (let i = 0; i < n; i++){
        const o = actx.createOscillator(), og = actx.createGain();
        o.frequency.value = f; og.gain.setValueAtTime(0, t + i * 0.07);
        og.gain.linearRampToValueAtTime(0.004, t + i * 0.07 + 0.008);
        og.gain.linearRampToValueAtTime(0, t + i * 0.07 + 0.03);
        o.connect(og); og.connect(amb.g); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.05);
      }
      later(insects, 900 + Math.random() * 2200);
    })();
  }
  function sound(kind){
    if (!actx) return;
    const t = actx.currentTime;
    const env = (node, peak, attack, decay) => {
      const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
      node.connect(g); g.connect(master); return g;
    };
    if (kind === 'lift'){
      const n = actx.createBufferSource(); n.buffer = noise(0.6);
      const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
      f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(260, t + 0.5);
      n.connect(f); env(f, 0.22, 0.12, 0.42); n.start(t); n.stop(t + 0.6);
    }
    if (kind === 'settle' || kind === 'click'){
      const o = actx.createOscillator(); o.frequency.value = kind === 'click' ? 150 : 82;
      env(o, kind === 'click' ? 0.12 : 0.09, 0.004, kind === 'click' ? 0.06 : 0.14); o.start(t); o.stop(t + 0.25);
      const n = actx.createBufferSource(); n.buffer = noise(0.05);
      const f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = kind === 'click' ? 2400 : 900;
      n.connect(f); env(f, kind === 'click' ? 0.3 : 0.05, 0.002, 0.03); n.start(t); n.stop(t + 0.06);
    }
    if (kind === 'hum'){
      const o = actx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
      const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 170;
      const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.03, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + 2.3);
    }
  }
  function ambienceOut(sec){
    if (!amb || !actx) return;
    const a = amb; amb = null;
    a.g.gain.cancelScheduledValues(actx.currentTime);
    a.g.gain.setValueAtTime(a.g.gain.value, actx.currentTime);
    a.g.gain.linearRampToValueAtTime(0, actx.currentTime + sec);
    later(() => a.stop.forEach(s => { try { s.stop(); } catch(e){} }), sec * 1000 + 100);
  }

  /* ── the sequence ─────────────────────────────────────────────────── */
  let state = 'idle', T = 0, stepT = 0, first = true, skipped = false;
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), tmp = new THREE.Vector3(), nrm = new THREE.Vector3();
  const FILL = (M.LC_H / 2) / Math.tan(13 * Math.PI / 180) * 0.82;       // the screen fills the view at fov 26
  const HOLD = new THREE.Vector3(-4, 40, 40);
  let from = null, lastGlow = -1, lastPixel = null;

  function lookAtTime(t, out){
    for (let i = 0; i < LOOKS.length - 1; i++){
      if (t < LOOKS[i + 1][0]){
        const k = easeSine((t - LOOKS[i][0]) / (LOOKS[i + 1][0] - LOOKS[i][0]));
        return out.lerpVectors(LOOKS[i][1], LOOKS[i + 1][1], k);
      }
    }
    return out.copy(LOOKS[LOOKS.length - 1][1]);
  }

  function screenState(glow, pixel){
    if (glow !== lastGlow || pixel !== lastPixel){
      lastGlow = glow; lastPixel = pixel;
      IRZ.intro.glow(glow, pixel);
    }
  }

  function forestStep(dt){
    adapt(dt);
    const tt = reduced ? T_STILL : T;
    PATH.getPointAt(easeSine(tt / T_PATH) * 0.999 + (tt >= T_PATH ? 0.001 : 0), camPos);
    lookAtTime(tt, look);
    if (!reduced){
      // held, not mounted: two slow sways and nothing that reads as shake
      camPos.x += Math.sin(T * 0.83) * 0.9 + Math.sin(T * 2.1) * 0.22;
      camPos.y += Math.sin(T * 1.21) * 0.55 + Math.sin(T * 2.9) * 0.12;
    }
    camera.position.copy(camPos);
    camera.fov = lerp(40, 30, clamp01(tt / T_PATH));
    camera.updateProjectionMatrix();
    camera.lookAt(look);
    ambient(dt);

    if (!reduced){
      /* Found, not presented: the glass catches the moon, the camera moves
         and it is gone, it catches again. The panel is not on, but it is
         not quite off: a faint wash, and once or twice a single dot. */
      const pulse = (c, w) => Math.max(0, 1 - Math.abs(T - c) / w);
      const g = Math.max(pulse(2.3, 0.35), pulse(3.5, 0.3) * 0.7, pulse(5.6, 0.45) * 0.5);
      glint.scale.setScalar(0.001 + g * 9);
      const px = (T > 3.02 && T < 3.12) || (T > 4.45 && T < 4.52) || (T > 6.3 && T < 6.34);
      screenState(T > 1.5 ? 0.12 : 0.06, px);
      /* The one thing. Far back between the trees for about a second,
         arriving and leaving behind a sheet of fog. */
      const seen = clamp01((T - 3.9) / 0.35) * clamp01((5.25 - T) / 0.45);
      stranger.material.opacity = 0.85 * seen;
      stranger.lookAt(camera.position.x, stranger.position.y, camera.position.z);
      veil.material.opacity = 0.22 * clamp01((T - 4.5) / 0.6) * clamp01((6.4 - T) / 0.8);
      veil.position.x = -80 + (T - 4.5) * 60;
      fadeEl.style.opacity = String(Math.max(0, 1 - T / 1.6));
    } else {
      screenState(0.12, false);
      fadeEl.style.opacity = '0';
    }

    if (tt >= T_PROMPT && !cueEl.classList.contains('on')){
      cue('Pick it up', 'tap, click or press <em>A</em>');
      IRZ.intro.say('Something is lying on the forest floor, its screen faintly lit. Press A, tap or click to pick it up. Escape skips.');
    }
    if (!reduced && T > T_AUTO) startPickup();
    const awake = !reduced || first;
    first = false;
    return awake;
  }

  function ambient(dt){
    if (reduced) return;
    for (const f of fogs){ f.position.x += f.userData.drift * dt; f.quaternion.copy(camera.quaternion); }
    veil.quaternion.copy(camera.quaternion);
    if (DROPS){
      for (let i = 0; i < DROPS; i++){
        let y = rainPos[i * 3 + 1] - rainV[i] * dt;
        if (y < 0) y += 260;
        rainPos[i * 3 + 1] = y; rainPos[i * 3] += dt * 6;
        if (rainPos[i * 3] > 220) rainPos[i * 3] -= 480;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
  }

  function startPickup(){
    if (state !== 'forest') return;
    audioStart(); sound('lift');
    cue('', '');
    glint.scale.setScalar(0.001);
    stranger.material.opacity = 0;
    branches.forEach(b => { b.visible = false; });
    from = { cam:camera.position.clone(), look:look.clone(), fov:camera.fov, pos:device.position.clone(),
             rx:device.rotation.x, ry:device.rotation.y, rz:device.rotation.z };
    if (reduced){ cut(); return; }
    state = 'pickup'; stepT = 0;
  }

  /* The machine rises and turns up to face you, and the camera goes in
     after the screen until the dark panel is the whole view. That is where
     the cut hides. */
  function pickupStep(dt){
    adapt(dt);
    stepT += dt;
    const k = clamp01(stepT / T_PICK);
    const lift = easeCubic(k * 1.12);
    device.position.lerpVectors(from.pos, HOLD, lift);
    device.rotation.set(lerp(from.rx, 0, lift), lerp(from.ry, 0, lift), lerp(from.rz, 0, lift));
    device.updateMatrixWorld();
    const c = easeCubic(k);
    device.localToWorld(tmp.set(0, M.LC_Y, M.BZ_FRONT));
    nrm.set(0, 0, 1).applyQuaternion(device.quaternion);
    camPos.copy(tmp).addScaledVector(nrm, FILL);
    camera.position.lerpVectors(from.cam, camPos, c);
    look.lerpVectors(from.look, tmp, clamp01(c * 1.35));
    camera.fov = lerp(from.fov, 26, c);
    camera.updateProjectionMatrix();
    camera.lookAt(look);
    ambient(dt);
    fadeEl.style.opacity = String(k > 0.8 ? (k - 0.8) / 0.2 : 0);
    if (k >= 1) cut();
    return true;
  }

  /* Through the glass. The forest goes, the room it was always in comes
     back, the lights and the camera are restored to what device.js expects,
     and the pull-back starts from exactly the framing the forest left. */
  function cut(){
    state = 'pull'; stepT = 0;
    scene.fog = saved.fog; scene.background = saved.background;
    forest.visible = false;
    device.remove(glint);
    ROOMS.forEach((o, i) => { o.visible = saved.room[i]; });
    L.rim.position.copy(saved.rimPos); L.rim.color.copy(saved.rimCol); L.rim.intensity = saved.rimI;
    L.rim2.position.copy(saved.rim2Pos); L.rim2.color.copy(saved.rim2Col); L.rim2.intensity = saved.rim2I;
    L.hemi.color.copy(saved.hemiSky); L.hemi.groundColor.copy(saved.hemiGround); L.hemi.intensity = saved.hemiI;
    h.studio(0.22, 0.55);
    screenState(0, false);
    device.rotation.order = 'XYZ'; device.rotation.set(0, 0, 0); device.position.set(0, 0, 0);
    camera.near = saved.near; camera.far = saved.far; camera.fov = saved.fov;
    camera.position.set(0, M.LC_Y, M.BZ_FRONT + FILL); camera.rotation.set(0, 0, 0);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(saved.dpr);
    bars.classList.add('open');
    sound('settle');
    ambienceOut(1.2);
    later(disposeForest, 50);
    if (reduced || skipped){ stepT = T_PULL; }
  }

  function pullStep(dt){
    stepT += dt;
    const k = clamp01(stepT / T_PULL), e = easeSine(k);
    camera.position.set(0, lerp(M.LC_Y, 0, e), lerp(M.BZ_FRONT + FILL, h.homeZ(), e));
    fadeEl.style.opacity = String(reduced || skipped ? 0 : Math.max(0, 1 - stepT / 0.35));
    if (k >= 1) held();
    return true;
  }

  function held(){
    state = 'held'; stepT = 0;
    camera.position.set(0, 0, h.homeZ());
    fadeEl.style.opacity = '0';
    ui.classList.add('held');
    root.classList.remove('intro');
    IRZ.intro.handheld();
    if (skipped){ later(autoPower, 180); return; }
    cue('Switch it on', 'press <em>POWER</em> or <em>P</em>');
    IRZ.intro.say('You are holding it. It is switched off. Press P or the power button to switch it on.');
    /* Nobody has to work out how. If the visitor does not, it does. */
    later(() => { if (state === 'held' && !IRZ.powered()) autoPower(); }, reduced ? 9000 : 7000);
  }

  function autoPower(){
    if (state !== 'held' || IRZ.powered()) return;
    h.input('power', true);
    later(() => h.input('power', false), 90);
  }

  /* Environment-led light to device-led light: the room comes up with the
     panel, over about a second, and then the prologue is over. */
  IRZ.on('power', e => {
    if (state !== 'held' || !e.on) return;
    state = 'lit'; stepT = 0;
    cue('', '');
    sound('click'); sound('hum');
  });
  function litStep(dt){
    stepT += dt;
    const k = reduced ? 1 : clamp01(stepT / 1.3), e = easeSine(k);
    h.studio(lerp(0.22, 1, e), lerp(0.55, 1, e));
    if (k >= 1) finish();
    return true;
  }

  function finish(){
    state = 'done';
    h.studio(1, 1);
    IRZ.intro.gate(null);
    later(() => { ui.remove(); }, 1200);
    if (actx){
      const ctx = actx;
      setTimeout(() => { try { ctx.close(); } catch(e){} }, 2600);
    }
    // the last timer to run is the one that removes the page layer; nothing else is left scheduled
    for (const id of timers) if (id) { /* kept: ui removal */ }
  }

  function skip(){
    if (state !== 'forest' && state !== 'pickup') return;
    skipped = true;
    cue('', '');
    from = from || {};
    cut();
  }

  function disposeForest(){
    scene.remove(forest);
    forest.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (m) (Array.isArray(m) ? m : [m]).forEach(x => x.dispose());
    });
    glint.material.dispose();
    textures.forEach(t => t.dispose());
    textures.length = 0;
  }

  function gate(btn, down){
    if (state === 'forest' || state === 'pickup' || state === 'pull'){
      if (down){
        audioStart();
        if (btn === 'b') skip();
        else if (state === 'forest') startPickup();
      }
      return true;
    }
    return false;
  }

  skipEl.addEventListener('click', () => { audioStart(); skip(); });

  return {
    start(){
      state = 'forest'; T = 0;
      document.body.appendChild(ui);
      root.classList.add('intro');
      IRZ.intro.begin();
      IRZ.intro.gate(gate);
      IRZ.intro.legend('A pick up · ESC skip');
      later(() => skipEl.classList.add('on'), reduced ? 0 : 1400);
      if (reduced) bars.classList.add('open');
    },
    update(dt){
      if (state === 'idle' || state === 'done') return false;
      T += dt;
      if (state === 'forest') return forestStep(dt);
      if (state === 'pickup') return pickupStep(dt);
      if (state === 'pull') return pullStep(dt);
      if (state === 'lit') return litStep(dt);
      return false;
    },
    ownsCamera(){ return state === 'idle' || state === 'forest' || state === 'pickup' || state === 'pull'; },
    done(){ return state === 'done'; },
    pointer(){
      if (state === 'forest'){ audioStart(); startPickup(); return true; }
      return state === 'pickup' || state === 'pull';
    }
  };
}
