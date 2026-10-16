/**
 * Original one-shot and loop sounds synthesised for MIXPLAY. These power both
 * the demo tracks (drum kits) and the Sound Library / pads, so every sound in
 * the app is cleared for any use inside MIXPLAY.
 */
import { Osc, SVF, TAU, rng, midiToHz, softClip, reverbInPlace, normalize } from './dsp';

export interface Stereo {
  l: Float32Array;
  r: Float32Array;
}

const alloc = (sr: number, seconds: number): Stereo => {
  const n = Math.max(1, Math.round(sr * seconds));
  return { l: new Float32Array(n), r: new Float32Array(n) };
};

const mono = (s: Stereo, i: number, v: number) => {
  s.l[i] += v;
  s.r[i] += v;
};

export function kick(sr: number, opt: { p0?: number; p1?: number; decay?: number; click?: number; drive?: number } = {}): Stereo {
  const { p0 = 165, p1 = 48, decay = 0.42, click = 0.5, drive = 1.4 } = opt;
  const s = alloc(sr, decay + 0.1);
  let ph = 0;
  const rand = rng(7);
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    const f = p1 + (p0 - p1) * Math.exp(-t * 28);
    ph += f / sr;
    const env = Math.exp(-t / (decay * 0.38));
    let v = Math.sin(TAU * ph) * env;
    if (t < 0.006) v += (rand() * 2 - 1) * click * (1 - t / 0.006);
    mono(s, i, softClip(v * drive) * 0.9);
  }
  return s;
}

export function snare(sr: number, opt: { tone?: number; decay?: number } = {}): Stereo {
  const { tone = 190, decay = 0.22 } = opt;
  const s = alloc(sr, decay + 0.15);
  const rand = rng(11);
  const f = new SVF();
  f.set(4200, 0.7, sr);
  const o = new Float64Array(3);
  let ph = 0;
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    ph += (tone * (1 + 0.5 * Math.exp(-t * 40))) / sr;
    const body = Math.sin(TAU * ph) * Math.exp(-t * 22) * 0.6;
    f.process(rand() * 2 - 1, o);
    const noise = (o[1] * 1.2 + o[2] * 0.4) * Math.exp(-t / (decay * 0.4));
    mono(s, i, softClip((body + noise) * 1.1) * 0.8);
  }
  return s;
}

export function clap(sr: number, opt: { decay?: number; spread?: number } = {}): Stereo {
  const { decay = 0.25, spread = 0.3 } = opt;
  const s = alloc(sr, decay + 0.1);
  const rand = rng(23);
  const f = new SVF();
  f.set(1500, 1.6, sr);
  const o = new Float64Array(3);
  const bursts = [0, 0.011, 0.022, 0.031];
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    let env = 0;
    for (const b of bursts) if (t >= b) env = Math.max(env, Math.exp(-(t - b) * (b === 0.031 ? 1 / (decay * 0.3) : 180)));
    f.process(rand() * 2 - 1, o);
    const v = o[1] * env * 1.6;
    s.l[i] += v * (1 - spread * 0.3);
    s.r[i] += v * (1 - spread * 0.3) * (i % 2 ? 1 : 0.96);
  }
  return s;
}

export function hat(sr: number, opt: { open?: boolean; decay?: number; tone?: number } = {}): Stereo {
  const { open = false, decay = open ? 0.38 : 0.05, tone = 8000 } = opt;
  const s = alloc(sr, decay * (open ? 1.6 : 2.4) + 0.02);
  const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21];
  const oscs = ratios.map((r) => ({ o: new Osc('square', r * 0.1), f: 40 * r * (tone / 8000) }));
  const f = new SVF();
  f.set(tone, 0.8, sr);
  const o = new Float64Array(3);
  const rand = rng(31);
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    let m = 0;
    for (const x of oscs) m += x.o.next(x.f * 10, sr);
    m = m / 6 + (rand() * 2 - 1) * 0.6;
    f.process(m, o);
    const env = Math.exp(-t / (decay * 0.42));
    mono(s, i, o[2] * env * 0.55);
  }
  return s;
}

export function tom(sr: number, pitch = 110, decay = 0.35): Stereo {
  const s = alloc(sr, decay + 0.1);
  let ph = 0;
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    ph += (pitch * (1 + 0.6 * Math.exp(-t * 18))) / sr;
    mono(s, i, Math.sin(TAU * ph) * Math.exp(-t / (decay * 0.4)) * 0.85);
  }
  return s;
}

