/**
 * MIXPLAY demo-track composer.
 *
 * Every song in the demo catalog is an original composition rendered on the
 * user's device from a small "recipe". Because we composed them, the BPM,
 * key and beat grid are exact facts — not estimates — and the music is
 * cleared for mixing, looping, effects and recording inside MIXPLAY.
 */
import { Osc, SVF, TAU, rng, midiToHz, softClip, reverbInPlace, normalize, adsr } from './dsp';
import * as S from './sounds';
import type { Stereo } from './sounds';

export type Layer =
  | 'kick'
  | 'clap'
  | 'hats'
  | 'openhat'
  | 'perc'
  | 'bass'
  | 'chords'
  | 'pad'
  | 'arp'
  | 'lead'
  | 'riser'
  | 'crash'
  | 'vinyl';

export interface Section {
  name: string;
  bars: number;
  layers: Layer[];
}

export type StyleId = 'house' | 'deephouse' | 'techhouse' | 'techno' | 'disco' | 'synthwave' | 'lofi' | 'trance' | 'dnb';

export interface Recipe {
  seed: number;
  bpm: number;
  /** MIDI note of the key root (e.g. 57 = A3) */
  root: number;
  scale: 'minor' | 'major' | 'dorian';
  /** scale degrees, one per bar, cycled */
  progression: number[];
  style: StyleId;
  sections: Section[];
}

type BassInst = 'saw' | 'sub' | 'reese' | 'pluck' | 'octave';
type ChordInst = 'stab' | 'pad' | 'keys' | 'pluck' | 'organ';
type LeadInst = 'saw' | 'square' | 'bell' | 'supersaw';

interface StyleDef {
  kick: string;
  kick2?: string;
  clap: string;
  hats: string;
  openhat: string;
  perc: string;
  percSound: 'conga' | 'rim' | 'shaker' | 'cowbell' | 'tom';
  swing: number;
  kickOpt?: Parameters<typeof S.kick>[1];
  snareInsteadOfClap?: boolean;
  bass: { inst: BassInst; steps: (number | null)[]; octave: number; gain: number };
  chords: { inst: ChordInst; rhythm: string; octave: number; gain: number };
  arp: { inst: LeadInst; rate: 8 | 16; octave: number; gain: number; pattern: number[] };
  lead: { inst: LeadInst; octave: number; gain: number };
  sidechain: number;
  reverb: number;
}

