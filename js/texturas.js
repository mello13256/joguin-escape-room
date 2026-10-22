// Texturas procedurais desenhadas em <canvas> (nenhuma imagem externa).
// Cada função devolve um HTMLCanvasElement; o jogo converte em THREE.CanvasTexture.
window.TEXTURAS = (function () {
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function noise(g, w, h, amount, alpha) {
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * amount;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
      if (alpha !== undefined) d[i + 3] = alpha;
    }
    g.putImageData(img, 0, 0);
  }

  function stains(g, w, h, count, color, maxR) {
    for (let i = 0; i < count; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 8 + Math.random() * maxR;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, color);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(x, y, r, r * (0.5 + Math.random() * 0.8), Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }

  function wall() {
    const w = 256, h = 384, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#6d6a62';
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 34);
    stains(g, w, h, 18, 'rgba(40,35,25,0.35)', 50);
    // faixa inferior suja / pintada
    const gr = g.createLinearGradient(0, h * 0.62, 0, h);
    gr.addColorStop(0, 'rgba(30,40,38,0)');
    gr.addColorStop(0.08, 'rgba(38,52,50,0.9)');
    gr.addColorStop(1, 'rgba(15,18,16,0.95)');
    g.fillStyle = gr;
    g.fillRect(0, h * 0.62, w, h * 0.38);
    g.fillStyle = 'rgba(160,140,60,0.5)';
    g.fillRect(0, h * 0.66, w, 4);
    // escorridos
    for (let i = 0; i < 9; i++) {
      const x = Math.random() * w, len = 30 + Math.random() * 160;
      const dg = g.createLinearGradient(0, 0, 0, len);
      dg.addColorStop(0, 'rgba(30,25,15,0.55)');
      dg.addColorStop(1, 'rgba(30,25,15,0)');
      g.fillStyle = dg;
      g.fillRect(x, 0, 2 + Math.random() * 4, len);
    }
    // junta de painel
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, 3, h);
    g.fillRect(0, h * 0.33, w, 2);
    // rachaduras
    g.strokeStyle = 'rgba(20,18,15,0.6)';
    for (let i = 0; i < 4; i++) {
      let x = Math.random() * w, y = Math.random() * h * 0.6;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (Math.random() - 0.5) * 22;
        y += Math.random() * 14;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    return c;
  }

  function floor() {
    const w = 256, h = 256, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#4a4741';
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 30);
    stains(g, w, h, 10, 'rgba(15,12,8,0.45)', 40);
    stains(g, w, h, 3, 'rgba(60,50,20,0.3)', 30);
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 3;
    g.strokeRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 1;
    g.strokeRect(3, 3, w - 6, h - 6);
    return c;
  }

  function ceiling() {
    const w = 128, h = 128, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#2a2a2a';
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 20);
    stains(g, w, h, 4, 'rgba(50,40,20,0.4)', 30);
    g.strokeStyle = 'rgba(0,0,0,0.7)';
    g.lineWidth = 4;
    g.strokeRect(0, 0, w, h);
    return c;
  }

  function crate() {
    const w = 128, h = 128, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#6b4e2e';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      g.fillStyle = `rgba(${40 + Math.random() * 30},${25 + Math.random() * 20},10,0.35)`;
      g.fillRect(0, y, w, 15);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(0, y + 15, w, 1);
    }
    noise(g, w, h, 30);
    g.strokeStyle = '#3b2814';
    g.lineWidth = 10;
    g.strokeRect(5, 5, w - 10, h - 10);
    g.beginPath();
    g.moveTo(8, 8);
    g.lineTo(w - 8, h - 8);
    g.stroke();
    g.fillStyle = '#222';
    [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10]].forEach(([x, y]) => g.fillRect(x - 2, y - 2, 4, 4));
    g.fillStyle = 'rgba(20,20,20,0.6)';
    g.font = 'bold 14px monospace';
    g.fillText('FRÁGIL', 40, 70);
    return c;
  }

  function cardboard() {
    const w = 64, h = 64, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#8a6a43';
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 25);
    g.fillStyle = 'rgba(200,180,120,0.5)';
    g.fillRect(0, h / 2 - 4, w, 8);
    return c;
  }

  function metal(base, stripes) {
    const w = 128, h = 256, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 25);
    stains(g, w, h, 8, 'rgba(110,50,20,0.45)', 25);
    if (stripes) {
      for (let y = 0; y < h; y += 12) {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(0, y, w, 2);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(0, y + 2, w, 1);
      }
      // faixa de perigo
      for (let x = -40; x < w + 40; x += 24) {
        g.fillStyle = '#c9a20a';
        g.beginPath();
        g.moveTo(x, h - 24); g.lineTo(x + 12, h - 24); g.lineTo(x + 24, h); g.lineTo(x + 12, h);
        g.fill();
      }
    } else {
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 3;
      g.strokeRect(10, 10, w - 20, h - 20);
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(w - 26, h / 2 - 4, 14, 8);
    }
    return c;
  }

  function asphalt() {
    const w = 256, h = 256, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#26262a';
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 40);
    stains(g, w, h, 6, 'rgba(0,0,0,0.5)', 40);
    return c;
  }

  function grass() {
    const w = 128, h = 128, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#1b2215';
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 30);
    return c;
  }

  function fence() {
    const w = 128, h = 128, c = canvas(w, h), g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(150,155,160,1)';
    g.lineWidth = 2;
    for (let i = -h; i < w + h; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
      g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke();
    }
    g.fillStyle = 'rgba(110,110,115,1)';
    g.fillRect(0, 0, w, 5);
    return c;
  }

  function blood() {
    const w = 128, h = 128, c = canvas(w, h), g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    const col = () => `rgba(${70 + Math.random() * 40},0,0,${0.6 + Math.random() * 0.3})`;
    for (let i = 0; i < 14; i++) {
      g.fillStyle = col();
      g.beginPath();
      const r = 4 + Math.random() * 22;
      g.ellipse(64 + (Math.random() - 0.5) * 60, 64 + (Math.random() - 0.5) * 60, r, r * (0.4 + Math.random()), Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 30; i++) {
      g.fillStyle = col();
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }

  function writing(text) {
    const w = 256, h = 128, c = canvas(w, h), g = c.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(110,8,8,0.85)';
    g.font = 'bold 54px "Creepster", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2);
    // escorridos
    for (let i = 0; i < 10; i++) {
      const x = w / 2 + (Math.random() - 0.5) * g.measureText(text).width;
      g.fillRect(x, h / 2 + 10, 2, 10 + Math.random() * 40);
    }
    return c;
  }

  function sign(text, bg, fg) {
    const w = 256, h = 96, c = canvas(w, h), g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = 'bold 56px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
    return c;
  }

  return { wall, floor, ceiling, crate, cardboard, metal, asphalt, grass, fence, blood, writing, sign };
})();
