// Todos os sons do jogo são sintetizados com WebAudio (nenhum arquivo de áudio).
// SFX.init(ctx, destino) é chamado após o primeiro clique do jogador.
window.SFX = (function () {
  let ctx = null;
  let out = null; // destino final (entrada do AudioListener do three.js)
  let noiseBuf = null;
  let monsterPanner = null;
  let growl = null;
  let chaseMusic = null;
  let heart = { next: 0 };

  function makeNoise(seconds, brown) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  function noiseSrc(loop) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = !!loop;
    return s;
  }

  function env(g, t, a, peak, hold, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }

  function distortionCurve(k) {
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      c[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
    }
    return c;
  }

  function panner(x, y, z, ref) {
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref || 2;
    p.rolloffFactor = 1.6;
    p.maxDistance = 60;
    setPos(p, x, y, z);
    p.connect(out);
    return p;
  }

  function setPos(p, x, y, z) {
    if (p.positionX) {
      p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    } else p.setPosition(x, y, z);
  }

  // ---------- ambiente ----------
  function startAmbience() {
    // zumbido grave
    const g = ctx.createGain();
    g.gain.value = 0.05;
    g.connect(out);
    [41, 41.7, 61.5].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 120;
      o.connect(lp).connect(g);
      o.start();
    });
    // vento / ar pesado
    const n = ctx.createBufferSource();
    n.buffer = makeNoise(4, true);
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = 400;
    const ng = ctx.createGain();
    ng.gain.value = 0.12;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 0.08;
    lfo.connect(lg).connect(ng.gain);
    lfo.start();
    n.connect(bp).connect(ng).connect(out);
    n.start();
  }

  // barulho metálico distante em posição aleatória
  function distantClang(x, z) {
    const t = ctx.currentTime;
    const p = panner(x, 2.5, z, 6);
    const g = ctx.createGain();
    env(g, t, 0.005, 0.5, 0.02, 2.5);
    g.connect(p);
    [180, 263, 397, 541].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f * (0.9 + Math.random() * 0.2);
      o.connect(g);
      o.start(t);
      o.stop(t + 3);
    });
    const n = noiseSrc();
    const ng = ctx.createGain();
    env(ng, t, 0.002, 0.6, 0, 0.3);
    n.connect(ng).connect(p);
    n.start(t);
    n.stop(t + 0.5);
  }

  // ---------- jogador ----------
  function step() {
    const t = ctx.currentTime;
    const n = noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500 + Math.random() * 300;
    const g = ctx.createGain();
    env(g, t, 0.005, 0.18, 0.01, 0.12);
    n.connect(lp).connect(g).connect(out);
    n.start(t, Math.random() * 1.5);
    n.stop(t + 0.2);
  }

  function flashlightClick() {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 2400;
    const g = ctx.createGain();
    env(g, t, 0.001, 0.08, 0, 0.03);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.05);
  }

  // ---------- criatura ----------
  function initMonster() {
    monsterPanner = panner(0, 2, 0, 2.5);
    // respiração / rosnado contínuo
    const n = noiseSrc(true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 260;
    bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.value = 0.0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.35;
    const lg = ctx.createGain();
    lg.gain.value = 0.25;
    lfo.connect(lg).connect(g.gain);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 48;
    const og = ctx.createGain();
    og.gain.value = 0.25;
    o.connect(og).connect(bp);
    n.connect(bp).connect(g).connect(monsterPanner);
    n.start(); o.start(); lfo.start();
    growl = { g, bp, lfo, o, base: 0.3 };
  }

  function updateMonster(x, y, z, chasing) {
    if (!monsterPanner) return;
    setPos(monsterPanner, x, y, z);
    const t = ctx.currentTime;
    growl.g.gain.setTargetAtTime(chasing ? 0.9 : 0.35, t, 0.3);
    growl.lfo.frequency.setTargetAtTime(chasing ? 1.6 : 0.35, t, 0.3);
    growl.bp.frequency.setTargetAtTime(chasing ? 420 : 260, t, 0.3);
    growl.o.frequency.setTargetAtTime(chasing ? 70 : 48, t, 0.3);
  }

  function monsterStep(heavy) {
    if (!monsterPanner) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    const g = ctx.createGain();
    env(g, t, 0.004, heavy ? 1.2 : 0.8, 0.02, 0.25);
    o.connect(g).connect(monsterPanner);
    o.start(t);
    o.stop(t + 0.4);
    const n = noiseSrc();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const ng = ctx.createGain();
    env(ng, t, 0.002, 0.5, 0, 0.12);
    n.connect(lp).connect(ng).connect(monsterPanner);
    n.start(t, Math.random());
    n.stop(t + 0.2);
  }

  // estrondo quando a criatura te vê
  function spotted() {
    const t = ctx.currentTime;
    const g = ctx.createGain();
    env(g, t, 0.01, 0.35, 0.4, 1.4);
    const ws = ctx.createWaveShaper();
    ws.curve = distortionCurve(30);
    ws.connect(g).connect(out);
    [55, 58.3, 82.4, 116.5, 233].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(ws);
      o.start(t);
      o.stop(t + 2.2);
    });
    const n = noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const ng = ctx.createGain();
    env(ng, t, 0.01, 0.25, 0.1, 0.8);
    n.connect(hp).connect(ng).connect(out);
    n.start(t);
    n.stop(t + 1.2);
  }

  // música de perseguição (pulso grave) — volume 0..1
  function initChase() {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(out);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 55;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 4.5;
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg).connect(trem.gain);
    o.connect(lp).connect(trem).connect(g);
    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = 110 * 1.06;
    const g2 = ctx.createGain();
    g2.gain.value = 0.15;
    o2.connect(g2).connect(lp);
    o.start(); o2.start(); lfo.start();
    chaseMusic = g;
  }

  function setChase(v) {
    if (!chaseMusic) return;
    chaseMusic.gain.setTargetAtTime(v * 0.22, ctx.currentTime, 0.4);
  }

  // batimento cardíaco: intensidade 0..1
  function heartbeat(intensity, now) {
    if (intensity <= 0.02) return;
    if (now < heart.next) return;
    const bpm = 60 + intensity * 100;
    heart.next = now + 60 / bpm;
    const t = ctx.currentTime;
    [0, 0.16].forEach((d, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(70, t + d);
      o.frequency.exponentialRampToValueAtTime(35, t + d + 0.12);
      const g = ctx.createGain();
      env(g, t + d, 0.005, (i ? 0.35 : 0.5) * intensity, 0.01, 0.15);
      o.connect(g).connect(out);
      o.start(t + d);
      o.stop(t + d + 0.3);
    });
  }

  // ---------- computadores ----------
  function beep(freq, dur, type, vol, delay) {
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    o.type = type || 'square';
    o.frequency.value = freq;
    const g = ctx.createGain();
    env(g, t, 0.005, vol || 0.08, dur, 0.05);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  function key() { beep(1800 + Math.random() * 600, 0.015, 'square', 0.04); }
  function correct() { beep(880, 0.07, 'square', 0.08); beep(1320, 0.1, 'square', 0.08, 0.09); }
  function wrong() {
    beep(140, 0.45, 'sawtooth', 0.18);
    beep(147, 0.45, 'sawtooth', 0.18);
  }
  function hacked() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => beep(f, 0.09, 'square', 0.08, i * 0.09));
  }

  // alarme alto que a criatura escuta (posicional)
  function alarmAt(x, z) {
    const t = ctx.currentTime;
    const p = panner(x, 1.2, z, 4);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(700, t);
    for (let i = 0; i < 6; i++) o.frequency.setValueAtTime(i % 2 ? 500 : 900, t + i * 0.15);
    const g = ctx.createGain();
    env(g, t, 0.01, 0.12, 0.8, 0.1);
    o.connect(g).connect(p);
    o.start(t);
    o.stop(t + 1);
  }

  // ---------- portas ----------
  function door(x, z) {
    const t = ctx.currentTime;
    const p = panner(x, 2, z, 3);
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(1500, t + 0.35);
    const g = ctx.createGain();
    env(g, t, 0.02, 0.35, 0.2, 0.15);
    n.connect(bp).connect(g).connect(p);
    n.start(t, Math.random());
    n.stop(t + 0.5);
  }

  function siren(seconds) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.2);
    g.gain.setValueAtTime(0.09, t + seconds - 1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    for (let i = 0; i < seconds; i++) {
      o.frequency.setValueAtTime(520, t + i);
      o.frequency.linearRampToValueAtTime(880, t + i + 0.5);
      o.frequency.linearRampToValueAtTime(520, t + i + 1);
    }
    o.connect(lp).connect(g).connect(out);
    o.start(t);
    o.stop(t + seconds);
  }

  function shutter(x, z) {
    const t = ctx.currentTime;
    const p = panner(x, 2, z, 5);
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 220;
    bp.Q.value = 1.5;
    const g = ctx.createGain();
    env(g, t, 0.1, 0.9, 2.6, 0.4);
    const am = ctx.createOscillator();
    am.frequency.value = 22;
    const amg = ctx.createGain();
    amg.gain.value = 0.4;
    am.connect(amg).connect(g.gain);
    am.start(t);
    am.stop(t + 3.3);
    n.connect(bp).connect(g).connect(p);
    n.start(t);
    n.stop(t + 3.3);
  }

  // ---------- jumpscare ----------
  function scream() {
    const t = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t);
    master.gain.exponentialRampToValueAtTime(0.9, t + 0.03);
    master.gain.setValueAtTime(0.9, t + 1.3);
    master.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(out);

    const ws = ctx.createWaveShaper();
    ws.curve = distortionCurve(60);
    ws.oversample = '4x';
    // formantes de voz ("aaah")
    const formants = [[800, 6, 1], [1150, 8, 0.6], [2900, 10, 0.35]];
    const voice = ctx.createGain();
    voice.gain.value = 0.6;
    formants.forEach(([f, q, a]) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = a * 3;
      ws.connect(bp).connect(g).connect(voice);
    });
    voice.connect(master);
    ws.connect(master);

    const vib = ctx.createOscillator();
    vib.frequency.value = 11;
    const vibg = ctx.createGain();
    vibg.gain.value = 35;
    vib.connect(vibg);
    vib.start(t);
    vib.stop(t + 2.4);
    [1, 1.007, 1.5, 0.5, 2.01].forEach((m) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(380 * m, t);
      o.frequency.exponentialRampToValueAtTime(980 * m, t + 0.25);
      o.frequency.exponentialRampToValueAtTime(720 * m, t + 1.2);
      o.frequency.exponentialRampToValueAtTime(420 * m, t + 2.2);
      vibg.connect(o.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.25;
      o.connect(g).connect(ws);
      o.start(t);
      o.stop(t + 2.4);
    });
    // chiado
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1500, t);
    bp.frequency.exponentialRampToValueAtTime(4000, t + 0.4);
    bp.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.value = 0.7;
    n.connect(bp).connect(ng).connect(master);
    n.start(t);
    n.stop(t + 2.4);
    // impacto grave
    const k = ctx.createOscillator();
    k.type = 'sine';
    k.frequency.setValueAtTime(90, t);
    k.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    const kg = ctx.createGain();
    env(kg, t, 0.005, 1.0, 0.1, 0.8);
    k.connect(kg).connect(comp);
    k.start(t);
    k.stop(t + 1.2);
  }

  // ---------- carro ----------
  function engine() {
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.3);
    g.gain.setValueAtTime(0.3, t + 3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    g.connect(out);
    lp.connect(g);
    [1, 2.02].forEach((m) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(30 * m, t);
      o.frequency.exponentialRampToValueAtTime(70 * m, t + 0.6);
      o.frequency.exponentialRampToValueAtTime(45 * m, t + 1.2);
      o.frequency.exponentialRampToValueAtTime(110 * m, t + 4);
      o.connect(lp);
      o.start(t);
      o.stop(t + 6);
    });
  }

  function stopAll() {
    if (!ctx) return;
    setChase(0);
    if (growl) growl.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  }

  return {
    init(audioCtx, destination) {
      ctx = audioCtx;
      out = destination;
      noiseBuf = makeNoise(2, false);
      startAmbience();
      initMonster();
      initChase();
    },
    get ready() { return !!ctx; },
    step, flashlightClick, distantClang,
    updateMonster, monsterStep, spotted, setChase, heartbeat,
    key, correct, wrong, hacked, alarmAt,
    door, siren, shutter, scream, engine, stopAll,
  };
})();
