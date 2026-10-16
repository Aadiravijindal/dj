/**
 * Interactive lessons. Every step is verified against the real engine/project
 * state, so "done" means the user actually did it.
 */
import { engine } from '../../audio/engine';
import { useApp, type StudioPanel } from '../../state/store';
import { manualSaves, openSample } from '../../state/actions';
import { buildStats } from '../../audio/performance';
import type { DeckId } from '../../project/types';

export interface Baseline {
  recentSounds: string;
  scratchA: number;
  scratchB: number;
  saves: number;
  cueA: number;
  built: number;
  dropped: number;
  hotA: (number | null)[];
}

export interface Step {
  text: string;
  hint?: string;
  check: (b: Baseline) => boolean;
}

export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  summary: string;
  panel?: StudioPanel;
  /** sample mix to open if the decks are empty (or always, for beatmatching) */
  sample?: string;
  forceSample?: boolean;
  steps: Step[];
}

const d = (id: DeckId) => (engine.ctx ? engine.decks[id] : null);
const p = () => useApp.getState().project;
const ready = (id: DeckId) => d(id)?.status === 'ready';
const playing = (id: DeckId) => !!d(id)?.playing;

export function baseline(): Baseline {
  const s = useApp.getState();
  return {
    recentSounds: s.settings.recentSounds.join(','),
    scratchA: d('A')?.scratchCount ?? 0,
    scratchB: d('B')?.scratchCount ?? 0,
    saves: manualSaves,
    cueA: s.project.decks.A.cue,
    built: buildStats.performed,
    dropped: buildStats.dropped,
    hotA: [...s.project.decks.A.hotCues],
  };
}

const anyFx = () => (['A', 'B'] as DeckId[]).some((id) => Object.values(p().fx[id]).some((f) => f.enabled));
const padHit = (b: Baseline) => useApp.getState().settings.recentSounds.join(',') !== b.recentSounds;

