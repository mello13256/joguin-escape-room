// Jumpscare: gera uma pixel art aterrorizante ALEATÓRIA e anima ela na tela.
// JUMPSCARE.play(canvas, aoTerminar)
window.JUMPSCARE = (function () {
  const S = 48; // resolução da pixel art (48x48)

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function makeArt() {
    const tipos = ['sorriso', 'caveira', 'olhos', 'criatura'];
    const pele = pick([
      [214, 206, 190], // pálido
      [150, 170, 120], // esverdeado doente
      [120, 110, 120], // cinza morto
      [190, 120, 110], // carne viva
      [60, 58, 66],    // sombra
    ]);
    const olho = pick([[255, 20, 20], [255, 240, 60], [240, 240, 255], [60, 255, 80]]);
    const art = {
      tipo: pick(tipos),
      pele,
      olho,
      fundo: pick([[0, 0, 0], [20, 0, 0], [0, 0, 12]]),
      nOlhos: 4 + Math.floor(Math.random() * 6),
      olhosPos: [],
      dentes: 7 + Math.floor(Math.random() * 7),
      sangue: Math.random() < 0.8,
      assim: rnd(-3, 3), // assimetria
      gotas: [],
    };
    for (let i = 0; i < art.nOlhos; i++) {
      art.olhosPos.push([rnd(10, 38), rnd(8, 26), rnd(2.2, 4.5), Math.random() * 10]);
    }
    for (let i = 0; i < 6; i++) art.gotas.push([rnd(12, 36), rnd(4, 14), rnd(0, 1)]);
    return art;
  }

  // ---- desenho em buffer de pixels ----
  function Buffer() {
    const data = new Uint8ClampedArray(S * S * 4);
    const b = {
      data,
      px(x, y, c, a) {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= S || y >= S) return;
        const i = (y * S + x) * 4;
        const k = a === undefined ? 1 : a;
        data[i] = data[i] * (1 - k) + c[0] * k;
        data[i + 1] = data[i + 1] * (1 - k) + c[1] * k;
        data[i + 2] = data[i + 2] * (1 - k) + c[2] * k;
        data[i + 3] = 255;
      },
      fill(c) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) b.px(x, y, c); },
      // elipse com sombreamento pontilhado (dithering) nas bordas
      ellipse(cx, cy, rx, ry, c, shade) {
        for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
          for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
            const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
            if (d > 1) continue;
            let col = c;
            if (shade) {
              const dark = d > 0.75 ? 0.45 : d > 0.5 && (x + y) % 2 === 0 ? 0.7 : 1;
              col = [c[0] * dark, c[1] * dark, c[2] * dark];
            }
            b.px(x, y, col);
          }
        }
      },
      rect(x0, y0, w, h, c) {
        for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) b.px(x, y, c);
      },
      tri(x0, y0, x1, y1, x2, y2, c) {
        const minX = Math.floor(Math.min(x0, x1, x2)), maxX = Math.ceil(Math.max(x0, x1, x2));
        const minY = Math.floor(Math.min(y0, y1, y2)), maxY = Math.ceil(Math.max(y0, y1, y2));
        const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
          const w0 = ((x1 - x) * (y2 - y) - (x2 - x) * (y1 - y)) / area;
          const w1 = ((x2 - x) * (y0 - y) - (x0 - x) * (y2 - y)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 >= 0 && w1 >= 0 && w2 >= 0) b.px(x, y, c);
        }
      },
    };
    return b;
  }

  const PRETO = [5, 0, 0];
  const BRANCO = [235, 230, 210];
  const SANGUE = [140, 0, 0];

  function teethRow(b, x0, x1, y, h, n, down) {
    const w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const xa = x0 + i * w, xb = xa + w;
      const hh = h * rnd(0.7, 1.15);
      if (down) b.tri(xa, y, xb, y, (xa + xb) / 2, y + hh, BRANCO);
      else b.tri(xa, y, xb, y, (xa + xb) / 2, y - hh, BRANCO);
    }
  }

  function drips(b, art, t) {
    if (!art.sangue) return;
    art.gotas.forEach(([x, len, ph]) => {
      const l = len * Math.min(1, t * 1.5 + ph);
      for (let k = 0; k < l; k++) b.px(x, 30 + k, SANGUE);
    });
  }

  function drawFrame(art, t, open) {
    const b = Buffer();
    b.fill(art.fundo);
    const jx = Math.round(rnd(-1, 1)), jy = Math.round(rnd(-1, 1));
    const P = art.pele;
    if (art.tipo === 'sorriso') {
      b.ellipse(24 + jx, 23 + jy, 17, 21, P, true);
      // olhos ocos
      const ey = 17 + jy;
      b.ellipse(16 + jx + art.assim * 0.3, ey, 4.5, 5.5, PRETO);
      b.ellipse(32 + jx, ey - art.assim * 0.3, 4.5, 5.5, PRETO);
      const pj = Math.round(rnd(-1, 1));
      b.px(16 + jx + pj, ey, art.olho); b.px(32 + jx + pj, ey, art.olho);
      // sangue escorrendo dos olhos
      for (let k = 0; k < 8 * Math.min(1, t * 2); k++) { b.px(15 + jx, ey + 5 + k, SANGUE); b.px(33 + jx, ey + 5 + k, SANGUE); }
      // sorriso enorme
      const my = 31 + jy, mh = 2 + open * 7;
      for (let x = 7; x <= 41; x++) {
        const curve = Math.sin(((x - 7) / 34) * Math.PI) * 4;
        for (let y = 0; y < mh * Math.sin(((x - 7) / 34) * Math.PI) + 1; y++) b.px(x + jx, my - 4 + curve + y, [40, 0, 0]);
      }
      teethRow(b, 9 + jx, 39 + jx, my - 3, 3 + open * 2, art.dentes, true);
    } else if (art.tipo === 'caveira') {
      const C = [220, 214, 196];
      b.ellipse(24 + jx, 19 + jy, 16, 15, C, true);
      b.rect(14 + jx, 26 + jy, 21, 6, C);
      b.ellipse(17 + jx, 19 + jy, 4.5, 5, PRETO);
      b.ellipse(31 + jx, 19 + jy, 4.5, 5, PRETO);
      const gl = 0.5 + 0.5 * Math.sin(t * 30);
      b.px(17 + jx, 19 + jy, art.olho, gl); b.px(31 + jx, 19 + jy, art.olho, gl);
      b.tri(24 + jx, 23 + jy, 22 + jx, 28 + jy, 26 + jx, 28 + jy, PRETO);
      teethRow(b, 15 + jx, 34 + jx, 32 + jy, 3, art.dentes, false);
      // mandíbula caindo
      const jo = Math.round(open * 9);
      b.rect(15 + jx, 33 + jy + jo, 19, 5, C);
      teethRow(b, 15 + jx, 34 + jx, 33 + jy + jo, 3, art.dentes, true);
      for (let y = 32 + jy; y < 33 + jy + jo; y++) for (let x = 16; x < 33; x++) b.px(x + jx, y, [30, 0, 0]);
    } else if (art.tipo === 'olhos') {
      b.ellipse(24 + jx, 24 + jy, 21, 22, [P[0] * 0.35, P[1] * 0.3, P[2] * 0.3], true);
      art.olhosPos.forEach(([x, y, r, ph]) => {
        const blink = Math.sin(t * 6 + ph) > 0.85 ? 0.15 : 1;
        b.ellipse(x + jx, y + jy, r, r * 0.8 * blink, BRANCO);
        if (blink > 0.5) {
          b.ellipse(x + jx + rnd(-0.7, 0.7), y + jy, r * 0.45, r * 0.45, art.olho);
          b.px(x + jx, y + jy, PRETO);
        }
      });
      const my = 34 + jy, mh = 3 + open * 8;
      b.ellipse(24 + jx, my, 12, mh, [25, 0, 0]);
      teethRow(b, 13 + jx, 35 + jx, my - mh + 1, 4, art.dentes, true);
      teethRow(b, 13 + jx, 35 + jx, my + mh - 1, 4, art.dentes, false);
    } else {
      // a própria criatura
      const D = [P[0] * 0.3, P[1] * 0.3, P[2] * 0.32];
      b.ellipse(24 + jx, 22 + jy, 13, 23, D, true);
      // olhos inclinados brilhando
      for (let i = 0; i < 6; i++) {
        b.px(14 + i + jx, 13 + i * 0.5 + jy, art.olho);
        b.px(14 + i + jx, 14 + i * 0.5 + jy, art.olho);
        b.px(34 - i + jx, 13 + i * 0.5 + jy, art.olho);
        b.px(34 - i + jx, 14 + i * 0.5 + jy, art.olho);
      }
      // boca vertical
      const mh = 6 + open * 12;
      b.ellipse(24 + jx, 31 + jy, 5 + open * 2, mh, [35, 0, 0]);
      for (let k = 0; k < 6; k++) {
        const y = 31 + jy - mh + 2 + k * (mh * 2 - 4) / 5;
        b.tri(19 + jx - open * 2, y, 19 + jx - open * 2, y + 2, 23 + jx, y + 1, BRANCO);
        b.tri(29 + jx + open * 2, y, 29 + jx + open * 2, y + 2, 25 + jx, y + 1, BRANCO);
      }
    }
    drips(b, art, t);
    // granulado
    for (let i = 0; i < 90; i++) {
      const v = Math.random() * 60;
      b.px(Math.random() * S, Math.random() * S, [v, v, v], 0.5);
    }
    return b;
  }

  function play(target, onDone) {
    const art = makeArt();
    const g = target.getContext('2d');
    const off = document.createElement('canvas');
    off.width = S; off.height = S;
    const og = off.getContext('2d');
    const start = performance.now();
    const DUR = 2100;
    let lastFrame = -1;

    function resize() {
      target.width = window.innerWidth;
      target.height = window.innerHeight;
    }
    resize();
    target.style.display = 'block';

    function frame(now) {
      const el = now - start;
      const t = el / 1000;
      const f = Math.floor(el / 70); // ~14 quadros por segundo, estilo pixel art
      if (f !== lastFrame) {
        lastFrame = f;
        const open = 0.5 + 0.5 * Math.sin(t * 22);
        const b = drawFrame(art, t, open);
        const img = og.createImageData(S, S);
        img.data.set(b.data);
        // glitch: deslocar linhas
        if (Math.random() < 0.35) {
          const y0 = Math.floor(Math.random() * S), h = 2 + Math.floor(Math.random() * 6), sh = Math.floor(rnd(-5, 5));
          for (let y = y0; y < Math.min(S, y0 + h); y++) {
            const row = img.data.slice(y * S * 4, (y + 1) * S * 4);
            for (let x = 0; x < S; x++) {
              const sx = (x - sh + S) % S;
              for (let k = 0; k < 4; k++) img.data[(y * S + x) * 4 + k] = row[sx * 4 + k];
            }
          }
        }
        // quadro invertido / vermelho de vez em quando
        const inv = Math.random() < 0.12;
        const red = Math.random() < 0.2;
        if (inv || red) {
          for (let i = 0; i < img.data.length; i += 4) {
            if (inv) { img.data[i] = 255 - img.data[i]; img.data[i + 1] = 255 - img.data[i + 1]; img.data[i + 2] = 255 - img.data[i + 2]; }
            if (red) { img.data[i + 1] *= 0.2; img.data[i + 2] *= 0.2; img.data[i] = Math.min(255, img.data[i] * 1.4 + 30); }
          }
        }
        og.putImageData(img, 0, 0);

        const W = target.width, H = target.height;
        g.fillStyle = Math.random() < 0.15 ? '#300' : '#000';
        g.fillRect(0, 0, W, H);
        g.imageSmoothingEnabled = false;
        // investida: começa menor e "pula" na cara
        const lunge = Math.min(1, t / 0.18);
        const pulse = 1 + 0.06 * Math.sin(t * 40);
        const size = Math.max(W, H) * (0.55 + 0.7 * lunge) * pulse;
        const sx = rnd(-1, 1) * 30 * (1.2 - Math.min(1, t)), sy = rnd(-1, 1) * 30 * (1.2 - Math.min(1, t));
        g.drawImage(off, (W - size) / 2 + sx, (H - size) / 2 + sy, size, size);
        // linhas de varredura
        g.fillStyle = 'rgba(0,0,0,0.25)';
        for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2);
      }
      if (el < DUR) requestAnimationFrame(frame);
      else {
        target.style.display = 'none';
        if (onDone) onDone();
      }
    }
    requestAnimationFrame(frame);
  }

  return { play, makeArt, drawFrame, SIZE: S };
})();
