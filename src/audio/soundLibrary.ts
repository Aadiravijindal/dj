/**
 * Sound packs. Every sound is synthesised by MIXPLAY (see synth/sounds.ts),
 * so all of them are cleared for use. New packs can be registered with
 * `registerPack` — e.g. a licensed sample pack loaded from a CDN later.
 */
import * as S from './synth/sounds';
import type { Stereo } from './synth/sounds';

export type SoundCategory =
  | 'Kicks'
  | 'Snares'
  | 'Claps'
  | 'Hi-hats'
  | 'Percussion'
  | 'Drum rolls'
  | 'Bass hits'
  | 'Risers'
  | 'Impacts'
  | 'FX'
  | 'Vocal chops'
  | 'Loops';

export interface SoundDef {
  id: string;
  name: string;
  category: SoundCategory;
  packId: string;
  /** hue for the pad colour */
  hue: number;
  /** loops repeat until stopped and follow tempo */
  loop?: { bpm: number; beats: number };
  render: (sr: number) => Stereo;
}

export interface SoundPack {
  id: string;
  name: string;
  description: string;
  license: string;
  sounds: SoundDef[];
}

const LICENSE = 'Synthesised by MIXPLAY. Free to use in your mixes.';
const hue: Record<SoundCategory, number> = {
  Kicks: 12,
  Snares: 32,
  Claps: 48,
  'Hi-hats': 70,
  Percussion: 150,
  'Drum rolls': 28,
  'Bass hits': 265,
  Risers: 190,
  Impacts: 345,
  FX: 300,
  'Vocal chops': 220,
  Loops: 170,
};

const def = (packId: string, id: string, name: string, category: SoundCategory, render: (sr: number) => Stereo, loop?: SoundDef['loop']): SoundDef => ({
  id,
  name,
  category,
  packId,
  hue: hue[category],
  render,
  loop,
});

const core: SoundPack = {
  id: 'core-drums',
  name: 'Core Drums',
  description: 'Punchy kicks, snares, claps, hats and percussion.',
  license: LICENSE,
  sounds: [
    def('core-drums', 'kick-club', 'Club Kick', 'Kicks', (sr) => S.kick(sr)),
    def('core-drums', 'kick-deep', 'Deep Kick', 'Kicks', (sr) => S.kick(sr, { p0: 120, p1: 42, decay: 0.7, drive: 1.2 })),
    def('core-drums', 'kick-hard', 'Hard Kick', 'Kicks', (sr) => S.kick(sr, { p0: 200, p1: 50, decay: 0.45, drive: 2.6, click: 0.9 })),
    def('core-drums', 'snare-tight', 'Tight Snare', 'Snares', (sr) => S.snare(sr)),
    def('core-drums', 'snare-fat', 'Fat Snare', 'Snares', (sr) => S.snare(sr, { tone: 160, decay: 0.35 })),
    def('core-drums', 'clap-classic', 'Classic Clap', 'Claps', (sr) => S.clap(sr)),
    def('core-drums', 'clap-wide', 'Wide Clap', 'Claps', (sr) => S.clap(sr, { decay: 0.4, spread: 0.8 })),
    def('core-drums', 'hat-closed', 'Closed Hat', 'Hi-hats', (sr) => S.hat(sr)),
    def('core-drums', 'hat-open', 'Open Hat', 'Hi-hats', (sr) => S.hat(sr, { open: true })),
    def('core-drums', 'hat-crisp', 'Crisp Hat', 'Hi-hats', (sr) => S.hat(sr, { decay: 0.03, tone: 10000 })),
    def('core-drums', 'perc-rim', 'Rimshot', 'Percussion', (sr) => S.rim(sr)),
    def('core-drums', 'perc-conga', 'Conga', 'Percussion', (sr) => S.conga(sr)),
    def('core-drums', 'perc-conga-lo', 'Low Conga', 'Percussion', (sr) => S.conga(sr, 220)),
    def('core-drums', 'perc-shaker', 'Shaker', 'Percussion', (sr) => S.shaker(sr)),
    def('core-drums', 'perc-cowbell', 'Cowbell', 'Percussion', (sr) => S.cowbell(sr)),
    def('core-drums', 'perc-tom', 'Floor Tom', 'Percussion', (sr) => S.tom(sr, 95)),
    def('core-drums', 'cym-crash', 'Crash', 'Impacts', (sr) => S.crash(sr)),
  ],
};

