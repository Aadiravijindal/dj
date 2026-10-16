/**
 * The contract between the creative assistant (real model or demo) and the
 * studio. Every suggestion the assistant makes is validated against this
 * schema before it can be shown, previewed, or applied. Only the actions
 * listed here can ever touch the audio engine.
 */
import { z } from 'zod';

export const DECKS = ['A', 'B'] as const;
export const EQ_BANDS = ['low', 'mid', 'high'] as const;
export const FX_NAMES = ['filter', 'echo', 'reverb', 'flanger', 'phaser', 'drive'] as const;
export const PANELS = ['fx', 'beats', 'pads', 'build', 'timeline', 'learn'] as const;
export const BUILD_TEMPLATES = ['classic-8', 'quick-4', 'echo-out', 'festival-16'] as const;
export const ACTION_TYPES = [
  'set_eq',
  'set_volume',
  'set_crossfader',
  'set_tempo',
  'sync_tempo',
  'set_key_lock',
  'set_key_shift',
  'set_fx',
  'set_loop',
  'clear_loop',
  'set_hot_cue',
  'set_beat_pattern',
  'trigger_sample',
  'load_build_template',
  'open_panel',
] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

const FxParams = z
  .object({
    /** filter: -1 (low-pass, darker) .. 0 (open) .. 1 (high-pass, thinner) */
    amount: z.number().optional(),
    resonance: z.number().optional(),
    /** echo: delay time in beats, e.g. 0.25, 0.5, 0.75, 1 */
    time: z.number().optional(),
    feedback: z.number().optional(),
    /** wet amount 0..1 */
    mix: z.number().optional(),
    /** reverb decay seconds 0.5..8 */
    decay: z.number().optional(),
    /** flanger/phaser rate Hz */
    rate: z.number().optional(),
    depth: z.number().optional(),
  })
  .strict();

const PatternRow = z.object({ sound: z.string(), steps: z.string() }).strict();

/**
 * A single, flat action shape keeps the JSON schema simple for the model.
 * Per-type requirements are enforced afterwards by `validateAction`.
 */
export const AssistantAction = z
  .object({
    type: z.enum(ACTION_TYPES),
    deck: z.enum(DECKS).optional(),
    band: z.enum(EQ_BANDS).optional(),
    /** dB for EQ, 0..1 for volume, -1..1 for crossfader, percent for tempo */
    value: z.number().optional(),
    effect: z.enum(FX_NAMES).optional(),
    enabled: z.boolean().optional(),
    params: FxParams.optional(),
    beats: z.number().optional(),
    slot: z.number().optional(),
    seconds: z.number().optional(),
    sound: z.string().optional(),
    pattern_name: z.string().optional(),
    pattern_bpm: z.number().optional(),
    pattern: z.array(PatternRow).optional(),
    template: z.enum(BUILD_TEMPLATES).optional(),
    panel: z.enum(PANELS).optional(),
  })
  .strict();
export type AssistantAction = z.infer<typeof AssistantAction>;

export const Suggestion = z
  .object({
    title: z.string(),
    outcome: z.string(),
    target: z.enum(['A', 'B', 'master', 'beats']),
    explanation: z.string(),
    timing: z.string().optional(),
    actions: z.array(AssistantAction),
  })
  .strict();
export type Suggestion = z.infer<typeof Suggestion>;

export const AssistantReply = z
  .object({
    message: z.string(),
    terms: z.array(z.object({ term: z.string(), plain: z.string() }).strict()).optional(),
    measured: z.array(z.string()).optional(),
    suggestions: z.array(Suggestion),
  })
  .strict();
export type AssistantReply = z.infer<typeof AssistantReply>;

export const ChatTurn = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(4000),
});
export type ChatTurn = z.infer<typeof ChatTurn>;

export const AssistantRequest = z.object({
  messages: z.array(ChatTurn).min(1).max(30),
  context: z.string().max(12000),
});
export type AssistantRequest = z.infer<typeof AssistantRequest>;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Checks per-type requirements and clamps values into safe ranges.
 * Returns null for actions that cannot be applied safely.
 */
