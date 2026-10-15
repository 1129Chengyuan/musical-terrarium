import { SPECIES, createPlant, buildPlant, growPlant, drawPlant, syncEvents } from './plants.js';
import { World, DAY_LENGTH, daylightAt } from './world.js';
import { GardenAudio } from './audio.js';

const SAVE_KEY = 'musical-terrarium-v1';
const MAX_PLANTS = 14;
const GROW_SECONDS = 80; // sim seconds for a healthy plant to fully grow in daylight

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const ctx = canvas.getContext('2d');
const header = document.querySelector('.hud');
const toolbar = document.querySelector('.toolbar');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const world = new World();
const audio = new GardenAudio();

const state = {
  time: DAY_LENGTH * 0.3,
  plants: [],
  speed: 1,
  paused: false,
  notes: 0,
  hoverX: null,
};

// ---------- save / load ----------

function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      time: state.time,
      water: world.water,
      notes: state.notes,
      plants: state.plants.map((p) => ({ s: p.species, seed: p.seed, x: p.x, g: p.growth, h: p.health })),
    }));
  } catch { /* storage unavailable; the garden just won't persist */ }
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!data || !Array.isArray(data.plants)) return false;
    state.time = data.time ?? state.time;
    world.water = data.water ?? world.water;
    state.notes = data.notes ?? 0;
    state.plants = data.plants.filter((p) => SPECIES[p.s]).map((p) => {
      const plant = { species: p.s, seed: p.seed, x: p.x, geo: buildPlant(p.s, p.seed), growth: p.g, health: p.h, next: 0 };
      syncEvents(plant);
      return plant;
    });
    return true;
  } catch {
    return false;
  }
}

function starterGarden() {
  const add = (species, x, seed, frac) => {
    const p = createPlant(species, x, seed);
    p.growth = p.geo.maxD * frac;
    syncEvents(p);
    state.plants.push(p);
  };
  add('fern', 0.16, 1013, 0.45);
  add('tree', 0.55, 4242, 0.3);
  add('flower', 0.86, 777, 0.6);
}

// ---------- layout ----------

let dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  world.layout(w, h, header.offsetHeight + 8, toolbar.offsetHeight + 40);
}
new ResizeObserver(resize).observe(canvas);

// ---------- interaction ----------

let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

const species = () => document.querySelector('input[name="species"]:checked').value;
const pointer = (e) => {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};

canvas.addEventListener('pointermove', (e) => {
  state.hoverX = world.hit(...pointer(e));
});
canvas.addEventListener('pointerleave', () => (state.hoverX = null));
canvas.addEventListener('click', (e) => {
  const x = world.hit(...pointer(e));
  if (x === null) return;
  if (state.plants.length >= MAX_PLANTS) {
    toast('The jar is full. Clear it to plant more.');
    return;
  }
  const kind = species();
  state.plants.push(createPlant(kind, x));
  audio.note({ voice: SPECIES[kind].voice, height: 0.05, pan: x * 2 - 1, register: SPECIES[kind].register, kind: 'seed' });
  if (!audio.ctx) $('hint').textContent = 'Planted. Press Start sound to hear it grow';
  save();
});

$('water').addEventListener('click', () => {
  world.water = Math.min(1, world.water + 0.4);
  world.addRain();
  audio.drip();
});

document.querySelectorAll('input[name="speed"]').forEach((el) =>
  el.addEventListener('change', () => (state.speed = Number(el.value))),
);

$('pause').addEventListener('click', (e) => {
  state.paused = !state.paused;
  e.currentTarget.setAttribute('aria-pressed', String(state.paused));
  e.currentTarget.textContent = state.paused ? 'Resume' : 'Pause';
});

// Clearing asks for a second tap instead of a dialog.
let clearArmed = null;
$('clear').addEventListener('click', (e) => {
  const btn = e.currentTarget;
  if (!clearArmed) {
    btn.classList.add('armed');
    btn.textContent = 'Tap again to clear';
    clearArmed = setTimeout(() => {
      btn.classList.remove('armed');
      btn.textContent = 'Clear jar';
      clearArmed = null;
    }, 3000);
    return;
  }
  clearTimeout(clearArmed);
  clearArmed = null;
  btn.classList.remove('armed');
  btn.textContent = 'Clear jar';
  state.plants = [];
  save();
  toast('Jar cleared. Click the soil to plant something new.');
});

