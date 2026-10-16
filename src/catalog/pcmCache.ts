/**
 * Persistent cache of rendered demo tracks (IndexedDB, works in workers).
 * Audio is stored as 16-bit PCM (~18 MB per track) with its analysis, so a
 * track only has to be synthesised once per browser. Bump CACHE_VERSION when
 * the composer changes so stale renders are ignored.
 */
import type { TrackAnalysis } from '../audio/analysis';

export const CACHE_VERSION = 1;
const DB = 'mixplay-audio';
const STORE = 'renders';

export interface CachedRender {
  sampleRate: number;
  left: Int16Array;
  right: Int16Array;
  analysis: TrackAnalysis;
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

const key = (local: string, sr: number) => `${local}@${sr}@v${CACHE_VERSION}`;

export async function getRender(local: string, sr: number): Promise<CachedRender | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key(local, sr));
      req.onsuccess = () => resolve((req.result as CachedRender) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function putRender(local: string, sr: number, r: CachedRender): Promise<boolean> {
  const db = await open();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(r, key(local, sr));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function clearRenders() {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export const toInt16 = (f: Float32Array) => {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const v = f[i];
    out[i] = v >= 1 ? 32767 : v <= -1 ? -32768 : Math.round(v * 32767);
  }
  return out;
};

export const toFloat32 = (i16: Int16Array) => {
  const out = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) out[i] = i16[i] / 32768;
  return out;
};