export function rim(sr: number): Stereo {
  const s = alloc(sr, 0.08);
  let p1 = 0;
  let p2 = 0;
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    p1 += 1700 / sr;
    p2 += 520 / sr;
    mono(s, i, (Math.sin(TAU * p1) * 0.5 + Math.sin(TAU * p2) * 0.6) * Math.exp(-t * 90));
  }
  return s;
}

export function conga(sr: number, pitch = 330): Stereo {
  const s = alloc(sr, 0.3);
  let ph = 0;
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    ph += (pitch * (1 + 0.15 * Math.exp(-t * 60))) / sr;
    const v = Math.sin(TAU * ph) * Math.exp(-t * 14) * 0.8;
    s.l[i] += v * 0.8;
    s.r[i] += v;
  }
  return s;
}

export function shaker(sr: number): Stereo {
  const s = alloc(sr, 0.12);
  const rand = rng(41);
  const f = new SVF();
  f.set(6500, 1.2, sr);
  const o = new Float64Array(3);
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    const env = t < 0.02 ? t / 0.02 : Math.exp(-(t - 0.02) * 40);
    f.process(rand() * 2 - 1, o);
    s.l[i] += o[1] * env * 0.7;
    s.r[i] += o[1] * env * 0.5;
  }
  return s;
}

export function cowbell(sr: number): Stereo {
  const s = alloc(sr, 0.3);
  const a = new Osc('square');
  const b = new Osc('square');
  const f = new SVF();
  f.set(2600, 2, sr);
  const o = new Float64Array(3);
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    f.process(a.next(562, sr) + b.next(845, sr), o);
    mono(s, i, o[1] * Math.exp(-t * 11) * 0.5);
  }
  return s;
}

export function crash(sr: number, decay = 1.8): Stereo {
  const s = alloc(sr, decay + 0.2);
  const rand = rng(53);
  const f = new SVF();
  f.set(5200, 0.6, sr);
  const o = new Float64Array(3);
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    const env = Math.exp(-t / (decay * 0.35)) * (t < 0.003 ? t / 0.003 : 1);
    f.process(rand() * 2 - 1, o);
    s.l[i] += o[2] * env * 0.45;
    f.process(rand() * 2 - 1, o);
    s.r[i] += o[2] * env * 0.45;
  }
  return s;
}

/** Accelerating snare roll, `bars` long at `bpm`. */
export function snareRoll(sr: number, bpm = 124, bars = 2): Stereo {
  const beat = 60 / bpm;
  const len = bars * 4 * beat;
  const s = alloc(sr, len + 0.3);
  const hit = snare(sr, { decay: 0.12 });
  let t = 0;
  while (t < len) {
    const prog = t / len;
    const div = prog < 0.25 ? 1 : prog < 0.5 ? 0.5 : prog < 0.75 ? 0.25 : 0.125;
    const gain = 0.35 + 0.65 * prog;
    const start = Math.round(t * sr);
    for (let i = 0; i < hit.l.length && start + i < s.l.length; i++) {
      s.l[start + i] += hit.l[i] * gain;
      s.r[start + i] += hit.r[i] * gain;
    }
    t += div * beat;
  }
  return s;
}

export function bass808(sr: number, midi = 33, decay = 1.4): Stereo {
  const s = alloc(sr, decay + 0.1);
  const f = midiToHz(midi);
  let ph = 0;
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    ph += (f * (1 + 1.2 * Math.exp(-t * 35))) / sr;
    const env = Math.exp(-t / (decay * 0.5)) * Math.min(1, t / 0.003);
    mono(s, i, softClip(Math.sin(TAU * ph) * env * 1.8) * 0.85);
  }
  return s;
}

export function subDrop(sr: number, len = 1.6): Stereo {
  const s = alloc(sr, len);
  let ph = 0;
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    const f = 30 + 90 * Math.exp(-t * 2.2);
    ph += f / sr;
    mono(s, i, softClip(Math.sin(TAU * ph) * 1.6) * Math.exp(-t * 1.4) * 0.9 * Math.min(1, t / 0.005));
  }
  return s;
}

