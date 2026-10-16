import { describe, expect, it } from 'vitest';
import { sanitizeReply, validateAction, AssistantReply } from '../../shared/assistantSchema';
import { demoReply } from '../../src/ai/demoAssistant';
import type { StudioSnap, DeckSnap } from '../../src/ai/context';

const deck = (id: 'A' | 'B', o: Partial<DeckSnap> = {}): DeckSnap => ({
  id,
  loaded: true,
  title: id === 'A' ? 'Neon Tide' : 'Glass Elevator',
  artist: 'x',
  genre: 'House',
  playing: true,
  position: 30,
  duration: 140,
  bpm: 124,
  bpmSource: 'composed',
  effectiveBpm: 124,
  tempo: 0,
  key: 'A minor · 8A',
  section: 'Groove',
  loop: null,
  volume: 0.85,
  eq: { low: 0, mid: 0, high: 0 },
  activeFx: [],
  level: 0.5,
  ...o,
});

const snap = (o: Partial<StudioSnap> = {}): StudioSnap => ({
  mode: 'play',
  decks: { A: deck('A'), B: deck('B') },
  crossfader: 0,
  master: 0.9,
  clipping: false,
  clipCount: 0,
  limiterReduction: 0,
  sequencer: { running: false, pattern: 'Four on the floor', follow: 'A', bpm: 124 },
  audioRunning: true,
  ...o,
});

describe('action validation', () => {
  it('clamps values into safe ranges', () => {
    expect(validateAction({ type: 'set_eq', deck: 'A', band: 'low', value: 40 })?.value).toBe(6);
    expect(validateAction({ type: 'set_fx', deck: 'B', effect: 'echo', params: { feedback: 3, mix: -1 } })?.params).toEqual({ feedback: 0.85, mix: 0 });
    expect(validateAction({ type: 'set_loop', deck: 'A', beats: 1.8 })?.beats).toBe(2);
    expect(validateAction({ type: 'set_tempo', deck: 'A', value: 99 })?.value).toBe(16);
  });
  it('rejects actions missing required fields', () => {
    expect(validateAction({ type: 'set_eq', deck: 'A', value: 2 })).toBeNull();
    expect(validateAction({ type: 'set_volume', value: 0.5 })).toBeNull();
    expect(validateAction({ type: 'trigger_sample' })).toBeNull();
  });
  it('sanitizes a reply: unknown keys fail, bad actions are dropped', () => {
    expect(sanitizeReply({ message: 'hi', suggestions: [], extra: 1 })).toBeNull();
    const r = sanitizeReply({
      message: 'ok',
      suggestions: [{ title: 't', outcome: 'o', target: 'A', explanation: 'e', actions: [{ type: 'set_volume', deck: 'A', value: 0.5 }, { type: 'set_eq', deck: 'A' }] }],
    });
    expect(r?.reply.suggestions[0].actions).toHaveLength(1);
    expect(r?.dropped).toBe(1);
  });
});

describe('demo assistant', () => {
  const prompts = [
    'Help me create a dramatic build-up before the next track.',
    'Suggest a rhythm that would work with this song.',
    'How could I make this part sound more energetic?',
    'Help me experiment with a vocal loop.',
    'Show me how to create an echo effect.',
    'Help me fix this transition.',
    'I want a darker, deeper sound here.',
    'I want to create a festival-style drop.',
    'What does a low-pass filter do?',
    'how do I scratch?',
    'blah',
  ];
  it.each(prompts)('returns a schema-valid reply for “%s”', (p) => {
    const r = demoReply(p, snap());
    expect(AssistantReply.safeParse(r).success).toBe(true);
    const clean = sanitizeReply(r)!;
    expect(clean.dropped).toBe(0);
  });
  it('build-up requests map to real controls', () => {
    const r = demoReply('Help me create a dramatic build-up', snap());
    const types = r.suggestions.flatMap((s) => s.actions.map((a) => a.type));
    expect(types).toContain('load_build_template');
    expect(types).toContain('set_fx');
  });
  it('troubleshooting reports measured tempo mismatch and suggests sync', () => {
    const r = demoReply('my transition sounds messy', snap({ decks: { A: deck('A'), B: deck('B', { bpm: 126, effectiveBpm: 126 }) } }));
    expect(r.measured?.some((m) => m.includes('126.00 BPM'))).toBe(true);
    expect(r.suggestions.some((s) => s.actions.some((a) => a.type === 'sync_tempo' && a.deck === 'B'))).toBe(true);
  });
  it('does not invent problems when the mix measures clean', () => {
    const r = demoReply('fix my mix', snap({ crossfader: -1 }));
    expect(r.suggestions).toHaveLength(0);
  });
  it('flags clipping only when it was measured', () => {
    expect(demoReply('it sounds distorted', snap({ clipCount: 0 })).measured?.some((m) => m.includes('0 dB'))).toBeFalsy();
    expect(demoReply('it sounds distorted', snap({ clipCount: 3, clipping: true })).measured?.some((m) => m.includes('0 dB'))).toBe(true);
  });
});
