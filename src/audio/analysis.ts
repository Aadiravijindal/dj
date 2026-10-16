/**
 * Real audio analysis computed from decoded/rendered PCM. Nothing here is
 * fabricated: if an analysis can't be performed, callers get `null`.
 */

export interface WaveformData {
  /** number of buckets */
  length: number;
  /** seconds represented by each bucket */
  bucketSeconds: number;
  /** peak amplitude per bucket, 0..1 */
  peak: Float32Array;
  /** relative band energy per bucket (0..1) for colouring */
  low: Float32Array;
  mid: Float32Array;
  high: Float32Array;
}

export interface TrackAnalysis {
  waveform: WaveformData;
  /** RMS energy per bar (0..1 normalised), only when a beat grid is known */
  energyPerBar: number[] | null;
  /** integrated RMS in dBFS */
  rmsDb: number;
  peakDb: number;
}

const BUCKETS_PER_SECOND = 100;

export function computeWaveform(left: Float32Array, right: Float32Array | null, sampleRate: number): WaveformData {
  const per = Math.max(1, Math.floor(sampleRate / BUCKETS_PER_SECOND));
  const len = Math.ceil(left.length / per);
  const peak = new Float32Array(len);
  const low = new Float32Array(len);
  const mid = new Float32Array(len);
  const high = new Float32Array(len);
  // crude 3-band split with one-pole filters (~200 Hz and ~2.5 kHz)
  const aLow = Math.exp((-2 * Math.PI * 200) / sampleRate);
  const aHigh = Math.exp((-2 * Math.PI * 2500) / sampleRate);
  let zl = 0;
  let zh = 0;
  for (let b = 0; b < len; b++) {
    let p = 0;
    let el = 0;
    let em = 0;
    let eh = 0;
    const end = Math.min(left.length, (b + 1) * per);
    for (let i = b * per; i < end; i++) {
      const x = right ? (left[i] + right[i]) * 0.5 : left[i];
      const ax = Math.abs(x);
      if (ax > p) p = ax;
      zl = x * (1 - aLow) + zl * aLow;
      zh = x * (1 - aHigh) + zh * aHigh;
      const lo = zl;
      const hi = x - zh;
      const md = zh - zl;
      el += lo * lo;
      em += md * md;
      eh += hi * hi;
    }
    peak[b] = p;
    const tot = el + em + eh || 1;
    low[b] = el / tot;
    mid[b] = em / tot;
    high[b] = eh / tot;
  }
  return { length: len, bucketSeconds: per / sampleRate, peak, low, mid, high };
}

export function computeEnergyPerBar(left: Float32Array, right: Float32Array | null, sampleRate: number, bpm: number, firstBeat = 0): number[] {
  const barLen = Math.round(((60 / bpm) * 4) * sampleRate);
  const start = Math.round(firstBeat * sampleRate);
  const out: number[] = [];
  for (let s = start; s + barLen <= left.length; s += barLen) {
    let sum = 0;
    for (let i = s; i < s + barLen; i += 4) {
      const x = right ? (left[i] + right[i]) * 0.5 : left[i];
      sum += x * x;
    }
    out.push(Math.sqrt(sum / (barLen / 4)));
  }
  const max = Math.max(...out, 1e-6);
  return out.map((v) => v / max);
}

export function levelStats(left: Float32Array, right: Float32Array | null) {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < left.length; i += 2) {
    const x = right ? (left[i] + right[i]) * 0.5 : left[i];
    sum += x * x;
    const a = Math.abs(x);
    if (a > peak) peak = a;
  }
  const rms = Math.sqrt(sum / Math.max(1, left.length / 2));
  return { rmsDb: 20 * Math.log10(rms || 1e-9), peakDb: 20 * Math.log10(peak || 1e-9) };
}

/**
 * Tempo estimate for audio without trusted metadata (e.g. a local file).
 * Onset-strength autocorrelation over 70–180 BPM. Results are labelled
 * "estimated" in the UI. Returns null when the signal is too weak/ambiguous.
 */
export function estimateBpm(left: Float32Array, sampleRate: number, maxSeconds = 60): { bpm: number; confidence: number } | null {
  const hop = 512;
  const n = Math.min(left.length, Math.round(maxSeconds * sampleRate));
  const frames = Math.floor(n / hop);
  if (frames < 200) return null;
  const env = new Float32Array(frames);
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) e += left[i] * left[i];
    e = Math.sqrt(e / hop);
    env[f] = Math.max(0, e - prev);
    prev = e;
  }
  const fps = sampleRate / hop;
  let best = 0;
  let bestLag = 0;
  let total = 0;
  let count = 0;
  const minLag = Math.floor((60 / 180) * fps);
  const maxLag = Math.ceil((60 / 70) * fps);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let f = 0; f + lag < frames; f++) s += env[f] * env[f + lag];
    total += s;
    count++;
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  if (!bestLag || total === 0) return null;
  // parabolic interpolation for sub-frame precision
  const ac = (lag: number) => {
    let s = 0;
    for (let f = 0; f + lag < frames; f++) s += env[f] * env[f + lag];
    return s;
  };
  const y0 = ac(bestLag - 1);
  const y2 = ac(bestLag + 1);
  const denom = y0 - 2 * best + y2;
  const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  let bpm = (60 * fps) / (bestLag + shift);
  while (bpm < 80) bpm *= 2;
  while (bpm > 175) bpm /= 2;
  const confidence = Math.min(1, best / (total / count) - 1);
  if (confidence < 0.1) return null;
  return { bpm: Math.round(bpm * 10) / 10, confidence };
}

export function analyse(left: Float32Array, right: Float32Array | null, sampleRate: number, bpm: number | null, firstBeat = 0): TrackAnalysis {
  const waveform = computeWaveform(left, right, sampleRate);
  const lv = levelStats(left, right);
  return {
    waveform,
    energyPerBar: bpm ? computeEnergyPerBar(left, right, sampleRate, bpm, firstBeat) : null,
    ...lv,
  };
}
