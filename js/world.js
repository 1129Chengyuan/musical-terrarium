// The scene around the plants: sky, sun and moon, the table, the glass jar,
// layered soil, fireflies at night, and rain when you water.

export const DAY_LENGTH = 180; // sim seconds per in-game day at 1×

// Sky colors (top, horizon) through one day. Phase 0 = midnight, 0.5 = noon.
const SKY = [
  [0.0, [7, 11, 31], [26, 31, 61]],
  [0.2, [22, 24, 66], [58, 44, 90]],
  [0.27, [62, 76, 138], [242, 164, 119]],
  [0.35, [104, 172, 226], [207, 232, 242]],
  [0.5, [79, 159, 224], [191, 226, 245]],
  [0.66, [90, 143, 208], [244, 196, 138]],
  [0.74, [58, 47, 107], [224, 122, 95]],
  [0.82, [20, 24, 56], [44, 37, 80]],
  [1.0, [7, 11, 31], [26, 31, 61]],
];

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export function skyAt(phase) {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [p0, t0, b0] = SKY[i], [p1, t1, b1] = SKY[i + 1];
    if (phase >= p0 && phase <= p1) {
      const t = (phase - p0) / (p1 - p0);
      return { top: mix(t0, t1, t), bottom: mix(b0, b1, t) };
    }
  }
  return { top: SKY[0][1], bottom: SKY[0][2] };
}

// 1 at noon, 0 through the night, with a soft dawn and dusk.
export function daylightAt(phase) {
  const s = Math.sin((phase - 0.25) * Math.PI * 2);
  return Math.max(0, Math.min(1, s * 1.4 + 0.3));
}

export class World {
  constructor() {
    const r = Math.random;
    this.stars = Array.from({ length: 140 }, () => ({ x: r(), y: r() * 0.8, s: 0.4 + r() * 1.3, tw: r() * 6 }));
    this.pebbles = Array.from({ length: 70 }, () => ({ x: r(), y: r(), s: 0.5 + r(), g: 120 + r() * 70 }));
    this.drops = Array.from({ length: 34 }, () => ({ x: r(), y: 0.12 + r() * 0.6, s: 0.4 + r() }));
    this.fireflies = Array.from({ length: 16 }, () => ({ x: 0.2 + r() * 0.6, y: 0.3 + r() * 0.4, vx: 0, vy: 0, blink: r() * 10 }));
    this.rain = [];
    this.water = 0.7;
  }

  layout(w, h, top, bottom) {
    this.w = w; this.h = h;
    const availH = Math.max(160, h - top - bottom);
    const jh = Math.min(availH * 0.97, (w - 32) / 0.84, 760);
    const jw = jh * 0.84;
    this.jar = { x: (w - jw) / 2, y: top + (availH - jh) / 2, w: jw, h: jh };
    this.soilTop = this.jar.y + jh * 0.8;
    this.tableY = this.jar.y + jh - jh * 0.012;
  }

  // Where a plant at x (0–1 across the jar) takes root, in canvas pixels.
  rootAt(x) {
    const J = this.jar;
    return { x: J.x + J.w * (0.1 + 0.8 * x), y: this.soilTop + J.h * 0.02 };
  }

  // The jar's inner x (0–1) under a canvas point, or null if outside.
  hit(px, py) {
    const J = this.jar;
    if (px < J.x || px > J.x + J.w || py < J.y || py > J.y + J.h) return null;
    return Math.max(0, Math.min(1, (px - J.x - J.w * 0.1) / (J.w * 0.8)));
  }

  addRain() {
    for (let i = 0; i < 70; i++) {
      this.rain.push({ x: 0.08 + Math.random() * 0.84, y: -Math.random() * 0.35, v: 0.6 + Math.random() * 0.4 });
    }
  }

  update(dt, realDt, night) {
    this.water = Math.max(0, this.water - dt / 260);

    for (const d of this.rain) d.y += d.v * realDt * 1.4;
    this.rain = this.rain.filter((d) => d.y < 0.8);

    // Fireflies wander by nudging their velocity a little each frame.
    for (const f of this.fireflies) {
      f.vx += (Math.random() - 0.5) * realDt * 0.18;
      f.vy += (Math.random() - 0.5) * realDt * 0.18;
      f.vx *= 0.985; f.vy *= 0.985;
      f.x += f.vx * realDt; f.y += f.vy * realDt;
      if (f.x < 0.1 || f.x > 0.9) f.vx -= Math.sign(f.x - 0.5) * 0.004;
      if (f.y < 0.15 || f.y > 0.74) f.vy -= Math.sign(f.y - 0.45) * 0.004;
      f.blink += realDt * (0.8 + night);
    }
  }

