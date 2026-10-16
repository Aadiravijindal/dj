/**
 * A single playback deck built on AudioBufferSourceNode.
 *
 * Position is tracked analytically (anchor position + elapsed × rate) so the
 * UI can read the playhead every frame without touching React state. Tempo
 * changes resample the audio (vinyl-style). With key lock on, a real-time
 * pitch shifter (AudioWorklet) cancels the pitch change so only the tempo
 * moves; key shift transposes independently of tempo. Scratching runs on a
 * sample-accurate worklet that follows the hand with physical inertia.
 * Browsers without AudioWorklet fall back to resampling-only playback and a
 * source-restart scratch.
 */
import type { TrackMeta } from '../catalog/types';
import type { TrackAnalysis } from '../audio/analysis';
import type { DeckId, LoopRegion } from '../project/types';

export type DeckStatus = 'empty' | 'loading' | 'ready' | 'error';

export type DeckEvent =
  | { type: 'state' }
  | { type: 'cue'; time: number }
  | { type: 'loop'; loop: LoopRegion | null; active: boolean }
  | { type: 'ended' };

const FADE = 0.004;
/** Seconds of audio represented by one full jog-wheel revolution (like a 33⅓ rpm record). */
export const SECONDS_PER_REV = 1.8;

/** Fixed latency introduced by the pitch worklet (half its 40 ms window). */
export const PITCH_LATENCY = 0.02;

export class Deck {
  readonly out: GainNode;
  /** sources connect here; routed through the pitch worklet when available */
  private preOut: GainNode;
  private pitchNode: AudioWorkletNode | null = null;
  private scratchNode: AudioWorkletNode | null = null;
  private workletPos = 0;
  keyLock = false;
  /** transpose in semitones, independent of tempo */
  keyShift = 0;
  buffer: AudioBuffer | null = null;
  private reversed: AudioBuffer | null = null;
  meta: TrackMeta | null = null;
  analysis: TrackAnalysis | null = null;
  status: DeckStatus = 'empty';
  error: string | null = null;
  loadProgress = 0;

  private src: AudioBufferSourceNode | null = null;
  private srcGain: GainNode | null = null;
  private anchorPos = 0;
  private anchorTime = 0;
  private rate = 1;
  private dir: 1 | -1 = 1;
  private token = 0;

  playing = false;
  tempoRate = 1;
  private nudgeAmt = 0;
  loop: LoopRegion | null = null;
  loopActive = false;

  scratching = false;
  /** number of scratch gestures since load (used by Learn DJing to confirm practice) */
  scratchCount = 0;
  private scratchWasPlaying = false;
  private scratchPos = 0;
  private scratchIdle: ReturnType<typeof setTimeout> | null = null;
  private braking: { start: number; dur: number; rate: number; timer: ReturnType<typeof setTimeout> } | null = null;
  private roll: { slipPos: number; slipTime: number; prevLoop: LoopRegion | null; prevActive: boolean } | null = null;
  private cuePreview = false;
  cuePoint = 0;
  quantize = true;

  listener: (e: DeckEvent) => void = () => {};

  constructor(readonly id: DeckId, private ctx: AudioContext) {
    this.out = ctx.createGain();
    this.preOut = ctx.createGain();
    this.preOut.connect(this.out);
  }

  get worklets() {
    return !!this.pitchNode;
  }

