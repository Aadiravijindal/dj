/**
 * Maps validated assistant actions onto real studio controls. Nothing here
 * runs unless the user presses Preview or Apply on a suggestion.
 */
import type { AssistantAction } from '../../shared/assistantSchema';
import { validateAction } from '../../shared/assistantSchema';
import { useApp, type StudioPanel } from '../state/store';
import { engine } from '../audio/engine';
import { soundById } from '../audio/soundLibrary';
import { BUILD_TEMPLATES, parseSteps, uid } from '../project/defaults';
import type { DeckId, FxName, LoopRegion, Pattern, Project } from '../project/types';
import { syncDeck } from '../state/deckActions';
import { triggerSound } from '../features/beats/Pads';

export interface Snapshot {
  project: Pick<Project, 'mixer' | 'fx' | 'beats' | 'build'> & { tempos: Record<DeckId, number>; keys: Record<DeckId, { lock: boolean; shift: number }>; hotCues: Record<DeckId, (number | null)[]> };
  loops: Record<DeckId, { loop: LoopRegion | null; active: boolean }>;
  seqRunning: boolean;
}

function take(): Snapshot {
  const p = useApp.getState().project;
  return {
    project: {
      mixer: p.mixer,
      fx: p.fx,
      beats: p.beats,
      build: p.build,
      tempos: { A: p.decks.A.tempo, B: p.decks.B.tempo },
      keys: { A: { lock: p.decks.A.keyLock, shift: p.decks.A.keyShift }, B: { lock: p.decks.B.keyLock, shift: p.decks.B.keyShift } },
      hotCues: { A: [...p.decks.A.hotCues], B: [...p.decks.B.hotCues] },
    },
    loops: {
      A: { loop: engine.ctx ? engine.decks.A.loop : null, active: engine.ctx ? engine.decks.A.loopActive : false },
      B: { loop: engine.ctx ? engine.decks.B.loop : null, active: engine.ctx ? engine.decks.B.loopActive : false },
    },
    seqRunning: !!engine.ctx && engine.sequencer.running,
  };
}

/** Undo everything a suggestion changed. */
export function restore(s: Snapshot) {
  useApp.getState().mutate((p) => {
    p.mixer = s.project.mixer;
    p.fx = s.project.fx;
    p.beats = s.project.beats;
    p.build = s.project.build;
    for (const d of ['A', 'B'] as DeckId[]) {
      p.decks[d].tempo = s.project.tempos[d];
      p.decks[d].keyLock = s.project.keys[d].lock;
      p.decks[d].keyShift = s.project.keys[d].shift;
      p.decks[d].hotCues = s.project.hotCues[d];
    }
  });
  if (engine.ctx) {
    for (const d of ['A', 'B'] as DeckId[]) {
      const deck = engine.decks[d];
      if (deck.status === 'ready') deck.setLoop(s.loops[d].loop, s.loops[d].active);
    }
    if (!s.seqRunning && engine.sequencer.running) engine.sequencer.stop();
  }
}

export function describe(a: AssistantAction): string {
  const deck = a.deck ? `Deck ${a.deck}` : '';
  switch (a.type) {
    case 'set_eq':
      return `${deck} ${a.band} EQ → ${a.value! > 0 ? '+' : ''}${a.value} dB`;
    case 'set_volume':
      return `${deck} fader → ${Math.round(a.value! * 100)}%`;
    case 'set_crossfader':
      return `Crossfader → ${a.value! < -0.9 ? 'A' : a.value! > 0.9 ? 'B' : a.value === 0 ? 'centre' : a.value!.toFixed(2)}`;
    case 'set_tempo':
      return `${deck} tempo → ${a.value! > 0 ? '+' : ''}${a.value}%`;
    case 'sync_tempo':
      return `${deck}: sync tempo & beats to the other deck`;
    case 'set_key_lock':
      return `${deck} key lock ${a.enabled ? 'on' : 'off'}`;
    case 'set_key_shift':
      return `${deck} key shift → ${a.value! > 0 ? '+' : ''}${a.value} semitones`;
    case 'set_fx': {
      const p = a.params ?? {};
      const parts = Object.entries(p).map(([k, v]) => `${k} ${typeof v === 'number' ? (Math.abs(v) <= 1 && k !== 'time' && k !== 'decay' && k !== 'rate' ? `${Math.round(v * 100)}%` : v) : v}`);
      return `${deck} ${a.effect} ${a.enabled === false ? 'off' : 'on'}${parts.length ? ` (${parts.join(', ')})` : ''}`;
    }
    case 'set_loop':
      return `${deck}: ${a.beats}-beat loop`;
    case 'clear_loop':
      return `${deck}: exit loop`;
    case 'set_hot_cue':
      return `${deck}: hot cue ${a.slot} at ${a.seconds?.toFixed(1)}s`;
    case 'set_beat_pattern':
      return `New beat pattern “${a.pattern_name ?? 'Assistant pattern'}” (${a.pattern?.length} rows), playing`;
    case 'trigger_sample':
      return `Play sound: ${soundById(a.sound!)?.name ?? a.sound}`;
    case 'load_build_template':
      return `Load build-up template: ${BUILD_TEMPLATES[a.template!]?.name}`;
    case 'open_panel':
      return `Open the ${a.panel === 'build' ? 'Build & Drop' : a.panel} panel`;
  }
}

