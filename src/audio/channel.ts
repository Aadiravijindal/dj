/**
 * Mixer channel: trim → 3-band EQ → FX rack → fader → crossfader → mute → out
 * with a post-fader meter tap and a pre-fader cue (headphone) tap.
 */
import { FxRack } from './fxRack';
import type { ChannelSettings } from '../project/types';

const SMOOTH = 0.012;
export const dbToGain = (db: number) => Math.pow(10, db / 20);

/** Equal-power ("smooth") or sharp ("cut") crossfader curves. x in -1..1 */
export function crossfadeGains(x: number, curve: 'smooth' | 'sharp') {
  const t = (Math.max(-1, Math.min(1, x)) + 1) / 2;
  if (curve === 'sharp') {
    // full volume until very close to the opposite side
    const a = t > 0.92 ? Math.max(0, 1 - (t - 0.92) / 0.08) : 1;
    const b = t < 0.08 ? Math.max(0, t / 0.08) : 1;
    return { a, b };
  }
  return { a: Math.cos((t * Math.PI) / 2), b: Math.sin((t * Math.PI) / 2) };
}

export class ChannelStrip {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly fx: FxRack;
  readonly analyser: AnalyserNode;
  readonly cueTap: GainNode;
  private trim: GainNode;
  private low: BiquadFilterNode;
  private mid: BiquadFilterNode;
  private high: BiquadFilterNode;
  private fader: GainNode;
  private xfade: GainNode;
  private muteGain: GainNode;
  private meterBuf: Float32Array<ArrayBuffer>;
  private muted = false;

  constructor(private ctx: AudioContext) {
    this.input = ctx.createGain();
    this.trim = ctx.createGain();
    this.low = ctx.createBiquadFilter();
    this.low.type = 'lowshelf';
    this.low.frequency.value = 180;
    this.mid = ctx.createBiquadFilter();
    this.mid.type = 'peaking';
    this.mid.frequency.value = 1000;
    this.mid.Q.value = 0.7;
    this.high = ctx.createBiquadFilter();
    this.high.type = 'highshelf';
    this.high.frequency.value = 3200;
    this.fx = new FxRack(ctx);
    this.fader = ctx.createGain();
    this.xfade = ctx.createGain();
    this.muteGain = ctx.createGain();
    this.output = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.meterBuf = new Float32Array(this.analyser.fftSize);
    this.cueTap = ctx.createGain();
    this.cueTap.gain.value = 0;

    this.input.connect(this.trim).connect(this.low).connect(this.mid).connect(this.high).connect(this.fx.input);
    this.fx.output.connect(this.fader).connect(this.xfade).connect(this.muteGain).connect(this.output);
    this.muteGain.connect(this.analyser);
    this.fx.output.connect(this.cueTap);
  }

  private set(p: AudioParam, v: number) {
    p.setTargetAtTime(v, this.ctx.currentTime, SMOOTH);
  }

  apply(s: ChannelSettings) {
    this.set(this.trim.gain, dbToGain(s.gain));
    this.set(this.low.gain, s.eq.low);
    this.set(this.mid.gain, s.eq.mid);
    this.set(this.high.gain, s.eq.high);
    // a squared taper makes the fader feel natural (and quiet at the bottom)
    this.set(this.fader.gain, s.volume * s.volume);
    this.muted = s.mute;
    this.set(this.muteGain.gain, s.mute ? 0 : 1);
    this.set(this.cueTap.gain, s.cue ? 1 : 0);
  }

  setCrossfade(g: number) {
    this.set(this.xfade.gain, g);
  }

  /** Scheduled volume dip (used by Build & Drop "silence before the drop"). */
  duck(at: number, until: number) {
    const p = this.muteGain.gain;
    p.setTargetAtTime(0, at, 0.005);
    p.setTargetAtTime(this.muted ? 0 : 1, until, 0.005);
  }

  /** Cancel a scheduled duck and restore the user's mute state now. */
  unduck() {
    const p = this.muteGain.gain;
    const now = this.ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setTargetAtTime(this.muted ? 0 : 1, now, 0.005);
  }

  /** Peak level of the last ~20 ms, linear 0..∞ (pre-limiter). */
  peak() {
    this.analyser.getFloatTimeDomainData(this.meterBuf);
    let p = 0;
    for (let i = 0; i < this.meterBuf.length; i++) {
      const a = Math.abs(this.meterBuf[i]);
      if (a > p) p = a;
    }
    return p;
  }
}
