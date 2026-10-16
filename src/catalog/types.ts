/**
 * Catalog provider abstraction. The DJ Studio only ever talks to this
 * interface, so a properly licensed commercial catalog can be connected later
 * without redesigning the studio.
 */
import type { TrackAnalysis } from '../audio/analysis';

export type ProviderKind = 'demo' | 'local' | 'licensed';

export type BpmSource = 'composed' | 'provider' | 'estimated';

export interface Artwork {
  kind: 'generated';
  hues: [number, number];
  pattern: 'rings' | 'grid' | 'waves' | 'sun' | 'stripes' | 'dots';
}

export interface TrackMeta {
  /** globally unique: `${providerId}:${localId}` */
  id: string;
  providerId: string;
  title: string;
  artist: string;
  album?: string;
  genre: string;
  durationSec: number | null;
  bpm: number | null;
  bpmSource: BpmSource | null;
  key: string | null;
  /** seconds to the first downbeat of the beat grid */
  firstBeat: number;
  artwork: Artwork | null;
  license: string;
  mood?: string;
  energy?: 'chill' | 'steady' | 'peak';
}

export type Availability =
  | { status: 'playable' }
  | { status: 'unavailable'; reason: string };

export interface PcmSource {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
}

export interface PlaybackGrant {
  meta: TrackMeta;
  pcm: PcmSource;
  analysis: TrackAnalysis;
}

export interface ProviderStatus {
  connected: boolean;
  label: string;
  detail: string;
  /** what the provider legally allows inside MIXPLAY */
  permissions: { mix: boolean; effects: boolean; loopAndSample: boolean; saveReferences: boolean };
}

export interface SearchFilters {
  genre?: string;
  bpmMin?: number;
  bpmMax?: number;
}

export interface CatalogProvider {
  id: string;
  name: string;
  kind: ProviderKind;
  status(): ProviderStatus;
  search(query: string, filters?: SearchFilters): Promise<TrackMeta[]>;
  getTrack(id: string): Promise<TrackMeta | null>;
  checkAvailability(id: string): Promise<Availability>;
  /** Request authorised playback. Resolves with decoded PCM ready for the engine. */
  requestPlayback(id: string, onProgress?: (p: number) => void): Promise<PlaybackGrant>;
}

export class PlaybackError extends Error {
  constructor(message: string, public readonly code: 'unavailable' | 'failed' | 'not-found') {
    super(message);
  }
}
