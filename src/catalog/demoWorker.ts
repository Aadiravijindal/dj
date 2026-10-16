/// <reference lib="webworker" />
/**
 * Renders original demo tracks off the main thread so the studio UI and the
 * audio engine never stutter while a track is being prepared. Renders are
 * cached in IndexedDB, so each track is synthesised only once per browser.
 */
import { renderTrack } from '../audio/synth/composer';
import { analyse } from '../audio/analysis';
import { DEMO_TRACKS } from './demoTracks';
import { getRender, putRender, toFloat32, toInt16 } from './pcmCache';

export interface RenderRequest {
  reqId: number;
  local: string;
  sampleRate: number;
  /** prefetch: render and cache only, don't send audio back */
  prefetch?: boolean;
}

const queue: RenderRequest[] = [];
let busy = false;

async function work(req: RenderRequest) {
  const { reqId, local, sampleRate, prefetch } = req;
  const entry = DEMO_TRACKS.find((t) => t.local === local);
  if (!entry) {
    self.postMessage({ reqId, type: 'error', message: `Unknown demo track "${local}"` });
    return;
  }
  try {
    const cached = await getRender(local, sampleRate);
    if (cached) {
      if (prefetch) {
        self.postMessage({ reqId, type: 'cached' });
        return;
      }
      const left = toFloat32(cached.left);
      const right = toFloat32(cached.right);
      const w = cached.analysis.waveform;
      self.postMessage({ reqId, type: 'done', sampleRate: cached.sampleRate, left, right, analysis: cached.analysis, fromCache: true }, [
        left.buffer,
        right.buffer,
        w.peak.buffer,
        w.low.buffer,
        w.mid.buffer,
        w.high.buffer,
      ] as Transferable[]);
      return;
    }
    let last = 0;
    const r = renderTrack(entry.recipe, sampleRate, (p) => {
      if (!prefetch && p - last > 0.05) {
        last = p;
        self.postMessage({ reqId, type: 'progress', progress: p * 0.95 });
      }
    });
    const a = analyse(r.left, r.right, r.sampleRate, entry.recipe.bpm, 0);
    // cache first (structured clone copies), then transfer the originals
    await putRender(local, sampleRate, { sampleRate: r.sampleRate, left: toInt16(r.left), right: toInt16(r.right), analysis: a });
    if (prefetch) {
      self.postMessage({ reqId, type: 'cached' });
      return;
    }
    const w = a.waveform;
    self.postMessage({ reqId, type: 'done', sampleRate: r.sampleRate, left: r.left, right: r.right, analysis: a }, [
      r.left.buffer,
      r.right.buffer,
      w.peak.buffer,
      w.low.buffer,
      w.mid.buffer,
      w.high.buffer,
    ] as Transferable[]);
  } catch (err) {
    self.postMessage({ reqId, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
}

async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    // real requests jump ahead of background prefetches
    const i = queue.findIndex((q) => !q.prefetch);
    const next = queue.splice(i >= 0 ? i : 0, 1)[0];
    await work(next);
  }
  busy = false;
}

self.onmessage = (e: MessageEvent<RenderRequest>) => {
  queue.push(e.data);
  pump();
};
