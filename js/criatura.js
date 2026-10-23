// A criatura: modelo 3D feito com formas simples + inteligência (patrulha / perseguição).
// Depende de THREE (carregado antes) e de um objeto "mundo" passado pelo jogo.
window.Criatura = class Criatura {
  constructor(scene, mundo, cfg) {
    this.mundo = mundo;
    this.cfg = cfg; // { walk, hunt, chase, catchDist }
    this.state = 'wander';
    this.final = false;
    this.path = [];
    this.repath = 0;
    this.lastKnown = null;
    this.lostTimer = 0;
    this.searchTimer = 0;
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector2();
    this.phase = 0;
    this.stepSide = 0;
    this.speedNow = 0;
    this.yaw = 0;
    this.twitch = { t: 0, x: 0, y: 0, z: 0 };
    const gltf = window.MODELOS && window.MODELOS.criatura_xbot;
    if (gltf) this.buildGLTF(scene, gltf);
    else this.build(scene);
  }

  // Versão com modelo animado (andar / correr / parado), deformado para ficar alto e magro.
  buildGLTF(scene, gltf) {
    const model = gltf.scene;
    const pele = new THREE.MeshStandardMaterial({ color: 0x0b0908, roughness: 0.88, metalness: 0.05 });
    const juntas = new THREE.MeshStandardMaterial({ color: 0x141110, roughness: 0.7 });
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.material = /joint/i.test(o.name) ? juntas : pele;
      o.castShadow = true;
      o.frustumCulled = false;
    });
    const bone = (n) => model.getObjectByName('mixamorig' + n);

    // membros e pescoço mais compridos: afasta as juntas (os clipes não mexem nessas posições)
    const alonga = { LeftForeArm: 1.35, RightForeArm: 1.35, LeftHand: 1.3, RightHand: 1.3, Head: 1.7, LeftLeg: 1.08, RightLeg: 1.08 };
    for (const [n, k] of Object.entries(alonga)) {
      const b = bone(n);
      if (b) b.position.multiplyScalar(k);
    }
    const clips = gltf.animations.map((c) => {
      const clip = c.clone();
      clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale') && (!t.name.endsWith('.position') || t.name.startsWith('mixamorigHips')));
      return clip;
    });

    const root = new THREE.Group();
    model.scale.setScalar(1.12);
    root.add(model);
    scene.add(root);
    root.updateMatrixWorld(true);

    // rosto: olhos vermelhos, boca com dentes (preso ao osso da cabeça, em metros)
    const head = bone('Head');
    const face = new THREE.Group();
    face.scale.setScalar(1 / head.getWorldScale(new THREE.Vector3()).x);
    head.add(face);
    const olhoMat = new THREE.MeshBasicMaterial({ color: 0xff2a10 });
    this.eyes = [-1, 1].map((s) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), olhoMat);
      e.position.set(0.045 * s, 0.2, 0.105);
      e.scale.set(1.2, 0.45, 0.6);
      e.rotation.z = -0.35 * s; // olhos em fenda, inclinados
      face.add(e);
      return e;
    });
    // boca larga com dentes, um pouco abaixo dos olhos
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.03), new THREE.MeshBasicMaterial({ color: 0x1a0000 }));
    mouth.position.set(0, 0.105, 0.11);
    face.add(mouth);
    this.mouth = mouth;
    const dente = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.4 });
    for (let k = 0; k < 9; k++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 4), dente);
      t.position.set(-0.064 + k * 0.016, 0.128, 0.124);
      t.rotation.x = Math.PI;
      face.add(t);
      const b = t.clone();
      b.position.y = 0.082;
      b.rotation.x = 0;
      face.add(b);
    }
    const glow = new THREE.PointLight(0xff2000, 1.2, 3.5, 2);
    glow.position.set(0, 0.2, 0.3);
    face.add(glow);
    this.glow = glow;

    // garras nas mãos
    const osso = new THREE.MeshStandardMaterial({ color: 0x8c8676, roughness: 0.6 });
    for (const lado of ['LeftHand', 'RightHand']) {
      const h = bone(lado);
      const g = new THREE.Group();
      g.scale.setScalar(1 / h.getWorldScale(new THREE.Vector3()).x);
      h.add(g);
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.24, 5), osso);
        c.position.set((k - 1) * 0.025, 0.2, 0.01);
        c.castShadow = true;
        g.add(c);
      }
    }

    this.mixer = new THREE.AnimationMixer(model);
    const acao = (nome) => {
      const clip = clips.find((c) => c.name === nome);
      const a = this.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(nome === 'idle' ? 1 : 0);
      return a;
    };
    this.actions = { idle: acao('idle'), walk: acao('walk'), run: acao('run') };
    // velocidade (m/s) em que cada clipe parece natural nesta escala
    this.clipSpeed = { idle: 1, walk: 1.5, run: 4.0 };
    this.current = 'idle';
    this.headBone = head;
    this.root = root;
    this.head = face;
    this.twitchQ = new THREE.Quaternion();
    this.twitchE = new THREE.Euler();
  }

  setAction(nome) {
    if (nome === this.current) return;
    const de = this.actions[this.current], para = this.actions[nome];
    para.reset();
    para.setEffectiveWeight(1);
    para.crossFadeFrom(de, 0.3, false);
    this.current = nome;
  }

  animateGLTF(dt) {
    const sp = this.speedNow;
    const chasing = this.state === 'chase';
    this.root.rotation.y = this.yaw;
    const nome = sp <= 0.05 ? 'idle' : sp > 3 ? 'run' : 'walk';
    this.setAction(nome);
    const a = this.actions[nome];
    if (nome !== 'idle') a.timeScale = Math.max(0.6, Math.min(1.7, sp / this.clipSpeed[nome]));
    const meio = a.getClip().duration / 2;
    const antes = Math.floor(a.time / meio);
    this.mixer.update(dt);
    if (nome !== 'idle' && Math.floor(a.time / meio) !== antes) this.mundo.onStep(chasing);

    // espasmos da cabeça por cima da animação
    this.twitch.t -= dt;
    if (this.twitch.t <= 0) {
      this.twitch.t = 0.3 + Math.random() * (chasing ? 0.6 : 2.5);
      const k = Math.random() < 0.35 ? 1 : 0.25;
      this.twitch.x = (Math.random() - 0.5) * 0.5 * k;
      this.twitch.y = (Math.random() - 0.5) * 0.8 * k;
      this.twitch.z = (Math.random() - 0.5) * 1.0 * k;
    }
    const r = Math.min(1, dt * 18), e = this.twitchE;
    // cabeça sempre um pouco abaixada (olhar de cima), mais ainda correndo
    const baixa = chasing ? 0.45 : 0.3;
    e.set(e.x + (this.twitch.x + baixa - e.x) * r, e.y + (this.twitch.y - e.y) * r, e.z + (this.twitch.z - e.z) * r);
    this.headBone.quaternion.multiply(this.twitchQ.setFromEuler(e));
    this.mouth.scale.y = chasing ? 1.6 + Math.sin(performance.now() / 60) * 0.5 : 1;
    this.glow.intensity = chasing ? 2.5 : 1.2;
  }

  build(scene) {
    const pele = new THREE.MeshStandardMaterial({ color: 0x1b1816, roughness: 0.85, metalness: 0.05 });
    const osso = new THREE.MeshStandardMaterial({ color: 0x8c8676, roughness: 0.7 });
    const olhoMat = new THREE.MeshBasicMaterial({ color: 0xff2a10 });
    const bocaMat = new THREE.MeshBasicMaterial({ color: 0x220000 });
    const dente = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.4 });

    const cyl = (rt, rb, h) => {
      const g = new THREE.CylinderGeometry(rt, rb, h, 8);
      g.translate(0, -h / 2, 0); // pendurado a partir do pivô
      return g;
    };
    const mesh = (g, m) => {
      const o = new THREE.Mesh(g, m);
      o.castShadow = true;
      return o;
    };

    const root = new THREE.Group();
    const hips = new THREE.Group();
    hips.position.y = 1.3;
    root.add(hips);

    // pernas
    this.legs = [-1, 1].map((s) => {
      const thigh = new THREE.Group();
      thigh.position.set(0.15 * s, 0, 0);
      thigh.add(mesh(cyl(0.09, 0.06, 0.68), pele));
      const knee = new THREE.Group();
      knee.position.y = -0.66;
      knee.add(mesh(cyl(0.06, 0.04, 0.62), pele));
      const foot = mesh(new THREE.BoxGeometry(0.1, 0.05, 0.3), pele);
      foot.position.set(0, -0.62, 0.08);
      knee.add(foot);
      thigh.add(knee);
      hips.add(thigh);
      return { thigh, knee };
    });

    // tronco curvado
    const torso = new THREE.Group();
    torso.rotation.x = 0.3;
    hips.add(torso);
    const chest = mesh(new THREE.CylinderGeometry(0.24, 0.13, 0.85, 9), pele);
    chest.position.y = 0.42;
    chest.scale.z = 0.7;
    torso.add(chest);
    // costelas / coluna aparente
    for (let i = 0; i < 5; i++) {
      const v = mesh(new THREE.SphereGeometry(0.045, 6, 4), osso);
      v.position.set(0, 0.15 + i * 0.16, -0.15);
      torso.add(v);
    }

    // braços longos
    this.arms = [-1, 1].map((s) => {
      const sh = new THREE.Group();
      sh.position.set(0.27 * s, 0.8, 0);
      sh.rotation.z = 0.12 * s;
      sh.add(mesh(cyl(0.06, 0.045, 0.75), pele));
      const el = new THREE.Group();
      el.position.y = -0.74;
      el.add(mesh(cyl(0.045, 0.035, 0.72), pele));
      // garras
      for (let k = 0; k < 3; k++) {
        const c = mesh(new THREE.ConeGeometry(0.018, 0.26, 5), osso);
        c.position.set((k - 1) * 0.035, -0.82, 0.02);
        c.rotation.x = Math.PI + 0.15;
        el.add(c);
      }
      sh.add(el);
      torso.add(sh);
      return { sh, el, s };
    });

    // pescoço + cabeça alongada
    const neck = new THREE.Group();
    neck.position.set(0, 0.86, 0.05);
    torso.add(neck);
    const neckMesh = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.25, 6), pele);
    neckMesh.position.y = 0.1;
    neck.add(neckMesh);
    const head = new THREE.Group();
    head.position.y = 0.26;
    neck.add(head);
    const skull = mesh(new THREE.SphereGeometry(0.2, 12, 10), pele);
    skull.scale.set(0.82, 1.35, 0.95);
    skull.position.y = 0.1;
    head.add(skull);
    this.eyes = [-1, 1].map((s) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), olhoMat);
      e.position.set(0.075 * s, 0.17, 0.165);
      head.add(e);
      return e;
    });
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.04), bocaMat);
    mouth.position.set(0, -0.03, 0.17);
    head.add(mouth);
    this.mouth = mouth;
    for (let k = 0; k < 6; k++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 4), dente);
      t.position.set(-0.06 + k * 0.024, 0.03, 0.19);
      t.rotation.x = Math.PI;
      head.add(t);
      const b = t.clone();
      b.position.y = -0.09;
      b.rotation.x = 0;
      head.add(b);
    }
    // brilho dos olhos
    const glow = new THREE.PointLight(0xff2000, 1.2, 3.5, 2);
    glow.position.set(0, 0.17, 0.35);
    head.add(glow);
    this.glow = glow;

    this.root = root;
    this.hips = hips;
    this.torso = torso;
    this.head = head;
    this.neck = neck;
    scene.add(root);
  }

  get x() { return this.root.position.x; }
  get z() { return this.root.position.z; }

  place(x, z) {
    this.root.position.set(x, 0, z);
    this.lastPos.set(x, z);
  }

  // ---------- percepção ----------
  canSee(px, pz, range) {
    const dx = px - this.x, dz = pz - this.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return false;
    if (d > 2.2 && this.state !== 'chase') {
      // campo de visão de ~140° à frente
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      if ((dx * fx + dz * fz) / d < Math.cos(1.22)) return false;
    }
    return this.mundo.lineOfSight(this.x, this.z, px, pz);
  }

  hear(x, z) {
    if (this.state === 'chase') return;
    this.state = 'investigate';
    this.setPath(x, z);
  }

  setFinal() {
    this.final = true;
    if (this.state !== 'chase') {
      this.state = 'hunt';
      this.path = [];
      this.repath = 0;
    }
  }

  // ---------- movimento ----------
  setPath(x, z) {
    this.path = this.mundo.findPath(this.x, this.z, x, z) || [];
  }

  moveToward(tx, tz, dt, speed) {
    const dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return true;
    const step = Math.min(d, speed * dt);
    this.mundo.moveCircle(this.root.position, (dx / d) * step, (dz / d) * step, 0.32);
    this.faceDir(dx, dz, dt, 6);
    this.speedNow = speed;
    return d <= speed * dt + 0.05;
  }

  faceDir(dx, dz, dt, rate) {
    const target = Math.atan2(dx, dz);
    let diff = target - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, dt * rate);
  }

  followPath(dt, speed) {
    // atalho: pula pontos se dá pra ir reto
    while (this.path.length > 1 && this.mundo.clearWalk(this.x, this.z, this.path[1].x, this.path[1].z, 0.34)) {
      this.path.shift();
    }
    if (!this.path.length) return true;
    const p = this.path[0];
    if (this.moveToward(p.x, p.z, dt, speed)) this.path.shift();
    return this.path.length === 0;
  }

  // ---------- IA ----------
  update(dt, ctx) {
    const { px, pz, sight } = ctx;
    this.speedNow = 0;
    const sees = this.canSee(px, pz, sight);

    if (sees) {
      if (this.state !== 'chase') {
        this.state = 'chase';
        this.mundo.onSpotted();
      }
      this.lastKnown = { x: px, z: pz };
      this.lostTimer = 0;
    }

    this.repath -= dt;
    const C = this.cfg;

    switch (this.state) {
      case 'wander': {
        if (!this.path.length) {
          const t = this.mundo.wanderTarget(px, pz);
          this.setPath(t.x, t.z);
        }
        this.followPath(dt, C.walk);
        break;
      }
      case 'investigate': {
        if (this.followPath(dt, C.walk * 1.7)) this.startSearch();
        break;
      }
      case 'hunt': {
        if (this.repath <= 0 || !this.path.length) {
          this.setPath(px, pz);
          this.repath = 0.6;
        }
        this.followPath(dt, C.hunt);
        break;
      }
      case 'chase': {
        if (sees && this.mundo.clearWalk(this.x, this.z, px, pz, 0.34)) {
          this.path = [];
          this.moveToward(px, pz, dt, C.chase);
        } else {
          const tgt = sees ? { x: px, z: pz } : this.lastKnown;
          if (this.repath <= 0 || !this.path.length) {
            this.setPath(tgt.x, tgt.z);
            this.repath = 0.25;
          }
          const done = this.followPath(dt, C.chase);
          if (!sees) {
            this.lostTimer += dt;
            if (done || this.lostTimer > 6) this.startSearch();
          }
        }
        break;
      }
      case 'search': {
        this.searchTimer -= dt;
        this.yaw += Math.sin(this.searchTimer * 2.2) * dt * 2.2;
        if (this.searchTimer <= 0) {
          this.state = this.final ? 'hunt' : 'wander';
          this.path = [];
        }
        break;
      }
    }

    // destravar se ficou parado tentando andar
    const moved = Math.hypot(this.x - this.lastPos.x, this.z - this.lastPos.y);
    if (this.state !== 'search' && moved < 0.2 * dt) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 1.2) {
        this.stuckTimer = 0;
        this.path = [];
        this.repath = 0;
        if (this.state === 'investigate') this.startSearch();
      }
    } else this.stuckTimer = 0;
    this.lastPos.set(this.x, this.z);

    this.animate(dt);
    return Math.hypot(px - this.x, pz - this.z);
  }

  startSearch() {
    this.state = 'search';
    this.searchTimer = 3;
    this.path = [];
  }

  // ---------- animação ----------
  animate(dt) {
    if (this.mixer) return this.animateGLTF(dt);
    const sp = this.speedNow;
    const chasing = this.state === 'chase';
    this.root.rotation.y = this.yaw;
    const prev = this.phase;
    this.phase += dt * sp * (chasing ? 2.1 : 2.6);
    const s = Math.sin(this.phase);
    const amp = sp > 0 ? (chasing ? 0.75 : 0.45) : 0;
    this.legs[0].thigh.rotation.x = -s * amp;
    this.legs[1].thigh.rotation.x = s * amp;
    this.legs[0].knee.rotation.x = Math.max(0, s) * amp * 1.3;
    this.legs[1].knee.rotation.x = Math.max(0, -s) * amp * 1.3;
    this.hips.position.y = 1.3 - Math.abs(Math.cos(this.phase)) * 0.06 * (sp > 0 ? 1 : 0);
    this.torso.rotation.x = chasing ? 0.55 : 0.3 + Math.sin(this.phase * 0.5) * 0.03;
    this.arms.forEach((a, i) => {
      if (chasing) {
        a.sh.rotation.x = -1.25 + Math.sin(this.phase + i * Math.PI) * 0.35;
        a.el.rotation.x = -0.3;
      } else {
        a.sh.rotation.x = (i ? -s : s) * amp * 0.6 + 0.1;
        a.el.rotation.x = -0.15 - Math.max(0, i ? s : -s) * 0.3;
      }
    });
    // passos (som)
    if (sp > 0 && Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI)) {
      this.mundo.onStep(chasing);
    }
    // espasmos da cabeça
    this.twitch.t -= dt;
    if (this.twitch.t <= 0) {
      this.twitch.t = 0.3 + Math.random() * (chasing ? 0.6 : 2.5);
      const k = Math.random() < 0.35 ? 1 : 0.25;
      this.twitch.x = (Math.random() - 0.5) * 0.6 * k;
      this.twitch.y = (Math.random() - 0.5) * 0.9 * k;
      this.twitch.z = (Math.random() - 0.5) * 1.2 * k;
    }
    const h = this.head.rotation;
    const r = Math.min(1, dt * 18);
    h.x += (this.twitch.x - (chasing ? 0.4 : 0.2) - h.x) * r;
    h.y += (this.twitch.y - h.y) * r;
    h.z += (this.twitch.z - h.z) * r;
    this.mouth.scale.y = chasing ? 1.4 + Math.sin(this.phase * 3) * 0.4 : 1;
    this.glow.intensity = chasing ? 2.5 : 1.2;
  }
};
