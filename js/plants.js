// Plants are grown from L-systems: a short string of symbols is rewritten
// a few times with simple rules, then read by a "turtle" that walks and draws.
//
//   F  draw one segment forward      +  turn left     -  turn right
//   ~  small random turn              [  save place    ]  return to saved place
//   L  leaf                           B  bloom
//
// Every plant is built from a random seed, so the same seed always grows the
// same plant and no two seeds look alike.

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 137.5°

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SPECIES = {
  fern: {
    name: 'Fern',
    axiom: () => 'X',
    rules: { X: [[1, 'F+[[X]-X]-F[-FX]+X']], F: [[1, 'FF']] },
    terminal: { X: 'L' },
    gens: 4,
    angle: 24,
    tropism: 0.04,
    height: [0.34, 0.46],
    trunk: 0.011,
    stem: [100, 38, 30],
    leaf: [112, 52, 36],
    leafSize: [0.016, 0.006],
    voice: 'pluck',
    register: 0,
  },
  tree: {
    name: 'Tree',
    axiom: () => 'FX',
    rules: {
      X: [[0.45, 'F[+X][-X]FX'], [0.3, 'F[-X]F[+X]X'], [0.25, 'F[+X]F[-X]']],
      F: [[1, 'FF']],
    },
    terminal: { X: 'L' },
    gens: 5,
    angle: 23,
    tropism: 0.05,
    height: [0.48, 0.62],
    trunk: 0.02,
    bark: [28, 32, 27],
    stem: [70, 30, 30],
    leaf: [138, 42, 34],
    leafSize: [0.013, 0.008],
    voice: 'pad',
    register: -12,
  },
  flower: {
    name: 'Flower',
    axiom: (rng) => ['A', '[-A]A', '[+A][-A]', '[-A][+A]A'][Math.floor(rng() * 4)],
    rules: { A: [[0.5, 'F[+L]F[-L]A'], [0.5, 'F[-L]F[+L]A']] },
    terminal: { A: 'FFB' },
    gens: 4,
    angle: 20,
    tropism: 0.18,
    height: [0.26, 0.4],
    trunk: 0.008,
    stem: [112, 40, 34],
    leaf: [118, 46, 40],
    leafSize: [0.026, 0.011],
    voice: 'bell',
    register: 12,
  },
  vine: {
    name: 'Vine',
    axiom: () => 'V',
    rules: {
      V: [[0.35, 'F~F~[+T]V'], [0.35, 'F~F~[-T]V'], [0.3, 'F~[+L]F~[-L]V']],
      T: [[0.5, '~F+F+F+FL'], [0.5, '~F-F-F-FL']],
    },
    terminal: { V: 'FL', T: '' },
    gens: 9,
    angle: 32,
    tropism: 0.1,
    height: [0.5, 0.66],
    trunk: 0.007,
    stem: [88, 44, 32],
    leaf: [94, 54, 42],
    leafSize: [0.019, 0.013],
    voice: 'glass',
    register: 0,
  },
};

const BLOOM_HUES = [340, 18, 45, 285, 205, 0];

function pick(options, rng) {
  let r = rng();
  for (const [p, s] of options) { if ((r -= p) <= 0) return s; }
  return options[options.length - 1][1];
}

