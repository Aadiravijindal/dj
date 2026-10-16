/**
 * Per-deck effects rack. Signal flow:
 *
 *  in → drive(dry/wet) → low-pass → high-pass ─┬─ dry ───────────────┬→ out
 *                                              ├─ echo send → delay ─┤
 *                                              ├─ reverb send → conv ┤
 *                                              ├─ flanger send ──────┤
 *                                              └─ phaser send ───────┘
 *
 * Echo/reverb are sends so their tails ring out naturally when switched off.
 * Every feedback path is capped well below 1 so it can never run away.
 */
import type { FxSettings } from '../project/types';

const SMOOTH = 0.015;

export function filterFrequencies(amount: number) {
  // amount < 0 sweeps a low-pass down; amount > 0 sweeps a high-pass up.
  const lp = amount < 0 ? 20000 * Math.pow(80 / 20000, -amount) : 20000;
  const hp = amount > 0 ? 20 * Math.pow(9000 / 20, amount) : 10;
  return { lp, hp };
}

function makeImpulse(ctx: BaseAudioContext, seconds: number) {
  const len = Math.max(1, Math.round(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let seed = 1234 + c * 999;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      const n = (seed / 2147483647) * 2 - 1;
      const t = i / len;
      d[i] = n * Math.pow(1 - t, 2.4) * (i < 64 ? i / 64 : 1);
    }
  }
  return buf;
}

