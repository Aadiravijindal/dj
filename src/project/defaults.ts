import type {
  BuildEvent,
  BuildSettings,
  ChannelSettings,
  DeckSettings,
  FxSettings,
  Pattern,
  PatternTrack,
  Project,
  Arrangement,
} from './types';

export const uid = (prefix = '') =>
  prefix + (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));

export const defaultDeck = (): DeckSettings => ({
  trackId: null,
  tempo: 0,
  tempoRange: 8,
  cue: 0,
  hotCues: Array(8).fill(null),
  loop: null,
  loopActive: false,
  savedLoops: [],
  position: 0,
  quantize: true,
});

export const defaultChannel = (): ChannelSettings => ({
  gain: 0,
  volume: 0.85,
  eq: { low: 0, mid: 0, high: 0 },
  mute: false,
  cue: false,
});

export const defaultFx = (): FxSettings => ({
  filter: { enabled: false, amount: 0, resonance: 0.25 },
  echo: { enabled: false, time: 0.75, feedback: 0.45, mix: 0.4 },
  reverb: { enabled: false, decay: 2.5, mix: 0.35 },
  flanger: { enabled: false, rate: 0.2, depth: 0.6, feedback: 0.5, mix: 0.5 },
  phaser: { enabled: false, rate: 0.4, depth: 0.7, mix: 0.6 },
  drive: { enabled: false, amount: 0.35, mix: 0.5 },
});

/** Parse "x...x...x...x..." (x = hit, X = accent) into a 16-step array. */
export function parseSteps(s: string): number[] {
  const out = Array(16).fill(0);
  for (let i = 0; i < 16 && i < s.length; i++) out[i] = s[i] === 'X' ? 2 : s[i] === 'x' || s[i] === 'o' || /[1-9]/.test(s[i]) ? 1 : 0;
  return out;
}

const row = (soundId: string, steps: string, volume = 0.8): PatternTrack => ({
  id: uid('t'),
  soundId,
  volume,
  muted: false,
  steps: parseSteps(steps),
});

export const PATTERN_PRESETS: { name: string; rows: [string, string, number?][] }[] = [
  {
    name: 'Four on the floor',
    rows: [
      ['kick-club', 'X...x...x...x...', 0.9],
      ['clap-classic', '....x.......x...'],
      ['hat-closed', '..x...x...x...x.', 0.6],
      ['hat-open', '................', 0.5],
      ['perc-shaker', 'x.x.x.x.x.x.x.x.', 0.4],
      ['perc-conga', '................', 0.6],
      ['bass-808', '................', 0.7],
      ['vox-eh-short', '................', 0.6],
    ],
  },
  {
    name: 'Breakbeat',
    rows: [
      ['kick-club', 'x.........x.....', 0.9],
      ['snare-tight', '....x.......x..x'],
      ['hat-closed', 'x.x.x.x.x.x.x.x.', 0.55],
      ['hat-open', '..............x.', 0.45],
      ['perc-rim', '...x......x.....', 0.5],
      ['perc-conga', '................', 0.6],
      ['bass-808', 'x.........x.....', 0.6],
      ['vox-ah', '................', 0.5],
    ],
  },
  {
    name: 'Half-time bounce',
    rows: [
      ['kick-deep', 'x......x..x.....', 0.9],
      ['clap-wide', '........x.......', 0.8],
      ['hat-crisp', 'xxx.x.xxx.x.xx.x', 0.45],
      ['hat-open', '................', 0.5],
      ['perc-rim', '......x.......x.', 0.5],
      ['perc-cowbell', '................', 0.4],
      ['bass-808', 'x......x..x.....', 0.75],
      ['vox-oh', '................', 0.5],
    ],
  },
  {
    name: 'Percussion jam',
    rows: [
      ['kick-club', 'x...x...x...x...', 0.8],
      ['perc-conga', '..x..x....x..x..', 0.7],
      ['perc-conga-lo', 'x.....x.....x...', 0.7],
      ['perc-shaker', 'xxxxxxxxxxxxxxxx', 0.35],
      ['perc-cowbell', '..x.......x.....', 0.35],
      ['perc-rim', '.....x.......x..', 0.5],
      ['hat-open', '..x...x...x...x.', 0.4],
      ['perc-tom', '..............xx', 0.6],
    ],
  },
];

export const makePattern = (presetIndex = 0, name?: string): Pattern => {
  const p = PATTERN_PRESETS[presetIndex] ?? PATTERN_PRESETS[0];
  return { id: uid('p'), name: name ?? p.name, tracks: p.rows.map(([s, st, v]) => row(s, st, v)) };
};

export const DEFAULT_PADS = [
  'kick-club', 'clap-classic', 'hat-open', 'perc-conga',
  'roll-1bar', 'rise-4', 'impact-boom', 'bass-808',
  'vox-ah', 'vox-eh-short', 'fx-horn', 'fx-laser',
  'loop-drums', 'loop-perc', 'loop-bass', 'rise-revcym',
];

const ev = (lane: BuildEvent['lane'], start: number, length: number, intensity: number): BuildEvent => ({ id: uid('e'), lane, start, length, intensity });

