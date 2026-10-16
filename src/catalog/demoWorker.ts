/// <reference lib="webworker" />
/**
 * Renders original demo tracks off the main thread so the studio UI and the
 * audio engine never stutter while a track is being prepared.
 */
import { renderTrack } from '../audio/synth/composer';
import { analyse } from '../audio/analysis';
import { DEMO_TRACKS } from './demoTracks';

export interface RenderRequest {
  reqId: number;
  local: string;
  sampleRate: number;
}

self.onmessage = (e: MessageEvent<RenderRequest>) => {
  const { reqId, local, sampleRate } = e.data;
  const entry = DEMO_TRACKS.find((t) => t.local === local);
  if (!entry) {
    self.postMessage({ reqId, type: 'error', message: `Unknown demo track "${local}"` });
    return;
  }
  try {
    let last = 0;
    const r = renderTrack(entry.recipe, sampleRate, (p) => {
      if (p - last > 0.05) {
        last = p;
        self.postMessage({ reqId, type: 'progress', progress: p * 0.95 });
      }
    });
    const a = analyse(r.left, r.right, r.sampleRate, entry.recipe.bpm, 0);
    const w = a.waveform;
    self.postMessage(
      {
        reqId,
        type: 'done',
        sampleRate: r.sampleRate,
        left: r.left,
        right: r.right,
        analysis: a,
      },
      [r.left.buffer, r.right.buffer, w.peak.buffer, w.low.buffer, w.mid.buffer, w.high.buffer] as Transferable[],
    );
  } catch (err) {
    self.postMessage({ reqId, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
