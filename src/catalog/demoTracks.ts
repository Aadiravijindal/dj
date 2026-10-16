import type { Recipe, Section, Layer } from '../audio/synth/composer';
import { totalBars } from '../audio/synth/composer';
import type { TrackMeta, Artwork } from './types';

export const DEMO_PROVIDER_ID = 'demo';
export const DEMO_LICENSE =
  'Original music composed for MIXPLAY. Cleared for mixing, looping, effects and performance inside MIXPLAY.';

const sec = (name: string, bars: number, layers: Layer[]): Section => ({ name, bars, layers });

const CLUB = (): Section[] => [
  sec('Intro', 8, ['kick', 'hats', 'perc']),
  sec('Groove', 8, ['kick', 'hats', 'perc', 'clap', 'bass', 'openhat']),
  sec('Build', 8, ['kick', 'hats', 'clap', 'bass', 'chords', 'riser']),
  sec('Drop', 16, ['kick', 'clap', 'hats', 'openhat', 'perc', 'bass', 'chords', 'arp', 'lead', 'crash']),
  sec('Break', 8, ['pad', 'lead', 'riser', 'crash']),
  sec('Drop 2', 16, ['kick', 'clap', 'hats', 'openhat', 'perc', 'bass', 'chords', 'arp', 'lead', 'crash']),
  sec('Outro', 8, ['kick', 'hats', 'perc', 'clap']),
];

const LOFI = (): Section[] => [
  sec('Intro', 4, ['chords', 'vinyl']),
  sec('Main', 16, ['kick', 'clap', 'hats', 'openhat', 'perc', 'bass', 'chords', 'vinyl', 'arp']),
  sec('Break', 4, ['chords', 'lead', 'vinyl']),
  sec('Main 2', 12, ['kick', 'clap', 'hats', 'perc', 'bass', 'chords', 'lead', 'vinyl']),
  sec('Outro', 4, ['kick', 'hats', 'chords', 'vinyl']),
];

const SYNTHWAVE = (): Section[] => [
  sec('Intro', 8, ['pad', 'arp']),
  sec('Verse', 16, ['kick', 'clap', 'hats', 'bass', 'pad', 'arp', 'crash']),
  sec('Chorus', 16, ['kick', 'clap', 'hats', 'bass', 'pad', 'arp', 'lead', 'crash']),
  sec('Break', 8, ['pad', 'lead', 'riser']),
  sec('Outro', 8, ['kick', 'clap', 'hats', 'bass', 'arp']),
];

interface DemoEntry {
  local: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  key: string;
  mood: string;
  energy: TrackMeta['energy'];
  artwork: Artwork;
  recipe: Recipe;
}