// Expand the L-system, walk the turtle, and scale the result so its height is
// a fraction of the jar. All coordinates are in "jar heights" (1 = jar height),
// with the root at (0, 0) and y pointing down.
export function buildPlant(species, seed) {
  const spec = SPECIES[species];
  const rng = mulberry32(seed);

  let s = spec.axiom(rng);
  for (let g = 0; g < spec.gens; g++) {
    let out = '';
    for (const c of s) out += spec.rules[c] ? pick(spec.rules[c], rng) : c;
    s = out;
  }
  let str = '';
  for (const c of s) str += spec.terminal[c] !== undefined ? spec.terminal[c] : c;

  const ang = (spec.angle * Math.PI) / 180;
  const UP = -Math.PI / 2;
  let x = 0, y = 0, a = UP, d = 0, depth = 0;
  const stack = [];
  const segs = [], items = [];
  for (const c of str) {
    switch (c) {
      case 'F': {
        a += (rng() - 0.5) * 0.12;
        a += (UP - a) * spec.tropism;
        const nx = x + Math.cos(a), ny = y + Math.sin(a);
        segs.push({ x1: x, y1: y, x2: nx, y2: ny, d, depth });
        x = nx; y = ny; d++;
        break;
      }
      case '+': a += ang * (0.75 + rng() * 0.5); break;
      case '-': a -= ang * (0.75 + rng() * 0.5); break;
      case '~': a += (rng() - 0.5) * ang; break;
      case '[': stack.push([x, y, a, d, depth]); depth++; break;
      case ']': [x, y, a, d, depth] = stack.pop(); break;
      case 'L': items.push({ type: 'leaf', x, y, a: a + (rng() - 0.5) * 0.9, d, s: 0.7 + rng() * 0.6 }); break;
      case 'B': items.push({ type: 'bloom', x, y, d, s: 0.8 + rng() * 0.45, petals: 5 + Math.floor(rng() * 4), spin: rng() * Math.PI }); break;
    }
  }

  // Scale to the target height, and keep the spread inside the jar.
  let minY = 0, maxX = 0;
  for (const g of segs) { minY = Math.min(minY, g.y2); maxX = Math.max(maxX, Math.abs(g.x2)); }
  const target = spec.height[0] + rng() * (spec.height[1] - spec.height[0]);
  let k = target / Math.max(-minY, 1e-6);
  if (maxX * k > 0.36) k = 0.36 / maxX;
  for (const g of segs) { g.x1 *= k; g.y1 *= k; g.x2 *= k; g.y2 *= k; }
  for (const it of items) { it.x *= k; it.y *= k; }
  items.sort((p, q) => p.d - q.d);

  let maxD = 0;
  for (const g of segs) maxD = Math.max(maxD, g.d + 1);
  for (const it of items) maxD = Math.max(maxD, it.d + (it.type === 'bloom' ? 4 : 2));

  // Group segments by branch depth so each depth is one stroke call.
  const maxDepth = segs.reduce((m, g) => Math.max(m, g.depth), 0);
  const byDepth = Array.from({ length: maxDepth + 1 }, () => []);
  for (const g of segs) byDepth[g.depth].push(g);

  return {
    species, seed, segs, byDepth, items, maxD,
    hueShift: (rng() - 0.5) * 16,
    bloomHue: BLOOM_HUES[Math.floor(rng() * BLOOM_HUES.length)] + (rng() - 0.5) * 14,
    phase: rng() * Math.PI * 2,
    lean: rng() < 0.5 ? -1 : 1,
  };
}

export function createPlant(species, x, seed = Math.floor(Math.random() * 2 ** 31)) {
  const geo = buildPlant(species, seed);
  return { species, seed, x, geo, growth: 0, health: 1, next: 0 };
}

// Skip events for growth that already happened (used when loading a save).
export function syncEvents(plant) {
  const { items } = plant.geo;
  plant.next = 0;
  while (plant.next < items.length && items[plant.next].d + 0.4 <= plant.growth) plant.next++;
}

// Grow, and return the leaves and blooms that just appeared.
export function growPlant(plant, dt, rate) {
  const { geo } = plant;
  if (plant.growth < geo.maxD) plant.growth = Math.min(geo.maxD, plant.growth + rate * geo.maxD * dt);
  const fresh = [];
  while (plant.next < geo.items.length && geo.items[plant.next].d + 0.4 <= plant.growth) {
    fresh.push(geo.items[plant.next++]);
  }
  return fresh;
}

const hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(1)},${s.toFixed(1)}%,${l.toFixed(1)}%,${a})`;

// Mix a color toward dry-brown as health drops and darken it at night.
function tone([h, s, l], plant, light, shift = 0) {
  const dry = 1 - plant.health;
  return [
    h + shift + (38 - h - shift) * dry,
    s * (1 - dry * 0.35),
    (l + dry * 10) * light,
  ];
}

export function drawPlant(ctx, plant, view) {
  const { geo } = plant;
  const spec = SPECIES[plant.species];
  const { baseX, baseY, unit, time, light, swayAmt } = view;
  const g = plant.growth;
  const dry = 1 - plant.health;

  // Sway grows with height squared, so tips move and the base stays put.
  // Dry plants droop sideways and sag.
  const sway = Math.sin(time * 0.7 + geo.phase) * 0.06 * swayAmt + Math.sin(time * 1.9 + geo.phase * 2) * 0.015 * swayAmt;
  const droop = dry * 0.55 * geo.lean;
  const px = (x, y) => {
    const h = -y;
    return baseX + (x + (sway + droop) * h * h) * unit;
  };
  const py = (x, y) => {
    const h = -y;
    return baseY + (y + dry * 0.25 * h * h) * unit;
  };

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Stems and branches, thinnest last.
  for (let depth = 0; depth < geo.byDepth.length; depth++) {
    const list = geo.byDepth[depth];
    let any = false;
    ctx.beginPath();
    for (const s of list) {
      if (s.d >= g) continue;
      const f = Math.min(1, g - s.d);
      const x2 = s.x1 + (s.x2 - s.x1) * f, y2 = s.y1 + (s.y2 - s.y1) * f;
      ctx.moveTo(px(s.x1, s.y1), py(s.x1, s.y1));
      ctx.lineTo(px(x2, y2), py(x2, y2));
      any = true;
    }
    if (!any) continue;
    const base = spec.bark && depth < 2 ? spec.bark : spec.stem;
    const [h, sat, l] = tone(base, plant, light, geo.hueShift * 0.3);
    ctx.strokeStyle = hsl(h, sat, l);
    ctx.lineWidth = Math.max(0.8, spec.trunk * Math.pow(0.66, depth) * unit);
    ctx.stroke();
  }

  // Leaves and blooms fade and scale in as they appear.
  const [lh, ls, ll] = tone(spec.leaf, plant, light, geo.hueShift);
  for (const it of geo.items) {
    if (it.d + 0.4 > g) break;
    const grow = Math.min(1, (g - it.d - 0.4) / 1.6);
    const x = px(it.x, it.y), y = py(it.x, it.y);
    if (it.type === 'leaf') {
      const len = spec.leafSize[0] * it.s * grow * unit;
      const wid = spec.leafSize[1] * it.s * grow * unit;
      const ang = it.a + (sway + droop) * 0.8 + dry * 0.9 * geo.lean;
      ctx.fillStyle = hsl(lh + (it.s - 1) * 12, ls, ll + (it.s - 1) * 8);
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(ang) * len * 0.8, y + Math.sin(ang) * len * 0.8, len, wid, ang, 0, Math.PI * 2);
      ctx.fill();
    } else {
      drawBloom(ctx, it, x, y, grow, plant, light, unit);
    }
  }
}

// A bloom is a ring of petals around a seed head laid out by phyllotaxis:
// seed n sits at angle n × 137.5° and radius c·√n, the sunflower pattern.
function drawBloom(ctx, it, x, y, open, plant, light, unit) {
  const r = 0.028 * it.s * unit * (0.35 + 0.65 * open);
  const hue = plant.geo.bloomHue;
  const dry = 1 - plant.health;
  const petalL = (68 + dry * 4) * light;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(it.spin + plant.growth * 0.01);
  ctx.fillStyle = hsl(hue + (38 - hue) * dry, 70 * (1 - dry * 0.5), petalL, 0.95);
  for (let i = 0; i < it.petals; i++) {
    const a = (i / it.petals) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62, r * 0.62, r * 0.3, a, 0, Math.PI * 2);
    ctx.fill();
  }
  const seeds = Math.floor(18 + 50 * open);
  const c = (r * 0.42) / Math.sqrt(seeds);
  for (let n = 1; n <= seeds; n++) {
    const a = n * GOLDEN_ANGLE, rr = c * Math.sqrt(n);
    ctx.fillStyle = hsl(40 + (n / seeds) * 10, 70, (30 + (n / seeds) * 25) * light);
    ctx.beginPath();
    ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, Math.max(0.6, c * 0.55), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