export const LESSONS: Lesson[] = [
  {
    id: 'first-mix',
    title: 'Your first mix',
    minutes: 3,
    summary: 'Play a track, bring in a second one, blend with the crossfader, add a little flavour and save.',
    sample: 'sunset-house',
    steps: [
      { text: 'Get two tracks onto the decks.', hint: 'The sample mix loads them for you — or use “Load track” on each deck.', check: () => ready('A') && ready('B') },
      { text: 'Press play on Deck A.', hint: 'The big orange play button (or press F).', check: () => playing('A') },
      { text: 'Start Deck B too.', hint: 'Both tracks are 124 BPM. Press play on Deck B on a kick drum (or press J).', check: () => playing('B') },
      { text: 'Slide the crossfader toward B.', hint: 'The horizontal slider in the mixer. Middle = both decks, right = Deck B.', check: () => p().mixer.crossfader > -0.2 },
      { text: 'Try an effect or a pad.', hint: 'Effects tab → “Build tension”, or tap a pad in the Pads tab.', check: (b) => anyFx() || padHit(b) },
      { text: 'Save your mix.', hint: 'Press Save at the top of the studio (or Ctrl/⌘ + S).', check: (b) => manualSaves > b.saves },
    ],
  },
  {
    id: 'loading',
    title: 'Loading tracks',
    minutes: 1,
    summary: 'Pick music from the library and send it to a deck.',
    steps: [
      { text: 'Load any track onto Deck A.', hint: 'Press “Load track” on Deck A, then choose “Deck A” next to a song.', check: () => ready('A') },
      { text: 'Load a different track onto Deck B.', check: () => ready('B') && d('B')?.meta?.id !== d('A')?.meta?.id },
    ],
  },
  {
    id: 'two-songs',
    title: 'Playing two songs',
    minutes: 1,
    summary: 'DJing is mostly about two tracks overlapping. Start both.',
    sample: 'sunset-house',
    steps: [
      { text: 'Play Deck A.', check: () => playing('A') },
      { text: 'Play Deck B while A keeps going.', hint: 'Try to press it right on a beat.', check: () => playing('A') && playing('B') },
    ],
  },
  {
    id: 'crossfader',
    title: 'The crossfader',
    minutes: 1,
    summary: 'One slider decides how much of each deck you hear.',
    sample: 'sunset-house',
    steps: [
      { text: 'Play both decks.', check: () => playing('A') && playing('B') },
      { text: 'Move the crossfader all the way left — only Deck A.', check: () => p().mixer.crossfader < -0.9 },
      { text: 'Now all the way right — only Deck B.', check: () => p().mixer.crossfader > 0.9 },
      { text: 'Settle it in the middle to hear both.', hint: 'Double-click the crossfader to centre it.', check: () => Math.abs(p().mixer.crossfader) < 0.15 },
    ],
  },
  {
    id: 'volume',
    title: 'Balancing volume',
    minutes: 1,
    summary: 'Channel faders set each deck’s loudness; watch the meters.',
    sample: 'sunset-house',
    steps: [
      { text: 'Play both decks with the crossfader in the middle.', check: () => playing('A') && playing('B') && Math.abs(p().mixer.crossfader) < 0.3 },
      { text: 'Pull Deck B’s channel fader down below half.', check: () => p().mixer.channels.B.volume < 0.5 },
      { text: 'Bring it back up until both meters look similar.', check: () => Math.abs(p().mixer.channels.B.volume - p().mixer.channels.A.volume) < 0.1 },
    ],
  },
  {
    id: 'eq',
    title: 'Using EQ',
    minutes: 2,
    summary: 'High, Mid and Low knobs shape each track. The classic trick: swap the bass.',
    sample: 'sunset-house',
    steps: [
      { text: 'Play both decks.', check: () => playing('A') && playing('B') },
      { text: 'Turn Deck B’s Low knob right down.', hint: 'Drag the knob downward. Hear the kick and bass disappear?', check: () => p().mixer.channels.B.eq.low < -15 },
      { text: 'Now swap: turn Deck A’s Low down and Deck B’s Low back up.', check: () => p().mixer.channels.A.eq.low < -15 && p().mixer.channels.B.eq.low > -3 },
    ],
  },
  {
    id: 'tempo',
    title: 'Understanding tempo',
    minutes: 1,
    summary: 'BPM is the speed. The tempo slider changes it (and, like a record, the pitch).',
    sample: 'sunset-house',
    steps: [
      { text: 'Play Deck B.', check: () => playing('B') },
      { text: 'Move Deck B’s tempo slider up or down a few percent.', check: () => Math.abs(p().decks.B.tempo) > 2 },
      { text: 'Double-click the slider to reset it to 0%.', check: () => p().decks.B.tempo === 0 },
    ],
  },
  {
    id: 'beatmatching',
    title: 'Beatmatching',
    minutes: 3,
    summary: 'Make two tracks with different BPMs play in time. Tempo first, then alignment.',
    sample: 'warehouse-techno',
    forceSample: true,
    steps: [
      { text: 'Play Deck A (126 BPM) and Deck B (128 BPM).', hint: 'Hear the kicks drift apart? That’s the tempo difference.', check: () => playing('A') && playing('B') },
      {
        text: 'Match Deck B’s tempo to Deck A — by ear with the tempo slider, or press Sync.',
        hint: 'You need about −1.6% on Deck B.',
        check: () => {
          const a = d('A')?.effectiveBpm;
          const b = d('B')?.effectiveBpm;
          return !!a && !!b && Math.abs(a - b) / a < 0.002;
        },
      },
      {
        text: 'Line up the kicks: hold the nudge arrows (or spin the jog wheel) until they hit together.',
        hint: 'Sync does this for you when both decks are playing.',
        check: () => {
          const A = d('A');
          const B = d('B');
          if (!A || !B || !A.playing || !B.playing) return false;
          let diff = A.phaseAt(A.getPosition()) - B.phaseAt(B.getPosition());
          diff -= Math.round(diff);
          return Math.abs(diff) < 0.06;
        },
      },
    ],
  },
  {
    id: 'loops',
    title: 'Creating loops',
    minutes: 1,
    summary: 'Repeat a few beats to extend a moment or build tension.',
    sample: 'sunset-house',
    steps: [
      { text: 'Play Deck A.', check: () => playing('A') },
      { text: 'Press the “4” loop button.', check: () => !!d('A')?.loopActive && d('A')?.loop?.beats === 4 },
      { text: 'Tighten it to 1 beat.', check: () => !!d('A')?.loopActive && d('A')?.loop?.beats === 1 },
      { text: 'Exit the loop and let the track carry on.', check: () => !d('A')?.loopActive },
    ],
  },
  {
    id: 'cues',
    title: 'Using cue points',
    minutes: 2,
    summary: 'Bookmarks you can jump to instantly.',
    sample: 'sunset-house',
    steps: [
      { text: 'Play Deck A and tap hot cue 1 to bookmark a moment.', check: (b) => p().decks.A.hotCues[0] !== null && p().decks.A.hotCues[0] !== b.hotA[0] },
      { text: 'Set hot cue 2 a little later.', check: () => p().decks.A.hotCues[1] !== null },
      { text: 'Pause, move somewhere new, and press CUE to set the main cue point.', hint: 'While paused, CUE sets the cue point. While playing, it jumps back to it.', check: (b) => Math.abs(p().decks.A.cue - b.cueA) > 0.5 },
    ],
  },
  {
    id: 'samples',
    title: 'Triggering samples',
    minutes: 1,
    summary: 'Pads fire sounds on top of the music — quantised to the beat.',
    sample: 'sunset-house',
    panel: 'pads',
    steps: [
      { text: 'Play a deck.', check: () => playing('A') || playing('B') },
      { text: 'Tap any pad.', check: (b) => padHit(b) },
      { text: 'Start the step sequencer in the Beats tab.', hint: 'Open “Beats”, then press Play pattern.', check: () => !!engine.ctx && engine.sequencer.running },
    ],
  },
  {
    id: 'filters',
    title: 'Filters and echo',
    minutes: 2,
    summary: 'The two most-used DJ effects.',
    sample: 'sunset-house',
    panel: 'fx',
    steps: [
      { text: 'Play Deck A.', check: () => playing('A') },
      { text: 'Drag Deck A’s filter left — low-pass makes it muffled.', check: () => p().fx.A.filter.enabled && p().fx.A.filter.amount < -0.3 },
      { text: 'Now drag it right — high-pass makes it thin.', check: () => p().fx.A.filter.enabled && p().fx.A.filter.amount > 0.3 },
      { text: 'Turn on Echo.', check: () => p().fx.A.echo.enabled && p().fx.A.echo.mix > 0.05 },
    ],
  },
  {
    id: 'buildup',
    title: 'Creating a build-up',
    minutes: 3,
    summary: 'Design tension, then decide when the drop lands.',
    sample: 'sunset-house',
    panel: 'build',
    steps: [
      { text: 'Play Deck A.', check: () => playing('A') },
      { text: 'Press “Perform build-up” in the Build & Drop tab.', check: (b) => buildStats.performed > b.built },
      { text: 'Ride it to the drop (or hit “Drop now”).', check: (b) => buildStats.dropped > b.dropped },
    ],
  },
  {
    id: 'scratch',
    title: 'Practising scratches',
    minutes: 2,
    summary: 'Grab the record and move it back and forth in rhythm.',
    sample: 'sunset-house',
    steps: [
      { text: 'Play Deck A.', check: () => playing('A') },
      { text: 'Turn on “Scratch” under Deck A’s jog wheel and grab the platter.', hint: 'Drag back and forth in short strokes. You can also drag the zoomed waveform.', check: (b) => (d('A')?.scratchCount ?? 0) > b.scratchA + 1 },
      { text: 'Do a few more strokes in time with the beat.', check: (b) => (d('A')?.scratchCount ?? 0) > b.scratchA + 5 },
    ],
  },
];

export function startLesson(id: string) {
  const l = LESSONS.find((x) => x.id === id);
  if (!l) return;
  const s = useApp.getState();
  const empty = !s.project.decks.A.trackId && !s.project.decks.B.trackId;
  if (l.sample && (l.forceSample || empty)) openSample(l.sample);
  else s.go('studio');
  if (l.panel) s.setPanel(l.panel);
  s.setCoach(id);
}