function driveCurve(amount: number) {
  const k = 1 + amount * 30;
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

export class FxRack {
  readonly input: GainNode;
  readonly output: GainNode;
  private driveDry: GainNode;
  private driveWet: GainNode;
  private shaper: WaveShaperNode;
  private lp: BiquadFilterNode;
  private hp: BiquadFilterNode;
  private dry: GainNode;
  private echoSend: GainNode;
  private delay: DelayNode;
  private echoFb: GainNode;
  private reverbSend: GainNode;
  private convolver: ConvolverNode;
  private flSend: GainNode;
  private flDelay: DelayNode;
  private flLfo: OscillatorNode;
  private flLfoGain: GainNode;
  private flFb: GainNode;
  private phSend: GainNode;
  private phStages: BiquadFilterNode[];
  private phLfo: OscillatorNode;
  private phLfoGain: GainNode;
  private settings: FxSettings | null = null;
  private bpm = 120;
  private reverbDecay = -1;
  private automating = false;

  constructor(private ctx: AudioContext) {
    const c = ctx;
    this.input = c.createGain();
    this.output = c.createGain();
    this.driveDry = c.createGain();
    this.driveWet = c.createGain();
    this.driveWet.gain.value = 0;
    this.shaper = c.createWaveShaper();
    this.shaper.oversample = '2x';
    this.shaper.curve = driveCurve(0.3);
    const driveSum = c.createGain();
    this.input.connect(this.driveDry).connect(driveSum);
    this.input.connect(this.shaper).connect(this.driveWet).connect(driveSum);

    this.lp = c.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 20000;
    this.hp = c.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 10;
    driveSum.connect(this.lp).connect(this.hp);

    this.dry = c.createGain();
    this.hp.connect(this.dry).connect(this.output);

    // echo
    this.echoSend = c.createGain();
    this.echoSend.gain.value = 0;
    this.delay = c.createDelay(4);
    this.echoFb = c.createGain();
    this.echoFb.gain.value = 0.4;
    const fbLo = c.createBiquadFilter();
    fbLo.type = 'lowpass';
    fbLo.frequency.value = 6000;
    const fbHi = c.createBiquadFilter();
    fbHi.type = 'highpass';
    fbHi.frequency.value = 180;
    this.hp.connect(this.echoSend).connect(this.delay);
    this.delay.connect(fbLo).connect(fbHi).connect(this.echoFb).connect(this.delay);
    this.delay.connect(this.output);

    // reverb
    this.reverbSend = c.createGain();
    this.reverbSend.gain.value = 0;
    this.convolver = c.createConvolver();
    this.hp.connect(this.reverbSend).connect(this.convolver).connect(this.output);

    // flanger
    this.flSend = c.createGain();
    this.flSend.gain.value = 0;
    this.flDelay = c.createDelay(0.05);
    this.flDelay.delayTime.value = 0.004;
    this.flLfo = c.createOscillator();
    this.flLfo.frequency.value = 0.25;
    this.flLfoGain = c.createGain();
    this.flLfoGain.gain.value = 0.002;
    this.flLfo.connect(this.flLfoGain).connect(this.flDelay.delayTime);
    this.flFb = c.createGain();
    this.flFb.gain.value = 0.5;
    this.hp.connect(this.flSend).connect(this.flDelay);
    this.flDelay.connect(this.flFb).connect(this.flDelay);
    this.flDelay.connect(this.output);
    this.flLfo.start();

    // phaser
    this.phSend = c.createGain();
    this.phSend.gain.value = 0;
    this.phStages = Array.from({ length: 4 }, () => {
      const f = c.createBiquadFilter();
      f.type = 'allpass';
      f.frequency.value = 900;
      f.Q.value = 0.6;
      return f;
    });
    this.phLfo = c.createOscillator();
    this.phLfo.frequency.value = 0.4;
    this.phLfoGain = c.createGain();
    this.phLfoGain.gain.value = 600;
    this.phLfo.connect(this.phLfoGain);
    let node: AudioNode = this.phSend;
    this.hp.connect(this.phSend);
    for (const s of this.phStages) {
      this.phLfoGain.connect(s.frequency);
      node.connect(s);
      node = s;
    }
    node.connect(this.output);
    this.phLfo.start();
  }

  private set(p: AudioParam, v: number) {
    p.setTargetAtTime(v, this.ctx.currentTime, SMOOTH);
  }

  setBpm(bpm: number) {
    if (!bpm || Math.abs(bpm - this.bpm) < 0.01) return;
    this.bpm = bpm;
    if (this.settings) this.updateEcho(this.settings);
  }

  private updateEcho(s: FxSettings) {
    const beat = 60 / this.bpm;
    this.set(this.delay.delayTime, Math.min(3.9, s.echo.time * beat));
    this.set(this.echoFb.gain, Math.min(0.85, s.echo.feedback));
    this.set(this.echoSend.gain, s.echo.enabled ? s.echo.mix : 0);
  }

  apply(s: FxSettings) {
    const prev = this.settings;
    this.settings = s;
    // drive
    if (!prev || prev.drive.amount !== s.drive.amount) this.shaper.curve = driveCurve(s.drive.amount);
    const dMix = s.drive.enabled ? s.drive.mix : 0;
    this.set(this.driveWet.gain, dMix * 0.7);
    this.set(this.driveDry.gain, 1 - dMix * 0.6);
    // filter
    if (!this.automating) {
      const { lp, hp } = filterFrequencies(s.filter.enabled ? s.filter.amount : 0);
      this.set(this.lp.frequency, lp);
      this.set(this.hp.frequency, hp);
    }
    const q = s.filter.enabled ? 0.7 + s.filter.resonance * 11 : 0.7;
    this.set(this.lp.Q, q);
    this.set(this.hp.Q, q);
    // echo
    this.updateEcho(s);
    // reverb
    if (s.reverb.enabled && Math.abs(s.reverb.decay - this.reverbDecay) > 0.05) {
      this.reverbDecay = s.reverb.decay;
      this.convolver.buffer = makeImpulse(this.ctx, s.reverb.decay);
    }
    this.set(this.reverbSend.gain, s.reverb.enabled ? s.reverb.mix * 0.9 : 0);
    // flanger
    this.set(this.flSend.gain, s.flanger.enabled ? s.flanger.mix : 0);
    this.set(this.flLfo.frequency, s.flanger.rate);
    this.set(this.flLfoGain.gain, 0.0005 + s.flanger.depth * 0.0035);
    this.set(this.flFb.gain, Math.min(0.8, s.flanger.feedback));
    // phaser
    this.set(this.phSend.gain, s.phaser.enabled ? s.phaser.mix : 0);
    this.set(this.phLfo.frequency, s.phaser.rate);
    this.set(this.phLfoGain.gain, 200 + s.phaser.depth * 700);
    // insert-style effects pull the dry signal down a little as they get wetter
    const insertWet = Math.max(s.flanger.enabled ? s.flanger.mix : 0, s.phaser.enabled ? s.phaser.mix : 0);
    this.set(this.dry.gain, 1 - insertWet * 0.45);
  }

  /** Scheduled filter automation used by Build & Drop. Values use the same -1..1 scale. */
  automateFilter(from: number, to: number, at: number, duration: number) {
    this.automating = true;
    const a = filterFrequencies(from);
    const b = filterFrequencies(to);
    for (const [p, v0, v1] of [
      [this.lp.frequency, a.lp, b.lp],
      [this.hp.frequency, a.hp, b.hp],
    ] as const) {
      p.cancelScheduledValues(at);
      p.setValueAtTime(Math.max(10, v0), at);
      p.exponentialRampToValueAtTime(Math.max(10, v1), at + Math.max(0.01, duration));
    }
  }

  automateEcho(mix: number, feedback: number, at: number, duration: number) {
    this.echoSend.gain.cancelScheduledValues(at);
    this.echoSend.gain.setValueAtTime(this.echoSend.gain.value, at);
    this.echoSend.gain.linearRampToValueAtTime(mix, at + Math.max(0.01, duration));
    this.echoFb.gain.setTargetAtTime(Math.min(0.85, feedback), at, 0.05);
  }

  /** Cancel any automation and return to the user's saved settings. */
  release(at = this.ctx.currentTime) {
    this.automating = false;
    for (const p of [this.lp.frequency, this.hp.frequency, this.echoSend.gain, this.echoFb.gain]) {
      p.cancelScheduledValues(at);
      p.setValueAtTime(p.value, at);
    }
    if (this.settings) this.apply(this.settings);
  }
}