const soundBtn = $('sound');
soundBtn.classList.add('fresh');
soundBtn.addEventListener('click', async () => {
  soundBtn.classList.remove('fresh');
  if (!audio.ctx) {
    await audio.start();
    audio.setMuted(false);
    $('hint').textContent = 'Every new leaf and bloom plays a note';
  } else {
    audio.setMuted(!audio.muted);
  }
  const on = !audio.muted;
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.textContent = on ? 'Sound on' : 'Sound off';
});

document.addEventListener('visibilitychange', () => document.hidden && save());
setInterval(save, 5000);

// ---------- loop ----------

let last = performance.now();
let statsAt = 0;

function frame(now) {
  const realDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const dt = state.paused ? 0 : realDt * state.speed;
  state.time += dt;

  const phase = (state.time / DAY_LENGTH) % 1;
  const daylight = daylightAt(phase);
  const night = 1 - daylight;

  // Simulate
  world.update(dt, state.paused ? 0 : realDt, night);
  const thirsty = world.water < 0.08;
  for (const p of state.plants) {
    p.health = Math.max(0, Math.min(1, p.health + (thirsty ? -0.012 : 0.03) * dt));
    const rate = (1 / GROW_SECONDS) * (0.25 + 0.75 * daylight) * p.health * (world.water > 0 ? 1 : 0.15);
    const fresh = growPlant(p, dt, rate);
    if (!fresh.length) continue;
    const spec = SPECIES[p.species];
    for (const it of fresh) {
      audio.queue({ voice: spec.voice, height: Math.min(1, -it.y / 0.7), pan: p.x * 2 - 1, register: spec.register, kind: it.type });
    }
  }
  const before = audio.played;
  audio.flush(night);
  state.notes += audio.played - before;
  audio.setDaylight(daylight);

  // Draw
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  world.drawBackground(ctx, phase, daylight, state.time);

  ctx.save();
  world.jarPath(ctx);
  ctx.clip();
  world.drawJarInside(ctx, daylight);
  const light = 0.35 + 0.65 * daylight;
  const view = { unit: world.jar.h, time: state.time, light, swayAmt: reduced.matches ? 0.25 : 1 };
  for (const p of state.plants) {
    const root = world.rootAt(p.x);
    drawPlant(ctx, p, { ...view, baseX: root.x, baseY: root.y });
  }
  if (state.hoverX !== null) drawSeedMarker(world.rootAt(state.hoverX));
  world.drawJarFront(ctx, daylight, reduced.matches);
  ctx.restore();
  world.drawGlass(ctx, daylight);

  if (now - statsAt > 250) {
    statsAt = now;
    updateHud(phase);
  }
  requestAnimationFrame(frame);
}

function drawSeedMarker(root) {
  const color = { fern: '#7dbb55', tree: '#c79a63', flower: '#f08aa8', vine: '#a8d860' }[species()];
  const J = world.jar;
  ctx.setLineDash([4, 5]);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(root.x, J.y + J.h * 0.12);
  ctx.lineTo(root.x, root.y - 6);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(root.x, root.y - 2, 5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function updateHud(phase) {
  const day = Math.floor(state.time / DAY_LENGTH) + 1;
  const mins = Math.floor(phase * 24 * 60);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(Math.floor((mins % 60) / 10) * 10).padStart(2, '0');
  $('day').textContent = `Day ${day}`;
  $('time').textContent = `${hh}:${mm}`;
  const n = state.plants.length;
  $('stats').textContent = `${n} ${n === 1 ? 'plant' : 'plants'} · ${state.notes} ${state.notes === 1 ? 'note' : 'notes'}`;
  $('gauge-fill').style.width = `${Math.round(world.water * 100)}%`;
  const water = $('water');
  water.title = world.water < 0.08 ? 'The soil is dry. Plants are wilting.' : `Water level ${Math.round(world.water * 100)}%`;
  water.classList.toggle('armed', world.water < 0.08);
}

if (!load()) starterGarden();
resize();
updateHud((state.time / DAY_LENGTH) % 1);
requestAnimationFrame(frame);