const _ = null;
const STYLES: Record<StyleId, StyleDef> = {
  house: {
    kick: 'x...x...x...x...', clap: '....x.......x...', hats: '..x...x...x...x.', openhat: '..x...x...x...x.', perc: '...x.....x....x.', percSound: 'conga', swing: 0.06,
    bass: { inst: 'saw', steps: [0, _, _, 0, _, _, 12, _, 0, _, _, 0, _, 7, _, _], octave: -2, gain: 0.55 },
    chords: { inst: 'stab', rhythm: '...x..x....x..x.', octave: 0, gain: 0.32 },
    arp: { inst: 'saw', rate: 16, octave: 1, gain: 0.12, pattern: [0, 2, 1, 2, 3, 2, 1, 2] },
    lead: { inst: 'square', octave: 1, gain: 0.13 }, sidechain: 0.55, reverb: 0.25,
  },
  deephouse: {
    kick: 'x...x...x...x...', clap: '....x.......x...', hats: '..x...x...x...x.', openhat: '......x.......x.', perc: 'x..x..x...x..x..', percSound: 'shaker', swing: 0.1,
    bass: { inst: 'sub', steps: [0, _, _, _, _, _, 0, _, _, _, 3, _, _, _, _, _], octave: -2, gain: 0.7 },
    chords: { inst: 'keys', rhythm: 'x.....x.....x...', octave: 0, gain: 0.3 },
    arp: { inst: 'bell', rate: 8, octave: 1, gain: 0.1, pattern: [0, 2, 1, 3] },
    lead: { inst: 'bell', octave: 1, gain: 0.12 }, sidechain: 0.4, reverb: 0.35,
  },
  techhouse: {
    kick: 'x...x...x...x...', clap: '....x.......x...', hats: 'xxxxxxxxxxxxxxxx', openhat: '..x...x...x...x.', perc: '..x..x....x..x..', percSound: 'rim', swing: 0.08,
    bass: { inst: 'pluck', steps: [_, _, 0, _, _, 0, _, 0, _, _, 0, _, _, 3, _, 0], octave: -2, gain: 0.6 },
    chords: { inst: 'stab', rhythm: '......x.......x.', octave: 0, gain: 0.22 },
    arp: { inst: 'square', rate: 16, octave: 1, gain: 0.08, pattern: [0, 0, 2, 0, 1, 0, 3, 0] },
    lead: { inst: 'saw', octave: 1, gain: 0.1 }, sidechain: 0.5, reverb: 0.2,
  },
  techno: {
    kick: 'x...x...x...x...', clap: '....x.......x...', hats: 'x.x.x.x.x.x.x.x.', openhat: '..x...x...x...x.', perc: 'x..x..x..x..x...', percSound: 'tom', swing: 0,
    kickOpt: { p0: 150, p1: 44, decay: 0.55, drive: 2.2 },
    bass: { inst: 'reese', steps: [_, _, 0, _, _, _, 0, _, _, _, 0, _, _, _, 0, _], octave: -2, gain: 0.5 },
    chords: { inst: 'stab', rhythm: '..x.....x..x....', octave: 0, gain: 0.18 },
    arp: { inst: 'square', rate: 16, octave: 0, gain: 0.09, pattern: [0, 0, 0, 7, 0, 0, 5, 0] },
    lead: { inst: 'saw', octave: 1, gain: 0.08 }, sidechain: 0.6, reverb: 0.3,
  },
  disco: {
    kick: 'x...x...x...x...', clap: '....x.......x...', hats: 'x.x.x.x.x.x.x.x.', openhat: '..x...x...x...x.', perc: '..x...x...x...x.', percSound: 'cowbell', swing: 0.04,
    snareInsteadOfClap: true,
    bass: { inst: 'octave', steps: [0, _, 12, _, 0, _, 12, _, 0, _, 12, _, 0, _, 12, 10], octave: -2, gain: 0.55 },
    chords: { inst: 'organ', rhythm: 'x..x..x...x..x..', octave: 0, gain: 0.22 },
    arp: { inst: 'bell', rate: 8, octave: 1, gain: 0.09, pattern: [0, 1, 2, 3] },
    lead: { inst: 'supersaw', octave: 1, gain: 0.1 }, sidechain: 0.25, reverb: 0.3,
  },
  synthwave: {
    kick: 'x.......x.......', kick2: 'x.......x..x....', clap: '....x.......x...', hats: 'x.x.x.x.x.x.x.x.', openhat: '................', perc: '................', percSound: 'tom', swing: 0,
    snareInsteadOfClap: true,
    bass: { inst: 'saw', steps: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], octave: -2, gain: 0.35 },
    chords: { inst: 'pad', rhythm: 'x...............', octave: 0, gain: 0.24 },
    arp: { inst: 'square', rate: 16, octave: 1, gain: 0.08, pattern: [0, 1, 2, 3, 2, 1, 0, 1] },
    lead: { inst: 'supersaw', octave: 1, gain: 0.12 }, sidechain: 0.35, reverb: 0.45,
  },
  lofi: {
    kick: 'x.........x.....', kick2: 'x......x..x.....', clap: '....x.......x...', hats: 'x.x.x.x.x.x.x.x.', openhat: '..............x.', perc: '.......x.......x', percSound: 'rim', swing: 0.22,
    snareInsteadOfClap: true, kickOpt: { p0: 120, p1: 50, decay: 0.35, drive: 1.1 },
    bass: { inst: 'sub', steps: [0, _, _, _, _, _, _, 7, _, _, 0, _, _, _, _, _], octave: -2, gain: 0.6 },
    chords: { inst: 'keys', rhythm: 'x.......x.......', octave: 0, gain: 0.32 },
    arp: { inst: 'bell', rate: 8, octave: 1, gain: 0.07, pattern: [2, 1, 0, 1] },
    lead: { inst: 'bell', octave: 1, gain: 0.1 }, sidechain: 0.15, reverb: 0.4,
  },
  trance: {
    kick: 'x...x...x...x...', clap: '....x.......x...', hats: '..x...x...x...x.', openhat: '..x...x...x...x.', perc: '................', percSound: 'shaker', swing: 0,
    bass: { inst: 'saw', steps: [_, 0, 0, 0, _, 0, 0, 0, _, 0, 0, 0, _, 0, 0, 0], octave: -2, gain: 0.45 },
    chords: { inst: 'pad', rhythm: 'x...............', octave: 0, gain: 0.22 },
    arp: { inst: 'supersaw', rate: 16, octave: 1, gain: 0.08, pattern: [0, 1, 2, 1, 3, 1, 2, 1] },
    lead: { inst: 'supersaw', octave: 1, gain: 0.12 }, sidechain: 0.6, reverb: 0.45,
  },
  dnb: {
    kick: 'x.........x.....', kick2: 'x.........x..x..', clap: '....x.......x...', hats: 'x.x.x.x.x.x.x.x.', openhat: '......x.......x.', perc: '..x.......x.....', percSound: 'shaker', swing: 0,
    snareInsteadOfClap: true,
    bass: { inst: 'reese', steps: [0, _, _, _, _, _, _, _, 0, _, _, 3, _, _, _, _], octave: -2, gain: 0.55 },
    chords: { inst: 'pad', rhythm: 'x...............', octave: 0, gain: 0.2 },
    arp: { inst: 'bell', rate: 8, octave: 1, gain: 0.08, pattern: [0, 2, 1, 3] },
    lead: { inst: 'square', octave: 1, gain: 0.1 }, sidechain: 0.3, reverb: 0.35,
  },
};

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};

