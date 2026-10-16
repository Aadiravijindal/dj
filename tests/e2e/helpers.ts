import { expect, type Page } from '@playwright/test';

type Eng = {
  engine: {
    ctx: AudioContext;
    decks: Record<'A' | 'B', { status: string; playing: boolean; loop: { start: number; end: number } | null; loopActive: boolean; getPosition(): number; meta: { id: string } | null; error: string | null }>;
    channels: Record<'A' | 'B', { peak(): number; analyser: AnalyserNode }>;
    meters(): { A: number; B: number; master: number };
    sequencer: { running: boolean };
  };
};

export async function skipOnboarding(page: Page) {
  await page.goto('/');
  await page.getByTestId('onboarding-skip').click();
}

export async function openDemoMix(page: Page) {
  await page.goto('/');
  await page.getByTestId('onboard-new').click();
  await page.getByTestId('onboard-open-demo').click();
  await waitReady(page, 'A');
  await waitReady(page, 'B');
}

export async function waitReady(page: Page, id: 'A' | 'B') {
  await expect.poll(() => page.evaluate((d) => (window as unknown as { __mixplay: Eng }).__mixplay.engine.decks[d as 'A' | 'B'].status, id), { timeout: 45_000 }).toBe('ready');
}

export function evalEngine<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate((src) => {
    const e = (window as unknown as { __mixplay: Eng }).__mixplay.engine;
    return new Function('e', `return (${src})`)(e);
  }, fn) as Promise<T>;
}

/** Max peak over ~0.6 s for a channel ('A' | 'B' | 'master'). */
export async function level(page: Page, ch: 'A' | 'B' | 'master') {
  return page.evaluate(async (c) => {
    const e = (window as unknown as { __mixplay: Eng }).__mixplay.engine;
    let max = 0;
    for (let i = 0; i < 12; i++) {
      const m = e.meters();
      max = Math.max(max, m[c as 'A' | 'B' | 'master']);
      await new Promise((r) => setTimeout(r, 50));
    }
    return max;
  }, ch);
}

/** Mean power (dB) in a frequency band of a channel over ~1.5 s, measured with its analyser. */
export async function bandDb(page: Page, ch: 'A' | 'B', lo: number, hi: number) {
  return page.evaluate(async ([c, lo, hi]) => {
    const e = (window as unknown as { __mixplay: Eng }).__mixplay.engine;
    const an = e.channels[c as 'A' | 'B'].analyser;
    const bins = new Float32Array(an.frequencyBinCount);
    const binHz = e.ctx.sampleRate / an.fftSize;
    // the analyser's smoothing only advances per read, so disable it to measure the signal as it is now
    const smoothing = an.smoothingTimeConstant;
    an.smoothingTimeConstant = 0;
    let power = 0;
    let n = 0;
    for (let k = 0; k < 40; k++) {
      an.getFloatFrequencyData(bins);
      for (let i = Math.floor((lo as number) / binHz); i < Math.min(bins.length, (hi as number) / binHz); i++) {
        if (isFinite(bins[i])) power += Math.pow(10, bins[i] / 10);
        n++;
      }
      await new Promise((r) => setTimeout(r, 37));
    }
    an.smoothingTimeConstant = smoothing;
    return 10 * Math.log10(power / Math.max(1, n) + 1e-30);
  }, [ch, lo, hi] as const);
}

export const store = (page: Page, path: string) =>
  page.evaluate((p) => {
    const s = (window as unknown as { __mixplayStore: { getState(): unknown } }).__mixplayStore.getState();
    return p.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], s);
  }, path);
