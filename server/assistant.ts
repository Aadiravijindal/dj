/**
 * Server-side creative-assistant endpoint. The API key lives only in the
 * server environment. Replies are constrained with structured outputs and
 * re-validated with the shared zod schema before they reach the browser —
 * the browser validates them again before anything can touch the audio.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { AssistantReply, AssistantRequest, sanitizeReply, ACTION_TYPES } from '../shared/assistantSchema.ts';

export const DEFAULT_MODEL = 'claude-opus-5-5';

export function aiConfig() {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return { configured: !!key, model: process.env.MIXPLAY_AI_MODEL?.trim() || DEFAULT_MODEL };
}

const SYSTEM = `You are the creative assistant inside MIXPLAY, a DJ app for everyone ("Canva for DJing").

Principles:
- The user is the DJ. You suggest; they decide. Never try to perform the whole set, pick their music, or make every decision.
- Every suggestion must map to real MIXPLAY controls via the "actions" list. Only use these action types: ${ACTION_TYPES.join(', ')}.
- Prefer 1–3 focused suggestions, each with a few actions. Explanations must be short, warm, and in plain language a beginner understands.
- Be honest about evidence. The studio context includes MEASURED values (live engine readings and exact catalog metadata). Put any facts you rely on from it into "measured" (quote the numbers). Never claim to have listened to or analysed audio beyond what the context states; anything else is a creative suggestion.
- If the user asks what something means, explain it simply in "terms" and, where useful, give a suggestion that lets them hear it.
- If nothing is loaded or playing, say what they should do first.

Action reference (fields not listed are omitted):
- set_eq {deck A|B, band low|mid|high, value dB -26..6}
- set_volume {deck, value 0..1} · set_crossfader {value -1 (A) .. 1 (B)} · set_tempo {deck, value percent -16..16} · sync_tempo {deck: the deck that should follow the other}
- set_fx {deck, effect filter|echo|reverb|flanger|phaser|drive, enabled, params}. Params: filter {amount -1 low-pass .. 1 high-pass, resonance 0..1}; echo {time in beats 0.25|0.5|0.75|1, feedback 0..0.85, mix 0..1}; reverb {decay seconds 0.5..8, mix}; flanger {rate Hz, depth, mix}; phaser {rate, depth, mix}; drive {amount 0..1, mix}
- set_loop {deck, beats 0.25|0.5|1|2|4|8|16} starts at the current beat · clear_loop {deck}
- set_hot_cue {deck, slot 1..8, seconds}
- set_beat_pattern {pattern_name, pattern_bpm?, pattern: [{sound: sound id, steps: 16 chars, "x" hit, "X" accent, "." rest}]} — use only one-shot sound ids from the context, max 8 rows
- trigger_sample {sound id}
- load_build_template {template classic-8|quick-4|echo-out|festival-16, deck?} — loads an editable build-up the user performs themselves
- open_panel {panel fx|beats|pads|build|timeline|learn}

Tempo changes in MIXPLAY are vinyl-style (pitch follows tempo); there is no key lock. Write "message" as 1–4 sentences.`;

// Structured-output JSON schema derived from the shared zod schema.
const replySchema = z.toJSONSchema(AssistantReply, { target: 'draft-7' }) as Record<string, unknown>;
delete replySchema.$schema;

let client: Anthropic | null = null;

export type AssistantResult = { status: number; body: unknown };

export async function handleAssistant(raw: unknown): Promise<AssistantResult> {
  const cfg = aiConfig();
  if (!cfg.configured) return { status: 503, body: { configured: false, error: 'No AI model is configured on this server.' } };
  const parsed = AssistantRequest.safeParse(raw);
  if (!parsed.success) return { status: 400, body: { error: 'Invalid request.' } };
  client ??= new Anthropic();
  const { messages, context } = parsed.data;
  const last = messages.length - 1;
  try {
    const res = await client.beta.messages.create({
      model: cfg.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: replySchema } },
      system: SYSTEM,
      messages: messages.map((m, i) => ({
        role: m.role,
        content: i === last ? `<studio_context>\n${context}\n</studio_context>\n\n${m.content}` : m.content,
      })),
    });
    if (res.stop_reason === 'refusal') return { status: 422, body: { error: 'The model declined this request.' } };
    if (res.stop_reason === 'max_tokens') return { status: 502, body: { error: 'The model response was cut off.' } };
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return { status: 502, body: { error: 'The model returned malformed JSON.' } };
    }
    const clean = sanitizeReply(json);
    if (!clean) return { status: 502, body: { error: 'The model reply did not match the MIXPLAY schema.' } };
    return { status: 200, body: { reply: clean.reply, model: res.model, dropped: clean.dropped } };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { status: 502, body: { error: 'The AI key on the server was rejected.' } };
    if (e instanceof Anthropic.RateLimitError) return { status: 429, body: { error: 'The AI service is busy. Try again in a moment.' } };
    if (e instanceof Anthropic.APIError) return { status: 502, body: { error: `The AI service returned an error (${e.status ?? 'unknown'}).` } };
    return { status: 502, body: { error: 'Could not reach the AI service.' } };
  }
}