function scaleNote(root: number, scale: number[], degree: number) {
  const oct = Math.floor(degree / scale.length);
  const idx = ((degree % scale.length) + scale.length) % scale.length;
  return root + oct * 12 + scale[idx];
}

/** Chord tones (as MIDI) for a scale degree: root, third, fifth, seventh. */
function chordTones(root: number, scale: number[], degree: number) {
  return [0, 2, 4, 6].map((k) => scaleNote(root, scale, degree + k));
}

interface Buses {
  dl: Float32Array;
  dr: Float32Array;
  ml: Float32Array;
  mr: Float32Array;
  sl: Float32Array;
  sr_: Float32Array;
  duck: Float32Array;
}

function addOneShot(b: Buses, snd: Stereo, start: number, gain: number, pan = 0, send = 0) {
  const gl = gain * (pan > 0 ? 1 - pan : 1);
  const gr = gain * (pan < 0 ? 1 + pan : 1);
  const n = b.dl.length;
  for (let i = 0; i < snd.l.length; i++) {
    const k = start + i;
    if (k >= n) break;
    if (k < 0) continue;
    b.dl[k] += snd.l[i] * gl;
    b.dr[k] += snd.r[i] * gr;
    if (send) {
      b.sl[k] += snd.l[i] * gl * send;
      b.sr_[k] += snd.r[i] * gr * send;
    }
  }
}