export const BUILD_TEMPLATES: Record<string, { name: string; description: string; make: () => BuildSettings }> = {
  'classic-8': {
    name: 'Classic build · 8 bars',
    description: 'Snare roll, rising noise and a high-pass sweep, with a beat of silence before the drop.',
    make: () => ({
      bars: 8,
      deck: 'A',
      templateName: 'Classic build · 8 bars',
      events: [ev('roll', 16, 16, 0.7), ev('riser', 0, 32, 0.6), ev('filter', 8, 24, 0.7), ev('silence', 31, 1, 1), ev('impact', 32, 0, 0.8)],
    }),
  },
  'quick-4': {
    name: 'Quick lift · 4 bars',
    description: 'A short filter rise and a loop roll — great between phrases.',
    make: () => ({
      bars: 4,
      deck: 'A',
      templateName: 'Quick lift · 4 bars',
      events: [ev('filter', 0, 16, 0.6), ev('loop', 8, 8, 0.6), ev('roll', 12, 4, 0.5)],
    }),
  },
  'echo-out': {
    name: 'Echo out · 4 bars',
    description: 'Echo and filter wash the track out so the next one can drop in clean.',
    make: () => ({
      bars: 4,
      deck: 'A',
      templateName: 'Echo out · 4 bars',
      events: [ev('echo', 4, 12, 0.8), ev('filter', 4, 12, 0.8), ev('riser', 8, 8, 0.4)],
    }),
  },
  'festival-16': {
    name: 'Festival drop · 16 bars',
    description: 'Long tension: percussion, loop roll, riser, roll, silence, then impact + sub drop.',
    make: () => ({
      bars: 16,
      deck: 'A',
      templateName: 'Festival drop · 16 bars',
      events: [
        ev('perc', 0, 32, 0.5),
        ev('riser', 32, 32, 0.8),
        ev('filter', 32, 30, 0.85),
        ev('loop', 48, 14, 0.8),
        ev('roll', 48, 14, 0.9),
        ev('silence', 62, 2, 1),
        ev('impact', 64, 0, 1),
        ev('bass', 64, 0, 0.9),
      ],
    }),
  },
};

export const defaultBuild = (): BuildSettings => BUILD_TEMPLATES['classic-8'].make();

export const newArrangement = (name = 'Main set'): Arrangement => ({ id: uid('a'), name, items: [], notes: '' });

export function createProject(name = 'Untitled mix'): Project {
  const now = Date.now();
  const patterns = PATTERN_PRESETS.map((_, i) => makePattern(i));
  const arr = newArrangement();
  return {
    schema: 1,
    id: uid('mix-'),
    name,
    createdAt: now,
    updatedAt: now,
    openedAt: now,
    favorite: false,
    decks: { A: defaultDeck(), B: defaultDeck() },
    mixer: { crossfader: 0, curve: 'smooth', master: 0.9, cueMix: 0.8, channels: { A: defaultChannel(), B: defaultChannel() } },
    fx: { A: defaultFx(), B: defaultFx() },
    beats: { bpm: 124, follow: 'A', swing: 0, volume: 0.8, patterns, activePatternId: patterns[0].id },
    pads: { assignments: [...DEFAULT_PADS], volumes: Array(16).fill(0.85), favorites: ['impact-boom', 'rise-4', 'fx-horn'], quantize: true, volume: 0.9 },
    build: defaultBuild(),
    timeline: { arrangements: [arr], activeId: arr.id },
  };
}

/**
 * Bring any stored project (possibly older or partially corrupted) up to the
 * current shape by filling gaps with defaults. Never throws.
 */
export function normalizeProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Project>;
  if (typeof r.id !== 'string' || typeof r.name !== 'string') return null;
  const base = createProject(r.name);
  const deck = (d: Partial<DeckSettings> | undefined) => {
    const out = { ...defaultDeck(), ...(d ?? {}) };
    out.hotCues = Array.from({ length: 8 }, (_, i) => (typeof d?.hotCues?.[i] === 'number' ? d.hotCues[i] : null));
    out.savedLoops = Array.isArray(d?.savedLoops) ? d.savedLoops : [];
    return out;
  };
  const chan = (c: Partial<ChannelSettings> | undefined) => ({ ...defaultChannel(), ...(c ?? {}), eq: { ...defaultChannel().eq, ...(c?.eq ?? {}) } });
  const fx = (f: Partial<FxSettings> | undefined) => {
    const d = defaultFx();
    const out = { ...d } as FxSettings;
    for (const k of Object.keys(d) as (keyof FxSettings)[]) (out as unknown as Record<string, unknown>)[k] = { ...d[k], ...((f?.[k] as object) ?? {}) };
    return out;
  };
  const beats = { ...base.beats, ...(r.beats ?? {}) };
  if (!Array.isArray(beats.patterns) || beats.patterns.length === 0) beats.patterns = base.beats.patterns;
  if (!beats.patterns.some((p) => p.id === beats.activePatternId)) beats.activePatternId = beats.patterns[0].id;
  const pads = { ...base.pads, ...(r.pads ?? {}) };
  pads.assignments = Array.from({ length: 16 }, (_, i) => pads.assignments?.[i] ?? null);
  pads.volumes = Array.from({ length: 16 }, (_, i) => pads.volumes?.[i] ?? 0.85);
  const timeline = r.timeline && Array.isArray(r.timeline.arrangements) && r.timeline.arrangements.length ? r.timeline : base.timeline;
  if (!timeline.arrangements.some((a) => a.id === timeline.activeId)) timeline.activeId = timeline.arrangements[0].id;
  return {
    ...base,
    ...r,
    schema: 1,
    decks: { A: deck(r.decks?.A), B: deck(r.decks?.B) },
    mixer: { ...base.mixer, ...(r.mixer ?? {}), channels: { A: chan(r.mixer?.channels?.A), B: chan(r.mixer?.channels?.B) } },
    fx: { A: fx(r.fx?.A), B: fx(r.fx?.B) },
    beats,
    pads,
    build: r.build && Array.isArray(r.build.events) ? { ...base.build, ...r.build } : base.build,
    timeline,
  } as Project;
}
