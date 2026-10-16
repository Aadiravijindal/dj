import type { CatalogProvider, PlaybackGrant, TrackMeta, SearchFilters, Availability, ProviderStatus } from './types';
import { PlaybackError } from './types';
import { DEMO_TRACKS, DEMO_PROVIDER_ID, demoMeta } from './demoTracks';
import type { TrackAnalysis } from '../audio/analysis';
import { analysisCache } from './analysisCache';

const RENDER_RATE = 32000;
const MAX_CACHED = 3;

type Pending = { resolve: (g: PlaybackGrant) => void; reject: (e: Error) => void; onProgress?: (p: number) => void; meta: TrackMeta };

export function matches(meta: TrackMeta, query: string, filters?: SearchFilters) {
  const q = query.trim().toLowerCase();
  if (filters?.genre && meta.genre !== filters.genre) return false;
  if (filters?.bpmMin && (meta.bpm ?? 0) < filters.bpmMin) return false;
  if (filters?.bpmMax && (meta.bpm ?? 999) > filters.bpmMax) return false;
  if (!q) return true;
  const hay = [meta.title, meta.artist, meta.album, meta.genre, meta.key, meta.mood, meta.bpm?.toString()].join(' ').toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

export class DemoCatalogProvider implements CatalogProvider {
  id = DEMO_PROVIDER_ID;
  name = 'MIXPLAY Demo Catalog';
  kind = 'demo' as const;
  private metas = DEMO_TRACKS.map(demoMeta);
  private workers: Worker[] = [];
  private nextWorker = 0;
  private reqId = 0;
  private pending = new Map<number, Pending>();
  private inflight = new Map<string, Promise<PlaybackGrant>>();
  private cached = new Map<string, PlaybackGrant>();

  status(): ProviderStatus {
    return {
      connected: true,
      label: 'Demo catalog · always available',
      detail: `${this.metas.length} original tracks composed for MIXPLAY and rendered on your device. Exact BPM, key and beat grid.`,
      permissions: { mix: true, effects: true, loopAndSample: true, saveReferences: true },
    };
  }

  all() {
    return this.metas;
  }

  async search(query: string, filters?: SearchFilters) {
    return this.metas.filter((m) => matches(m, query, filters));
  }

  async getTrack(id: string) {
    return this.metas.find((m) => m.id === id) ?? null;
  }

  async checkAvailability(id: string): Promise<Availability> {
    return this.metas.some((m) => m.id === id)
      ? { status: 'playable' }
      : { status: 'unavailable', reason: 'This track is not part of the demo catalog.' };
  }

  private worker(index?: number) {
    if (this.workers.length === 0) {
      const n = Math.min(3, Math.max(1, (navigator.hardwareConcurrency ?? 2) - 1));
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('./demoWorker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e) => this.onMessage(e.data);
        w.onerror = (e) => {
          for (const [id, p] of this.pending) {
            p.reject(new PlaybackError(`Track renderer crashed: ${e.message}`, 'failed'));
            this.pending.delete(id);
          }
        };
        this.workers.push(w);
      }
    }
    if (index !== undefined) return this.workers[index % this.workers.length];
    // spread real requests away from the prefetch worker when there is more than one
    const w = this.workers.length > 1 ? this.workers[1 + (this.nextWorker % (this.workers.length - 1))] : this.workers[0];
    this.nextWorker++;
    return w;
  }

  /**
   * Render and cache tracks in the background (one worker, one at a time) so
   * they load instantly later. Already-cached tracks cost a quick lookup.
   */
  prefetch(ids: string[]) {
    if (typeof Worker === 'undefined') return;
    const w = this.worker(0);
    for (const id of ids) {
      if (!this.metas.some((m) => m.id === id) || this.prefetched.has(id)) continue;
      this.prefetched.add(id);
      w.postMessage({ reqId: ++this.reqId, local: id.slice(DEMO_PROVIDER_ID.length + 1), sampleRate: RENDER_RATE, prefetch: true });
    }
  }

  private prefetched = new Set<string>();

  private onMessage(msg: { reqId: number; type: string; progress?: number; message?: string; sampleRate?: number; left?: Float32Array; right?: Float32Array; analysis?: TrackAnalysis }) {
    const p = this.pending.get(msg.reqId);
    if (!p) return;
    if (msg.type === 'progress') p.onProgress?.(msg.progress ?? 0);
    else if (msg.type === 'error') {
      this.pending.delete(msg.reqId);
      p.reject(new PlaybackError(msg.message ?? 'Render failed', 'failed'));
    } else if (msg.type === 'done') {
      this.pending.delete(msg.reqId);
      const grant: PlaybackGrant = {
        meta: p.meta,
        pcm: { sampleRate: msg.sampleRate!, left: msg.left!, right: msg.right! },
        analysis: msg.analysis!,
      };
      analysisCache.set(p.meta.id, grant.analysis);
      this.cached.set(p.meta.id, grant);
      while (this.cached.size > MAX_CACHED) this.cached.delete(this.cached.keys().next().value!);
      p.onProgress?.(1);
      p.resolve(grant);
    }
  }

  requestPlayback(id: string, onProgress?: (p: number) => void): Promise<PlaybackGrant> {
    const hit = this.cached.get(id);
    if (hit) {
      onProgress?.(1);
      return Promise.resolve(hit);
    }
    const existing = this.inflight.get(id);
    if (existing) return existing;
    const meta = this.metas.find((m) => m.id === id);
    if (!meta) return Promise.reject(new PlaybackError('Track not found in the demo catalog.', 'not-found'));
    const local = id.slice(DEMO_PROVIDER_ID.length + 1);
    const promise = new Promise<PlaybackGrant>((resolve, reject) => {
      const reqId = ++this.reqId;
      this.pending.set(reqId, { resolve, reject, onProgress, meta });
      try {
        this.worker().postMessage({ reqId, local, sampleRate: RENDER_RATE });
      } catch (e) {
        this.pending.delete(reqId);
        reject(new PlaybackError(`Could not start the track renderer: ${(e as Error).message}`, 'failed'));
      }
    }).finally(() => this.inflight.delete(id));
    this.inflight.set(id, promise);
    return promise;
  }
}
