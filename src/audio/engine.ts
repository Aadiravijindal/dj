/**
 * The MIXPLAY audio engine. Owns the AudioContext and the whole signal graph:
 *
 *   Deck A → Channel A ┐
 *   Deck B → Channel B ┼→ master sum → master gain → [clip meter] → limiter → [meter] → speakers
 *   Sampler (pads)  ───┤
 *   Sequencer       ───┘
 *   Channel cue taps → cue bus → headphone cue:
 *     - split mode: master (mono) in the left ear, cue (mono) in the right, on one output
 *     - device mode: a second output device via HTMLMediaElement.setSinkId
 *
 * The engine knows nothing about React. The UI reads real-time values
 * (playheads, meters) by polling inside requestAnimationFrame, and
 * subscribes to discrete state changes through `subscribe`.
 */
import { Deck, PITCH_LATENCY, type DeckEvent } from './deck';
import processorsUrl from './worklets/processors.js?url';
import { ChannelStrip, crossfadeGains } from './channel';
import { Sampler } from './sampler';
import { Sequencer } from './sequencer';
import type { BeatSettings, DeckId, FxSettings, MixerSettings } from '../project/types';

export interface MeterReading {
  A: number;
  B: number;
  master: number;
  /** true if the pre-limiter master exceeded 0 dBFS in the last second */
  clipping: boolean;
  /** how hard the safety limiter is working, in dB */
  limiterReduction: number;
}

type Listener = () => void;

class AudioEngine {
  ctx: AudioContext | null = null;
  decks!: Record<DeckId, Deck>;
  channels!: Record<DeckId, ChannelStrip>;
  sampler!: Sampler;
  sequencer!: Sequencer;
  padBus!: GainNode;
  private masterSum!: GainNode;
  private masterGain!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private preAnalyser!: AnalyserNode;
  private postAnalyser!: AnalyserNode;
  private buf = new Float32Array(1024);
  private cueBus!: GainNode;
  private normalOut!: GainNode;
  private splitOut!: GainNode;
  private padDelay!: DelayNode;
  private seqDelay!: DelayNode;
  cueMode: 'off' | 'split' | 'device' = 'off';
  /** true once the AudioWorklet processors (key lock, key shift, vinyl scratch) are running */
  workletsReady = false;
  workletError: string | null = null;
  private cueDest: MediaStreamAudioDestinationNode | null = null;
  private cueEl: HTMLAudioElement | null = null;
  private lastClip = -10;
  clipCount = 0;
  private listeners = new Set<Listener>();
  private deckListeners = new Set<(id: DeckId, e: DeckEvent) => void>();
  private version = 0;
  private mixer: MixerSettings | null = null;
  readonly supportsSinkId = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  unsupportedReason: string | null = null;

  /** Create the graph (context may start suspended until a user gesture). */
  init(): boolean {
    if (this.ctx) return true;
    const Ctor: typeof AudioContext | undefined =
      typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!Ctor) {
      this.unsupportedReason = 'This browser does not support the Web Audio API, which MIXPLAY needs to play and mix audio.';
      return false;
    }
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.masterSum = ctx.createGain();
    this.masterGain = ctx.createGain();
    this.preAnalyser = ctx.createAnalyser();
    this.preAnalyser.fftSize = 1024;
    this.limiter = ctx.createDynamicsCompressor();
    // a transparent-ish safety limiter: protects ears and speakers from spikes
    this.limiter.threshold.value = -2;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    this.postAnalyser = ctx.createAnalyser();
    this.postAnalyser.fftSize = 1024;
    this.masterSum.connect(this.masterGain).connect(this.preAnalyser);
    this.masterGain.connect(this.limiter).connect(this.postAnalyser);
    this.normalOut = ctx.createGain();
    this.postAnalyser.connect(this.normalOut).connect(ctx.destination);

