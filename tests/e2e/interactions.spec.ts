import { test, expect } from '@playwright/test';
import { openDemoMix, waitReady, level, evalEngine, store } from './helpers';

test.describe('performance interactions', () => {
  test('sync matches tempo and aligns beats (126 → 128 BPM)', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('onboarding-skip').click();
    await page.getByTestId('sample-warehouse-techno').click();
    await waitReady(page, 'A');
    await waitReady(page, 'B');
    await page.getByTestId('play-A').click();
    await page.getByTestId('play-B').click();
    await page.getByTestId('sync-B').click();
    const bpms = await evalEngine<[number, number]>(page, '[e.decks.A.effectiveBpm, e.decks.B.effectiveBpm]');
    expect(Math.abs(bpms[0] - bpms[1])).toBeLessThan(0.02);
    expect(await store(page, 'project.decks.B.tempo')).toBeCloseTo(-1.56, 1);
    const phase = await evalEngine<number>(page, '(() => { let d = e.decks.A.phaseAt(e.decks.A.getPosition()) - e.decks.B.phaseAt(e.decks.B.getPosition()); return Math.abs(d - Math.round(d)); })()');
    expect(phase).toBeLessThan(0.05);
  });

  test('jog wheel scratching moves the record backwards and forwards', async ({ page }) => {
    await openDemoMix(page);
    await evalEngine(page, 'e.decks.A.seek(20)');
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
    await expect.poll(() => evalEngine(page, 'e.decks.A.scratching')).toBe(true);
    const start = await evalEngine<number>(page, 'e.decks.A.getPosition()');
    // drag a quarter-turn counter-clockwise (backwards)
    for (let a = 0; a <= 90; a += 10) {
      const rad = (-a * Math.PI) / 180;
      await page.mouse.move(cx + r * Math.cos(rad), cy + r * Math.sin(rad));
      await page.waitForTimeout(16);
    }
    expect(await evalEngine<boolean>(page, 'e.decks.A.scratching')).toBe(true);
    const back = await evalEngine<number>(page, 'e.decks.A.getPosition()');
    expect(back).toBeLessThan(start - 0.2);
    await page.mouse.up();
    // the record plays on after release
    await expect.poll(() => evalEngine(page, 'e.decks.A.playing && !e.decks.A.scratching')).toBe(true);
  });

  test('pads trigger sounds and tempo loops can be stopped', async ({ page }) => {
    await openDemoMix(page);
    await page.getByTestId('tab-pads').click();
    await page.getByTestId('pad-7').dispatchEvent('pointerdown');
    expect(await level(page, 'master')).toBeGreaterThan(0.02);
    await page.getByTestId('pad-12').dispatchEvent('pointerdown');
    await expect.poll(() => evalEngine(page, "e.sampler.isPlaying('loop-drums')")).toBe(true);
    await page.getByTestId('pad-12').dispatchEvent('pointerdown');
    await expect.poll(() => evalEngine(page, "e.sampler.isPlaying('loop-drums')")).toBe(false);
  });

  test('build & drop performs on the beat and the performer can drop early', async ({ page }) => {
    await openDemoMix(page);
    await page.getByTestId('play-A').click();
    await page.getByTestId('tab-build').click();
    await page.getByTestId('build-perform').click();
    await expect(page.getByRole('button', { name: 'Drop now' })).toBeVisible();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Drop now' }).click();
    await expect(page.getByRole('button', { name: /Perform build-up/ })).toBeVisible();
    // automation released: filter back to the user's setting
    expect(await evalEngine<number>(page, 'e.channels.A.fx.hp.frequency.value')).toBeLessThan(50);
    expect(await level(page, 'A')).toBeGreaterThan(0.05);
  });

  test('switching Play/Pro changes the interface but not the mix', async ({ page }) => {
    await openDemoMix(page);
    await expect(page.getByTestId('deck-A').getByRole('button', { name: /hot cue/i })).toHaveCount(4);
    const before = JSON.stringify(await store(page, 'project.mixer'));
    await page.getByTestId('mode-pro').click();
    await expect(page.getByTestId('deck-A').getByRole('button', { name: /hot cue/i })).toHaveCount(8);
    await expect(page.getByTestId('strip-A').getByRole('slider', { name: 'Trim' })).toBeVisible();
    expect(JSON.stringify(await store(page, 'project.mixer'))).toBe(before);
    await page.getByTestId('mode-play').click();
    await expect(page.getByTestId('strip-A').getByRole('slider', { name: 'Trim' })).toHaveCount(0);
  });
});
