/** Shared, observable cache of real analysis results keyed by track id. */
import type { TrackAnalysis } from '../audio/analysis';

const cache = new Map<string, TrackAnalysis>();
const listeners = new Set<() => void>();
let version = 0;

export const analysisCache = {
  get: (id: string) => cache.get(id) ?? null,
  set(id: string, a: TrackAnalysis) {
    cache.set(id, a);
    version++;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  version: () => version,
};