/** Render a single synth note onto the music bus. */
function synthNote(
  b: Buses,
  sr: number,
  start: number,
  dur: number,
  midi: number,
  inst: BassInst | ChordInst | LeadInst,
  gain: number,
  pan: number,
  send: number,
  seed: number,
) {
  const hz = midiToHz(midi);
  const rel =
    inst === 'pad' ? 0.6 : inst === 'keys' || inst === 'bell' ? 0.5 : inst === 'organ' ? 0.08 : inst === 'sub' ? 0.08 : 0.12;
  const total = dur + rel * 1.5;
  const len = Math.min(Math.round(total * sr), b.ml.length - start);
  if (len <= 0) return;
  const r = rng(seed);
  const voices: Osc[] = [];
  const det: number[] = [];
  const addV = (w: 'saw' | 'square' | 'sine' | 'triangle', d: number) => {
    voices.push(new Osc(w, r()));
    det.push(d);
  };
  switch (inst) {
    case 'saw':
    case 'octave':
    case 'pluck':
      addV('saw', 1);
      break;
    case 'sub':
      addV('sine', 1);
      addV('triangle', 2);
      break;
    case 'reese':
      addV('saw', 0.993);
      addV('saw', 1.007);
      break;
    case 'stab':
      addV('saw', 0.996);
      addV('saw', 1.004);
      addV('square', 2);
      break;
    case 'pad':
      addV('saw', 0.994);
      addV('saw', 1.006);
      break;
    case 'keys':
      addV('sine', 1);
      addV('sine', 2);
      addV('sine', 3.01);
      break;
    case 'organ':
      addV('sine', 1);
      addV('sine', 2);
      addV('sine', 4);
      break;
    case 'square':
      addV('square', 1);
      break;
    case 'bell':
      addV('sine', 1);
      addV('sine', 3.5);
      break;
    case 'supersaw':
      for (const d of [0.99, 0.996, 1, 1.004, 1.01]) addV('saw', d);
      break;
  }
  const f = new SVF();
  const out = new Float64Array(3);
  const gl = (gain * (pan > 0 ? 1 - pan * 0.8 : 1)) / Math.sqrt(voices.length);
  const gr = (gain * (pan < 0 ? 1 + pan * 0.8 : 1)) / Math.sqrt(voices.length);
  const additive = inst === 'keys' || inst === 'organ' || inst === 'bell';
  const weights = voices.map((_, k) => (additive ? [1, 0.45, 0.2][k] ?? 0.2 : 1));
  const freqs = det.map((d) => hz * d);
  const nv = voices.length;
  const startSec = start / sr;
  // Envelope + filter run at control rate (every CR samples) — inaudible
  // difference, ~10x faster than per-sample coefficient updates.
  const CR = 16;
  let env = 0;
  for (let i = 0; i < len; i++) {
    if (i % CR === 0) {
      const t = i / sr;
      let cut: number;
      let q = 0.9;
      switch (inst) {
        case 'pad':
          env = adsr(t, dur, 0.35, 0.4, 0.8, rel);
          cut = 900 + 900 * Math.sin(TAU * 0.15 * (startSec + t)) ** 2;
          break;
        case 'stab':
          env = adsr(t, dur, 0.004, 0.18, 0.25, rel);
          cut = 600 + 3200 * Math.exp(-t * 14);
          q = 1.4;
          break;
        case 'pluck':
          env = adsr(t, dur, 0.003, 0.12, 0.2, rel);
          cut = 250 + 2600 * Math.exp(-t * 22);
          q = 2.2;
          break;
        case 'keys':
          env = adsr(t, dur, 0.004, 1.2, 0.35, rel) * (1 + 0.15 * Math.sin(TAU * 4.5 * t));
          cut = 3000;
          break;
        case 'bell':
          env = adsr(t, dur, 0.002, 0.6, 0.15, rel);
          cut = 5000;
          break;
        case 'organ':
          env = adsr(t, dur, 0.006, 0.1, 0.8, rel);
          cut = 2800;
          break;
        case 'sub':
          env = adsr(t, dur, 0.004, 0.2, 0.9, rel);
          cut = 400;
          break;
        case 'reese':
          env = adsr(t, dur, 0.01, 0.3, 0.85, rel);
          cut = 300 + 250 * Math.sin(TAU * 0.5 * (startSec + t)) ** 2;
          q = 1.3;
          break;
        case 'saw':
        case 'octave':
          env = adsr(t, dur, 0.003, 0.15, 0.6, rel);
          cut = 280 + 1400 * Math.exp(-t * 16);
          q = 1.5;
          break;
        case 'square':
          env = adsr(t, dur, 0.004, 0.15, 0.55, rel);
          cut = 1800 + 1500 * Math.exp(-t * 10);
          break;
        case 'supersaw':
          env = adsr(t, dur, 0.01, 0.3, 0.7, rel);
          cut = 2400 + 2000 * Math.exp(-t * 6);
          break;
      }
      if (env === 0 && t > dur) break;
      f.set(cut, q, sr);
    }
    let v = 0;
    for (let k = 0; k < nv; k++) v += voices[k].next(freqs[k], sr) * weights[k];
    f.process(v, out);
    const s = out[0] * env;
    const k = start + i;
    b.ml[k] += s * gl;
    b.mr[k] += s * gr;
    if (send) {
      b.sl[k] += s * gl * send;
      b.sr_[k] += s * gr * send;
    }
  }
}

