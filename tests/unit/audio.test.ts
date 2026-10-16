import { describe, expect, it } from 'vitest';
import { renderTrack, totalBars, type Recipe } from '../../src/audio/synth/composer';
import { estimateBpm, computeWaveform, computeEnergyPerBar } from '../../src/audio/analysis';
import { crossfadeGains } from '../../src/audio/channel';
import { filterFrequencies } from '../../src/audio/fxRack';
import { DEMO_TRACKS, demoMeta, demoSections } from '../../src/catalog/demoTracks';
import * as S from '../../src/audio/synth/sounds';

const short: Recipe = {
  seed: 1,
  bpm: 124,
  root: 57,
  scale: 'minor',
  progression: [0, 5, 3, 4],
  style: 'house',
  sections: [
    { name: 'Intro', bars: 4, layers: ['kick', 'hats'] },
    { name: 'Main', bars: 4, layers: ['kick', 'clap', 'hats', 'bass', 'chords'] },
  ],
};

describe('composer', () => {
  it('renders deterministic, normalised audio of the expected length', () => {
    const a = renderTrack(short, 16000);
    const b = renderTrack(short, 16000);
    expect(a.duration).toBeCloseTo(((totalBars(short) + 0.5) * 4 * 60) / 124, 2);
    let peak = 0;
    for (const v of a.left) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.85);
    expect(peak).toBeLessThanOrEqual(0.9);
    expect(a.left[5000]).toBe(b.left[5000]);
  });
  it('produces a beat the tempo estimator agrees with', () => {
    const r = renderTrack(short, 22050);
    const est = estimateBpm(r.left, r.sampleRate);
    expect(est).not.toBeNull();
    expect(Math.abs(est!.bpm - 124)).toBeLessThan(1.5);
  });
  it('energy rises when more layers come in', () => {
    const r = renderTrack(short, 16000);
    const e = computeEnergyPerBar(r.left, r.right, r.sampleRate, 124);
    expect(e[6]).toBeGreaterThan(e[1]);
  });
});

describe('analysis', () => {
  it('estimates tempo of a click track', () => {
    const sr = 22050;
    const sig = new Float32Array(sr * 20);
    const period = Math.round((60 / 120) * sr);
    for (let i = 0; i < sig.length; i += period) for (let k = 0; k < 200; k++) sig[i + k] = Math.sin(k * 0.3) * (1 - k / 200);
    expect(Math.abs(estimateBpm(sig, sr)!.bpm - 120)).toBeLessThan(1);
  });
  it('returns null instead of guessing on silence', () => {
    expect(estimateBpm(new Float32Array(44100 * 10), 44100)).toBeNull();
  });
  it('builds waveform buckets at 100 per second', () => {
    const w = computeWaveform(new Float32Array(44100 * 2).fill(0.5), null, 44100);
    expect(w.length).toBe(200);
    expect(w.peak[10]).toBeCloseTo(0.5);
  });
});

describe('mixer maths', () => {
  it('crossfader is equal-power and hard at the edges', () => {
    expect(crossfadeGains(-1, 'smooth')).toEqual({ a: 1, b: 0 });
    const c = crossfadeGains(0, 'smooth');
    expect(c.a ** 2 + c.b ** 2).toBeCloseTo(1);
    expect(crossfadeGains(1, 'smooth').a).toBeCloseTo(0);
    expect(crossfadeGains(0.5, 'sharp')).toEqual({ a: 1, b: 1 });
  });
  it('filter knob maps to low-pass/high-pass ranges', () => {
    expect(filterFrequencies(0)).toEqual({ lp: 20000, hp: 10 });
    expect(filterFrequencies(-1).lp).toBeCloseTo(80);
    expect(filterFrequencies(1).hp).toBeCloseTo(9000);
  });
});

describe('demo catalog', () => {
  it('has exact metadata derived from the compositions', () => {
    for (const t of DEMO_TRACKS) {
      const m = demoMeta(t);
      expect(m.bpmSource).toBe('composed');
      expect(m.bpm).toBe(t.recipe.bpm);
      const secs = demoSections(t.local);
      expect(secs[secs.length - 1].end).toBeLessThan(m.durationSec!);
    }
  });
  it('sound pack generators produce audio', () => {
    for (const s of [S.kick(22050), S.snareRoll(22050), S.noiseRiser(22050, 1), S.voxChop(22050)]) {
      expect(s.l.length).toBeGreaterThan(100);
      expect(s.l.some((v) => Math.abs(v) > 0.05)).toBe(true);
    }
  });
});
