/* global sampleRate, currentTime, registerProcessor, AudioWorkletProcessor */
/**
 * MIXPLAY AudioWorklet processors (plain JS — loaded with audioWorklet.addModule).
 *
 * mixplay-pitch   Real-time pitch shifter used for key lock (pitch-preserving
 *                 tempo) and key shift. Two crossfaded delay-line taps
 *                 ("rotating tape heads"). It always delays the signal by
 *                 half a window, even at ratio 1, so the latency is constant
 *                 and both decks stay in time with each other.
 *
 * mixplay-scratch Sample-accurate vinyl emulation. The UI sends the hand's
 *                 target position; a critically damped spring moves the
 *                 virtual record towards it, giving smooth forward/backward
 *                 motion with inertia, read with cubic interpolation.
 */

const WINDOW_SECONDS = 0.04;

class PitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ratio', defaultValue: 1, minValue: 0.5, maxValue: 2, automationRate: 'k-rate' }];
  }

  constructor() {
    super();
    this.win = Math.max(256, Math.round(sampleRate * WINDOW_SECONDS));
    this.size = 1;
    while (this.size < this.win * 2 + 256) this.size <<= 1;
    this.mask = this.size - 1;
    this.buf = [new Float32Array(this.size), new Float32Array(this.size)];
    this.w = 0;
    this.phase = 0.5;
  }

  read(ch, delay) {
    const b = this.buf[ch];
    const pos = this.w - delay;
    const i = Math.floor(pos);
    const f = pos - i;
    return b[i & this.mask] * (1 - f) + b[(i + 1) & this.mask] * f;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const ratio = parameters.ratio[0];
    const n = output[0].length;
    const chans = Math.min(2, output.length);
    const W = this.win;
    const bypass = Math.abs(ratio - 1) < 1e-4;
    const step = (1 - ratio) / W;
    for (let s = 0; s < n; s++) {
      for (let c = 0; c < 2; c++) {
        const src = input && input.length ? input[Math.min(c, input.length - 1)] : null;
        this.buf[c][this.w & this.mask] = src ? src[s] : 0;
      }
      if (bypass) {
        // constant half-window delay so latency never jumps when key lock toggles
        for (let c = 0; c < chans; c++) output[c][s] = this.read(c, W * 0.5);
        // ease the tape heads back to centre so re-enabling is seamless
        this.phase += (0.5 - this.phase) * 0.001;
      } else {
        this.phase += step;
        this.phase -= Math.floor(this.phase);
        const p2 = (this.phase + 0.5) % 1;
        const d1 = 1 + this.phase * W;
        const d2 = 1 + p2 * W;
        // triangular crossfade: each head is silent when it jumps
        const g1 = 1 - Math.abs(2 * this.phase - 1);
        const g2 = 1 - g1;
        for (let c = 0; c < chans; c++) output[c][s] = this.read(c, d1) * g1 + this.read(c, d2) * g2;
      }
      this.w++;
    }
    if (this.w > 1e9) this.w &= this.mask;
    return true;
  }
}

class ScratchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.L = null;
    this.R = null;
    this.srcRate = sampleRate;
    this.active = false;
    this.x = 0; // position in source samples
    this.v = 0; // velocity in source samples per output sample
    this.target = 0;
    this.gain = 0;
    this.lastReport = 0;
    this.omega = 2 * Math.PI * 14; // spring stiffness → how tightly the record follows the hand
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'buffer') {
        this.L = m.left;
        this.R = m.right;
        this.srcRate = m.sampleRate;
        this.active = false;
      } else if (m.type === 'start') {
        this.x = m.pos * this.srcRate;
        this.target = this.x;
        this.v = (m.velocity || 0) * (this.srcRate / sampleRate);
        this.active = true;
      } else if (m.type === 'target') {
        this.target = m.pos * this.srcRate;
      } else if (m.type === 'stop') {
        this.active = false;
        this.port.postMessage({ type: 'pos', pos: this.x / this.srcRate, final: true });
      } else if (m.type === 'clear') {
        this.L = this.R = null;
        this.active = false;
      }
    };
  }

  sample(arr, x) {
    const n = arr.length;
    const i = Math.floor(x);
    if (i < 1 || i >= n - 2) return 0;
    const f = x - i;
    const y0 = arr[i - 1];
    const y1 = arr[i];
    const y2 = arr[i + 1];
    const y3 = arr[i + 2];
    // Catmull-Rom cubic interpolation
    return y1 + 0.5 * f * (y2 - y0 + f * (2 * y0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - y0)));
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const n = out[0].length;
    const L = this.L;
    const R = this.R || this.L;
    const dt = 1 / sampleRate;
    const w = this.omega;
    for (let s = 0; s < n; s++) {
      const targetGain = this.active && L ? 1 : 0;
      this.gain += (targetGain - this.gain) * 0.01; // ~2 ms fade in/out, no clicks
      if (this.gain < 1e-4 && !this.active) {
        for (let c = 0; c < out.length; c++) out[c][s] = 0;
        continue;
      }
      // critically damped spring towards the hand position (units: source samples)
      const err = this.target - this.x;
      const acc = w * w * err - 2 * w * this.v * sampleRate;
      this.v += (acc * dt) / sampleRate;
      // cap at 4x speed, like a fast hand on a real platter
      const vmax = (4 * this.srcRate) / sampleRate;
      if (this.v > vmax) this.v = vmax;
      if (this.v < -vmax) this.v = -vmax;
      this.x += this.v;
      if (L) {
        if (this.x < 0) this.x = 0;
        if (this.x > L.length - 3) this.x = L.length - 3;
        const l = this.sample(L, this.x) * this.gain;
        const r = this.sample(R, this.x) * this.gain;
        out[0][s] = l;
        if (out.length > 1) out[1][s] = r;
      }
    }
    if (this.active && currentTime - this.lastReport > 0.03) {
      this.lastReport = currentTime;
      this.port.postMessage({ type: 'pos', pos: this.x / this.srcRate });
    }
    return true;
  }
}

registerProcessor('mixplay-pitch', PitchProcessor);
registerProcessor('mixplay-scratch', ScratchProcessor);
