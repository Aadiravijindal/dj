import type { CatalogProvider, TrackMeta, SearchFilters, PlaybackGrant } from './types';
import { PlaybackError } from './types';
import { DemoCatalogProvider } from './demoCatalog';
import { LocalFilesProvider } from './localFiles';

export const demoCatalog = new DemoCatalogProvider();
export const localFiles = new LocalFilesProvider();

const providers: CatalogProvider[] = [demoCatalog, localFiles];

/**
 * Commercial catalogs MIXPLAY is designed to support once a licence and
 * credentials exist. These are listed for transparency only: none of them is
 * connected, and MIXPLAY never pretends otherwise.
 */
export const PLANNED_INTEGRATIONS = [
  {
    id: 'licensed-dj-catalog',
    name: 'Licensed DJ streaming catalog',
    requirement:
      'Requires a commercial agreement with a DJ-licensed streaming service that permits third-party mixing, effects and performance, plus server-side OAuth credentials.',
  },
  {
    id: 'label-direct',
    name: 'Label / distributor catalog',
    requirement: 'Requires a direct licence covering in-app manipulation, plus an API for authorised audio delivery.',
  },
];

export function providerFor(trackId: string): CatalogProvider | null {
  const pid = trackId.split(':')[0];
  return providers.find((p) => p.id === pid) ?? null;
}

export async function getTrackMeta(trackId: string): Promise<TrackMeta | null> {
  return (await providerFor(trackId)?.getTrack(trackId)) ?? null;
}

/** Synchronous lookup for UI rendering (demo + local are in memory). */
export function getTrackMetaSync(trackId: string): TrackMeta | null {
  return demoCatalog.all().find((m) => m.id === trackId) ?? localFiles.all().find((m) => m.id === trackId) ?? null;
}

export async function searchAll(query: string, filters?: SearchFilters) {
  const results = await Promise.all(providers.map((p) => p.search(query, filters).catch(() => [] as TrackMeta[])));
  return results.flat();
}

export async function requestPlayback(trackId: string, onProgress?: (p: number) => void): Promise<PlaybackGrant> {
  const p = providerFor(trackId);
  if (!p) throw new PlaybackError('No catalog is connected for this track.', 'unavailable');
  const avail = await p.checkAvailability(trackId);
  if (avail.status !== 'playable') throw new PlaybackError(avail.reason, 'unavailable');
  return p.requestPlayback(trackId, onProgress);
}

export { providers };
