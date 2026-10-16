import { test, expect, type Page } from '@playwright/test';
import { openDemoMix, waitReady, evalEngine, store, level } from './helpers';

const worklets = (page: Page) => expect.poll(() => evalEngine(page, 'e.workletsReady')).toBe(true);

test.describe('key lock, scratch, split cue, MIDI, render cache', () => {
  test('pitch-shift worklet transposes a tone without changing its duration', async ({ page }) => {
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const sr = 44100;
      const measure = async (ratio: number) => {
        const ctx = new OfflineAudioContext(2, sr, sr);
        await ctx.audioWorklet.addModule('/src/audio/worklets/processors.js');
        const osc = ctx.createOscillator();
        osc.frequency.value = 440;
        const node = new AudioWorkletNode(ctx, 'mixplay-pitch', { outputChannelCount: [2] });
        (node.parameters as unknown as Map<string, AudioParam>).get('ratio')!.value = ratio;
        osc.connect(node).connect(ctx.destination);
        osc.start();
        const out = (await ctx.startRendering()).getChannelData(0);
        // count rising zero crossings over the last 0.5 s (after start-up)
        let n = 0;
        for (let i = sr / 2; i < sr; i++) if (out[i - 1] < 0 && out[i] >= 0) n++;
        return n / 0.5;
      };
      return { unity: await measure(1), down: await measure(1 / 1.08), up: await measure(Math.pow(2, 2 / 12)) };
    });
    expect(result.unity).toBeCloseTo(440, -1);
    expect(Math.abs(result.down - 440 / 1.08)).toBeLessThan(6);
    expect(Math.abs(result.up - 440 * Math.pow(2, 2 / 12))).toBeLessThan(8);
  });

  test('key lock compensates tempo changes; key shift transposes', async ({ page }) => {
    await openDemoMix(page);
    await worklets(page);
    const ratio = () => evalEngine<number>(page, "e.decks.A.pitchNode.parameters.get('ratio').value");
    await page.getByTestId('play-A').click();
    expect(await store(page, 'project.decks.A.keyLock')).toBe(true);
    await evalEngine(page, "window.__mixplayStore.getState().mutate(p => { p.decks.A.tempo = 8 })");
    await expect.poll(ratio).toBeCloseTo(1 / 1.08, 3);
    // tempo really changed: the deck plays 8% faster
    expect(await evalEngine<number>(page, 'e.decks.A.effectiveBpm')).toBeCloseTo(124 * 1.08, 1);
    await page.getByTestId('keylock-A').click();
    await expect.poll(ratio).toBeCloseTo(1, 3);
    await page.getByTestId('mode-pro').click();
    await page.getByTestId('deck-A').getByRole('button', { name: 'Key up' }).click();
    await page.getByTestId('deck-A').getByRole('button', { name: 'Key up' }).click();
    await expect(page.getByTestId('keyshift-A')).toHaveText('+2');
    await expect.poll(ratio).toBeCloseTo(Math.pow(2, 2 / 12), 3);
    expect(await level(page, 'A')).toBeGreaterThan(0.05);
  });

  test('vinyl scratch is audible, reverses smoothly and resumes playback', async ({ page }) => {
    await openDemoMix(page);
    await worklets(page);
    await evalEngine(page, 'e.decks.A.seek(30)');
    await page.getByTestId('play-A').click();
    await page.getByTestId('deck-A').getByRole('button', { name: 'Scratch' }).click();
    await expect(page.getByTestId('deck-A').getByRole('button', { name: 'Scratch' })).toHaveAttribute('aria-pressed', 'true');
    const platter = page.getByTestId('deck-A').getByRole('slider', { name: /jog wheel/ });
    const box = (await platter.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const r = box.width * 0.4;
    await page.mouse.move(cx + r, cy);
    await page.mouse.down();
    const start = await evalEngine<number>(page, 'e.decks.A.getPosition()');
    let peak = 0;
    for (let a = 0; a <= 120; a += 6) {
      const rad = (-a * Math.PI) / 180;
      await page.mouse.move(cx + r * Math.cos(rad), cy + r * Math.sin(rad));
      await page.waitForTimeout(16);
      if (a % 30 === 0) peak = Math.max(peak, await evalEngine<number>(page, 'e.channels.A.peak()'));
    }
    await page.waitForTimeout(150);
    const back = await evalEngine<number>(page, 'e.decks.A.getPosition()');
    expect(back).toBeLessThan(start - 0.3);
    expect(peak).toBeGreaterThan(0.02);
    await page.mouse.up();
    await expect.poll(() => evalEngine(page, 'e.decks.A.playing && !e.decks.A.scratching')).toBe(true);
    const p1 = await evalEngine<number>(page, 'e.decks.A.getPosition()');
    await page.waitForTimeout(500);
    expect(await evalEngine<number>(page, 'e.decks.A.getPosition()')).toBeGreaterThan(p1 + 0.3);
  });

  test('split cue puts the master in the left ear and the cued deck in the right', async ({ page }) => {
    await openDemoMix(page);
    await page.getByTestId('play-A').click();
    await page.getByTestId('play-B').click();
    await page.getByTestId('crossfader').fill('-1'); // crowd hears only A
    await page.getByTestId('mode-pro').click();
    await page.getByRole('button', { name: 'Headphone cue deck B' }).click();
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('cue-mode-split').click();
    await expect.poll(() => store(page, 'settings.cueMode')).toBe('split');
    const ears = await page.evaluate(async () => {
      const e = (window as unknown as { __mixplay: { engine: Record<string, unknown> & { ctx: AudioContext } } }).__mixplay.engine;
      const ctx = e.ctx;
      const split = ctx.createChannelSplitter(2);
      (e.splitOut as AudioNode).connect(split);
      const an = [ctx.createAnalyser(), ctx.createAnalyser()];
      split.connect(an[0], 0);
      split.connect(an[1], 1);
      // B solo on the cue: mute A's cue tap is already off; measure correlation with each deck by muting
      const buf = new Float32Array(1024);
      const peak = (a: AnalyserNode) => {
        a.getFloatTimeDomainData(buf);
        return buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
      };
      let l = 0;
      let r = 0;
      for (let i = 0; i < 15; i++) {
        await new Promise((res) => setTimeout(res, 40));
        l = Math.max(l, peak(an[0]));
        r = Math.max(r, peak(an[1]));
      }
      return { l, r };
    });
    expect(ears.l).toBeGreaterThan(0.05);
    expect(ears.r).toBeGreaterThan(0.05);
    // turning B's cue off silences the right ear
    await page.getByTestId('nav-studio').click();
    await page.getByRole('button', { name: 'Headphone cue deck B' }).click();
    await page.waitForTimeout(300);
    const right = await page.evaluate(async () => {
      const e = (window as unknown as { __mixplay: { engine: Record<string, unknown> & { ctx: AudioContext } } }).__mixplay.engine;
      const split = e.ctx.createChannelSplitter(2);
      (e.splitOut as AudioNode).connect(split);
      const a = e.ctx.createAnalyser();
      split.connect(a, 1);
      const buf = new Float32Array(1024);
      let m = 0;
      for (let i = 0; i < 10; i++) {
        await new Promise((res) => setTimeout(res, 40));
        a.getFloatTimeDomainData(buf);
        m = Math.max(m, ...Array.from(buf, Math.abs));
      }
      return m;
    });
    expect(right).toBeLessThan(0.005);
  });

  test('MIDI controller: learn a fader and a button, then drive the mix', async ({ page }) => {
    await page.addInitScript(() => {
      const input = { id: 'virt-1', name: 'Virtual DJ Controller', onmidimessage: null as null | ((e: { data: Uint8Array }) => void) };
      const access = {
        inputs: new Map([['virt-1', input]]),
        outputs: new Map(),
        onstatechange: null,
      };
      (window as unknown as { __fakeMidi: unknown }).__fakeMidi = (bytes: number[]) => input.onmidimessage?.({ data: new Uint8Array(bytes) });
      Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access, configurable: true });
    });
    await openDemoMix(page);
    const send = (bytes: number[]) => page.evaluate((b) => (window as unknown as { __fakeMidi: (b: number[]) => void }).__fakeMidi(b), bytes);
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('midi-enable').click();
    await expect(page.getByText('Virtual DJ Controller')).toBeVisible();
    await page.getByTestId('learn-mixer.crossfader').click();
    await send([0xb0, 8, 64]);
    await page.getByTestId('learn-A.play').click();
    await send([0x90, 36, 127]);
    await send([0x80, 36, 0]);
    expect(await store(page, 'settings.midiMap')).toEqual({ 'cc:1:8': 'mixer.crossfader', 'note:1:36': 'A.play' });
    await send([0xb0, 8, 127]);
    expect(await store(page, 'project.mixer.crossfader')).toBeCloseTo(1, 2);
    await send([0xb0, 8, 0]);
    expect(await store(page, 'project.mixer.crossfader')).toBeCloseTo(-1, 2);
    await send([0x90, 36, 127]);
    await expect.poll(() => evalEngine(page, 'e.decks.A.playing')).toBe(true);
    await send([0x80, 36, 0]);
    await send([0x90, 36, 100]);
    await expect.poll(() => evalEngine(page, 'e.decks.A.playing')).toBe(false);
  });

  test('rendered tracks are cached: a reload loads them almost instantly', async ({ page }) => {
    await openDemoMix(page); // renders (or reuses) both tracks and stores them
    await page.waitForTimeout(1500); // let the cache write finish
    await page.reload();
    const t0 = Date.now();
    await page.getByTestId('nav-mixes').click();
    await page.getByTestId('mix-card').first().getByRole('button', { name: 'Open', exact: true }).click();
    await waitReady(page, 'A');
    await waitReady(page, 'B');
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});
