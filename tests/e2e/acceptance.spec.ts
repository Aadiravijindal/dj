import { test, expect } from '@playwright/test';
import { openDemoMix, waitReady, level, bandDb, evalEngine, store, skipOnboarding } from './helpers';

test.describe('MIXPLAY acceptance', () => {
  test('1 · first mix: load two demo tracks and hear both', async ({ page }) => {
    await openDemoMix(page);
    await expect(page.getByTestId('coach')).toBeVisible();
    await page.getByTestId('play-A').click();
    await page.getByTestId('crossfader').fill('0');
    await page.getByTestId('play-B').click();
    await expect.poll(() => evalEngine(page, 'e.decks.A.playing && e.decks.B.playing')).toBe(true);
    expect(await level(page, 'A')).toBeGreaterThan(0.05);
    expect(await level(page, 'B')).toBeGreaterThan(0.05);
    expect(await level(page, 'master')).toBeGreaterThan(0.05);
    // the onboarding checklist ticks off real actions
    await expect(page.getByTestId('coach-step-2')).toHaveClass(/done/);
  });

  test('2 · mixing: crossfader and volume change the audible balance', async ({ page }) => {
    await openDemoMix(page);
    await page.getByTestId('play-A').click();
    await page.getByTestId('play-B').click();
    await page.getByTestId('crossfader').fill('-1');
    await page.waitForTimeout(300);
    expect(await level(page, 'A')).toBeGreaterThan(0.05);
    expect(await level(page, 'B')).toBeLessThan(0.005);
    await page.getByTestId('crossfader').fill('1');
    await page.waitForTimeout(300);
    expect(await level(page, 'A')).toBeLessThan(0.005);
    expect(await level(page, 'B')).toBeGreaterThan(0.05);
    // channel fader
    await page.getByTestId('volume-B').fill('0.2');
    await page.waitForTimeout(300);
    const quiet = await level(page, 'B');
    await page.getByTestId('volume-B').fill('1');
    await page.waitForTimeout(300);
    const loud = await level(page, 'B');
    expect(loud).toBeGreaterThan(quiet * 4);
  });

  test('3 · effects: filters audibly change the sound, and can be switched off', async ({ page }) => {
    await openDemoMix(page);
    await page.getByTestId('play-A').click();
    // jump into the Drop, where the full arrangement is playing
    await evalEngine(page, 'e.decks.A.seek(50)');
    await page.waitForTimeout(400);
    const bassBefore = await bandDb(page, 'A', 40, 250);
    const highsBefore = await bandDb(page, 'A', 3000, 10000);
    // high-pass: the kick and bassline disappear
    await page.getByTestId('fx-filter-A').fill('0.9');
    await page.waitForTimeout(400);
    expect(await bandDb(page, 'A', 40, 250)).toBeLessThan(bassBefore - 30);
    // low-pass: the hats and sparkle disappear
    await page.getByTestId('fx-filter-A').fill('-0.9');
    await page.waitForTimeout(400);
    const highsFiltered = await bandDb(page, 'A', 3000, 10000);
    expect(highsFiltered).toBeLessThan(highsBefore - 30);
    // switch the effect off: the highs come back
    await page.getByTestId('fx-toggle-filter-A').click();
    await page.waitForTimeout(400);
    expect(await store(page, 'project.fx.A.filter.enabled')).toBe(false);
    expect(await bandDb(page, 'A', 3000, 10000)).toBeGreaterThan(highsFiltered + 25);
    // echo on → toggles state and its send carries signal
    await page.getByTestId('fx-toggle-echo-A').click();
    expect(await store(page, 'project.fx.A.echo.enabled')).toBe(true);
  });

  test('4 · beat creation: program, hear and save a pattern', async ({ page }) => {
    await openDemoMix(page);
    await page.getByTestId('tab-beats').click();
    // add an extra kick and a vocal stab
    await page.getByTestId('step-0-2').click();
    await page.getByTestId('step-7-6').click();
    await page.getByTestId('seq-play').click();
    await expect.poll(() => evalEngine(page, 'e.sequencer.running')).toBe(true);
    expect(await level(page, 'master')).toBeGreaterThan(0.02);
    await page.getByTestId('save-btn').click();
    await expect(page.getByTestId('save-state')).toHaveText(/Saved/);
    const saved = await page.evaluate(() => {
      const id = (window as unknown as { __mixplayStore: { getState(): { project: { id: string } } } }).__mixplayStore.getState().project.id;
      return JSON.parse(localStorage.getItem(`mixplay.project.v1.${id}`)!);
    });
    const pat = saved.beats.patterns.find((p: { id: string }) => p.id === saved.beats.activePatternId);
    expect(pat.tracks[0].steps[2]).toBe(1);
    expect(pat.tracks[7].steps[6]).toBe(1);
  });

  test('5 · looping: the playhead stays inside a 1-beat loop', async ({ page }) => {
    await openDemoMix(page);
    await page.getByTestId('play-A').click();
    await page.waitForTimeout(600);
    await page.getByTestId('loop-A-1').click();
    const loop = await evalEngine<{ start: number; end: number }>(page, 'e.decks.A.loop');
    expect(loop.end - loop.start).toBeCloseTo(60 / 124, 2);
    const positions: number[] = [];
    for (let i = 0; i < 20; i++) {
      positions.push(await evalEngine<number>(page, 'e.decks.A.getPosition()'));
      await page.waitForTimeout(100);
    }
    for (const p of positions) {
      expect(p).toBeGreaterThanOrEqual(loop.start - 0.01);
      expect(p).toBeLessThan(loop.end + 0.01);
    }
    // it actually wrapped around (repeated) rather than standing still
    expect(Math.max(...positions) - Math.min(...positions)).toBeGreaterThan(0.2);
    await page.getByTestId('loop-toggle-A').click();
    await page.waitForTimeout(1200);
    expect(await evalEngine<number>(page, 'e.decks.A.getPosition()')).toBeGreaterThan(loop.end);
  });

  test('6 · AI assistance: actionable build-up suggestion with preview, apply and dismiss', async ({ page }) => {
    await openDemoMix(page);
    await page.getByTestId('play-A').click();
    await page.getByTestId('assistant-toggle').click();
    await expect(page.getByTestId('assistant-demo-badge')).toBeVisible();
    await page.getByTestId('assistant-input').fill('Help me create a dramatic build-up before the next track.');
    await page.getByTestId('assistant-input').press('Enter');
    const cards = page.getByTestId('suggestion');
    await expect(cards).toHaveCount(3);
    const filterCard = cards.filter({ hasText: 'Hands-on filter rise' });
    // nothing changed yet
    expect(await store(page, 'project.fx.A.filter.enabled')).toBe(false);
    // preview → applies temporarily → revert restores
    await filterCard.getByTestId('sugg-preview').click();
    await expect.poll(() => store(page, 'project.fx.A.filter.enabled')).toBe(true);
    await filterCard.getByRole('button', { name: 'Revert' }).click();
    await expect.poll(() => store(page, 'project.fx.A.filter.enabled')).toBe(false);
    // apply explicitly
    await filterCard.getByTestId('sugg-apply').click();
    expect(await store(page, 'project.fx.A.filter.enabled')).toBe(true);
    expect(await store(page, 'project.fx.A.filter.amount')).toBeCloseTo(0.6);
    // user can still modify it manually
    await page.getByTestId('fx-filter-A').fill('0.2');
    expect(await store(page, 'project.fx.A.filter.amount')).toBeCloseTo(0.2);
    // dismiss another card without changing anything
    const before = await store(page, 'project.build');
    await cards.filter({ hasText: 'riser and impact' }).getByTestId('sugg-dismiss').click();
    await expect(cards).toHaveCount(2);
    expect(await store(page, 'project.build')).toEqual(before);
  });

  test('7 · persistence: save, leave, reopen restores the mix', async ({ page }) => {
    await openDemoMix(page);
    await page.getByTestId('play-A').click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /Set hot cue 1/ }).first().click();
    await page.locator('.fx-panel').getByRole('button', { name: 'Deck B' }).click();
    await page.getByTestId('fx-filter-B').fill('-0.5');
    await page.getByTestId('volume-A').fill('0.6');
    await page.getByTestId('save-btn').click();
    await expect(page.getByTestId('save-state')).toHaveText(/Saved/);
    const hot = (await store(page, 'project.decks.A.hotCues')) as (number | null)[];
    expect(hot[0]).not.toBeNull();
    // leave the studio and reload the whole app
    await page.getByTestId('nav-home').click();
    await page.reload();
    await page.getByTestId('nav-mixes').click();
    await page.getByTestId('mix-card').filter({ hasText: 'Sunset House Blend' }).getByRole('button', { name: 'Open', exact: true }).click();
    await waitReady(page, 'A');
    await waitReady(page, 'B');
    expect(await evalEngine(page, 'e.decks.A.meta.id')).toBe('demo:neon-tide');
    expect(await store(page, 'project.decks.A.hotCues.0')).toBeCloseTo(hot[0]!);
    expect(await store(page, 'project.fx.B.filter.amount')).toBeCloseTo(-0.5);
    expect(await store(page, 'project.mixer.channels.A.volume')).toBeCloseTo(0.6);
    await expect(page.getByRole('button', { name: /Hot cue 1 at/ }).first()).toBeVisible();
  });

  test('8 · missing credentials: demo mode is clearly labelled and the app works', async ({ page, request }) => {
    const status = await (await request.get('/api/status')).json();
    expect(status.ai.configured).toBe(false);
    expect((await request.post('/api/assistant', { data: { messages: [{ role: 'user', content: 'hi' }], context: '' } })).status()).toBe(503);
    await skipOnboarding(page);
    await page.getByTestId('nav-settings').click();
    await expect(page.getByText('Demo assistant active — not connected to an AI model.')).toBeVisible();
    await page.getByTestId('nav-library').click();
    await expect(page.getByText('You’re using the MIXPLAY Demo Catalog.')).toBeVisible();
    await page.getByTestId('nav-assistant').click();
    await expect(page.getByTestId('assistant-demo-badge')).toBeVisible();
    await page.getByTestId('assistant-input').fill('What does a low-pass filter do?');
    await page.getByTestId('assistant-input').press('Enter');
    await expect(page.getByText('Demo assistant (rule-based, not an AI model)')).toBeVisible();
  });

  test('9 · failure handling: an unavailable track shows a message without breaking the studio', async ({ page }) => {
    await skipOnboarding(page);
    // a saved mix that references a local file from another session + a valid demo track
    await page.evaluate(() => {
      const p = { id: 'mix-broken', name: 'Broken refs', decks: { A: { trackId: 'local:gone-123' }, B: { trackId: 'demo:paper-satellites' } } };
      localStorage.setItem('mixplay.project.v1.mix-broken', JSON.stringify(p));
      localStorage.setItem('mixplay.projects.v1', JSON.stringify([{ id: 'mix-broken', name: 'Broken refs', createdAt: 1, updatedAt: 1, openedAt: Date.now(), favorite: false, trackIds: [] }]));
    });
    await page.reload();
    await page.getByTestId('nav-mixes').click();
    await page.getByRole('button', { name: 'Open Broken refs' }).click();
    await expect(page.getByTestId('deck-A').getByRole('alert')).toContainText('not loaded in this session');
    await waitReady(page, 'B');
    await page.getByTestId('play-B').click();
    await page.getByTestId('crossfader').fill('1');
    expect(await level(page, 'B')).toBeGreaterThan(0.05);
    // an assistant service failure falls back to the labelled demo, not a crash
    await page.route('/api/status', (r) => r.fulfill({ json: { ai: { configured: true, model: 'test-model' } } }));
    await page.route('/api/assistant', (r) => r.fulfill({ status: 502, json: { error: 'Could not reach the AI service.' } }));
    await page.reload();
    await page.getByTestId('nav-assistant').click();
    await page.getByTestId('assistant-input').fill('make it darker');
    await page.getByTestId('assistant-input').press('Enter');
    await expect(page.getByText(/the AI service failed: Could not reach the AI service/)).toBeVisible();
  });

  test('10 · responsive: phone layout keeps the critical controls usable', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.getByTestId('onboard-new').click();
    await page.getByTestId('onboard-open-demo').click();
    await waitReady(page, 'A');
    await expect(page.getByRole('tab', { name: 'Deck A' })).toBeVisible();
    await page.getByTestId('play-A').click();
    await expect.poll(() => evalEngine(page, 'e.decks.A.playing')).toBe(true);
    await page.getByRole('tab', { name: 'Mixer' }).click();
    await expect(page.getByTestId('crossfader')).toBeVisible();
    await expect(page.getByTestId('nav-library')).toBeVisible();
    for (const r of ['studio', 'home', 'library', 'beats', 'mixes', 'settings']) {
      await page.getByTestId(`nav-${r}`).click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `horizontal overflow on ${r}`).toBeLessThanOrEqual(1);
    }
    await ctx.close();
  });
});
