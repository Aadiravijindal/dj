/**
 * DJ controller support over Web MIDI.
 *
 * Any class-compliant MIDI controller works: the user maps hardware controls
 * to MIXPLAY actions with MIDI learn (press "Learn", then move the control).
 * Buttons trigger on press (note-on or CC ≥ 64), faders/knobs map their
 * 0–127 range, and jog wheels use the common relative encoding
 * (1–63 = clockwise, 65–127 = counter-clockwise).
 */
import { engine } from '../audio/engine';
import { useApp, toast } from '../state/store';
import { hotCuePress, syncDeck, toggleLoop } from '../state/deckActions';
import { SECONDS_PER_REV } from '../audio/deck';
import type { DeckId } from '../project/types';

export type ControlKind = 'button' | 'absolute' | 'jog';

export interface MidiAction {
  id: string;
  label: string;
  group: string;
  kind: ControlKind;
  /** absolute controls receive 0..1; buttons receive pressed=true/false; jogs receive signed ticks */
  run: (v: number, pressed: boolean) => void;
}

const mutate = (fn: Parameters<ReturnType<typeof useApp.getState>['mutate']>[0]) => useApp.getState().mutate(fn);
const deck = (id: DeckId) => (engine.ctx ? engine.decks[id] : null);

function deckActions(id: DeckId): MidiAction[] {
  const g = `Deck ${id}`;
  return [
    { id: `${id}.play`, label: 'Play / pause', group: g, kind: 'button', run: (_, p) => p && (engine.resume(), deck(id)?.toggle()) },
    { id: `${id}.cue`, label: 'Cue (hold)', group: g, kind: 'button', run: (_, p) => (p ? (engine.resume(), deck(id)?.cueDown()) : deck(id)?.cueUp()) },
    { id: `${id}.sync`, label: 'Sync', group: g, kind: 'button', run: (_, p) => p && syncDeck(id) },
    { id: `${id}.loop`, label: 'Loop on/off (4 beats)', group: g, kind: 'button', run: (_, p) => p && toggleLoop(id) },
    ...[0, 1, 2, 3].map((i) => ({ id: `${id}.hot${i + 1}`, label: `Hot cue ${i + 1}`, group: g, kind: 'button' as const, run: (_: number, p: boolean) => p && hotCuePress(id, i) })),
    {
      id: `${id}.tempo`,
      label: 'Tempo fader',
      group: g,
      kind: 'absolute',
      run: (v) =>
        mutate((p) => {
          const r = p.decks[id].tempoRange;
          p.decks[id].tempo = Math.round((v * 2 - 1) * r * 100) / 100;
        }),
    },
    {
      id: `${id}.jog`,
      label: 'Jog wheel',
      group: g,
      kind: 'jog',
      run: (ticks) => {
        const d = deck(id);
        if (!d || d.status !== 'ready') return;
        // 128 ticks per revolution is typical for DJ controllers
        const seconds = (ticks / 128) * SECONDS_PER_REV;
        if (d.scratching) d.scratchMove(seconds, 0.01);
        else if (d.playing) {
          d.nudge(Math.max(-0.08, Math.min(0.08, ticks * 0.01)));
          clearTimeout(jogTimers[id]);
          jogTimers[id] = setTimeout(() => d.nudge(0), 80);
        } else d.scrub(seconds);
      },
    },
    {
      id: `${id}.jogtouch`,
      label: 'Jog touch (scratch)',
      group: g,
      kind: 'button',
      run: (_, p) => (p ? deck(id)?.scratchStart() : deck(id)?.scratchEnd()),
    },
    { id: `${id}.volume`, label: 'Channel fader', group: g, kind: 'absolute', run: (v) => mutate((p) => void (p.mixer.channels[id].volume = v)) },
    ...(['high', 'mid', 'low'] as const).map((b) => ({
      id: `${id}.eq.${b}`,
      label: `EQ ${b}`,
      group: g,
      kind: 'absolute' as const,
      // centre detent maps to 0 dB; below centre down to −26 dB, above up to +6 dB
      run: (v: number) => mutate((p) => void (p.mixer.channels[id].eq[b] = v < 0.5 ? (0.5 - v) * -52 : (v - 0.5) * 12)),
    })),
    {
      id: `${id}.filter`,
      label: 'Filter',
      group: g,
      kind: 'absolute',
      run: (v) =>
        mutate((p) => {
          const amt = Math.abs(v - 0.5) < 0.02 ? 0 : v * 2 - 1;
          p.fx[id].filter.amount = amt;
          p.fx[id].filter.enabled = amt !== 0;
        }),
    },
  ];
}

const jogTimers: Record<DeckId, ReturnType<typeof setTimeout> | undefined> = { A: undefined, B: undefined };

