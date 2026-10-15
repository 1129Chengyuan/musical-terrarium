// Every note comes from the C major pentatonic scale (C D E G A). Any two notes
// in it sound fine together, so a garden growing at random still makes music.

const PENTATONIC = [0, 2, 4, 7, 9];
const SCALE = [];
for (let m = 36; m <= 88; m++) if (PENTATONIC.includes(m % 12)) SCALE.push(m);

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class GardenAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.pending = [];
    this.lastAt = 0;
    this.played = 0;
  }

  get running() { return !!this.ctx && this.ctx.state === 'running'; }

  async start() {
    if (!this.ctx) {
      const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);

      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.impulse(3.8);
      const wet = ctx.createGain();
      wet.gain.value = 0.55;
      this.reverb.connect(wet).connect(this.master);

      this.startDrone();
    }
    await this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.08);
  }

  // A room sound: decaying stereo noise used as the reverb's echo shape.
  impulse(seconds) {
    const rate = this.ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  // A soft low C + G hum whose brightness follows the daylight.
  startDrone() {
    const ctx = this.ctx;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 400;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.045;
    for (const f of [65.41, 98.0, 130.81]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      o.connect(this.droneFilter);
      o.start();
    }
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.master);
    this.droneGain.connect(this.reverb);
  }

  setDaylight(day) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.droneFilter.frequency.setTargetAtTime(180 + 620 * day, t, 1.5);
  }

  // Growth can produce dozens of leaves at once (especially at 20×), so events
  // wait here and only one plays per short gap. Blooms jump the line.
  queue(evt) {
    if (evt.kind === 'bloom') this.pending.unshift(evt);
    else this.pending.push(evt);
    if (this.pending.length > 10) this.pending.length = 10;
  }

  flush(night) {
    if (!this.running || this.muted) { this.pending.length = 0; return; }
    const now = this.ctx.currentTime;
    const gap = 0.16 + night * 0.34;
    if (!this.pending.length || now - this.lastAt < gap) return;
    const evt = this.pending[0].kind === 'bloom' ? this.pending[0] : this.pending[Math.floor(Math.random() * this.pending.length)];
    this.pending.length = 0;
    this.lastAt = now;
    this.note(evt, night);
  }

  // height: 0 at the soil to 1 at the jar's top. pan: -1 left to 1 right.
  note({ voice, height, pan, register = 0, kind }, night = 0) {
    if (!this.running || this.muted) return;
    const idx = Math.round(4 + height * (SCALE.length - 12) + (Math.random() - 0.5) * 2);
    let m = SCALE[Math.max(0, Math.min(SCALE.length - 1, idx))] + register - (night > 0.6 ? 12 : 0);
    while (m < 40) m += 12;
    while (m > 92) m -= 12;
    const f = mtof(m);
    const t = this.ctx.currentTime + 0.01;
    const vel = kind === 'bloom' ? 1 : 0.7;
    this[voice](f, t, vel, pan);
    if (kind === 'bloom') this.bell(f * 1.5, t + 0.12, 0.45, -pan);
    this.played++;
  }

  out(pan, send = 0.6) {
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-0.8, Math.min(0.8, pan));
    const g = this.ctx.createGain();
    g.gain.value = send;
    p.connect(this.master);
    p.connect(g).connect(this.reverb);
    return p;
  }

  env(node, t, peak, attack, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(g);
    return g;
  }

  osc(type, f, t, stop) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.start(t);
    o.stop(stop);
    return o;
  }

  // Flower: a bell, made of a sine plus an inharmonic partial at 2.76×.
  bell(f, t, vel, pan) {
    const dest = this.out(pan);
    this.env(this.osc('sine', f, t, t + 3.2), t, 0.16 * vel, 0.005, 3).connect(dest);
    this.env(this.osc('sine', f * 2.76, t, t + 1.4), t, 0.05 * vel, 0.003, 1.2).connect(dest);
  }

  // Fern: a plucked string, a triangle wave with a closing filter.
  pluck(f, t, vel, pan) {
    const dest = this.out(pan, 0.45);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 9, t);
    lp.frequency.exponentialRampToValueAtTime(f * 1.4, t + 0.5);
    this.osc('triangle', f, t, t + 1.6).connect(lp);
    this.env(lp, t, 0.2 * vel, 0.004, 1.4).connect(dest);
  }

  // Tree: a slow, warm pad from two slightly detuned waves.
  pad(f, t, vel, pan) {
    const dest = this.out(pan, 0.8);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    this.osc('triangle', f, t, t + 3.6).connect(lp);
    this.osc('sawtooth', f * 1.004, t, t + 3.6).connect(lp);
    this.env(lp, t, 0.07 * vel, 0.35, 3).connect(dest);
  }

  // Vine: a glassy tone with a little vibrato.
  glass(f, t, vel, pan) {
    const dest = this.out(pan, 0.7);
    const o = this.osc('sine', f, t, t + 2.4);
    const lfo = this.osc('sine', 5.2, t, t + 2.4);
    const depth = this.ctx.createGain();
    depth.gain.value = f * 0.006;
    lfo.connect(depth).connect(o.frequency);
    this.env(o, t, 0.13 * vel, 0.03, 2.2).connect(dest);
    this.env(this.osc('sine', f * 3, t, t + 1), t, 0.025 * vel, 0.01, 0.8).connect(dest);
  }

  drip() {
    if (!this.running || this.muted) return;
    for (let i = 0; i < 4; i++) {
      const t = this.ctx.currentTime + 0.05 + i * (0.08 + Math.random() * 0.12);
      const o = this.osc('sine', 700 + Math.random() * 500, t, t + 0.25);
      o.frequency.exponentialRampToValueAtTime(1500 + Math.random() * 600, t + 0.07);
      this.env(o, t, 0.06, 0.004, 0.18).connect(this.out((Math.random() - 0.5) * 1.2, 0.5));
    }
  }
}