/** Build a 2-bar melodic motif from chord tones (deterministic per seed). */
function motif(seed: number): { step: number; len: number; tone: number }[] {
  const r = rng(seed);
  const notes: { step: number; len: number; tone: number }[] = [];
  let step = 0;
  while (step < 32) {
    const len = [2, 2, 4, 3, 1, 6][Math.floor(r() * 6)];
    if (r() > 0.25) notes.push({ step, len: Math.min(len, 32 - step), tone: Math.floor(r() * 5) });
    step += len;
  }
  return notes;
}

export interface RenderResult {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
  duration: number;
}

export function totalBars(recipe: Recipe) {
  return recipe.sections.reduce((a, s) => a + s.bars, 0);
}

export function renderTrack(recipe: Recipe, sr = 44100, onProgress?: (p: number) => void): RenderResult {
  const style = STYLES[recipe.style];
  const scale = SCALES[recipe.scale];
  const beat = 60 / recipe.bpm;
  const bar = beat * 4;
  const step = bar / 16;
  const bars = totalBars(recipe);
  // one extra bar of tail so the last notes/reverb can ring out
  const n = Math.round((bars + 0.5) * bar * sr);
  const b: Buses = {
    dl: new Float32Array(n),
    dr: new Float32Array(n),
    ml: new Float32Array(n),
    mr: new Float32Array(n),
    sl: new Float32Array(n),
    sr_: new Float32Array(n),
    duck: new Float32Array(n).fill(1),
  };

  const kit = {
    kick: S.kick(sr, style.kickOpt),
    clap: style.snareInsteadOfClap ? S.snare(sr) : S.clap(sr),
    hat: S.hat(sr),
    open: S.hat(sr, { open: true }),
    crash: S.crash(sr, 2.2),
    perc:
      style.percSound === 'conga'
        ? S.conga(sr)
        : style.percSound === 'rim'
          ? S.rim(sr)
          : style.percSound === 'shaker'
            ? S.shaker(sr)
            : style.percSound === 'cowbell'
              ? S.cowbell(sr)
              : S.tom(sr, 140),
  };
  const lead = motif(recipe.seed * 3 + 1);

  // Bars repeat a lot in dance music, so each unique bar (same layers, chord,
  // phrase position and fills) is synthesised once and then copied.
  const barLen = Math.round(bar * sr);
  const tailLen = Math.round(1.6 * sr);
  const cache = new Map<string, Buses>();
  const mkBuses = (len: number): Buses => ({
    dl: new Float32Array(len),
    dr: new Float32Array(len),
    ml: new Float32Array(len),
    mr: new Float32Array(len),
    sl: new Float32Array(len),
    sr_: new Float32Array(len),
    duck: new Float32Array(len).fill(1),
  });
  const vel = (barKey: number, s: number) => 0.85 + rng(recipe.seed + barKey * 16 + s)() * 0.15;

  const renderBar = (L: Set<Layer>, cycle: number, first: boolean, last: boolean, longSection: boolean): Buses => {
    const lb = mkBuses(barLen + tailLen);
    const n2 = lb.dl.length;
    const degree = recipe.progression[cycle % recipe.progression.length];
    const chord = chordTones(recipe.root, scale, degree);
    const swingAt = (s: number) => (s % 2 === 1 ? style.swing * step : 0);
    const at = (s: number) => Math.round((s * step + swingAt(s)) * sr);
    const kickPat = style.kick2 && cycle % 2 === 1 ? style.kick2 : style.kick;
    const seedBase = recipe.seed + cycle * 97;

    for (let s = 0; s < 16; s++) {
      const v = vel(cycle, s);
      if (L.has('kick') && kickPat[s] === 'x') {
        const pos = at(s);
        addOneShot(lb, kit.kick, pos, 0.95);
        const dl = Math.round(beat * 0.9 * sr);
        for (let i = 0; i < dl && pos + i < n2; i++) {
          const g = 1 - style.sidechain * Math.exp(-i / (sr * 0.09));
          if (g < lb.duck[pos + i]) lb.duck[pos + i] = g;
        }
      }
      if (L.has('clap') && style.clap[s] === 'x') addOneShot(lb, kit.clap, at(s), 0.62 * v, 0, 0.25);
      // snare fill on the last bar of a section
      if (L.has('clap') && last && s >= 12 && longSection) addOneShot(lb, kit.clap, at(s), 0.25 + 0.08 * (s - 12), 0, 0.2);
      if (L.has('hats') && style.hats[s] === 'x') addOneShot(lb, kit.hat, at(s), (s % 4 === 2 ? 0.42 : 0.28) * v, 0.25);
      if (L.has('openhat') && style.openhat[s] === 'x') addOneShot(lb, kit.open, at(s), 0.28 * v, -0.2);
      if (L.has('perc') && style.perc[s] === 'x') addOneShot(lb, kit.perc, at(s), 0.36 * v, s % 2 ? 0.4 : -0.4, 0.2);
    }
    if (L.has('crash') && first) addOneShot(lb, kit.crash, at(0), 0.4, 0, 0.3);
    if (L.has('vinyl')) {
      // gentle vinyl crackle for lo-fi character
      const vr = rng(seedBase + 5);
      for (let i = 0; i < 12; i++) {
        const pos = Math.round(vr() * barLen);
        lb.dl[pos] += (vr() - 0.5) * 0.25;
        lb.dr[pos] += (vr() - 0.5) * 0.25;
      }
    }
    if (L.has('bass')) {
      const bs = style.bass;
      const bassRoot = chord[0] + bs.octave * 12;
      for (let s = 0; s < 16; s++) {
        const off = bs.steps[s];
        if (off === null) continue;
        let len = 1;
        while (s + len < 16 && bs.steps[s + len] === null && len < 4) len++;
        const isOct = bs.inst === 'octave';
        synthNote(lb, sr, at(s), step * len * (isOct ? 0.6 : 0.85), bassRoot + off, isOct ? 'saw' : bs.inst, bs.gain, 0, 0, seedBase + 31 + s);
      }
    }
    if (L.has('chords') || L.has('pad')) {
      const cs = style.chords;
      const inst: ChordInst = L.has('pad') && !L.has('chords') ? 'pad' : cs.inst;
      const rhythm = inst === 'pad' ? 'x...............' : cs.rhythm;
      for (let s = 0; s < 16; s++) {
        if (rhythm[s] !== 'x') continue;
        let len = 1;
        while (s + len < 16 && rhythm[s + len] !== 'x') len++;
        const dur = inst === 'pad' ? bar * 0.98 : inst === 'keys' ? step * len * 0.95 : step * Math.min(len, 2) * 0.6;
        chord.slice(0, 3).forEach((m, k) => {
          synthNote(lb, sr, at(s), dur, m + cs.octave * 12, inst, cs.gain / 1.6, (k - 1) * 0.35, style.reverb, seedBase + 7 + k * 101 + s);
        });
      }
    }
    if (L.has('arp')) {
      const ar = style.arp;
      const div = ar.rate === 16 ? 1 : 2;
      for (let s = 0, k = 0; s < 16; s += div, k++) {
        const idx = ar.pattern[k % ar.pattern.length];
        const m = idx >= 7 ? chord[0] + idx : chord[idx % 4];
        synthNote(lb, sr, at(s), step * div * 0.7, m + ar.octave * 12, ar.inst, ar.gain, k % 2 ? 0.45 : -0.45, style.reverb * 1.2, seedBase + 17 + s);
      }
    }
    if (L.has('lead')) {
      const ls = style.lead;
      const phraseBar = cycle % 2;
      for (const note of lead) {
        if (Math.floor(note.step / 16) !== phraseBar) continue;
        const s = note.step % 16;
        const m = scaleNote(recipe.root, scale, degree + [0, 2, 4, 7, 9][note.tone]) + ls.octave * 12;
        synthNote(lb, sr, at(s), step * note.len * 0.9, m, ls.inst, ls.gain, 0.1, style.reverb * 1.3, seedBase + 13 + s);
      }
    }
    return lb;
  };

  const cycleLen = Math.max(2, recipe.progression.length % 2 === 0 ? recipe.progression.length : recipe.progression.length * 2);
  let barIndex = 0;
  for (const section of recipe.sections) {
    const L = new Set(section.layers);
    for (let sb = 0; sb < section.bars; sb++, barIndex++) {
      const cycle = barIndex % cycleLen;
      const first = sb === 0 && L.has('crash');
      const last = sb === section.bars - 1 && section.bars >= 8 && L.has('clap');
      const key = `${section.layers.join(',')}|${cycle}|${first}|${last}`;
      let lb = cache.get(key);
      if (!lb) {
        lb = renderBar(L, cycle, first, last, section.bars >= 8);
        cache.set(key, lb);
      }
      const off = Math.round(barIndex * bar * sr);
      const lim = Math.min(lb.dl.length, n - off);
      for (let i = 0; i < lim; i++) {
        const k = off + i;
        b.dl[k] += lb.dl[i];
        b.dr[k] += lb.dr[i];
        b.ml[k] += lb.ml[i];
        b.mr[k] += lb.mr[i];
        b.sl[k] += lb.sl[i];
        b.sr_[k] += lb.sr_[i];
        if (lb.duck[i] < b.duck[k]) b.duck[k] = lb.duck[i];
      }
      onProgress?.((barIndex / bars) * 0.9);
    }
    // riser leading into the next section
    if (L.has('riser')) {
      const riseBars = Math.min(4, section.bars);
      const start = (barIndex - riseBars) * bar;
      const rs = S.noiseRiser(sr, riseBars * bar, true);
      addOneShot(b, rs, Math.round(start * sr), 0.4, 0, 0.3);
    }
  }

  // reverb on the send bus
  reverbInPlace(b.sl, b.sr_, sr, 0.84, 0.4);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = b.duck[i];
    left[i] = softClip((b.dl[i] + b.ml[i] * d + b.sl[i] * 0.55 * d) * 0.9);
    right[i] = softClip((b.dr[i] + b.mr[i] * d + b.sr_[i] * 0.55 * d) * 0.9);
  }
  normalize(0.89, left, right);
  onProgress?.(1);
  return { sampleRate: sr, left, right, duration: n / sr };
}
