// Jogo principal: monta o depósito, controla o jogador, os computadores, as portas,
// a criatura, o HUD e as telas de vitória / derrota.
(function () {
  'use strict';

  // ================== CONFIGURAÇÃO ==================
  const CELL = 2;            // tamanho de cada célula do mapa (metros)
  const WALL_H = 3;          // altura das paredes
  const EYE = 1.62;          // altura dos olhos do jogador
  const PLAYER_R = 0.33;     // raio de colisão do jogador
  const PLAYER_SPEED = 3.4;  // velocidade do jogador (m/s)
  const MONSTER = {
    walk: 1.5,                   // patrulhando devagar
    hunt: 2.3,                   // andando direto até o jogador (depois dos 5 PCs)
    chase: PLAYER_SPEED * 1.25,  // correndo: 25% mais rápido que o jogador
  };
  const CATCH_DIST = 1.15;
  const SIGHT_LIGHT_ON = 16;   // alcance da visão da criatura com a lanterna ligada
  const SIGHT_LIGHT_OFF = 7;   // ... e com a lanterna desligada
  const TOTAL_PCS = 7;         // computadores espalhados pelo mapa
  const NEEDED = 5;            // quantos precisam ser hackeados
  const QUESTIONS_PER_PC = 3;  // perguntas certas para hackear um computador
  const CAR_HOLD = 2.5;        // segundos segurando E para entrar no carro
  const TEST = /[?&]teste=1/.test(location.search);

  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const sfx = (name, ...args) => { if (SFX.ready) SFX[name](...args); };

  // ================== MAPA / GRADE ==================
  const M = MAPA.map((r) => r.split(''));
  const ROWS = M.length, COLS = M[0].length;
  const INTERIOR_ROWS = M.findIndex((r) => r.includes('o')); // primeira linha do pátio
  const at = (r, c) => (r < 0 || c < 0 || r >= ROWS || c >= COLS ? '#' : M[r][c]);
  const center = (r, c) => ({ x: c * CELL + CELL / 2, z: r * CELL + CELL / 2 });
  const cellOf = (x, z) => ({ r: Math.floor(z / CELL), c: Math.floor(x / CELL) });
  const key = (r, c) => r * COLS + c;
  const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];

  let exitsOpen = false;
  const blockedExtra = new Set(); // células ocupadas por mesas / carro (para o caminho da criatura)
  const colliders = [];           // caixas extras de colisão {minX,maxX,minZ,maxZ}
  const doorByCell = new Map();

  function solidMove(r, c) {
    const ch = at(r, c);
    return ch === '#' || ch === 'F' || ch === 'x' || ch === 'S' || (ch === 'E' && !exitsOpen);
  }
  function solidPath(r, c) {
    return solidMove(r, c) || blockedExtra.has(key(r, c));
  }
  function solidSight(r, c) {
    const ch = at(r, c);
    if (ch === 'D') return doorByCell.get(key(r, c)).open < 0.5;
    return ch === '#' || ch === 'x' || ch === 'S' || (ch === 'E' && !exitsOpen);
  }

  function lineOfSight(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.ceil(d / 0.2);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const { r, c } = cellOf(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
      if (solidSight(r, c)) return false;
    }
    return true;
  }

  function clearWalk(x0, z0, x1, z1, rad) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(d / 0.25));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      for (const [ox, oz] of [[-rad, -rad], [rad, -rad], [-rad, rad], [rad, rad]]) {
        const { r, c } = cellOf(x + ox, z + oz);
        if (solidPath(r, c)) return false;
      }
    }
    return true;
  }

  // BFS na grade: devolve lista de pontos até o alvo
  function findPath(x0, z0, x1, z1) {
    const s = cellOf(x0, z0);
    let g = cellOf(x1, z1);
    if (solidPath(g.r, g.c)) {
      const alt = DIRS.map(([dr, dc]) => ({ r: g.r + dr, c: g.c + dc })).find((n) => !solidPath(n.r, n.c));
      if (!alt) return [];
      g = alt;
    }
    const prev = new Int32Array(ROWS * COLS).fill(-1);
    const sk = key(s.r, s.c), gk = key(g.r, g.c);
    prev[sk] = sk;
    const q = [sk];
    let found = sk === gk;
    while (q.length && !found) {
      const k = q.shift();
      const r = Math.floor(k / COLS), c = k % COLS;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (solidPath(nr, nc)) continue;
        const nk = key(nr, nc);
        if (prev[nk] !== -1) continue;
        prev[nk] = k;
        if (nk === gk) { found = true; break; }
        q.push(nk);
      }
    }
    if (!found) return [];
    const path = [];
    for (let k = gk; k !== sk; k = prev[k]) path.push(center(Math.floor(k / COLS), k % COLS));
    path.reverse();
    if (path.length && !solidPath(cellOf(x1, z1).r, cellOf(x1, z1).c)) path[path.length - 1] = { x: x1, z: z1 };
    if (!path.length) path.push({ x: x1, z: z1 });
    return path;
  }

  // ---- colisão de círculo contra a grade e caixas ----
  function pushOut(p, rad, minX, maxX, minZ, maxZ) {
    const cx = Math.max(minX, Math.min(p.x, maxX));
    const cz = Math.max(minZ, Math.min(p.z, maxZ));
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rad * rad) return;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * rad;
      p.z = cz + (dz / d) * rad;
    } else {
      const pens = [p.x - minX + rad, maxX - p.x + rad, p.z - minZ + rad, maxZ - p.z + rad];
      const m = Math.min(...pens);
      if (m === pens[0]) p.x = minX - rad;
      else if (m === pens[1]) p.x = maxX + rad;
      else if (m === pens[2]) p.z = minZ - rad;
      else p.z = maxZ + rad;
    }
  }
  function resolve(p, rad) {
    const c0 = Math.floor((p.x - rad) / CELL), c1 = Math.floor((p.x + rad) / CELL);
    const r0 = Math.floor((p.z - rad) / CELL), r1 = Math.floor((p.z + rad) / CELL);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (solidMove(r, c)) pushOut(p, rad, c * CELL, (c + 1) * CELL, r * CELL, (r + 1) * CELL);
    }
    for (const b of colliders) pushOut(p, rad, b.minX, b.maxX, b.minZ, b.maxZ);
  }
  function moveCircle(p, dx, dz, rad) {
    p.x += dx; resolve(p, rad);
    p.z += dz; resolve(p, rad);
  }

  // ================== RENDER / CENA ==================
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  $('jogo').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020304);
  scene.fog = new THREE.FogExp2(0x020304, 0.075);

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 120);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  scene.add(new THREE.AmbientLight(0x8090a0, 0.09));

  // ---------- texturas ----------
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  function tex(canvas, rx, ry) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx || 1, ry || 1);
    t.anisotropy = Math.min(8, maxAniso);
    return t;
  }
  const T = TEXTURAS;
  // Texturas fotográficas (ambientCG) quando carregaram; senão, as desenhadas em canvas.
  const PBR = window.MATERIAIS_PBR || {};
  function pbr(nome, rx, ry, fallback, extra) {
    const m = PBR[nome];
    if (!m || !m.map || !m.normalMap || !m.roughnessMap) return fallback;
    const maps = {};
    for (const k of ['map', 'normalMap', 'roughnessMap']) {
      const t = m[k].clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      t.anisotropy = Math.min(8, maxAniso);
      if (k === 'map') t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      maps[k] = t;
    }
    return new THREE.MeshStandardMaterial({ ...maps, ...extra });
  }
  const MAT = {
    wall: pbr('Concrete044B', 1, 1.5, new THREE.MeshStandardMaterial({ map: tex(T.wall()), roughness: 0.92 })),
    floor: pbr('Concrete035', COLS / 2, INTERIOR_ROWS / 2, new THREE.MeshStandardMaterial({ map: tex(T.floor(), COLS, INTERIOR_ROWS), roughness: 0.85 })),
    ceiling: pbr('Concrete033', COLS / 2, INTERIOR_ROWS / 2, new THREE.MeshStandardMaterial({ map: tex(T.ceiling(), COLS, INTERIOR_ROWS), roughness: 1 })),
    crate: new THREE.MeshStandardMaterial({ map: tex(T.crate()), roughness: 0.9 }),
    cardboard: new THREE.MeshStandardMaterial({ map: tex(T.cardboard()), roughness: 1 }),
    door: pbr('Rust004', 1, 1.2, new THREE.MeshStandardMaterial({ map: tex(T.metal('#4b5560', false)), roughness: 0.6, metalness: 0.4 }), { metalness: 0.5 }),
    shutter: new THREE.MeshStandardMaterial({ map: tex(T.metal('#7a5a3a', true)), roughness: 0.6, metalness: 0.3 }),
    rack: pbr('Rust004', 0.2, 1.5, new THREE.MeshStandardMaterial({ color: 0x24406a, roughness: 0.6, metalness: 0.5 }), { metalness: 0.5 }),
    rackShelf: pbr('Rust004', 1, 0.8, new THREE.MeshStandardMaterial({ color: 0x8a5a18, roughness: 0.8 }), { metalness: 0.4 }),
    asphalt: pbr('Asphalt026C', COLS / 3, (ROWS - INTERIOR_ROWS) / 3, new THREE.MeshStandardMaterial({ map: tex(T.asphalt(), COLS / 2, (ROWS - INTERIOR_ROWS) / 2), roughness: 0.95 })),
    grass: new THREE.MeshStandardMaterial({ map: tex(T.grass(), 60, 60), roughness: 1 }),
    fence: new THREE.MeshStandardMaterial({ map: tex(T.fence(), 1, 1.3), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.6 }),
    desk: new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.8 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.5 }),
    beige: new THREE.MeshStandardMaterial({ color: 0x8f877a, roughness: 0.6 }),
    lampOn: new THREE.MeshBasicMaterial({ color: 0xffe2b0 }),
    lampOff: new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6 }),
    pole: new THREE.MeshStandardMaterial({ color: 0x333438, roughness: 0.5, metalness: 0.6 }),
  };

  // ---------- modelos 3D (modelos/*.glb) ----------
  const MOD = window.MODELOS || {};
  const tem = (...nomes) => nomes.every((n) => MOD[n]);
  // Cópia de um modelo, centralizada em x/z e com a base em y=0.
  // opts.fit: maior lado horizontal em metros; opts.height: altura em metros; opts.scale: escala direta.
  function modelo(nome, opts = {}) {
    const src = MOD[nome].scene;
    src.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(opts.only ? src.getObjectByName(opts.only) : src);
    const size = box.getSize(new THREE.Vector3());
    let s = opts.scale || 1;
    if (opts.fit) s = opts.fit / Math.max(size.x, size.z);
    if (opts.height) s = opts.height / size.y;
    const obj = src.clone(true);
    if (opts.only) obj.traverse((o) => { if (o.isMesh && o.name !== opts.only) o.visible = false; });
    obj.scale.multiplyScalar(s);
    const c = box.getCenter(new THREE.Vector3());
    obj.position.set(-c.x * s, -box.min.y * s, -c.z * s);
    obj.traverse((o) => {
      if (o.isMesh) { o.castShadow = opts.shadow !== false; o.receiveShadow = true; }
    });
    const g = new THREE.Group();
    g.add(obj);
    g.userData.size = size.multiplyScalar(s);
    return g;
  }

  // ================== CONSTRUÇÃO DO MUNDO ==================
  const W = COLS * CELL;
  const IH = INTERIOR_ROWS * CELL;

  // chão e teto do depósito
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, IH), MAT.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, IH / 2);
  floor.receiveShadow = true;
  scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, IH), MAT.ceiling);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(W / 2, WALL_H, IH / 2);
  scene.add(ceil);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, IH), new THREE.MeshStandardMaterial({ color: 0x1a1a1c }));
  roof.position.set(W / 2, WALL_H + 0.2, IH / 2);
  scene.add(roof);

  // pátio, grama, cerca
  const yardH = (ROWS - INTERIOR_ROWS) * CELL;
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(W, yardH), MAT.asphalt);
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(W / 2, 0.005, IH + yardH / 2);
  yard.receiveShadow = true;
  scene.add(yard);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), MAT.grass);
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(W / 2, -0.02, IH);
  scene.add(grass);

  // paredes (InstancedMesh)
  const wallCells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (M[r][c] !== '#') continue;
    let visible = false;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const n = at(r + dr, c + dc);
      if (n !== '#' && !(r + dr < 0 || c + dc < 0 || r + dr >= ROWS || c + dc >= COLS)) visible = true;
    }
    if (visible) wallCells.push([r, c]);
  }
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, WALL_H, CELL), MAT.wall, wallCells.length);
  const tmp = new THREE.Object3D();
  wallCells.forEach(([r, c], i) => {
    const p = center(r, c);
    tmp.position.set(p.x, WALL_H / 2, p.z);
    tmp.updateMatrix();
    walls.setMatrixAt(i, tmp.matrix);
  });
  walls.castShadow = true;
  walls.receiveShadow = true;
  scene.add(walls);

  // cerca
  const fenceGeo = new THREE.BoxGeometry(CELL, 2.6, 0.05);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (M[r][c] !== 'F') continue;
    const p = center(r, c);
    const f = new THREE.Mesh(fenceGeo, MAT.fence);
    f.position.set(p.x, 1.3, p.z);
    if (at(r - 1, c) === 'F' || at(r + 1, c) === 'F') f.rotation.y = Math.PI / 2;
    scene.add(f);
  }

  // caixotes: pilhas de modelos reais (ou caixas desenhadas, sem os modelos)
  const PILHAS = [
    ['wooden_crate_01', 'wooden_crate_02'],
    ['barrel_01', 'barrel_03', 'metal_trash_can'],
    ['cardboard_box_01'],
    ['old_military_crate', 'wooden_crate_02'],
  ];
  // empilha cópias de um modelo em colunas dentro da célula
  function pilha(p, nome, fit, cols, alturaMax) {
    for (let i = 0; i < cols.length; i++) {
      const [ox, oz] = cols[i];
      let y = 0;
      const n = 1 + Math.floor(Math.random() * alturaMax);
      for (let k = 0; k < n; k++) {
        const m = modelo(nome, { fit: fit * rand(0.92, 1.05) });
        m.position.set(p.x + ox + rand(-0.05, 0.05), y, p.z + oz + rand(-0.05, 0.05));
        m.rotation.y = rand(-0.15, 0.15) + (Math.random() < 0.5 ? 0 : Math.PI / 2);
        scene.add(m);
        y += m.userData.size.y;
      }
    }
  }
  const crateGeo = new THREE.BoxGeometry(1.8, 1.8, 1.8);
  const smallCrateGeo = new THREE.BoxGeometry(1.15, 1.15, 1.15);
  const temPilhas = PILHAS.every((l) => tem(...l));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (M[r][c] !== 'x') continue;
    const p = center(r, c);
    if (temPilhas) {
      const tipo = Math.floor(Math.random() * PILHAS.length);
      const lista = PILHAS[tipo];
      const um = () => lista[Math.floor(Math.random() * lista.length)];
      const quatro = [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]];
      if (tipo === 0) { pilha(p, um(), 1.6, [[0, 0]], 2); }
      else if (tipo === 1) { pilha(p, um(), 0.75, quatro, 2); }
      else if (tipo === 2) { pilha(p, um(), 0.85, quatro, 3); }
      else { pilha(p, um(), 1.5, [[0, 0]], 3); }
      continue;
    }
    const a = new THREE.Mesh(crateGeo, MAT.crate);
    a.position.set(p.x, 0.9, p.z);
    a.rotation.y = rand(-0.08, 0.08);
    a.castShadow = a.receiveShadow = true;
    scene.add(a);
    if (Math.random() < 0.6) {
      const b = new THREE.Mesh(smallCrateGeo, MAT.crate);
      b.position.set(p.x + rand(-0.2, 0.2), 1.8 + 0.575, p.z + rand(-0.2, 0.2));
      b.rotation.y = rand(0, Math.PI);
      b.castShadow = b.receiveShadow = true;
      scene.add(b);
    }
  }

  // prateleiras
  const postGeo = new THREE.BoxGeometry(0.07, 2.7, 0.07);
  const boardGeo = new THREE.BoxGeometry(1.9, 0.05, 1.5);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (M[r][c] !== 'S') continue;
    const p = center(r, c);
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    for (const sx of [-0.92, 0.92]) for (const sz of [-0.72, 0.72]) {
      const post = new THREE.Mesh(postGeo, MAT.rack);
      post.position.set(sx, 1.35, sz);
      g.add(post);
    }
    for (const y of [0.15, 0.85, 1.55, 2.25]) {
      const b = new THREE.Mesh(boardGeo, MAT.rackShelf);
      b.position.y = y;
      b.castShadow = b.receiveShadow = true;
      g.add(b);
      let x = -0.85;
      while (x < 0.7) {
        const w = rand(0.3, 0.6), h = rand(0.25, 0.55), d = rand(0.5, 1.3);
        if (Math.random() < 0.8 && tem('cardboard_box_01')) {
          const box = modelo('cardboard_box_01', { fit: w * 1.2, shadow: false });
          box.position.set(x + w / 2, y + 0.025, rand(-0.25, 0.25));
          box.rotation.y = rand(-0.2, 0.2);
          g.add(box);
        } else if (Math.random() < 0.8) {
          const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.cardboard);
          box.position.set(x + w / 2, y + 0.025 + h / 2, rand(-0.1, 0.1));
          box.rotation.y = rand(-0.1, 0.1);
          box.castShadow = box.receiveShadow = true;
          g.add(box);
        }
        x += w + 0.05;
      }
    }
    scene.add(g);
  }

  // ---------- portas internas ----------
  const doors = [];
  const lintelGeo = new THREE.BoxGeometry(CELL, 0.6, CELL);
  const doorGeo = new THREE.BoxGeometry(CELL * 0.98, 2.4, 0.1);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (M[r][c] !== 'D') continue;
    const p = center(r, c);
    const lintel = new THREE.Mesh(lintelGeo, MAT.wall);
    lintel.position.set(p.x, 2.7, p.z);
    lintel.castShadow = true;
    scene.add(lintel);
    const alongX = at(r, c - 1) === '#' && at(r, c + 1) === '#';
    const panel = new THREE.Mesh(doorGeo, MAT.door);
    panel.castShadow = panel.receiveShadow = true;
    if (!alongX) panel.rotation.y = Math.PI / 2;
    panel.position.set(p.x, 1.2, p.z);
    scene.add(panel);
    const d = { r, c, x: p.x, z: p.z, panel, alongX, open: 0, target: 0 };
    doors.push(d);
    doorByCell.set(key(r, c), d);
  }

  // ---------- saídas (portões de enrolar) ----------
  const exits = [];
  const exitClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 2.62);
  renderer.localClippingEnabled = true;
  const signTex = {
    locked: tex(T.sign('SAÍDA', '#5a0000', '#ff5050')),
    open: tex(T.sign('SAÍDA', '#003a10', '#50ff80')),
  };
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (M[r][c] !== 'E') continue;
    const p = center(r, c);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(CELL, 0.4, CELL), MAT.wall);
    lintel.position.set(p.x, 2.8, p.z);
    scene.add(lintel);
    // lado de dentro: linha de cima (r-1) se for chão
    const inDir = at(r - 1, c) !== '#' ? -1 : 1;
    let shutter, model = false;
    if (tem('rollershutter_door')) {
      // portão real; ao abrir ele sobe e é cortado na altura do batente
      shutter = modelo('rollershutter_door', { only: 'rollershutter_door' });
      shutter.scale.set(CELL * 0.97 / 1.08, 2.62 / 2.4, 1);
      shutter.position.set(p.x, 0, p.z);
      if (inDir > 0) shutter.rotation.y = Math.PI;
      shutter.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.clippingPlanes = [exitClip];
      });
      model = true;
      if (tem('security_light')) {
        const sl = modelo('security_light', { height: 0.45 });
        sl.position.set(p.x + 1.2, 2.45, p.z - inDir * (CELL / 2 + 0.15));
        sl.rotation.y = inDir > 0 ? 0 : Math.PI;
        scene.add(sl);
      }
    } else {
      shutter = new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.98, 2.6, 0.15), MAT.shutter);
      shutter.position.set(p.x, 1.3, p.z);
      shutter.castShadow = true;
    }
    scene.add(shutter);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex.locked });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42), signMat);
    sign.position.set(p.x, 2.78, p.z + inDir * (CELL / 2 + 0.01));
    if (inDir < 0) sign.rotation.y = Math.PI;
    scene.add(sign);
    const light = new THREE.PointLight(0xff1a1a, 5, 8, 2);
    light.position.set(p.x, 2.5, p.z + inDir * 1.5);
    scene.add(light);
    exits.push({ r, c, x: p.x, z: p.z, shutter, model, signMat, light, open: 0 });
  }

  // ---------- lâmpadas ----------
  const lamps = [];
  const fixtureGeo = new THREE.BoxGeometry(1.0, 0.08, 0.22);
  const lampCells = [];
  for (let r = 0; r < INTERIOR_ROWS; r++) for (let c = 0; c < COLS; c++) if (M[r][c] === 'L') lampCells.push([r, c]);
  shuffle(lampCells);
  lampCells.forEach(([r, c], i) => {
    const p = center(r, c);
    const lit = i < 9;
    let f;
    if (tem('caged_hanging_light')) {
      // luminária industrial pendurada por correntes; o pivô fica no teto
      f = new THREE.Group();
      f.position.set(p.x, WALL_H, p.z);
      f.rotation.y = Math.random() < 0.5 ? 0 : Math.PI / 2;
      const lum = modelo('caged_hanging_light', { shadow: false });
      lum.position.y = -lum.userData.size.y;
      f.add(lum);
      const tubo = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.035, 0.035), lit ? MAT.lampOn.clone() : MAT.lampOff);
      tubo.position.y = -lum.userData.size.y + 0.07;
      f.add(tubo);
      if (!lit) f.rotation.z = rand(-0.5, 0.5); // quebrada, pendurada torta
      f.material = tubo.material;
    } else {
      f = new THREE.Mesh(fixtureGeo, lit ? MAT.lampOn.clone() : MAT.lampOff);
      f.position.set(p.x, WALL_H - 0.06, p.z);
      f.rotation.y = Math.random() < 0.5 ? 0 : Math.PI / 2;
      if (!lit) f.rotation.z = rand(-0.4, 0.4); // lâmpada quebrada, pendurada torta
    }
    scene.add(f);
    if (lit) {
      const l = new THREE.PointLight(0xffd29a, 14, 11, 2);
      l.position.set(p.x, f.isGroup ? WALL_H - 0.85 : WALL_H - 0.3, p.z);
      scene.add(l);
      lamps.push({ light: l, mesh: f, base: 14, flicker: i < 4, t: Math.random() * 10, off: 0 });
    }
  });

  // ---------- sangue e escritas ----------
  const bloodTex = [0, 1, 2].map(() => tex(T.blood()));
  function addBlood(x, z, s) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(s, s),
      new THREE.MeshStandardMaterial({ map: bloodTex[Math.floor(Math.random() * 3)], transparent: true, depthWrite: false, roughness: 0.3 })
    );
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rand(0, Math.PI * 2);
    m.position.set(x, 0.012, z);
    m.receiveShadow = true;
    scene.add(m);
  }
  const floorCells = [];
  for (let r = 0; r < INTERIOR_ROWS; r++) for (let c = 0; c < COLS; c++) {
    const ch = M[r][c];
    if ('.LBCMP'.includes(ch)) floorCells.push([r, c]);
    if (ch === 'B') { const p = center(r, c); addBlood(p.x, p.z, rand(1.6, 2.4)); }
  }
  for (let i = 0; i < 10; i++) {
    const [r, c] = floorCells[Math.floor(Math.random() * floorCells.length)];
    const p = center(r, c);
    addBlood(p.x + rand(-0.6, 0.6), p.z + rand(-0.6, 0.6), rand(0.6, 1.4));
  }
  const frases = shuffle(['FUJA', 'ELE VÊ A LUZ', 'NÃO CORRA', 'SOCORRO', 'ELE ESTÁ AQUI', '5 PCs', 'NÃO OLHE PRA TRÁS', 'APAGUE A LANTERNA']);
  let fi = 0;
  for (const [r, c] of shuffle(floorCells.slice())) {
    if (fi >= 7) break;
    if (M[r][c] !== '.') continue;
    const dir = DIRS.find(([dr, dc]) => at(r + dr, c + dc) === '#' && r + dr < INTERIOR_ROWS - 1 && r + dr > 0);
    if (!dir) continue;
    const p = center(r, c);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.1),
      new THREE.MeshStandardMaterial({ map: tex(T.writing(frases[fi++])), transparent: true, depthWrite: false, roughness: 0.8 })
    );
    const [dr, dc] = dir;
    m.position.set(p.x + dc * (CELL / 2 - 0.01), rand(1.3, 1.9), p.z + dr * (CELL / 2 - 0.01));
    m.rotation.y = Math.atan2(-dc, -dr);
    m.rotation.z = rand(-0.12, 0.12);
    scene.add(m);
  }

  // ---------- computadores ----------
  const computers = [];
  const cCells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (M[r][c] === 'C') cCells.push([r, c]);
  shuffle(cCells).slice(0, TOTAL_PCS).forEach(([r, c], idx) => {
    const [dr, dc] = DIRS.find(([a, b]) => at(r + a, c + b) === '#');
    const p = center(r, c);
    const g = new THREE.Group();
    const px = p.x + dc * (CELL / 2 - 0.42), pz = p.z + dr * (CELL / 2 - 0.42);
    g.position.set(px, 0, pz);
    g.rotation.y = Math.atan2(-dc, -dr); // frente (+z local) virada para o lado oposto à parede
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 192;
    const screenTex = new THREE.CanvasTexture(canvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
    if (tem('metal_office_desk', 'television_02')) {
      // mesa de escritório de metal + monitor de tubo
      const desk = modelo('metal_office_desk');
      desk.scale.set(0.75, 1, 0.8);
      g.add(desk);
      const deskH = desk.userData.size.y;
      const tv = modelo('television_02', { scale: 1.45 });
      tv.position.set(0, deskH, -0.06);
      g.add(tv);
      const s = 1.45;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.29 * s, 0.22 * s), screenMat);
      screen.position.set(0, deskH + 0.255 * s, -0.06 + tv.userData.size.z / 2 + 0.004);
      g.add(screen);
    } else {
      // mesa
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.75), MAT.desk);
      top.position.y = 0.75;
      top.castShadow = top.receiveShadow = true;
      g.add(top);
      for (const sx of [-0.7, 0.7]) for (const sz of [-0.32, 0.32]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), MAT.plastic);
        leg.position.set(sx, 0.375, sz);
        g.add(leg);
      }
      // monitor CRT
      const mon = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.48, 0.45), MAT.beige);
      mon.position.set(0, 1.03, -0.12);
      mon.castShadow = true;
      g.add(mon);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.39), screenMat);
      screen.position.set(0, 1.04, 0.106);
      g.add(screen);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.45, 0.45), MAT.beige);
      tower.position.set(0.55, 1.0, -0.1);
      g.add(tower);
    }
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.17), MAT.plastic);
    kb.position.set(0, 0.795, 0.24);
    g.add(kb);
    const light = new THREE.PointLight(0x4f9dff, 3, 5, 2);
    light.position.set(0, 1.1, 0.6);
    g.add(light);
    scene.add(g);

    const along = dc !== 0; // parede a leste/oeste → mesa gira 90°
    const hx = along ? 0.375 : 0.75, hz = along ? 0.75 : 0.375;
    colliders.push({ minX: px - hx, maxX: px + hx, minZ: pz - hz, maxZ: pz + hz });
    blockedExtra.add(key(r, c));
    const pc = {
      id: idx + 1, x: px, z: pz, fx: -dc, fz: -dr, canvas, screenTex, light,
      progress: 0, done: false, blink: 0,
    };
    computers.push(pc);
    drawScreen(pc);
  });
  // células "C" sem computador viram chão comum
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (M[r][c] === 'C' && !blockedExtra.has(key(r, c))) M[r][c] = '.';

  function drawScreen(pc, mode) {
    const g = pc.canvas.getContext('2d');
    const w = pc.canvas.width, h = pc.canvas.height;
    const done = pc.done;
    g.fillStyle = done ? '#021a06' : mode === 'erro' ? '#2a0000' : '#020a14';
    g.fillRect(0, 0, w, h);
    g.font = 'bold 18px monospace';
    g.fillStyle = done ? '#4dff7a' : mode === 'erro' ? '#ff4040' : '#5fb4ff';
    g.fillText(`TERMINAL #${pc.id}`, 14, 30);
    g.font = '15px monospace';
    if (done) {
      g.fillText('ACESSO CONCEDIDO', 14, 80);
      g.fillText('>> sistema hackeado', 14, 110);
    } else if (mode === 'erro') {
      g.fillText('ACESSO NEGADO!', 14, 80);
      g.fillText('!! alarme disparado', 14, 110);
    } else {
      g.fillText('SISTEMA BLOQUEADO', 14, 70);
      g.fillText(`senha: ${'*'.repeat(pc.progress)}${'_'.repeat(QUESTIONS_PER_PC - pc.progress)}`, 14, 100);
      if (pc.blink % 2 === 0) g.fillText('> █', 14, 140);
      else g.fillText('>', 14, 140);
    }
    // linhas de CRT
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
    pc.screenTex.needsUpdate = true;
  }

  // ---------- carro de fuga + postes ----------
  let car = null;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (M[r][c] !== 'K') continue;
    const p = center(r, c);
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    let frente = 2.16;
    if (tem('carro_sedan')) {
      const sedan = modelo('carro_sedan', { scale: 1.6 });
      sedan.scale.y = 0.85;
      sedan.rotation.y = Math.PI / 2; // frente (+z do modelo) virada para +x
      // tira a cor de brinquedo: textura dessaturada e escurecida (carro velho e sujo)
      sedan.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.roughness = 0.7;
        const img = o.material.map && o.material.map.image;
        if (img && img.width) {
          const cv = document.createElement('canvas');
          cv.width = img.width; cv.height = img.height;
          const cg = cv.getContext('2d');
          cg.filter = 'saturate(0.3) brightness(0.55) sepia(0.25)';
          cg.drawImage(img, 0, 0);
          const t = new THREE.CanvasTexture(cv);
          t.colorSpace = THREE.SRGBColorSpace;
          t.flipY = o.material.map.flipY;
          t.magFilter = o.material.map.magFilter;
          o.material.map = t;
        }
      });
      g.add(sedan);
      frente = sedan.userData.size.z / 2;
    } else {
      const paint = new THREE.MeshStandardMaterial({ color: 0x5a1d18, roughness: 0.45, metalness: 0.5 });
      const glass = new THREE.MeshStandardMaterial({ color: 0x0a0e12, roughness: 0.1, metalness: 0.8 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.75, 1.85), paint);
      body.position.y = 0.65;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.62, 1.65), glass);
      cabin.position.set(-0.2, 1.33, 0);
      const roofC = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 1.6), paint);
      roofC.position.set(-0.2, 1.66, 0);
      [body, cabin, roofC].forEach((m) => { m.castShadow = true; g.add(m); });
      const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 16);
      wheelGeo.rotateX(Math.PI / 2);
      const tire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
      for (const sx of [-1.35, 1.35]) for (const sz of [-0.85, 0.85]) {
        const w = new THREE.Mesh(wheelGeo, tire);
        w.position.set(sx, 0.38, sz);
        g.add(w);
      }
    }
    const hlMat = new THREE.MeshBasicMaterial({ color: 0x333322 });
    for (const sz of [-0.6, 0.6]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.36), hlMat);
      hl.position.set(frente, 0.75, sz);
      g.add(hl);
    }
    const head = new THREE.SpotLight(0xfff3d0, 0, 30, 0.5, 0.5, 1.5);
    head.position.set(frente + 0.1, 0.8, 0);
    head.target.position.set(10, 0, 0);
    g.add(head, head.target);
    scene.add(g);
    const hx = tem('carro_sedan') ? frente - 0.05 : 2.2, hz = tem('carro_sedan') ? 1.15 : 0.95;
    colliders.push({ minX: p.x - hx, maxX: p.x + hx, minZ: p.z - hz, maxZ: p.z + hz });
    for (const dc of [-1, 0, 1]) blockedExtra.add(key(r, c + dc));
    car = { x: p.x, z: p.z, hx, hz, hlMat, head };
  }
  for (const [r, c] of [[INTERIOR_ROWS + 1, 6], [INTERIOR_ROWS + 1, COLS - 7]]) {
    const p = center(r, c);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5, 8), MAT.pole);
    pole.position.set(p.x, 2.5, p.z);
    pole.castShadow = true;
    scene.add(pole);
    const lampHead = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: 0xffb060 }));
    lampHead.position.set(p.x, 5, p.z);
    scene.add(lampHead);
    const l = new THREE.PointLight(0xff9a40, 45, 20, 1.8);
    l.position.set(p.x, 4.8, p.z);
    scene.add(l);
    colliders.push({ minX: p.x - 0.12, maxX: p.x + 0.12, minZ: p.z - 0.12, maxZ: p.z + 0.12 });
  }

  // ---------- objetos espalhados (cadeira de rodas, barris, lixeiras...) ----------
  if (tem('covered_car')) {
    // carro abandonado, coberto com lona, no estacionamento
    const r = INTERIOR_ROWS + 3, c = 7;
    const p = center(r, c);
    const cc = modelo('covered_car', { fit: 4.2 });
    cc.position.set(p.x, 0, p.z);
    cc.rotation.y = Math.PI / 2;
    scene.add(cc);
    colliders.push({ minX: p.x - 2.1, maxX: p.x + 2.1, minZ: p.z - 0.9, maxZ: p.z + 0.9 });
    for (const dc of [-1, 0, 1]) blockedExtra.add(key(r, c + dc));
  }
  const PROPS = [['wheelchair_01', 0.9], ['barrel_01', 0.65], ['metal_trash_can', 0.6], ['industrial_storage_cart', 1.1],
    ['barrel_03', 0.65], ['plastic_crate_03', 0.7], ['old_military_crate', 1.0]];
  if (tem(...PROPS.map((x) => x[0]))) {
    const ps = (() => {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (M[r][c] === 'P') return { r, c };
    })();
    // quantas células o jogador alcança (para não bloquear nenhum caminho)
    const alcance = () => {
      const seen = new Set([key(ps.r, ps.c)]);
      const q = [[ps.r, ps.c]];
      while (q.length) {
        const [r, c] = q.pop();
        for (const [dr, dc] of DIRS) {
          const k = key(r + dr, c + dc);
          if (seen.has(k) || solidPath(r + dr, c + dc) || at(r + dr, c + dc) === 'E') continue;
          seen.add(k);
          q.push([r + dr, c + dc]);
        }
      }
      return seen.size;
    };
    const vizinhos = (r, c, f) => [-1, 0, 1].some((dr) => [-1, 0, 1].some((dc) => f(r + dr, c + dc)));
    const candidatos = shuffle(floorCells.filter(([r, c]) =>
      M[r][c] === '.' && Math.abs(r - ps.r) + Math.abs(c - ps.c) > 3 &&
      DIRS.some(([a, b]) => at(r + a, c + b) === '#') &&
      !vizinhos(r, c, (rr, cc) => 'DE'.includes(at(rr, cc)) || blockedExtra.has(key(rr, cc)))));
    let base = alcance(), n = 0;
    for (const [r, c] of candidatos) {
      if (n >= 12) break;
      if (vizinhos(r, c, (rr, cc) => blockedExtra.has(key(rr, cc)))) continue;
      blockedExtra.add(key(r, c));
      if (alcance() !== base - 1) { blockedExtra.delete(key(r, c)); continue; }
      base--;
      const [nome, fit] = PROPS[n % PROPS.length];
      const [dr, dc] = DIRS.find(([a, b]) => at(r + a, c + b) === '#');
      const p = center(r, c);
      const off = CELL / 2 - fit / 2 - 0.1;
      const x = p.x + dc * off, z = p.z + dr * off;
      const m = modelo(nome, { fit });
      m.position.set(x, 0, z);
      m.rotation.y = Math.atan2(-dc, -dr) + rand(-0.4, 0.4);
      scene.add(m);
      colliders.push({ minX: x - fit / 2, maxX: x + fit / 2, minZ: z - fit / 2, maxZ: z + fit / 2 });
      n++;
    }
  }
  if (tem('power_box_01')) {
    // quadros de energia presos nas paredes
    let n = 0;
    for (const [r, c] of shuffle(floorCells.slice())) {
      if (n >= 6) break;
      if (M[r][c] !== '.' || blockedExtra.has(key(r, c))) continue;
      const dir = DIRS.find(([dr, dc]) => at(r + dr, c + dc) === '#' && r + dr < INTERIOR_ROWS - 1);
      if (!dir) continue;
      const [dr, dc] = dir;
      const p = center(r, c);
      const pb = modelo('power_box_01', { height: 0.7 });
      const d = pb.userData.size.z / 2;
      pb.position.set(p.x + dc * (CELL / 2 - d), 0.9, p.z + dr * (CELL / 2 - d));
      pb.rotation.y = Math.atan2(-dc, -dr);
      scene.add(pb);
      n++;
    }
  }

  // ================== JOGADOR ==================
  const startCell = (() => {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (M[r][c] === 'P') return center(r, c);
  })();
  const player = { x: startCell.x, z: startCell.z, yaw: 0, pitch: 0, bob: 0, moving: false };
  player.yaw = Math.PI; // olhando para dentro do depósito (+z)

  const flashlight = new THREE.SpotLight(0xffe9c4, 70, 28, 0.48, 0.45, 1.5);
  flashlight.position.set(0.22, -0.22, 0.05);
  flashlight.castShadow = true;
  flashlight.shadow.mapSize.set(1024, 1024);
  flashlight.shadow.camera.near = 0.2;
  flashlight.shadow.camera.far = 28;
  flashlight.shadow.bias = -0.0008;
  camera.add(flashlight);
  flashlight.target.position.set(0, -0.15, -5);
  camera.add(flashlight.target);
  const FLASH_BASE = 70;
  let flashOn = true;

  // ================== CRIATURA ==================
  const mundo = {
    findPath, clearWalk, lineOfSight, moveCircle,
    wanderTarget(px, pz) {
      const pc = cellOf(px, pz);
      const pool = floorCells.filter(([r, c]) => !solidPath(r, c));
      if (Math.random() < 0.35) {
        const near = pool.filter(([r, c]) => Math.abs(r - pc.r) + Math.abs(c - pc.c) < 10);
        if (near.length) { const [r, c] = near[Math.floor(Math.random() * near.length)]; return center(r, c); }
      }
      const mc = cellOf(monster.x, monster.z);
      const far = pool.filter(([r, c]) => Math.abs(r - mc.r) + Math.abs(c - mc.c) > 6);
      const [r, c] = far[Math.floor(Math.random() * far.length)];
      return center(r, c);
    },
    onSpotted() {
      sfx('spotted');
      toast('ELE TE VIU! CORRA!', 2000, '#ff3030');
    },
    onStep(heavy) { sfx('monsterStep', heavy); },
  };
  const monster = new Criatura(scene, mundo, MONSTER);
  (() => {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (M[r][c] === 'M') { const p = center(r, c); monster.place(p.x, p.z); }
  })();

  // ================== ESTADO DO JOGO ==================
  const game = {
    state: 'menu', // menu | playing | paused | dead | won
    hacked: 0,
    certas: 0,
    erradas: 0,
    time: 0,
    hacking: null,     // computador sendo hackeado
    question: null,
    lockInput: 0,
    carHold: 0,
    nextClang: 15,
  };
  const keys = {};

  // ---------- perguntas ----------
  let qPool = [];
  function nextQuestion() {
    if (!qPool.length) qPool = shuffle(PERGUNTAS.map((_, i) => i));
    const q = PERGUNTAS[qPool.pop()];
    const opts = shuffle(q.o.map((t, i) => ({ t, ok: i === q.r })));
    return { p: q.p, opts };
  }

  // ================== HUD ==================
  function updateHUD() {
    $('contador').innerHTML = `<b>${game.hacked}</b>/${NEEDED}`;
    const pcs = $('pcs');
    pcs.innerHTML = '';
    for (let i = 0; i < NEEDED; i++) {
      const s = document.createElement('span');
      s.className = i < game.hacked ? 'pc ok' : 'pc';
      pcs.appendChild(s);
    }
    $('objetivo').textContent = exitsOpen
      ? 'As saídas foram abertas! Fuja até o carro no estacionamento!'
      : `Encontre e hackeie ${NEEDED} computadores. Não deixe a criatura te ver.`;
    $('lanterna').textContent = flashOn ? 'LANTERNA: LIGADA [F]' : 'LANTERNA: DESLIGADA [F]';
    $('lanterna').classList.toggle('off', !flashOn);
  }

  let toastTimer = 0;
  function toast(msg, ms, color) {
    const el = $('aviso');
    el.textContent = msg;
    el.style.color = color || '#e8e0d0';
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms || 2500);
  }

  function setPrompt(text) {
    const el = $('prompt');
    if (el.textContent !== text) el.textContent = text;
    el.style.display = text ? 'block' : 'none';
  }

  // ---------- painel de hack ----------
  function startHack(pc) {
    game.hacking = pc;
    game.question = nextQuestion();
    game.lockInput = 0.25;
    renderHack();
    $('hack').classList.add('show');
    sfx('key');
  }
  function stopHack() {
    game.hacking = null;
    game.question = null;
    $('hack').classList.remove('show');
  }
  function renderHack(status, cls) {
    const pc = game.hacking;
    if (!pc) return;
    $('hack-titulo').textContent = `> HACKEANDO TERMINAL #${pc.id}`;
    let bar = '';
    for (let i = 0; i < QUESTIONS_PER_PC; i++) bar += i < pc.progress ? '■' : '□';
    $('hack-prog').textContent = `[${bar}] ${pc.progress}/${QUESTIONS_PER_PC}`;
    $('hack-pergunta').textContent = game.question.p;
    $('hack-opcoes').innerHTML = game.question.opts
      .map((o, i) => `<div class="op"><span>[${i + 1}]</span> ${escapeHtml(o.t)}</div>`)
      .join('');
    const st = $('hack-status');
    st.textContent = status || '';
    st.className = cls || '';
  }
  function escapeHtml(s) {
    return s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  }

  function answer(i) {
    const pc = game.hacking;
    if (!pc || game.lockInput > 0 || !game.question) return;
    const opt = game.question.opts[i];
    if (!opt) return;
    if (opt.ok) {
      game.certas++;
      pc.progress++;
      sfx('correct');
      if (pc.progress >= QUESTIONS_PER_PC) {
        pcHacked(pc);
        return;
      }
      game.question = nextQuestion();
      game.lockInput = 0.3;
      renderHack('✔ CORRETO — próxima camada de segurança...', 'ok');
      drawScreen(pc);
    } else {
      game.erradas++;
      sfx('wrong');
      sfx('alarmAt', pc.x, pc.z);
      monster.hear(pc.x, pc.z);
      game.lockInput = 1.2;
      const certa = game.question.opts.find((o) => o.ok).t;
      game.question = nextQuestion();
      renderHack(`✖ ACESSO NEGADO! (a certa era: ${certa}) — o alarme fez barulho...`, 'erro');
      drawScreen(pc, 'erro');
      setTimeout(() => drawScreen(pc), 1200);
      $('flash').classList.remove('on');
      void $('flash').offsetWidth;
      $('flash').classList.add('on');
    }
  }

  function pcHacked(pc) {
    pc.done = true;
    pc.light.color.set(0x3dff6a);
    drawScreen(pc);
    stopHack();
    game.hacked++;
    sfx('hacked');
    updateHUD();
    if (game.hacked >= NEEDED) openExits();
    else toast(`COMPUTADOR HACKEADO! (${game.hacked}/${NEEDED})`, 2500, '#4dff7a');
  }

  function openExits() {
    exitsOpen = true;
    exits.forEach((e) => {
      e.signMat.map = signTex.open;
      e.light.color.set(0x30ff60);
      sfx('shutter', e.x, e.z);
    });
    sfx('siren', 8);
    monster.setFinal();
    toast('AS SAÍDAS FORAM ABERTAS... E ELE SABE ONDE VOCÊ ESTÁ!', 4500, '#ff4040');
    updateHUD();
  }

  // ================== ENTRADA ==================
  const canvasEl = renderer.domElement;
  document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (game.state !== 'playing') return;
    if (game.hacking) {
      const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[e.code];
      if (n !== undefined) { answer(n); return; }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        stopHack();
        keys.KeyE = false; // não reabrir imediatamente
        toast('Hack pausado — o progresso foi salvo.', 1500);
      }
      return;
    }
    if (e.code === 'KeyF') {
      flashOn = !flashOn;
      sfx('flashlightClick');
      updateHUD();
    }
    if (e.code === 'KeyE' && !e.repeat) {
      const pc = nearComputer();
      if (pc && !pc.done && game.hacked < NEEDED) startHack(pc);
    }
  });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; });
  document.addEventListener('mousemove', (e) => {
    if (game.state !== 'playing') return;
    if (document.pointerLockElement !== canvasEl && !TEST) return;
    player.yaw -= e.movementX * 0.0022;
    player.pitch -= e.movementY * 0.0022;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch));
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvasEl && game.state === 'playing' && !TEST) pause();
  });

  function lockPointer() {
    try {
      const p = canvasEl.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (err) { /* sem pointer lock */ }
  }

  function pause() {
    game.state = 'paused';
    Object.keys(keys).forEach((k) => (keys[k] = false));
    $('tela-pausa').classList.add('show');
    if (SFX.ready) listener.context.suspend();
  }
  function resume() {
    $('tela-pausa').classList.remove('show');
    game.state = 'playing';
    if (SFX.ready) listener.context.resume();
    lockPointer();
    last = performance.now();
  }

  let listener = null;
  function start() {
    $('tela-menu').classList.remove('show');
    $('hud').classList.add('show');
    if (!listener) {
      listener = new THREE.AudioListener();
      camera.add(listener);
      listener.context.resume();
      SFX.init(listener.context, listener.getInput());
    }
    game.state = 'playing';
    updateHUD();
    lockPointer();
    toast('Encontre os computadores... e não faça barulho.', 4000);
    last = performance.now();
  }
  $('btn-jogar').addEventListener('click', start);
  $('tela-pausa').addEventListener('click', resume);
  document.querySelectorAll('.btn-denovo').forEach((b) => b.addEventListener('click', () => location.reload()));

  // ================== INTERAÇÕES ==================
  function nearComputer() {
    let best = null, bd = 2.3;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    for (const pc of computers) {
      const dx = pc.x - player.x, dz = pc.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / d > 0.2) { best = pc; bd = d; }
    }
    return best;
  }
  function nearLockedExit() {
    return exits.find((e) => Math.hypot(e.x - player.x, e.z - player.z) < 2.6);
  }
  function distToCar() {
    if (!car) return Infinity;
    const dx = Math.max(0, Math.abs(player.x - car.x) - car.hx);
    const dz = Math.max(0, Math.abs(player.z - car.z) - car.hz);
    return Math.hypot(dx, dz);
  }

  // ================== FIM DE JOGO ==================
  function fmtTime(t) {
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  function stats() {
    return `Tempo: <b>${fmtTime(game.time)}</b> &nbsp;•&nbsp; Computadores: <b>${game.hacked}/${NEEDED}</b><br>` +
      `Respostas certas: <b>${game.certas}</b> &nbsp;•&nbsp; Erradas: <b>${game.erradas}</b>`;
  }

  function caught() {
    game.state = 'dead';
    stopHack();
    setPrompt('');
    // vira a câmera para a criatura
    player.yaw = Math.atan2(-(monster.x - player.x), -(monster.z - player.z));
    player.pitch = 0.15;
    sfx('stopAll');
    sfx('scream');
    $('hud').classList.remove('show');
    if (document.pointerLockElement) document.exitPointerLock();
    JUMPSCARE.play($('jumpscare'), () => {
      $('fim-stats').innerHTML = stats();
      $('tela-fim').classList.add('show');
    });
  }

  function win() {
    game.state = 'won';
    setPrompt('');
    $('segurar').classList.remove('show');
    sfx('stopAll');
    sfx('engine');
    car.hlMat.color.set(0xffffee);
    car.head.intensity = 80;
    $('hud').classList.remove('show');
    $('fade').classList.add('on');
    if (document.pointerLockElement) document.exitPointerLock();
    setTimeout(() => {
      $('vit-stats').innerHTML = stats();
      $('tela-vitoria').classList.add('show');
    }, 2200);
  }

  // ================== LOOP ==================
  const grain = $('grao');
  const gg = grain.getContext('2d');
  const grainImg = gg.createImageData(grain.width, grain.height);
  function drawGrain() {
    const d = grainImg.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    gg.putImageData(grainImg, 0, 0);
  }

  let last = performance.now();
  let shake = 0;

  function update(dt) {
    game.time += dt;
    if (game.lockInput > 0) game.lockInput -= dt;

    // ----- movimento do jogador -----
    let mx = 0, mz = 0;
    const canMove = !game.hacking;
    if (canMove) {
      if (keys.KeyW || keys.ArrowUp) mz -= 1;
      if (keys.KeyS || keys.ArrowDown) mz += 1;
      if (keys.KeyA || keys.ArrowLeft) mx -= 1;
      if (keys.KeyD || keys.ArrowRight) mx += 1;
    }
    const len = Math.hypot(mx, mz);
    player.moving = len > 0;
    if (len > 0) {
      mx /= len; mz /= len;
      const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
      const dx = (mx * cos + mz * sin) * PLAYER_SPEED * dt;
      const dz = (-mx * sin + mz * cos) * PLAYER_SPEED * dt;
      moveCircle(player, dx, dz, PLAYER_R);
      const prev = player.bob;
      player.bob += dt * PLAYER_SPEED * 2.3;
      if (Math.floor(prev / Math.PI) !== Math.floor(player.bob / Math.PI)) sfx('step');
    }

    // ----- portas -----
    for (const d of doors) {
      const near = Math.hypot(d.x - player.x, d.z - player.z) < 2.8 || Math.hypot(d.x - monster.x, d.z - monster.z) < 2.8;
      const t = near ? 1 : 0;
      if (t !== d.target) {
        d.target = t;
        sfx('door', d.x, d.z);
      }
      d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * 4);
      const off = d.open * CELL * 0.92;
      if (d.alongX) d.panel.position.x = d.x + off;
      else d.panel.position.z = d.z + off;
    }
    // ----- saídas -----
    for (const e of exits) {
      if (exitsOpen && e.open < 1) {
        e.open = Math.min(1, e.open + dt / 3);
        if (e.model) {
          e.shutter.position.y = e.open * 2.6;
        } else {
          const s = 1 - 0.94 * e.open;
          e.shutter.scale.y = s;
          e.shutter.position.y = 2.6 - (2.6 * s) / 2;
        }
      }
    }

    // ----- criatura -----
    const sight = Math.max(flashOn ? SIGHT_LIGHT_ON : SIGHT_LIGHT_OFF, game.hacking ? 11 : 0);
    const dist = monster.update(dt, { px: player.x, pz: player.z, sight });
    const chasing = monster.state === 'chase';
    if (SFX.ready) {
      SFX.updateMonster(monster.x, 1.9, monster.z, chasing);
      SFX.setChase(chasing ? 1 : monster.state === 'hunt' ? 0.35 : 0);
      const danger = Math.max(0, 1 - dist / 16) + (chasing ? 0.3 : 0);
      SFX.heartbeat(Math.min(1, danger), game.time);
    }
    if (dist < CATCH_DIST) { caught(); return; }

    // perigo visual
    const danger = Math.max(0, 1 - dist / 12);
    $('perigo').style.opacity = String(Math.min(0.85, (chasing ? 0.45 : 0) + danger * 0.5));
    shake = chasing ? Math.max(0, 1 - dist / 10) * 0.035 : 0;

    // ----- lanterna (falha quando a criatura está perto) -----
    let fl = flashOn ? FLASH_BASE : 0;
    if (flashOn && dist < 9 && Math.random() < 0.25 * (1 - dist / 9)) fl *= Math.random() * 0.3;
    flashlight.intensity = fl;

    // ----- lâmpadas piscando -----
    for (const l of lamps) {
      if (!l.flicker) continue;
      l.t -= dt;
      if (l.t <= 0) {
        l.off = Math.random() < 0.4 ? rand(0.05, 0.4) : 0;
        l.t = l.off ? l.off : rand(0.05, 2.5);
      }
      const on = l.off ? 0 : 1;
      l.light.intensity = l.base * on;
      l.mesh.material.color.setScalar(on ? 1 : 0.15);
    }

    // ----- telas piscando -----
    for (const pc of computers) {
      if (pc.done) continue;
      pc.blinkT = (pc.blinkT || 0) + dt;
      if (pc.blinkT > 0.5) { pc.blinkT = 0; pc.blink++; if (!(game.hacking === pc && game.lockInput > 0.3)) drawScreen(pc); }
    }

    // ----- barulhos distantes -----
    game.nextClang -= dt;
    if (game.nextClang <= 0) {
      game.nextClang = rand(18, 40);
      const [r, c] = floorCells[Math.floor(Math.random() * floorCells.length)];
      const p = center(r, c);
      sfx('distantClang', p.x, p.z);
    }

    // ----- interações / prompt -----
    let prompt = '';
    if (game.hacking) {
      if (Math.hypot(game.hacking.x - player.x, game.hacking.z - player.z) > 3) stopHack();
    } else {
      const pc = nearComputer();
      if (pc) {
        if (pc.done) prompt = 'Computador já hackeado';
        else if (game.hacked >= NEEDED) prompt = 'Não precisa mais... FUJA!';
        else prompt = pc.progress ? `[E] Continuar hack (${pc.progress}/${QUESTIONS_PER_PC})` : '[E] Hackear computador';
      } else if (!exitsOpen && nearLockedExit()) {
        prompt = `Saída trancada — hackeie ${NEEDED} computadores (${game.hacked}/${NEEDED})`;
      }
    }
    // carro: segurar E
    const dc = distToCar();
    if (dc < 1.4 && !game.hacking) {
      if (keys.KeyE) {
        game.carHold += dt;
        $('segurar').classList.add('show');
        const frac = Math.min(1, game.carHold / CAR_HOLD);
        $('segurar-arco').style.strokeDashoffset = String(176 * (1 - frac));
        prompt = '';
        if (game.carHold >= CAR_HOLD) { win(); return; }
      } else {
        game.carHold = 0;
        $('segurar').classList.remove('show');
        prompt = `Segure [E] por ${CAR_HOLD.toString().replace('.', ',')}s para entrar no carro`;
      }
    } else {
      game.carHold = 0;
      $('segurar').classList.remove('show');
    }
    setPrompt(prompt);
  }

  function updateCamera(dt) {
    const bobY = player.moving ? Math.sin(player.bob) * 0.045 : 0;
    const bobX = player.moving ? Math.cos(player.bob * 0.5) * 0.025 : 0;
    camera.position.set(
      player.x + bobX * Math.cos(player.yaw) + rand(-shake, shake),
      EYE + bobY + rand(-shake, shake),
      player.z - bobX * Math.sin(player.yaw)
    );
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (game.state === 'playing') update(dt);
    if (game.state === 'won') {
      // carro... e silêncio
    }
    updateCamera(dt);
    renderer.render(scene, camera);
    drawGrain();
  }

  updateHUD();
  updateCamera(0);
  requestAnimationFrame(loop);
  $('carregando').style.display = 'none';
  $('btn-jogar').disabled = false;

  if (TEST) {
    window.__jogo = {
      game, player, monster, computers, exits, doors, camera, scene, renderer,
      start, answer, openExits, pcHacked, startHack,
      get exitsOpen() { return exitsOpen; },
      teleport(x, z, yaw) { player.x = x; player.z = z; if (yaw !== undefined) player.yaw = yaw; },
      keys,
      update,
    };
  }
})();