    this.cueBus = ctx.createGain();
    // split cue: downmix master and cue to mono, put them in the left/right ears
    const mono = () => {
      const g = ctx.createGain();
      g.channelCount = 1;
      g.channelCountMode = 'explicit';
      g.channelInterpretation = 'speakers';
      return g;
    };
    const masterMono = mono();
    const cueMono = mono();
    const cueLimiter = ctx.createDynamicsCompressor();
    cueLimiter.threshold.value = -3;
    cueLimiter.ratio.value = 20;
    const merger = ctx.createChannelMerger(2);
    this.splitOut = ctx.createGain();
    this.splitOut.gain.value = 0;
    this.postAnalyser.connect(masterMono).connect(merger, 0, 0);
    this.cueBus.connect(cueLimiter).connect(cueMono).connect(merger, 0, 1);
    merger.connect(this.splitOut).connect(ctx.destination);
    this.decks = { A: new Deck('A', ctx), B: new Deck('B', ctx) };
    this.channels = { A: new ChannelStrip(ctx), B: new ChannelStrip(ctx) };
    for (const id of ['A', 'B'] as DeckId[]) {
      this.decks[id].out.connect(this.channels[id].input);
      this.channels[id].output.connect(this.masterSum);
      this.channels[id].cueTap.connect(this.cueBus);
      this.decks[id].listener = (e) => {
        if (e.type === 'state' || e.type === 'loop') {
          const bpm = this.decks[id].effectiveBpm;
          if (bpm) this.channels[id].fx.setBpm(bpm);
        }
        this.deckListeners.forEach((l) => l(id, e));
        this.bump();
      };
    }
    this.sampler = new Sampler(ctx);
    this.padBus = ctx.createGain();
    // pads and beats are delayed by the decks' pitch-worklet latency so everything stays in time
    this.padDelay = ctx.createDelay(0.1);
    this.padDelay.delayTime.value = 0;
    this.padBus.connect(this.padDelay).connect(this.masterSum);
    this.sequencer = new Sequencer(ctx, this.sampler, (id) => this.decks[id]);
    this.seqDelay = ctx.createDelay(0.1);
    this.seqDelay.delayTime.value = 0;
    this.sequencer.bus.connect(this.seqDelay).connect(this.masterSum);
    this.loadWorklets();
    this.sequencer.onChange(() => this.bump());
    this.sampler.onChange(() => this.bump());
    ctx.onstatechange = () => this.bump();
    return true;
  }

  private async loadWorklets() {
    const ctx = this.ctx!;
    if (!ctx.audioWorklet) {
      this.workletError = 'This browser has no AudioWorklet support, so key lock, key shift and vinyl-style scratching are unavailable.';
      return;
    }
    try {
      await ctx.audioWorklet.addModule(processorsUrl);
      for (const id of ['A', 'B'] as DeckId[]) this.decks[id].attachWorklets();
      this.padDelay.delayTime.value = PITCH_LATENCY;
      this.seqDelay.delayTime.value = PITCH_LATENCY;
      this.workletsReady = this.decks.A.worklets && this.decks.B.worklets;
    } catch (e) {
      this.workletError = `Audio processors failed to load: ${(e as Error).message}`;
    }
    this.bump();
  }

  /** Must be called from a user gesture (click/tap/key) to satisfy autoplay rules. */
  async resume() {
    if (!this.init()) return false;
    if (this.ctx!.state !== 'running') {
      try {
        await this.ctx!.resume();
      } catch {
        return false;
      }
    }
    return this.ctx!.state === 'running';
  }

  get running() {
    return this.ctx?.state === 'running';
  }

  now() {
    return this.ctx?.currentTime ?? 0;
  }

  // ------------------------------------------------------------ subscriptions

  private bump() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  getVersion = () => this.version;

  onDeckEvent(l: (id: DeckId, e: DeckEvent) => void) {
    this.deckListeners.add(l);
    return () => {
      this.deckListeners.delete(l);
    };
  }

  // --------------------------------------------------------------- settings

  applyMixer(m: MixerSettings) {
    if (!this.ctx) return;
    this.mixer = m;
    for (const id of ['A', 'B'] as DeckId[]) this.channels[id].apply(m.channels[id]);
    const { a, b } = crossfadeGains(m.crossfader, m.curve);
    this.channels.A.setCrossfade(a);
    this.channels.B.setCrossfade(b);
    this.masterGain.gain.setTargetAtTime(m.master * m.master, this.ctx.currentTime, 0.015);
    this.cueBus.gain.setTargetAtTime(m.cueMix, this.ctx.currentTime, 0.015);
  }

  applyFx(id: DeckId, fx: FxSettings) {
    if (!this.ctx) return;
    this.channels[id].fx.apply(fx);
  }

  applyBeats(b: BeatSettings) {
    if (!this.ctx) return;
    this.sequencer.apply(b);
  }

  setPadVolume(v: number) {
    if (!this.ctx) return;
    this.padBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  // ------------------------------------------------------------------ meters

  private peakOf(a: AnalyserNode) {
    const buf = this.buf;
    a.getFloatTimeDomainData(buf);
    let p = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i]);
      if (v > p) p = v;
    }
    return p;
  }

  meters(): MeterReading {
    if (!this.ctx) return { A: 0, B: 0, master: 0, clipping: false, limiterReduction: 0 };
    const pre = this.peakOf(this.preAnalyser);
    const now = this.ctx.currentTime;
    if (pre >= 1) {
      if (now - this.lastClip > 0.5) this.clipCount++;
      this.lastClip = now;
    }
    return {
      A: this.channels.A.peak(),
      B: this.channels.B.peak(),
      master: this.peakOf(this.postAnalyser),
      clipping: now - this.lastClip < 1,
      limiterReduction: this.limiter.reduction,
    };
  }

  // -------------------------------------------------------------- cue output

  /**
   * Headphone cue routing.
   *  - 'split': one stereo output; left = master (mono), right = cue (mono). Works
   *    everywhere with a headphone splitter or by listening on one ear.
   *  - 'device': cue bus to a second output device (needs HTMLMediaElement.setSinkId).
   */
  async setCueMode(mode: 'off' | 'split' | 'device', deviceId: string | null = null): Promise<{ ok: boolean; message: string }> {
    if (!this.init()) return { ok: false, message: this.unsupportedReason ?? 'Audio unavailable' };
    const now = this.ctx!.currentTime;
    if (mode !== 'device' && this.cueEl) {
      this.cueEl.pause();
      this.cueEl.srcObject = null;
    }
    if (mode === 'device') {
      const r = await this.setCueDevice(deviceId);
      if (!r.ok) return r;
    }
    this.cueMode = mode;
    this.normalOut.gain.setTargetAtTime(mode === 'split' ? 0 : 1, now, 0.01);
    this.splitOut.gain.setTargetAtTime(mode === 'split' ? 1 : 0, now, 0.01);
    this.bump();
    return {
      ok: true,
      message:
        mode === 'split'
          ? 'Split cue on: master in your left ear, cued decks in your right.'
          : mode === 'device'
            ? 'Cue goes to your second output device.'
            : 'Headphone cue is off.',
    };
  }

  /** Route the cue (headphone) bus to a separate output device. */
  private async setCueDevice(deviceId: string | null): Promise<{ ok: boolean; message: string }> {
    if (!deviceId) return { ok: false, message: 'Choose an output device first.' };
    if (!this.supportsSinkId) return { ok: false, message: 'Your browser cannot send audio to a second output device. Use split cue instead.' };
    if (!this.cueDest) {
      this.cueDest = this.ctx!.createMediaStreamDestination();
      this.cueBus.connect(this.cueDest);
    }
    if (!this.cueEl) this.cueEl = new Audio();
    this.cueEl.srcObject = this.cueDest.stream;
    try {
      await (this.cueEl as HTMLAudioElement & { setSinkId(id: string): Promise<void> }).setSinkId(deviceId);
      await this.cueEl.play();
      return { ok: true, message: 'Cue output connected.' };
    } catch (e) {
      return { ok: false, message: `Could not use that output: ${(e as Error).message}` };
    }
  }

  get cueRouted() {
    return this.cueMode === 'split' || (!!this.cueEl && !!this.cueEl.srcObject && !this.cueEl.paused);
  }

  get mixerSettings() {
    return this.mixer;
  }
}

export const engine = new AudioEngine();

// Expose a read-only test/debug hook (used by the end-to-end tests).
if (typeof window !== 'undefined') {
  (window as unknown as { __mixplay?: unknown }).__mixplay = { engine };
}