export const MIDI_ACTIONS: MidiAction[] = [
  ...deckActions('A'),
  ...deckActions('B'),
  { id: 'mixer.crossfader', label: 'Crossfader', group: 'Mixer', kind: 'absolute', run: (v) => mutate((p) => void (p.mixer.crossfader = v * 2 - 1)) },
  { id: 'mixer.master', label: 'Master volume', group: 'Mixer', kind: 'absolute', run: (v) => mutate((p) => void (p.mixer.master = v)) },
  { id: 'beats.play', label: 'Sequencer play/stop', group: 'Beats', kind: 'button', run: (_, p) => p && engine.ctx && (engine.sequencer.running ? engine.sequencer.stop() : engine.sequencer.start()) },
];

export interface ParsedMidi {
  key: string;
  value: number;
  isNote: boolean;
}

/** Turn raw MIDI bytes into a stable key ("cc:1:7") and a 0–127 value. Returns null for messages we ignore. */
export function parseMidi(data: Uint8Array | number[]): ParsedMidi | null {
  if (data.length < 3) return null;
  const status = data[0] & 0xf0;
  const ch = (data[0] & 0x0f) + 1;
  if (status === 0xb0) return { key: `cc:${ch}:${data[1]}`, value: data[2], isNote: false };
  if (status === 0x90) return { key: `note:${ch}:${data[1]}`, value: data[2], isNote: true };
  if (status === 0x80) return { key: `note:${ch}:${data[1]}`, value: 0, isNote: true };
  return null;
}

/** Relative jog encoding → signed ticks. */
export const relTicks = (v: number) => (v === 64 ? 0 : v < 64 ? v : v - 128);

type Listener = () => void;

class MidiManager {
  private access: MIDIAccess | null = null;
  learning: string | null = null;
  lastMessage: string | null = null;
  inputs: { id: string; name: string }[] = [];
  error: string | null = null;
  private listeners = new Set<Listener>();
  private pressed = new Set<string>();

  get supported() {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }

  async enable(): Promise<boolean> {
    if (!this.supported) {
      this.error = 'This browser has no Web MIDI support. Use Chrome, Edge, Opera or Firefox.';
      this.emit();
      return false;
    }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (e) {
      this.error = `MIDI access was not granted: ${(e as Error).message}`;
      this.emit();
      return false;
    }
    this.error = null;
    this.access.onstatechange = () => this.refresh();
    this.refresh();
    return true;
  }

  disable() {
    this.access?.inputs.forEach((i) => (i.onmidimessage = null));
    this.access = null;
    this.inputs = [];
    this.emit();
  }

  private refresh() {
    if (!this.access) return;
    this.inputs = [];
    this.access.inputs.forEach((input) => {
      this.inputs.push({ id: input.id, name: input.name ?? 'MIDI device' });
      input.onmidimessage = (e) => e.data && this.handle(e.data);
    });
    this.emit();
  }

  startLearn(actionId: string | null) {
    this.learning = actionId;
    this.emit();
  }

  /** Process one MIDI message (exported for tests and virtual controllers). */
  handle(data: Uint8Array | number[]) {
    const m = parseMidi(data);
    if (!m) return;
    this.lastMessage = `${m.key} = ${m.value}`;
    if (this.learning) {
      const action = this.learning;
      // ignore note-offs while learning so the release doesn't overwrite the press
      if (m.isNote && m.value === 0) return;
      useApp.getState().updateSettings((s) => {
        for (const k of Object.keys(s.midiMap)) if (s.midiMap[k] === action) delete s.midiMap[k];
        s.midiMap[m.key] = action;
      });
      this.learning = null;
      toast('success', `Mapped ${m.key} → ${MIDI_ACTIONS.find((a) => a.id === action)?.label ?? action}.`);
      this.emit();
      return;
    }
    const actionId = useApp.getState().settings.midiMap[m.key];
    const action = MIDI_ACTIONS.find((a) => a.id === actionId);
    if (!action) {
      this.emit();
      return;
    }
    if (action.kind === 'absolute') action.run(m.value / 127, false);
    else if (action.kind === 'jog') action.run(relTicks(m.value), false);
    else {
      const down = m.value >= 64 || (m.isNote && m.value > 0);
      const was = this.pressed.has(m.key);
      if (down && !was) {
        this.pressed.add(m.key);
        action.run(1, true);
      } else if (!down && was) {
        this.pressed.delete(m.key);
        action.run(0, false);
      }
    }
  }
}

export const midi = new MidiManager();

if (typeof window !== 'undefined') {
  (window as unknown as { __mixplayMidi?: MidiManager }).__mixplayMidi = midi;
}