export function reeseStab(sr: number, midi = 38): Stereo {
  const s = alloc(sr, 0.8);
  const a = new Osc('saw');
  const b = new Osc('saw', 0.3);
  const f = new SVF();
  const o = new Float64Array(3);
  const hz = midiToHz(midi);
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    f.set(180 + 1800 * Math.exp(-t * 9), 1.4, sr);
    f.process(a.next(hz * 0.995, sr) + b.next(hz * 1.006, sr), o);
    const env = Math.min(1, t / 0.004) * Math.exp(-t * 3.2);
    s.l[i] += softClip(o[0] * 1.3) * env * 0.6;
    s.r[i] += softClip(o[0] * 1.3) * env * 0.6;
  }
  return s;
}

export function noiseRiser(sr: number, len = 4, tonal = true): Stereo {
  const s = alloc(sr, len + 0.4);
  const rand = rng(61);
  const fl = new SVF();
  const fr = new SVF();
  const o = new Float64Array(3);
  const saw = new Osc('saw');
  const n = Math.round(len * sr);
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    const p = Math.min(1, i / n);
    const env = i < n ? Math.pow(p, 1.6) : Math.exp(-(t - len) * 18);
    const cut = 300 + 9000 * Math.pow(p, 2);
    fl.set(cut, 2.5, sr);
    fr.set(cut * 1.04, 2.5, sr);
    fl.process(rand() * 2 - 1, o);
    let l = o[1];
    fr.process(rand() * 2 - 1, o);
    let r = o[1];
    if (tonal) {
      const sv = saw.next(110 * Math.pow(2, p * 3), sr) * 0.12;
      l += sv;
      r += sv;
    }
    s.l[i] += l * env * 0.6;
    s.r[i] += r * env * 0.6;
  }
  return s;
}

export function downlifter(sr: number, len = 2): Stereo {
  const s = noiseRiser(sr, len, false);
  s.l.reverse();
  s.r.reverse();
  return s;
}

export function impact(sr: number): Stereo {
  const len = 3;
  const s = alloc(sr, len);
  const rand = rng(71);
  let ph = 0;
  const f = new SVF();
  const o = new Float64Array(3);
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    ph += (38 + 70 * Math.exp(-t * 7)) / sr;
    const boom = Math.sin(TAU * ph) * Math.exp(-t * 1.6) * 1.2;
    f.set(900 + 4000 * Math.exp(-t * 3), 0.7, sr);
    f.process(rand() * 2 - 1, o);
    const noise = o[0] * Math.exp(-t * 3.5) * 0.7;
    mono(s, i, softClip(boom + noise) * Math.min(1, t / 0.002));
  }
  const wl = new Float32Array(s.l);
  const wr = new Float32Array(s.r);
  reverbInPlace(wl, wr, sr, 0.86, 0.3);
  for (let i = 0; i < s.l.length; i++) {
    s.l[i] += wl[i] * 0.5;
    s.r[i] += wr[i] * 0.5;
  }
  return s;
}

export function reverseCymbal(sr: number, len = 2): Stereo {
  const c = crash(sr, len);
  c.l.reverse();
  c.r.reverse();
  return c;
}

export function laser(sr: number): Stereo {
  const s = alloc(sr, 0.5);
  const o = new Osc('square');
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    const v = o.next(2400 * Math.exp(-t * 9) + 120, sr) * Math.exp(-t * 6) * 0.35;
    s.l[i] += v;
    s.r[i] += v * 0.8;
  }
  return s;
}

/** A synthesised party horn: stacked detuned saws with vibrato. Not a sample of any recording. */
export function partyHorn(sr: number): Stereo {
  const s = alloc(sr, 1.3);
  const notes = [70, 74, 77].map(midiToHz);
  const oscs = notes.flatMap((f) => [new Osc('saw'), new Osc('saw', 0.5)].map((o, k) => ({ o, f: f * (k ? 1.004 : 0.996) })));
  const flt = new SVF();
  const out = new Float64Array(3);
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    const vib = 1 + 0.008 * Math.sin(TAU * 6 * t) * Math.min(1, t * 3);
    let v = 0;
    for (const x of oscs) v += x.o.next(x.f * vib, sr);
    flt.set(2200, 0.9, sr);
    flt.process(v / oscs.length, out);
    const env = Math.min(1, t / 0.03) * (t > 1.05 ? Math.exp(-(t - 1.05) * 20) : 1);
    s.l[i] += out[0] * env * 0.9;
    s.r[i] += out[0] * env * 0.85;
  }
  return s;
}

