/**
 * Small, dependency-free DSP toolkit used to synthesise MIXPLAY's original
 * demo music and sound packs. Everything here is pure TypeScript operating on
 * Float32Arrays so it can run inside a Web Worker (and in unit tests).
 */

export const TAU = Math.PI * 2;

/** Deterministic PRNG (mulberry32) so demo tracks render identically every time. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const dbToGain = (db: number) => Math.pow(10, db / 20);

/** PolyBLEP residual for band-limited saw/square oscillators. */
function polyBlep(t: number, dt: number) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

export type Wave = 'sine' | 'saw' | 'square' | 'triangle';

export class Osc {
  phase: number;
  constructor(public wave: Wave, phase = 0) {
    this.phase = phase;
  }
  next(freq: number, sr: number, pw = 0.5) {
    const dt = freq / sr;
    const t = this.phase;
    let v: number;
    switch (this.wave) {
      case 'sine':
        v = Math.sin(TAU * t);
        break;
      case 'saw':
        v = 2 * t - 1 - polyBlep(t, dt);
        break;
      case 'square': {
        v = t < pw ? 1 : -1;
        v += polyBlep(t, dt);
        v -= polyBlep((t + 1 - pw) % 1, dt);
        break;
      }
      case 'triangle':
        v = 1 - 4 * Math.abs(Math.round(t - 0.25) - (t - 0.25));
        break;
    }
    this.phase += dt;
    if (this.phase >= 1) this.phase -= Math.floor(this.phase);
    return v;
  }
}

/** Topology-preserving-transform state variable filter (stable under modulation). */
export class SVF {
  ic1 = 0;
  ic2 = 0;
  private g = 0;
  private k = 1;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  private lastF = -1;
  private lastQ = -1;
  set(freq: number, q: number, sr: number) {
    if (freq === this.lastF && q === this.lastQ) return;
    this.lastF = freq;
    this.lastQ = q;
    const f = Math.min(freq, sr * 0.45);
    this.g = Math.tan((Math.PI * f) / sr);
    this.k = 1 / Math.max(0.05, q);
    this.a1 = 1 / (1 + this.g * (this.g + this.k));
    this.a2 = this.g * this.a1;
    this.a3 = this.g * this.a2;
  }
  /** returns [low, band, high] packed in an out-array to avoid allocations */
  process(v0: number, out: Float64Array) {
    const v3 = v0 - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    out[0] = v2;
    out[1] = v1;
    out[2] = v0 - this.k * v1 - v2;
  }
}

export class OnePole {
  z = 0;
  constructor(public coef = 0.5) {}
  static fromHz(hz: number, sr: number) {
    return new OnePole(Math.exp((-TAU * hz) / sr));
  }
  lp(x: number) {
    this.z = x * (1 - this.coef) + this.z * this.coef;
    return this.z;
  }
}

/** Exponential-segment ADSR evaluated at time t (seconds) for a note held `hold` seconds. */
export function adsr(t: number, hold: number, a: number, d: number, s: number, r: number) {
  if (t < 0) return 0;
  let v: number;
  if (t < a) v = t / a;
  else if (t < a + d) v = 1 - (1 - s) * ((t - a) / d);
  else v = s;
  if (t > hold) {
    const rt = t - hold;
    const atRelease = hold < a ? hold / a : hold < a + d ? 1 - (1 - s) * ((hold - a) / d) : s;
    v = atRelease * Math.exp((-rt * 5) / Math.max(0.001, r));
    if (rt > r * 1.5) v = 0;
  }
  return v;
}

export const softClip = (x: number) => (x > 1.5 ? 1 : x < -1.5 ? -1 : x - (x * x * x) / 6.75);

/** Simple stereo Schroeder/Freeverb-style reverb applied in place on a send buffer. */
export function reverbInPlace(l: Float32Array, r: Float32Array, sr: number, decay = 0.82, damp = 0.35) {
  // The reverb runs at half the sample rate: tails are damped anyway, and
  // this halves the cost of rendering demo tracks.
  const D = 2;
  const rate = sr / D;
  const scale = rate / 44100;
  const combTunings = [1116, 1277, 1422, 1557].map((n) => Math.round(n * scale));
  const apTunings = [556, 441, 341, 225].map((n) => Math.round(n * scale));
  const spread = Math.round(23 * scale);
  const m = Math.floor(l.length / D);
  const run = (input: Float32Array, offset: number) => {
    const out = new Float32Array(input.length);
    for (const tune of combTunings) {
      const size = tune + offset;
      const buf = new Float32Array(size);
      let idx = 0;
      let store = 0;
      for (let i = 0; i < input.length; i++) {
        const y = buf[idx];
        store = y * (1 - damp) + store * damp;
        buf[idx] = input[i] * 0.03 + store * decay;
        out[i] += y;
        if (++idx >= size) idx = 0;
      }
    }
    for (const tune of apTunings) {
      const size = tune + offset;
      const buf = new Float32Array(size);
      let idx = 0;
      for (let i = 0; i < out.length; i++) {
        const bufout = buf[idx];
        const x = out[i];
        out[i] = -x + bufout;
        buf[idx] = x + bufout * 0.5;
        if (++idx >= size) idx = 0;
      }
    }
    return out;
  };
  const mono = new Float32Array(m);
  for (let i = 0; i < m; i++) mono[i] = (l[i * D] + r[i * D] + l[i * D + 1] + r[i * D + 1]) * 0.25;
  const outL = run(mono, 0);
  const outR = run(mono, spread);
  for (let i = 0; i < l.length; i++) {
    const p = i / D;
    const k = Math.min(m - 2, Math.floor(p));
    const fr = p - k;
    l[i] = k >= 0 ? outL[k] + (outL[k + 1] - outL[k]) * fr : 0;
    r[i] = k >= 0 ? outR[k] + (outR[k + 1] - outR[k]) * fr : 0;
  }
}

export function peakOf(...chans: Float32Array[]) {
  let p = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) {
    const a = Math.abs(c[i]);
    if (a > p) p = a;
  }
  return p;
}

export function normalize(target: number, ...chans: Float32Array[]) {
  const p = peakOf(...chans);
  if (p <= 0) return;
  const g = target / p;
  for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= g;
}