  drawBackground(ctx, phase, daylight, time) {
    const { w, h } = this;
    const sky = skyAt(phase);
    const grad = ctx.createLinearGradient(0, 0, 0, this.tableY);
    grad.addColorStop(0, rgb(sky.top));
    grad.addColorStop(1, rgb(sky.bottom));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const night = 1 - daylight;
    if (night > 0.05) {
      for (const s of this.stars) {
        const a = night * (0.45 + 0.4 * Math.sin(time * 1.3 + s.tw));
        ctx.fillStyle = `rgba(255,250,235,${a})`;
        ctx.fillRect(s.x * w, s.y * this.tableY, s.s, s.s);
      }
    }

    // Sun by day, moon by night, each rising in the east and setting west.
    const arc = (p, color, r, glow) => {
      if (p < 0 || p > 1) return;
      const x = w * (0.08 + 0.84 * p);
      const y = this.tableY - Math.sin(p * Math.PI) * (this.tableY * 0.78) + r;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
      g.addColorStop(0, rgb(color, glow));
      g.addColorStop(1, rgb(color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
      ctx.fillStyle = rgb(color);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const R = Math.max(12, Math.min(w, h) * 0.03);
    arc((phase - 0.22) / 0.56, [255, 214, 140], R, 0.35);
    arc(((phase + 0.5) % 1 - 0.22) / 0.56, [230, 232, 245], R * 0.75, 0.18);

    // Table
    const light = 0.35 + 0.65 * daylight;
    const tg = ctx.createLinearGradient(0, this.tableY, 0, h);
    tg.addColorStop(0, rgb([118 * light, 86 * light, 60 * light]));
    tg.addColorStop(1, rgb([60 * light, 42 * light, 30 * light]));
    ctx.fillStyle = tg;
    ctx.fillRect(0, this.tableY, w, h - this.tableY);

    // Jar shadow
    const J = this.jar;
    ctx.fillStyle = `rgba(0,0,0,${0.18 + 0.12 * daylight})`;
    ctx.beginPath();
    ctx.ellipse(J.x + J.w / 2, this.tableY + 4, J.w * 0.54, J.h * 0.025, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  jarPath(ctx) {
    const { x, y, w, h } = this.jar;
    const r = w * 0.16, lip = h * 0.05, neck = w * 0.07;
    ctx.beginPath();
    ctx.moveTo(x + neck, y);
    ctx.lineTo(x + neck, y + lip);
    ctx.quadraticCurveTo(x, y + lip, x, y + lip + r);
    ctx.lineTo(x, y + h - r);
    ctx.quadraticCurveTo(x, y + h, x + r, y + h);
    ctx.lineTo(x + w - r, y + h);
    ctx.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
    ctx.lineTo(x + w, y + lip + r);
    ctx.quadraticCurveTo(x + w, y + lip, x + w - neck, y + lip);
    ctx.lineTo(x + w - neck, y);
    ctx.closePath();
  }

  // Called with the jar clipped: glass tint and soil layers.
  drawJarInside(ctx, daylight) {
    const J = this.jar;
    const light = 0.35 + 0.65 * daylight;
    ctx.fillStyle = `rgba(210,235,255,${0.06 + 0.05 * daylight})`;
    ctx.fillRect(J.x, J.y, J.w, J.h);

    const bottom = J.y + J.h;
    const soilH = bottom - this.soilTop;
    const wet = this.water;

    // Pebbles, then charcoal, then soil with a gently uneven top.
    const pebTop = bottom - soilH * 0.28;
    ctx.fillStyle = rgb([110 * light, 108 * light, 100 * light]);
    ctx.fillRect(J.x, pebTop, J.w, bottom - pebTop);
    for (const p of this.pebbles) {
      ctx.fillStyle = rgb([p.g * light, (p.g - 6) * light, (p.g - 16) * light]);
      ctx.beginPath();
      ctx.ellipse(J.x + p.x * J.w, pebTop + p.y * (bottom - pebTop), J.w * 0.018 * p.s, J.w * 0.012 * p.s, p.x * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    const charTop = pebTop - soilH * 0.1;
    ctx.fillStyle = rgb([36 * light, 34 * light, 34 * light]);
    ctx.fillRect(J.x, charTop, J.w, pebTop - charTop);

    const dryC = [122, 88, 58], wetC = [66, 44, 30];
    const c = mix(dryC, wetC, wet).map((v) => v * light);
    const sg = ctx.createLinearGradient(0, this.soilTop, 0, charTop);
    sg.addColorStop(0, rgb(c));
    sg.addColorStop(1, rgb(c.map((v) => v * 0.75)));
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(J.x, charTop);
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      ctx.lineTo(J.x + t * J.w, this.soilTop + Math.sin(t * 9.3) * J.h * 0.004 + Math.sin(t * 23) * J.h * 0.002);
    }
    ctx.lineTo(J.x + J.w, charTop);
    ctx.closePath();
    ctx.fill();
  }

  // Also clipped: rain and fireflies, which sit in front of the plants.
  drawJarFront(ctx, daylight, reduced) {
    const J = this.jar;
    if (this.rain.length) {
      ctx.strokeStyle = 'rgba(170,215,255,0.7)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const d of this.rain) {
        if (d.y < 0) continue;
        const x = J.x + d.x * J.w, y = J.y + d.y * J.h;
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + J.h * 0.025);
      }
      ctx.stroke();
    }

    const night = 1 - daylight;
    if (night > 0.3) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const f of this.fireflies) {
        const a = (night - 0.3) / 0.7 * (reduced ? 0.7 : 0.35 + 0.65 * Math.max(0, Math.sin(f.blink)));
        const x = J.x + f.x * J.w, y = J.y + f.y * J.h, r = J.w * 0.03;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(240,255,150,${a})`);
        g.addColorStop(0.2, `rgba(200,240,90,${a * 0.5})`);
        g.addColorStop(1, 'rgba(200,240,90,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    }

    // Condensation beads up when the soil is wet.
    if (this.water > 0.25) {
      ctx.fillStyle = `rgba(230,245,255,${(this.water - 0.25) * 0.35})`;
      for (const d of this.drops) {
        const side = d.x < 0.5 ? d.x * 0.18 : 1 - (1 - d.x) * 0.18;
        ctx.beginPath();
        ctx.arc(J.x + side * J.w, J.y + d.y * J.h, J.w * 0.005 * d.s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawGlass(ctx, daylight) {
    const J = this.jar;
    this.jarPath(ctx);
    ctx.strokeStyle = `rgba(225,240,255,${0.35 + 0.2 * daylight})`;
    ctx.lineWidth = Math.max(2, J.w * 0.008);
    ctx.stroke();

    // Highlights: a long streak on the left, a short one on the right.
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + 0.18 * daylight})`;
    ctx.lineWidth = J.w * 0.025;
    ctx.beginPath();
    ctx.moveTo(J.x + J.w * 0.07, J.y + J.h * 0.2);
    ctx.lineTo(J.x + J.w * 0.07, J.y + J.h * 0.66);
    ctx.stroke();
    ctx.lineWidth = J.w * 0.012;
    ctx.beginPath();
    ctx.moveTo(J.x + J.w * 0.93, J.y + J.h * 0.24);
    ctx.lineTo(J.x + J.w * 0.93, J.y + J.h * 0.36);
    ctx.stroke();

    // Rim
    const neck = J.w * 0.07, lipH = J.h * 0.03;
    ctx.fillStyle = `rgba(225,240,255,${0.18 + 0.15 * daylight})`;
    ctx.strokeStyle = `rgba(225,240,255,${0.45 + 0.2 * daylight})`;
    ctx.lineWidth = Math.max(1.5, J.w * 0.005);
    ctx.beginPath();
    ctx.roundRect(J.x + neck - J.w * 0.015, J.y - lipH * 0.5, J.w - neck * 2 + J.w * 0.03, lipH, lipH / 2);
    ctx.fill();
    ctx.stroke();
  }
}