const perf: SoundPack = {
  id: 'performance',
  name: 'Performance FX',
  description: 'Rolls, risers, impacts, bass hits and crowd-pleasers for build-ups and drops.',
  license: LICENSE,
  sounds: [
    def('performance', 'roll-2bar', 'Snare Roll · 2 bars', 'Drum rolls', (sr) => S.snareRoll(sr, 124, 2)),
    def('performance', 'roll-1bar', 'Snare Roll · 1 bar', 'Drum rolls', (sr) => S.snareRoll(sr, 124, 1)),
    def('performance', 'bass-808', '808 Boom', 'Bass hits', (sr) => S.bass808(sr)),
    def('performance', 'bass-808-hi', '808 High', 'Bass hits', (sr) => S.bass808(sr, 40, 1)),
    def('performance', 'bass-subdrop', 'Sub Drop', 'Bass hits', (sr) => S.subDrop(sr)),
    def('performance', 'bass-reese', 'Reese Stab', 'Bass hits', (sr) => S.reeseStab(sr)),
    def('performance', 'rise-4', 'Noise Riser · 4s', 'Risers', (sr) => S.noiseRiser(sr, 4)),
    def('performance', 'rise-8', 'Long Riser · 8s', 'Risers', (sr) => S.noiseRiser(sr, 8)),
    def('performance', 'rise-down', 'Downlifter', 'Risers', (sr) => S.downlifter(sr)),
    def('performance', 'rise-revcym', 'Reverse Cymbal', 'Risers', (sr) => S.reverseCymbal(sr)),
    def('performance', 'impact-boom', 'Boom Impact', 'Impacts', (sr) => S.impact(sr)),
    def('performance', 'fx-laser', 'Laser Zap', 'FX', (sr) => S.laser(sr)),
    def('performance', 'fx-horn', 'Party Horn', 'FX', (sr) => S.partyHorn(sr)),
    def('performance', 'fx-siren', 'Siren', 'FX', (sr) => S.siren(sr)),
    def('performance', 'fx-brake', 'Tape Stop', 'FX', (sr) => S.vinylBrake(sr)),
    def('performance', 'vox-ah', 'Vox Chop “Ah”', 'Vocal chops', (sr) => S.voxChop(sr, 'ah', 64)),
    def('performance', 'vox-oh', 'Vox Chop “Oh”', 'Vocal chops', (sr) => S.voxChop(sr, 'oh', 62)),
    def('performance', 'vox-ee', 'Vox Chop “Ee”', 'Vocal chops', (sr) => S.voxChop(sr, 'ee', 67)),
    def('performance', 'vox-eh-short', 'Vox Stab “Eh”', 'Vocal chops', (sr) => S.voxChop(sr, 'eh', 69, 0.18)),
  ],
};

const loops: SoundPack = {
  id: 'loops',
  name: 'Tempo Loops',
  description: 'One-bar loops that lock to the tempo of the deck you are playing.',
  license: LICENSE,
  sounds: [
    def('loops', 'loop-drums', 'House Drums', 'Loops', (sr) => {
      const k = S.kick(sr), c = S.clap(sr), h = S.hat(sr), o = S.hat(sr, { open: true });
      return S.renderLoop(sr, 124, 4, [[k, 0, 0.9], [k, 1, 0.9], [k, 2, 0.9], [k, 3, 0.9], [c, 1, 0.6], [c, 3, 0.6], [o, 0.5, 0.3], [o, 1.5, 0.3], [o, 2.5, 0.3], [o, 3.5, 0.3], [h, 0.25, 0.2], [h, 0.75, 0.2], [h, 1.25, 0.2], [h, 1.75, 0.2], [h, 2.25, 0.2], [h, 2.75, 0.2], [h, 3.25, 0.2], [h, 3.75, 0.2]]);
    }, { bpm: 124, beats: 4 }),
    def('loops', 'loop-perc', 'Conga Groove', 'Loops', (sr) => {
      const a = S.conga(sr), b = S.conga(sr, 220), r = S.rim(sr), s = S.shaker(sr);
      return S.renderLoop(sr, 124, 4, [[a, 0.5, 0.5], [b, 0.75, 0.6], [a, 1.5, 0.4], [r, 2.25, 0.4], [b, 2.75, 0.6], [a, 3.5, 0.5], ...[0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((t) => [s, t + 0.25, 0.3] as [S.Stereo, number, number])]);
    }, { bpm: 124, beats: 4 }),
    def('loops', 'loop-hats', 'Rolling Hats', 'Loops', (sr) => {
      const h = S.hat(sr, { decay: 0.035 });
      return S.renderLoop(sr, 124, 4, Array.from({ length: 16 }, (_, i) => [h, i / 4, i % 4 === 2 ? 0.45 : 0.22] as [S.Stereo, number, number]));
    }, { bpm: 124, beats: 4 }),
    def('loops', 'loop-bass', 'Bassline A', 'Loops', (sr) => S.bassLoop(sr, 124, 33), { bpm: 124, beats: 4 }),
    def('loops', 'loop-bass-g', 'Bassline G', 'Loops', (sr) => S.bassLoop(sr, 124, 31), { bpm: 124, beats: 4 }),
  ],
};

const packs: SoundPack[] = [core, perf, loops];

export function registerPack(p: SoundPack) {
  if (!packs.some((x) => x.id === p.id)) packs.push(p);
}

export function allPacks() {
  return packs;
}

export function allSounds(): SoundDef[] {
  return packs.flatMap((p) => p.sounds);
}

export function soundById(id: string): SoundDef | undefined {
  return allSounds().find((s) => s.id === id);
}

export const CATEGORIES: SoundCategory[] = ['Kicks', 'Snares', 'Claps', 'Hi-hats', 'Percussion', 'Drum rolls', 'Bass hits', 'Risers', 'Impacts', 'FX', 'Vocal chops', 'Loops'];