export function siren(sr: number, len = 2): Stereo {
  const s = alloc(sr, len);
  const o = new Osc('triangle');
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    const f = 700 + 350 * Math.sin(TAU * 1.5 * t);
    const env = Math.min(1, t / 0.05) * Math.min(1, (len - t) / 0.1);
    mono(s, i, o.next(f, sr) * env * 0.35);
  }
  return s;
}

const VOWELS: Record<string, [number, number, number]> = {
  ah: [800, 1150, 2900],
  oh: [450, 800, 2830],
  ee: [270, 2140, 2950],
  eh: [530, 1840, 2480],
};

/** Formant-synthesised vocal-style chop (no recorded voice). */
export function voxChop(sr: number, vowel: keyof typeof VOWELS = 'ah', midi = 64, len = 0.45): Stereo {
  const s = alloc(sr, len + 0.05);
  const src = new Osc('saw');
  const formants = VOWELS[vowel].map((f, k) => {
    const flt = new SVF();
    flt.set(f, 6 + k * 2, sr);
    return flt;
  });
  const o = new Float64Array(3);
  const hz = midiToHz(midi);
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    const vib = 1 + 0.01 * Math.sin(TAU * 5.5 * t);
    const x = src.next(hz * vib, sr);
    let v = 0;
    formants.forEach((flt, k) => {
      flt.process(x, o);
      v += o[1] * [1, 0.6, 0.25][k];
    });
    const env = Math.min(1, t / 0.015) * (t > len - 0.08 ? Math.max(0, (len - t) / 0.08) : 1);
    s.l[i] += v * env * 0.9;
    s.r[i] += v * env * 0.9;
  }
  normalize(0.8, s.l, s.r);
  return s;
}

export function vinylBrake(sr: number): Stereo {
  // A rhythmic tone that slows to a halt — evokes a turntable stop.
  const len = 1.2;
  const s = alloc(sr, len);
  const o = new Osc('saw');
  const f = new SVF();
  const out = new Float64Array(3);
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    const speed = Math.max(0, 1 - t / len);
    f.set(300 + 2500 * speed, 1, sr);
    f.process(o.next(220 * speed + 20, sr), out);
    const gate = Math.sin(TAU * 4 * speed * t) > 0 ? 1 : 0.4;
    mono(s, i, out[0] * gate * speed * 0.5);
  }
  return s;
}

/** Mix a list of one-shots into a loop buffer. `events` = [sound, beatPosition, gain]. */
export function renderLoop(sr: number, bpm: number, beats: number, events: [Stereo, number, number][]): Stereo {
  const len = (beats * 60) / bpm;
  const s = alloc(sr, len);
  const n = s.l.length;
  for (const [snd, beat, g] of events) {
    const start = Math.round(((beat * 60) / bpm) * sr);
    for (let i = 0; i < snd.l.length; i++) {
      // wrap tails around so the loop is seamless
      const k = (start + i) % n;
      s.l[k] += snd.l[i] * g;
      s.r[k] += snd.r[i] * g;
    }
  }
  return s;
}

export function bassLoop(sr: number, bpm: number, rootMidi = 33): Stereo {
  const beatS = 60 / bpm;
  const len = beatS * 4;
  const s = alloc(sr, len);
  const pattern = [0, 0, 12, 0, 7, 0, 12, 10];
  const o = new Osc('saw');
  const f = new SVF();
  const out = new Float64Array(3);
  const step = len / 8;
  for (let i = 0; i < s.l.length; i++) {
    const t = i / sr;
    const k = Math.floor(t / step);
    const tt = t - k * step;
    const hz = midiToHz(rootMidi + pattern[k % 8]);
    f.set(300 + 1600 * Math.exp(-tt * 18), 2, sr);
    f.process(o.next(hz, sr), out);
    const env = Math.min(1, tt / 0.003) * (tt > step * 0.8 ? Math.max(0, 1 - (tt - step * 0.8) / (step * 0.2)) : 1);
    mono(s, i, softClip(out[0] * 1.4) * env * 0.6);
  }
  return s;
}