export function validateAction(a: AssistantAction): AssistantAction | null {
  const needDeck = () => (a.deck ? a.deck : null);
  switch (a.type) {
    case 'set_eq':
      if (!needDeck() || !a.band || a.value === undefined) return null;
      return { ...a, value: clamp(a.value, -26, 6) };
    case 'set_volume':
      if (!needDeck() || a.value === undefined) return null;
      return { ...a, value: clamp(a.value, 0, 1) };
    case 'set_crossfader':
      if (a.value === undefined) return null;
      return { ...a, value: clamp(a.value, -1, 1) };
    case 'set_tempo':
      if (!needDeck() || a.value === undefined) return null;
      return { ...a, value: clamp(a.value, -16, 16) };
    case 'sync_tempo':
    case 'clear_loop':
      return needDeck() ? a : null;
    case 'set_key_lock':
      if (!needDeck() || a.enabled === undefined) return null;
      return a;
    case 'set_key_shift':
      if (!needDeck() || a.value === undefined) return null;
      return { ...a, value: clamp(Math.round(a.value), -6, 6) };
    case 'set_fx': {
      if (!needDeck() || !a.effect) return null;
      const p = { ...(a.params ?? {}) };
      if (p.amount !== undefined) p.amount = clamp(p.amount, -1, 1);
      if (p.resonance !== undefined) p.resonance = clamp(p.resonance, 0, 1);
      if (p.time !== undefined) p.time = clamp(p.time, 0.125, 2);
      if (p.feedback !== undefined) p.feedback = clamp(p.feedback, 0, 0.85);
      if (p.mix !== undefined) p.mix = clamp(p.mix, 0, 1);
      if (p.decay !== undefined) p.decay = clamp(p.decay, 0.5, 8);
      if (p.rate !== undefined) p.rate = clamp(p.rate, 0.05, 8);
      if (p.depth !== undefined) p.depth = clamp(p.depth, 0, 1);
      return { ...a, params: p, enabled: a.enabled ?? true };
    }
    case 'set_loop': {
      if (!needDeck() || a.beats === undefined) return null;
      const allowed = [0.25, 0.5, 1, 2, 4, 8, 16];
      const beats = allowed.reduce((best, b) => (Math.abs(b - a.beats!) < Math.abs(best - a.beats!) ? b : best), 4);
      return { ...a, beats };
    }
    case 'set_hot_cue':
      if (!needDeck() || a.slot === undefined || a.seconds === undefined) return null;
      return { ...a, slot: clamp(Math.round(a.slot), 1, 8), seconds: Math.max(0, a.seconds) };
    case 'set_beat_pattern':
      if (!a.pattern || a.pattern.length === 0) return null;
      return {
        ...a,
        pattern: a.pattern.slice(0, 8).map((r) => ({ sound: r.sound, steps: r.steps.replace(/[^xX.\-o0-9]/g, '').slice(0, 16) })),
        pattern_bpm: a.pattern_bpm !== undefined ? clamp(a.pattern_bpm, 60, 180) : undefined,
      };
    case 'trigger_sample':
      return a.sound ? a : null;
    case 'load_build_template':
      return a.template ? a : null;
    case 'open_panel':
      return a.panel ? a : null;
    default:
      return null;
  }
}

/** Parse + validate an untrusted reply. Invalid actions are dropped, never applied. */
export function sanitizeReply(raw: unknown): { reply: AssistantReply; dropped: number } | null {
  const parsed = AssistantReply.safeParse(raw);
  if (!parsed.success) return null;
  let dropped = 0;
  const suggestions = parsed.data.suggestions.slice(0, 3).map((s) => {
    const actions: AssistantAction[] = [];
    for (const a of s.actions.slice(0, 12)) {
      const v = validateAction(a);
      if (v) actions.push(v);
      else dropped++;
    }
    return { ...s, actions };
  });
  return { reply: { ...parsed.data, suggestions }, dropped };
}
