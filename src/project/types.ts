/**
 * The shared project model. The live DJ Studio, the Beat Playground, the
 * Build & Drop workspace and the Mix Timeline all read and write this one
 * structure, and it is what gets persisted. It stores *references* to
 * authorised tracks plus creative settings — never audio.
 */

export type DeckId = 'A' | 'B';
export const DECK_IDS: DeckId[] = ['A', 'B'];

export interface LoopRegion {
  start: number;
  end: number;
  beats: number | null;
}

export interface SavedLoop extends LoopRegion {
  id: string;
  label: string;
}

export interface DeckSettings {
  trackId: string | null;
  /** tempo change in percent */
  tempo: number;
  /** key lock: keep the original pitch when the tempo changes */
  keyLock: boolean;
  /** transpose in semitones (-6..6), independent of tempo */
  keyShift: number;
  tempoRange: 8 | 16 | 50;
  /** main cue point (seconds) */
  cue: number;
  hotCues: (number | null)[];
  loop: LoopRegion | null;
  loopActive: boolean;
  savedLoops: SavedLoop[];
  /** last known playhead, restored when a project re-opens */
  position: number;
  quantize: boolean;
}

export interface ChannelSettings {
  /** trim in dB */
  gain: number;
  /** channel fader 0..1 */
  volume: number;
  eq: { low: number; mid: number; high: number };
  mute: boolean;
  cue: boolean;
}

export interface MixerSettings {
  /** -1 = full A, 1 = full B */
  crossfader: number;
  curve: 'smooth' | 'sharp';
  master: number;
  cueMix: number;
  channels: Record<DeckId, ChannelSettings>;
}

export interface FxSettings {
  filter: { enabled: boolean; amount: number; resonance: number };
  echo: { enabled: boolean; time: number; feedback: number; mix: number };
  reverb: { enabled: boolean; decay: number; mix: number };
  flanger: { enabled: boolean; rate: number; depth: number; feedback: number; mix: number };
  phaser: { enabled: boolean; rate: number; depth: number; mix: number };
  drive: { enabled: boolean; amount: number; mix: number };
}

export type FxName = keyof FxSettings;

export interface PatternTrack {
  id: string;
  soundId: string;
  volume: number;
  muted: boolean;
  /** 0 = off, 1 = normal, 2 = accent */
  steps: number[];
}

export interface Pattern {
  id: string;
  name: string;
  tracks: PatternTrack[];
}

export interface BeatSettings {
  bpm: number;
  /** follow a deck's live tempo and beat phase */
  follow: DeckId | null;
  swing: number;
  volume: number;
  patterns: Pattern[];
  activePatternId: string;
}

export interface PadSettings {
  assignments: (string | null)[];
  volumes: number[];
  favorites: string[];
  quantize: boolean;
  volume: number;
}

export type BuildLane = 'roll' | 'riser' | 'filter' | 'echo' | 'loop' | 'perc' | 'silence' | 'impact' | 'bass';

export interface BuildEvent {
  id: string;
  lane: BuildLane;
  /** start position in beats from the start of the build */
  start: number;
  /** length in beats (0 for one-shots at the drop) */
  length: number;
  /** 0..1 */
  intensity: number;
}

export interface BuildSettings {
  bars: 4 | 8 | 16;
  deck: DeckId;
  events: BuildEvent[];
  templateName: string | null;
}

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
}

export type TransitionKind = 'blend' | 'cut' | 'echo-out' | 'filter-fade' | 'build-drop';

export interface TimelineItem {
  id: string;
  trackId: string;
  /** section of the track you plan to play */
  start: number;
  end: number | null;
  transition: TransitionKind;
  note: string;
  markers: TimelineMarker[];
}

export interface Arrangement {
  id: string;
  name: string;
  items: TimelineItem[];
  notes: string;
}

export interface TimelineSettings {
  arrangements: Arrangement[];
  activeId: string;
}

export interface Project {
  schema: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  openedAt: number;
  favorite: boolean;
  /** true for built-in sample projects that are copied on open */
  sample?: boolean;
  description?: string;
  decks: Record<DeckId, DeckSettings>;
  mixer: MixerSettings;
  fx: Record<DeckId, FxSettings>;
  beats: BeatSettings;
  pads: PadSettings;
  build: BuildSettings;
  timeline: TimelineSettings;
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  openedAt: number;
  favorite: boolean;
  trackIds: string[];
}