export const DEMO_TRACKS: DemoEntry[] = [
  {
    local: 'neon-tide', title: 'Neon Tide', artist: 'Lumen Harbor', album: 'Harbor Lights', genre: 'House', key: 'A minor · 8A', mood: 'Bright, rolling, late-evening', energy: 'steady',
    artwork: { kind: 'generated', hues: [18, 330], pattern: 'waves' },
    recipe: { seed: 101, bpm: 124, root: 57, scale: 'minor', progression: [0, 5, 3, 4], style: 'house', sections: CLUB() },
  },
  {
    local: 'sunday-signal', title: 'Sunday Signal', artist: 'Marlow & Finch', album: 'Open Windows', genre: 'House', key: 'C major · 8B', mood: 'Warm, uplifting, sunny', energy: 'steady',
    artwork: { kind: 'generated', hues: [42, 12], pattern: 'sun' },
    recipe: { seed: 202, bpm: 124, root: 60, scale: 'major', progression: [0, 4, 5, 3], style: 'house', sections: CLUB() },
  },
  {
    local: 'paper-satellites', title: 'Paper Satellites', artist: 'Kiro & The Static', album: 'Low Orbit', genre: 'Deep House', key: 'F minor · 4A', mood: 'Hazy, deep, hypnotic', energy: 'chill',
    artwork: { kind: 'generated', hues: [205, 255], pattern: 'rings' },
    recipe: { seed: 303, bpm: 120, root: 53, scale: 'dorian', progression: [0, 0, 3, 3], style: 'deephouse', sections: CLUB() },
  },
  {
    local: 'glass-elevator', title: 'Glass Elevator', artist: 'Tessellate', album: 'Floors', genre: 'Tech House', key: 'G minor · 6A', mood: 'Bouncy, percussive, groovy', energy: 'peak',
    artwork: { kind: 'generated', hues: [160, 190], pattern: 'grid' },
    recipe: { seed: 404, bpm: 126, root: 55, scale: 'minor', progression: [0, 0, 0, 5], style: 'techhouse', sections: CLUB() },
  },
  {
    local: 'night-shift-engine', title: 'Night Shift Engine', artist: 'Vanta Grid', album: 'Third Shift', genre: 'Techno', key: 'E minor · 9A', mood: 'Driving, dark, relentless', energy: 'peak',
    artwork: { kind: 'generated', hues: [0, 280], pattern: 'stripes' },
    recipe: { seed: 505, bpm: 128, root: 52, scale: 'minor', progression: [0, 0, 0, 0], style: 'techno', sections: CLUB() },
  },
  {
    local: 'velvet-hours', title: 'Velvet Hours', artist: 'Sol Mirage', album: 'Mirrorball Season', genre: 'Disco', key: 'D major · 10B', mood: 'Glittery, playful, dance-floor', energy: 'steady',
    artwork: { kind: 'generated', hues: [300, 40], pattern: 'dots' },
    recipe: { seed: 606, bpm: 116, root: 62, scale: 'major', progression: [1, 4, 0, 3], style: 'disco', sections: CLUB() },
  },
  {
    local: 'afterglow-run', title: 'Afterglow Run', artist: 'Polar Coast', album: 'Coastline FM', genre: 'Synthwave', key: 'C minor · 5A', mood: 'Nostalgic, cinematic, night-drive', energy: 'steady',
    artwork: { kind: 'generated', hues: [320, 260], pattern: 'sun' },
    recipe: { seed: 707, bpm: 100, root: 60, scale: 'minor', progression: [0, 5, 2, 6], style: 'synthwave', sections: SYNTHWAVE() },
  },
  {
    local: 'golden-static', title: 'Golden Static', artist: 'Juno Park', album: 'Tape Days', genre: 'Lo-fi Hip-hop', key: 'E♭ major · 5B', mood: 'Mellow, dusty, cosy', energy: 'chill',
    artwork: { kind: 'generated', hues: [35, 200], pattern: 'dots' },
    recipe: { seed: 808, bpm: 86, root: 51, scale: 'major', progression: [1, 4, 0, 5], style: 'lofi', sections: LOFI() },
  },
  {
    local: 'skyline-pulse', title: 'Skyline Pulse', artist: 'Aerial Sea', album: 'Altitude', genre: 'Trance', key: 'B minor · 10A', mood: 'Euphoric, soaring, wide', energy: 'peak',
    artwork: { kind: 'generated', hues: [190, 230], pattern: 'rings' },
    recipe: { seed: 909, bpm: 138, root: 59, scale: 'minor', progression: [0, 5, 2, 6], style: 'trance', sections: CLUB() },
  },
  {
    local: 'rapid-bloom', title: 'Rapid Bloom', artist: 'Nightjar', album: 'Fast Gardens', genre: 'Drum & Bass', key: 'G minor · 6A', mood: 'Fast, rolling, energetic', energy: 'peak',
    artwork: { kind: 'generated', hues: [100, 150], pattern: 'waves' },
    recipe: { seed: 1010, bpm: 172, root: 55, scale: 'minor', progression: [0, 0, 5, 4], style: 'dnb', sections: CLUB() },
  },
];

export function demoMeta(e: DemoEntry): TrackMeta {
  const bars = totalBars(e.recipe);
  const barSec = (60 / e.recipe.bpm) * 4;
  return {
    id: `${DEMO_PROVIDER_ID}:${e.local}`,
    providerId: DEMO_PROVIDER_ID,
    title: e.title,
    artist: e.artist,
    album: e.album,
    genre: e.genre,
    durationSec: Math.round((bars + 0.5) * barSec * 100) / 100,
    bpm: e.recipe.bpm,
    bpmSource: 'composed',
    key: e.key,
    firstBeat: 0,
    artwork: e.artwork,
    license: DEMO_LICENSE,
    mood: e.mood,
    energy: e.energy,
  };
}

/** Section boundaries in seconds — real structure because we composed it. */
export function demoSections(local: string): { name: string; start: number; end: number }[] {
  const e = DEMO_TRACKS.find((t) => t.local === local);
  if (!e) return [];
  const barSec = (60 / e.recipe.bpm) * 4;
  let bar = 0;
  return e.recipe.sections.map((s) => {
    const r = { name: s.name, start: bar * barSec, end: (bar + s.bars) * barSec };
    bar += s.bars;
    return r;
  });
}
