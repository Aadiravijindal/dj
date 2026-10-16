/**
 * Build & Drop performance scheduler. The user designs the build-up (which
 * elements, when, how intense) and presses Perform; this module schedules
 * exactly those elements against the deck's beat grid. It never chooses
 * music or decides when the drop happens on its own.
 */
import { engine } from './engine';
import { noiseRiser } from './synth/sounds';
import type { BuildSettings, BuildEvent } from '../project/types';

export interface BuildRun {
  startTime: number;
  dropTime: number;
  beatSec: number;
  totalBeats: number;
  cancel: () => void;
  dropNow: () => void;
  done: Promise<'dropped' | 'cancelled'>;
}

export type BuildError = { error: string };

const TAG = 'build';

/** Simple counters so Learn DJing can confirm a build-up was performed. */
export const buildStats = { performed: 0, dropped: 0 };

export function performBuild(build: BuildSettings): BuildRun | BuildError {
  const ctx = engine.ctx;
  if (!ctx) return { error: 'Audio is not running yet — press play on a deck first.' };
  const deck = engine.decks[build.deck];
  const channel = engine.channels[build.deck];
  if (!deck.playing || !deck.effectiveBpm) return { error: `Start Deck ${build.deck} first — the build-up locks to its beat.` };
  if (build.events.length === 0) return { error: 'Add at least one element to the build-up, or load a template.' };
  const beatSec = 60 / deck.effectiveBpm;
  const totalBeats = build.bars * 4;
  const startTime = deck.nextBeatTime(4) ?? deck.nextBeatTime(1) ?? ctx.currentTime + 0.1;
  const dropTime = startTime + totalBeats * beatSec;
  const at = (beat: number) => startTime + beat * beatSec;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (time: number, fn: () => void) => {
    timers.push(setTimeout(fn, Math.max(0, (time - ctx.currentTime) * 1000)));
  };
  const dest = engine.padBus;
  let resolveDone: (v: 'dropped' | 'cancelled') => void = () => {};
  const done = new Promise<'dropped' | 'cancelled'>((r) => (resolveDone = r));
  let finished = false;

  const schedule = (ev: BuildEvent) => {
    const t0 = at(ev.start);
    const len = Math.max(0, ev.length) * beatSec;
    const k = ev.intensity;
    switch (ev.lane) {
      case 'roll': {
        let b = ev.start;
        const end = ev.start + ev.length;
        while (b < end - 1e-6) {
          const prog = (b - ev.start) / Math.max(0.001, ev.length);
          const div = prog < 0.25 ? 1 : prog < 0.5 ? 0.5 : prog < 0.75 ? 0.25 : 0.125;
          engine.sampler.trigger('snare-tight', { when: at(b), volume: (0.25 + 0.6 * prog) * (0.4 + 0.6 * k), destination: dest, tag: TAG });
          b += div;
        }
        break;
      }
      case 'riser': {
        const st = noiseRiser(ctx.sampleRate, len, true);
        const buf = ctx.createBuffer(2, st.l.length, ctx.sampleRate);
        buf.copyToChannel(st.l as Float32Array<ArrayBuffer>, 0);
        buf.copyToChannel(st.r as Float32Array<ArrayBuffer>, 1);
        engine.sampler.playBuffer(buf, { when: t0, volume: 0.3 + 0.6 * k, destination: dest, tag: TAG });
        break;
      }
      case 'filter':
        channel.fx.automateFilter(0, 0.35 + 0.55 * k, t0, len);
        break;
      case 'echo':
        later(t0, () => channel.fx.automateEcho(0.25 + 0.5 * k, 0.4 + 0.35 * k, ctx.currentTime, len));
        break;
      case 'loop': {
        const steps = [4, 2, 1, 0.5];
        steps.forEach((beats, i) => {
          later(at(ev.start + (ev.length * i) / steps.length), () => {
            if (i > 0) deck.rollEnd();
            deck.rollStart(Math.max(0.25, beats * (k < 0.5 ? 2 : 1)));
          });
        });
        break;
      }
      case 'perc': {
        for (let b = ev.start; b < ev.start + ev.length - 1e-6; b += 0.5) {
          engine.sampler.trigger(b % 1 === 0 ? 'perc-conga' : 'perc-shaker', { when: at(b), volume: 0.3 + 0.5 * k, destination: dest, tag: TAG });
        }
        break;
      }
      case 'silence':
        channel.duck(dropTime - Math.max(0.25, ev.length) * beatSec, dropTime);
        break;
      case 'impact':
        engine.sampler.trigger('impact-boom', { when: dropTime, volume: 0.5 + 0.5 * k, destination: dest, tag: TAG + '-drop' });
        break;
      case 'bass':
        engine.sampler.trigger(k > 0.6 ? 'bass-subdrop' : 'bass-808', { when: dropTime, volume: 0.5 + 0.5 * k, destination: dest, tag: TAG + '-drop' });
        break;
    }
  };
  for (const ev of build.events) schedule(ev);
  buildStats.performed++;

  const finish = (how: 'dropped' | 'cancelled') => {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    if (deck.isRolling) deck.rollEnd();
    channel.fx.release();
    if (how === 'cancelled') {
      engine.sampler.stopTag(TAG);
      engine.sampler.stopTag(TAG + '-drop');
      channel.unduck();
    }
    if (how === 'dropped') buildStats.dropped++;
    resolveDone(how);
  };
  later(dropTime, () => finish('dropped'));

  return {
    startTime,
    dropTime,
    beatSec,
    totalBeats,
    done,
    cancel: () => finish('cancelled'),
    dropNow: () => {
      // the performer decides the drop is now: cut the build and fire the drop hits
      engine.sampler.stopTag(TAG);
      engine.sampler.stopTag(TAG + '-drop');
      const now = ctx.currentTime;
      channel.unduck();
      for (const ev of build.events) {
        if (ev.lane === 'impact') engine.sampler.trigger('impact-boom', { when: now, volume: 0.5 + 0.5 * ev.intensity, destination: dest });
        if (ev.lane === 'bass') engine.sampler.trigger(ev.intensity > 0.6 ? 'bass-subdrop' : 'bass-808', { when: now, volume: 0.5 + 0.5 * ev.intensity, destination: dest });
      }
      finish('dropped');
    },
  };
}
