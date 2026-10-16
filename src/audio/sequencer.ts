/**
 * 16-step sequencer using the classic look-ahead pattern: a light timer wakes
 * every 25 ms and schedules any steps falling in the next 120 ms on the
 * AudioContext clock, so timing is sample-accurate regardless of React
 * renders or UI jank.
 */
import type { Sampler } from './sampler';
import type { Deck } from './deck';
import type { BeatSettings, Pattern } from '../project/types';

const LOOKAHEAD = 0.12;
const INTERVAL = 25;

export class Sequencer {
  readonly bus: GainNode;
  running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private gridTime = 0;
  private settings: BeatSettings | null = null;
  /** recently scheduled steps so the UI can light up the right column */
  private history: { step: number; time: number }[] = [];
  private listeners = new Set<() => void>();
  /** a one-off pattern override used for AI previews */
  private previewPattern: Pattern | null = null;

  constructor(private ctx: AudioContext, private sampler: Sampler, private deckFor: (id: 'A' | 'B') => Deck) {
    this.bus = ctx.createGain();
  }

  onChange(l: () => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  apply(s: BeatSettings) {
    this.settings = s;
    this.bus.gain.setTargetAtTime(s.volume, this.ctx.currentTime, 0.02);
  }

  setPreviewPattern(p: Pattern | null) {
    this.previewPattern = p;
  }

  private pattern(): Pattern | null {
    if (this.previewPattern) return this.previewPattern;
    const s = this.settings;
    if (!s) return null;
    return s.patterns.find((p) => p.id === s.activePatternId) ?? s.patterns[0] ?? null;
  }

  /** Current tempo: the followed deck's live BPM, or the pattern BPM. */
  bpm(): number {
    const s = this.settings;
    if (s?.follow) {
      const d = this.deckFor(s.follow);
      if (d.effectiveBpm && d.playing) return d.effectiveBpm;
    }
    return s?.bpm ?? 120;
  }

  start() {
    if (this.running || !this.settings) return;
    const now = this.ctx.currentTime;
    this.step = 0;
    this.gridTime = now + 0.06;
    const f = this.settings.follow ? this.deckFor(this.settings.follow) : null;
    const nb = f?.nextBeatTime(1);
    if (f && nb) {
      // lock step 0 to the deck's bar position
      const beatIdx = f.beatIndex() + 1;
      this.step = (((beatIdx % 4) + 4) % 4) * 4;
      this.gridTime = nb;
    }
    this.running = true;
    this.history = [];
    this.timer = setInterval(() => this.tick(), INTERVAL);
    this.tick();
    this.listeners.forEach((l) => l());
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
    this.history = [];
    this.listeners.forEach((l) => l());
  }

  private tick() {
    const s = this.settings;
    if (!s) return;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    let guard = 0;
    while (this.gridTime < horizon && guard++ < 32) {
      const stepDur = 60 / this.bpm() / 4;
      // gently re-lock to the followed deck on every beat (handles tempo
      // changes, seeks and loops without drifting)
      if (this.step % 4 === 0 && s.follow) {
        const d = this.deckFor(s.follow);
        const nb = d.nextBeatTime(1);
        if (nb !== null) {
          const prevBeat = nb - (60 / (d.effectiveBpm ?? 120));
          const candidate = Math.abs(prevBeat - this.gridTime) < Math.abs(nb - this.gridTime) ? prevBeat : nb;
          if (Math.abs(candidate - this.gridTime) < stepDur * 1.5 && candidate >= this.ctx.currentTime) this.gridTime = candidate;
        }
      }
      const swing = this.step % 2 === 1 ? s.swing * stepDur * 0.66 : 0;
      this.scheduleStep(this.step, this.gridTime + swing);
      this.gridTime += stepDur;
      this.step = (this.step + 1) % 16;
    }
  }

  private scheduleStep(step: number, time: number) {
    const p = this.pattern();
    this.history.push({ step, time });
    if (this.history.length > 32) this.history.shift();
    if (!p) return;
    for (const t of p.tracks) {
      const v = t.steps[step] ?? 0;
      if (!v || t.muted) continue;
      this.sampler.trigger(t.soundId, { when: time, volume: t.volume * (v === 2 ? 1 : 0.72), destination: this.bus });
    }
  }

  /** Step currently sounding (for UI), or -1. */
  currentStep(): number {
    if (!this.running) return -1;
    const now = this.ctx.currentTime;
    let cur = -1;
    for (const h of this.history) if (h.time <= now) cur = h.step;
    return cur;
  }
}