  /** Called by the engine once the AudioWorklet module has loaded. */
  attachWorklets() {
    if (this.pitchNode) return;
    try {
      const pitch = new AudioWorkletNode(this.ctx, 'mixplay-pitch', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
      const scratch = new AudioWorkletNode(this.ctx, 'mixplay-scratch', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      this.preOut.disconnect();
      this.preOut.connect(pitch);
      scratch.connect(pitch);
      pitch.connect(this.out);
      scratch.port.onmessage = (e) => {
        if (e.data?.type === 'pos') this.workletPos = e.data.pos;
      };
      this.pitchNode = pitch;
      this.scratchNode = scratch;
      if (this.buffer) this.sendBufferToScratch();
      this.updatePitch();
    } catch {
      /* stay on the plain path */
    }
  }

  private sendBufferToScratch() {
    if (!this.scratchNode || !this.buffer) return;
    this.scratchNode.port.postMessage({
      type: 'buffer',
      left: this.buffer.getChannelData(0).slice(),
      right: this.buffer.getChannelData(this.buffer.numberOfChannels > 1 ? 1 : 0).slice(),
      sampleRate: this.buffer.sampleRate,
    });
  }

  /** Pitch-shift ratio: undo the tempo's pitch change (key lock) and apply key shift. */
  private updatePitch() {
    const p = this.pitchNode ? (this.pitchNode.parameters as unknown as ReadonlyMap<string, AudioParam>).get('ratio') : undefined;
    if (!p) return;
    let ratio = Math.pow(2, this.keyShift / 12);
    if (this.keyLock && !this.scratching) ratio /= this.tempoRate;
    p.setValueAtTime(Math.max(0.5, Math.min(2, ratio)), this.ctx.currentTime);
  }

  setKeyLock(on: boolean) {
    this.keyLock = on;
    this.updatePitch();
  }

  setKeyShift(semitones: number) {
    this.keyShift = Math.max(-6, Math.min(6, semitones));
    this.updatePitch();
  }

  get duration() {
    return this.buffer?.duration ?? 0;
  }
  get bpm() {
    return this.meta?.bpm ?? null;
  }
  get effectiveBpm() {
    return this.bpm ? this.bpm * this.tempoRate : null;
  }
  get beatLen() {
    return this.bpm ? 60 / this.bpm : null;
  }
  get isRolling() {
    return !!this.roll;
  }

  private emit(e: DeckEvent) {
    this.listener(e);
  }

  // ---------------------------------------------------------------- loading

  setLoading(meta: TrackMeta) {
    this.stopSource();
    this.playing = false;
    this.meta = meta;
    this.status = 'loading';
    this.loadProgress = 0;
    this.error = null;
    this.buffer = null;
    this.analysis = null;
    this.emit({ type: 'state' });
  }

  setProgress(p: number) {
    this.loadProgress = p;
  }

  setError(message: string) {
    this.stopSource();
    this.playing = false;
    this.status = 'error';
    this.error = message;
    this.buffer = null;
    this.emit({ type: 'state' });
  }

  load(meta: TrackMeta, pcm: { sampleRate: number; left: Float32Array; right: Float32Array }, analysis: TrackAnalysis) {
    this.stopSource();
    const buf = this.ctx.createBuffer(2, pcm.left.length, pcm.sampleRate);
    buf.copyToChannel(pcm.left as Float32Array<ArrayBuffer>, 0);
    buf.copyToChannel(pcm.right as Float32Array<ArrayBuffer>, 1);
    this.buffer = buf;
    this.reversed = null;
    this.sendBufferToScratch();
    this.meta = meta;
    this.analysis = analysis;
    this.status = 'ready';
    this.error = null;
    this.playing = false;
    this.anchorPos = 0;
    this.loop = null;
    this.loopActive = false;
    this.roll = null;
    this.emit({ type: 'state' });
  }

  eject() {
    this.stopSource();
    this.buffer = null;
    this.reversed = null;
    this.meta = null;
    this.analysis = null;
    this.status = 'empty';
    this.playing = false;
    this.anchorPos = 0;
    this.loop = null;
    this.loopActive = false;
    this.emit({ type: 'state' });
  }

  // --------------------------------------------------------------- position

  getPosition(): number {
    if (this.scratching && this.scratchNode) return Math.max(0, Math.min(this.duration, this.workletPos));
    if (!this.src) return this.anchorPos;
    const elapsed = Math.max(0, this.ctx.currentTime - this.anchorTime);
    let pos: number;
    if (this.braking) {
      const e = Math.min(elapsed, this.braking.dur);
      pos = this.anchorPos + this.braking.rate * (e - (e * e) / (2 * this.braking.dur));
    } else {
      pos = this.anchorPos + this.dir * elapsed * this.rate;
    }
    const L = this.loop;
    if (this.dir > 0 && this.loopActive && L && this.src.loop && pos >= L.end) {
      const len = L.end - L.start;
      pos = L.start + ((pos - L.start) % len);
    }
    return Math.max(0, Math.min(this.duration, pos));
  }

  private rebase() {
    this.anchorPos = this.getPosition();
    this.anchorTime = this.ctx.currentTime;
  }

  // ------------------------------------------------------------ source mgmt

  private ensureReversed() {
    if (this.reversed || !this.buffer) return;
    const b = this.buffer;
    const r = this.ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
    for (let c = 0; c < b.numberOfChannels; c++) {
      const src = b.getChannelData(c);
      const dst = r.getChannelData(c);
      for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i];
    }
    this.reversed = r;
  }

  private stopSource() {
    const now = this.ctx.currentTime;
    if (this.src && this.srcGain) {
      const s = this.src;
      s.onended = null;
      this.srcGain.gain.cancelScheduledValues(now);
      this.srcGain.gain.setTargetAtTime(0, now, FADE / 2);
      try {
        s.stop(now + FADE * 4);
      } catch {
        /* already stopped */
      }
      const g = this.srcGain;
      setTimeout(() => g.disconnect(), 100);
    }
    this.src = null;
    this.srcGain = null;
  }

  private startSource(pos: number) {
    if (!this.buffer) return;
    this.stopSource();
    if (this.dir < 0) this.ensureReversed();
    const buf = this.dir > 0 ? this.buffer : this.reversed!;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = this.rate;
    const L = this.loop;
    if (this.dir > 0 && this.loopActive && L && pos >= L.start && pos < L.end) {
      src.loop = true;
      src.loopStart = L.start;
      src.loopEnd = L.end;
    }
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(1, now + FADE);
    src.connect(g).connect(this.preOut);
    const offset = this.dir > 0 ? pos : Math.max(0, this.duration - pos);
    src.start(now, Math.min(offset, Math.max(0, buf.duration - 0.001)));
    this.src = src;
    this.srcGain = g;
    this.anchorPos = pos;
    this.anchorTime = now;
    const token = ++this.token;
    src.onended = () => {
      if (token !== this.token || this.src !== src) return;
      this.src = null;
      this.srcGain = null;
      if (this.scratching) {
        this.anchorPos = this.dir > 0 ? this.duration : 0;
        return;
      }
      this.anchorPos = this.duration;
      this.playing = false;
      this.emit({ type: 'ended' });
      this.emit({ type: 'state' });
    };
  }

  // -------------------------------------------------------------- transport

  play() {
    if (!this.buffer || this.playing) return;
    this.cancelBrake();
    let pos = this.anchorPos;
    if (pos >= this.duration - 0.05) pos = 0;
    this.dir = 1;
    this.rate = this.tempoRate * (1 + this.nudgeAmt);
    this.playing = true;
    if (!this.scratching) this.startSource(pos);
    this.emit({ type: 'state' });
  }

  pause() {
    if (!this.playing && !this.src) return;
    this.cancelBrake();
    this.anchorPos = this.getPosition();
    this.stopSource();
    this.playing = false;
    this.emit({ type: 'state' });
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  stop() {
    this.pause();
    this.seek(this.cuePoint);
  }

  seek(t: number) {
    if (!this.buffer) return;
    t = Math.max(0, Math.min(this.duration - 0.01, t));
    if (this.loopActive && this.loop && (t < this.loop.start || t >= this.loop.end) && !this.roll) {
      this.loopActive = false;
      this.emit({ type: 'loop', loop: this.loop, active: false });
    }
    if (this.src && !this.braking) this.startSource(t);
    else this.anchorPos = t;
    this.emit({ type: 'state' });
  }

  private updateRate() {
    if (this.scratching || this.braking) return;
    const r = this.tempoRate * (1 + this.nudgeAmt);
    if (this.src) {
      this.rebase();
      this.src.playbackRate.setValueAtTime(r, this.ctx.currentTime);
    }
    this.rate = r;
  }

  setTempo(percent: number) {
    this.tempoRate = 1 + percent / 100;
    this.updateRate();
    this.updatePitch();
  }

  /** Temporary pitch bend while held (e.g. ±4%). */
  nudge(amount: number) {
    this.nudgeAmt = amount;
    this.updateRate();
  }

  brake(duration = 1.2) {
    if (!this.src || !this.playing) return;
    this.rebase();
    const now = this.ctx.currentTime;
    const p = this.src.playbackRate;
    p.cancelScheduledValues(now);
    p.setValueAtTime(this.rate, now);
    p.linearRampToValueAtTime(0.001, now + duration);
    const timer = setTimeout(() => {
      if (!this.braking) return;
      const pos = this.anchorPos + this.braking.rate * (this.braking.dur / 2);
      this.braking = null;
      this.stopSource();
      this.anchorPos = Math.min(this.duration, pos);
      this.playing = false;
      this.rate = this.tempoRate;
      this.emit({ type: 'state' });
    }, duration * 1000);
    this.braking = { start: now, dur: duration, rate: this.rate, timer };
  }

  private cancelBrake() {
    if (!this.braking) return;
    clearTimeout(this.braking.timer);
    this.anchorPos = this.getPosition();
    this.braking = null;
    this.stopSource();
    this.rate = this.tempoRate * (1 + this.nudgeAmt);
  }

  // ------------------------------------------------------------------ beats

  /** Beat phase 0..1 at a track position. */
  phaseAt(pos: number) {
    const bl = this.beatLen;
    if (!bl) return 0;
    const b = (pos - (this.meta?.firstBeat ?? 0)) / bl;
    return b - Math.floor(b);
  }

  /** Snap a position to the nearest beat (or previous when floor=true). */
  snap(pos: number, floor = false) {
    const bl = this.beatLen;
    if (!bl) return pos;
    const fb = this.meta?.firstBeat ?? 0;
    const b = (pos - fb) / bl;
    return fb + (floor ? Math.floor(b + 1e-6) : Math.round(b)) * bl;
  }

  /** AudioContext time of the next beat (or bar when unit=4) boundary while playing. */
  nextBeatTime(unit = 1): number | null {
    const bl = this.beatLen;
    if (!bl || !this.playing || !this.src || this.scratching) return null;
    const pos = this.getPosition();
    const fb = this.meta?.firstBeat ?? 0;
    const beats = (pos - fb) / bl / unit;
    const until = (Math.ceil(beats + 1e-4) - beats) * bl * unit;
    return this.ctx.currentTime + until / this.rate;
  }

  /** Current beat index (0-based, from the first downbeat). */
  beatIndex() {
    const bl = this.beatLen;
    if (!bl) return 0;
    return Math.floor((this.getPosition() - (this.meta?.firstBeat ?? 0)) / bl + 1e-6);
  }

  // ------------------------------------------------------------------ loops

  setLoop(region: LoopRegion | null, active: boolean) {
    if (this.src) this.rebase();
    this.loop = region;
    this.loopActive = !!region && active;
    if (this.src && this.dir > 0) {
      const pos = this.getPosition();
      if (this.loopActive && region) {
        if (pos < region.start || pos >= region.end) {
          this.startSource(region.start);
        } else {
          this.src.loop = true;
          this.src.loopStart = region.start;
          this.src.loopEnd = region.end;
        }
      } else {
        this.src.loop = false;
      }
    } else if (!this.src && this.loopActive && region) {
      if (this.anchorPos < region.start || this.anchorPos >= region.end) this.anchorPos = region.start;
    }
    this.emit({ type: 'loop', loop: this.loop, active: this.loopActive });
    this.emit({ type: 'state' });
  }

  /** Beat-length loop starting at the current beat. */
  autoLoop(beats: number) {
    const bl = this.beatLen;
    if (!bl || !this.buffer) return;
    const pos = this.getPosition();
    const start = this.quantize ? this.snap(pos, true) : pos;
    const end = Math.min(this.duration, start + beats * bl);
    this.setLoop({ start, end, beats }, true);
  }

  /** Momentary loop roll (beat repeat/stutter) with slip: release returns to where the track would have been. */
  rollStart(beats: number) {
    if (!this.buffer || !this.playing || !this.beatLen) return;
    const pos = this.getPosition();
    const start = this.snap(pos, true);
    this.roll = { slipPos: pos, slipTime: this.ctx.currentTime, prevLoop: this.loop, prevActive: this.loopActive };
    const end = start + beats * this.beatLen;
    // roll loops always restart at the loop start for a crisp stutter
    this.loop = { start, end, beats };
    this.loopActive = true;
    this.startSource(start);
    this.emit({ type: 'state' });
  }

  rollEnd() {
    if (!this.roll) return;
    const r = this.roll;
    this.roll = null;
    const target = r.slipPos + (this.ctx.currentTime - r.slipTime) * this.rate;
    this.loop = r.prevLoop;
    this.loopActive = r.prevActive && !!r.prevLoop && target >= r.prevLoop.start && target < r.prevLoop.end;
    if (this.playing) this.startSource(Math.min(target, this.duration - 0.01));
    else this.anchorPos = target;
    this.emit({ type: 'loop', loop: this.loop, active: this.loopActive });
    this.emit({ type: 'state' });
  }

  // -------------------------------------------------------------------- cue

  cueDown() {
    if (!this.buffer) return;
    if (this.playing && !this.cuePreview) {
      this.pause();
      this.seek(this.cuePoint);
      return;
    }
    const pos = this.getPosition();
    if (Math.abs(pos - this.cuePoint) > 0.02) {
      this.cuePoint = this.quantize ? this.snap(pos) : pos;
      this.anchorPos = this.cuePoint;
      this.emit({ type: 'cue', time: this.cuePoint });
    }
    this.cuePreview = true;
    this.play();
  }

  cueUp() {
    if (!this.cuePreview) return;
    this.cuePreview = false;
    this.pause();
    this.seek(this.cuePoint);
  }

  /** Hot cue: jump and keep playing (or start, CDJ style). */
  jumpTo(t: number) {
    this.seek(t);
    if (!this.playing) this.play();
  }

  // ---------------------------------------------------------------- scratch

  scratchStart() {
    if (!this.buffer) return;
    this.cancelBrake();
    if (this.scratchNode) {
      const pos = this.getPosition();
      const velocity = this.playing && this.src ? this.rate : 0;
      this.stopSource();
      this.scratchWasPlaying = this.playing;
      this.scratching = true;
      this.scratchCount++;
      this.scratchPos = pos;
      this.workletPos = pos;
      this.anchorPos = pos;
      this.updatePitch();
      this.scratchNode.port.postMessage({ type: 'start', pos, velocity });
      this.emit({ type: 'state' });
      return;
    }
    this.legacyScratchStart();
  }

  /** Move the virtual record by `delta` seconds of audio, over `dt` real seconds. */
  scratchMove(delta: number, dt: number) {
    if (!this.scratching || !this.buffer) return;
    if (this.scratchNode) {
      this.scratchPos = Math.max(0, Math.min(this.duration - 0.01, this.scratchPos + delta));
      this.scratchNode.port.postMessage({ type: 'target', pos: this.scratchPos });
      return;
    }
    this.legacyScratchMove(delta, dt);
  }

  scratchEnd() {
    if (!this.scratching) return;
    if (this.scratchNode) {
      const pos = Math.max(0, Math.min(this.duration - 0.01, this.workletPos));
      this.scratchNode.port.postMessage({ type: 'stop' });
      this.scratching = false;
      this.dir = 1;
      this.rate = this.tempoRate * (1 + this.nudgeAmt);
      this.anchorPos = pos;
      this.playing = this.scratchWasPlaying;
      this.updatePitch();
      if (this.playing) this.startSource(pos);
      this.emit({ type: 'state' });
      return;
    }
    this.legacyScratchEnd();
  }

  // ---- fallback for browsers without AudioWorklet: restart sources to follow the hand

  private legacyScratchStart() {
    this.scratching = true;
    this.scratchCount++;
    this.scratchWasPlaying = this.playing;
    this.scratchPos = this.getPosition();
    this.stopSource();
    this.anchorPos = this.scratchPos;
    this.rate = 0;
    this.emit({ type: 'state' });
  }

  private legacyScratchMove(delta: number, dt: number) {
    const target = Math.max(0, Math.min(this.duration - 0.01, this.scratchPos + delta));
    const vel = dt > 0 ? delta / dt : 0;
    const speed = Math.min(4, Math.abs(vel));
    const dir: 1 | -1 = vel < 0 ? -1 : 1;
    if (speed < 0.03) {
      this.scratchPos = target;
      this.idleScratch();
      return;
    }
    const current = this.src ? this.getPosition() : this.anchorPos;
    const drift = target - current;
    if (!this.src || dir !== this.dir || Math.abs(drift) > 0.06) {
      this.dir = dir;
      this.rate = speed;
      this.startSource(target);
    } else {
      this.rebase();
      this.rate = speed;
      this.src.playbackRate.setValueAtTime(speed, this.ctx.currentTime);
    }
    this.scratchPos = target;
    if (this.scratchIdle) clearTimeout(this.scratchIdle);
    this.scratchIdle = setTimeout(() => this.idleScratch(), 45);
  }

  private idleScratch() {
    if (!this.scratching) return;
    if (this.src) {
      this.anchorPos = this.getPosition();
      this.stopSource();
    }
    this.anchorPos = this.scratchPos;
  }

  private legacyScratchEnd() {
    if (this.scratchIdle) clearTimeout(this.scratchIdle);
    const pos = this.src ? this.getPosition() : this.scratchPos;
    this.scratching = false;
    this.stopSource();
    this.dir = 1;
    this.rate = this.tempoRate * (1 + this.nudgeAmt);
    this.anchorPos = pos;
    this.playing = this.scratchWasPlaying;
    if (this.playing) this.startSource(pos);
    this.emit({ type: 'state' });
  }

  /** Scrub while paused (silent position change), delta in seconds. */
  scrub(delta: number) {
    if (!this.buffer) return;
    this.seek(this.getPosition() + delta);
  }
}
