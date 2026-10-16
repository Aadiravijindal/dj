import { soundById } from './soundLibrary';

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
  soundId: string;
  tag?: string;
}

/** Plays one-shots and tempo-locked loops from the sound library. */
export class Sampler {
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Set<Voice>();
  private listeners = new Set<() => void>();

  constructor(private ctx: AudioContext) {}

  onChange(l: () => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }

  buffer(soundId: string): AudioBuffer | null {
    const hit = this.buffers.get(soundId);
    if (hit) return hit;
    const def = soundById(soundId);
    if (!def) return null;
    const st = def.render(this.ctx.sampleRate);
    const buf = this.ctx.createBuffer(2, st.l.length, this.ctx.sampleRate);
    buf.copyToChannel(st.l as Float32Array<ArrayBuffer>, 0);
    buf.copyToChannel(st.r as Float32Array<ArrayBuffer>, 1);
    this.buffers.set(soundId, buf);
    return buf;
  }

  /** Pre-render sounds during idle time so the first hit is instant. */
  warm(ids: string[]) {
    const queue = ids.filter((id) => !this.buffers.has(id));
    const step = () => {
      const id = queue.shift();
      if (!id) return;
      this.buffer(id);
      if (queue.length) setTimeout(step, 16);
    };
    setTimeout(step, 50);
  }

  trigger(
    soundId: string,
    opts: { when?: number; volume?: number; destination: AudioNode; tempoBpm?: number | null; rate?: number; tag?: string },
  ): boolean {
    const buf = this.buffer(soundId);
    const def = soundById(soundId);
    if (!buf || !def) return false;
    const when = Math.max(this.ctx.currentTime, opts.when ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    let rate = opts.rate ?? 1;
    if (def.loop) {
      src.loop = true;
      if (opts.tempoBpm) rate = opts.tempoBpm / def.loop.bpm;
    }
    src.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    const v = Math.max(0, Math.min(1.5, opts.volume ?? 1));
    gain.gain.value = v;
    src.connect(gain).connect(opts.destination);
    const voice: Voice = { src, gain, soundId, tag: opts.tag };
    this.voices.add(voice);
    src.onended = () => {
      this.voices.delete(voice);
      gain.disconnect();
      if (def.loop) this.emit();
    };
    src.start(when);
    if (def.loop) this.emit();
    // keep the number of overlapping one-shots bounded
    if (this.voices.size > 64) {
      const oldest = this.voices.values().next().value;
      if (oldest) this.kill(oldest);
    }
    return true;
  }

  private kill(v: Voice, at = this.ctx.currentTime) {
    v.gain.gain.cancelScheduledValues(at);
    v.gain.gain.setTargetAtTime(0, at, 0.01);
    try {
      v.src.stop(at + 0.06);
    } catch {
      // a voice scheduled in the future can still be stopped; ignore
      // "already stopped" errors only
    }
  }

  isPlaying(soundId: string) {
    for (const v of this.voices) if (v.soundId === soundId) return true;
    return false;
  }

  /** Stop a looping sound (optionally at a quantised time). */
  stop(soundId: string, at?: number) {
    for (const v of this.voices) if (v.soundId === soundId) this.kill(v, at);
  }

  /** Stop (or cancel, if not yet started) every voice carrying a tag. */
  stopTag(tag: string) {
    for (const v of this.voices) if (v.tag === tag) this.kill(v);
  }

  /** Play an arbitrary buffer (e.g. a riser generated at an exact length). */
  playBuffer(buf: AudioBuffer, opts: { when: number; volume: number; destination: AudioNode; tag?: string }) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = opts.volume;
    src.connect(gain).connect(opts.destination);
    const voice: Voice = { src, gain, soundId: '__buffer', tag: opts.tag };
    this.voices.add(voice);
    src.onended = () => {
      this.voices.delete(voice);
      gain.disconnect();
    };
    src.start(Math.max(this.ctx.currentTime, opts.when));
  }

  stopAll() {
    for (const v of this.voices) this.kill(v);
  }

  /** Re-pitch running loops to follow a new tempo. */
  retempo(bpm: number) {
    for (const v of this.voices) {
      const def = soundById(v.soundId);
      if (def?.loop) v.src.playbackRate.setTargetAtTime(bpm / def.loop.bpm, this.ctx.currentTime, 0.02);
    }
  }
}