/** Apply actions. Returns a snapshot so the change can be undone, plus any notes. */
export function applyActions(actions: AssistantAction[], opts: { preview?: boolean } = {}): { snapshot: Snapshot; notes: string[] } {
  const snapshot = take();
  const notes: string[] = [];
  const st = useApp.getState();
  const mutate = st.mutate;
  for (const raw of actions) {
    const a = validateAction(raw);
    if (!a) continue;
    const d = a.deck as DeckId | undefined;
    const deck = d && engine.ctx ? engine.decks[d] : null;
    switch (a.type) {
      case 'set_eq':
        mutate((p) => void (p.mixer.channels[d!].eq[a.band!] = a.value!));
        break;
      case 'set_volume':
        mutate((p) => void (p.mixer.channels[d!].volume = a.value!));
        break;
      case 'set_crossfader':
        mutate((p) => void (p.mixer.crossfader = a.value!));
        break;
      case 'set_tempo':
        mutate((p) => {
          const r = Math.abs(a.value!) > 8 ? 16 : p.decks[d!].tempoRange;
          p.decks[d!].tempoRange = r as 8 | 16 | 50;
          p.decks[d!].tempo = a.value!;
        });
        break;
      case 'set_key_lock':
        mutate((p) => void (p.decks[d!].keyLock = !!a.enabled));
        break;
      case 'set_key_shift':
        mutate((p) => void (p.decks[d!].keyShift = a.value!));
        break;
      case 'sync_tempo':
        if (!syncDeck(d!)) notes.push('Sync needs tracks with known tempo on both decks.');
        break;
      case 'set_fx':
        mutate((p) => {
          const fx = p.fx[d!][a.effect as FxName] as unknown as Record<string, number | boolean>;
          fx.enabled = a.enabled ?? true;
          for (const [k, v] of Object.entries(a.params ?? {})) if (k in fx && typeof v === 'number') fx[k] = v;
        });
        break;
      case 'set_loop':
        if (deck?.status === 'ready' && deck.bpm) deck.autoLoop(a.beats!);
        else notes.push(`Load a track with a known tempo on Deck ${d} to use loops.`);
        break;
      case 'clear_loop':
        if (deck?.loop) deck.setLoop(deck.loop, false);
        break;
      case 'set_hot_cue':
        mutate((p) => void (p.decks[d!].hotCues[a.slot! - 1] = a.seconds!));
        break;
      case 'set_beat_pattern': {
        const pattern: Pattern = {
          id: uid('p'),
          name: (a.pattern_name ?? 'Assistant pattern').slice(0, 40),
          tracks: a
            .pattern!.filter((r) => soundById(r.sound) && !soundById(r.sound)!.loop)
            .map((r) => ({ id: uid('t'), soundId: r.sound, volume: 0.75, muted: false, steps: parseSteps(r.steps) })),
        };
        if (!pattern.tracks.length) {
          notes.push('The suggested pattern used sounds that are not in the library, so it was skipped.');
          break;
        }
        mutate((p) => {
          p.beats.patterns.push(pattern);
          p.beats.activePatternId = pattern.id;
          if (a.pattern_bpm) p.beats.bpm = Math.round(a.pattern_bpm);
          const playing = (['A', 'B'] as DeckId[]).find((x) => engine.ctx && engine.decks[x].playing);
          if (playing) p.beats.follow = playing;
        });
        if (engine.ctx && !engine.sequencer.running) {
          engine.applyBeats(useApp.getState().project.beats);
          engine.sequencer.start();
        }
        break;
      }
      case 'trigger_sample':
        if (!triggerSound(a.sound!, 0.85, true)) notes.push(`Sound “${a.sound}” isn't in the library.`);
        break;
      case 'load_build_template': {
        const t = BUILD_TEMPLATES[a.template!];
        if (t) mutate((p) => void (p.build = { ...t.make(), deck: (d ?? p.build.deck) as DeckId }));
        break;
      }
      case 'open_panel':
        if (!opts.preview) {
          if (a.panel === 'learn') st.go('learn');
          else {
            st.setPanel(a.panel as StudioPanel);
            if (st.route !== 'studio') st.go('studio');
          }
        }
        break;
    }
  }
  return { snapshot, notes };
}

export function canPreview(actions: AssistantAction[]) {
  const audible = actions.some((a) => a.type !== 'open_panel' && a.type !== 'load_build_template');
  const playing = !!engine.ctx && (engine.decks.A.playing || engine.decks.B.playing);
  return { audible, playing };
}
