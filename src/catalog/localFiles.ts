/**
 * Optional development/fallback provider: audio files the user chooses from
 * their own device. Kept separate from the main catalog experience. Files stay
 * in memory for this browser session only — they are never uploaded and never
 * written into project files.
 */
import type { CatalogProvider, PlaybackGrant, TrackMeta, SearchFilters, Availability, ProviderStatus } from './types';
import { PlaybackError } from './types';
import { analyse, estimateBpm } from '../audio/analysis';
import { analysisCache } from './analysisCache';
import { matches } from './demoCatalog';

export const LOCAL_PROVIDER_ID = 'local';
const MAX_BYTES = 80 * 1024 * 1024;

export class LocalFilesProvider implements CatalogProvider {
  id = LOCAL_PROVIDER_ID;
  name = 'Files on this device';
  kind = 'local' as const;
  private tracks = new Map<string, PlaybackGrant>();
  private listeners = new Set<() => void>();

  status(): ProviderStatus {
    return {
      connected: true,
      label: 'Session only',
      detail: 'Files you add are decoded in your browser for this session. Use only audio you have the rights to use.',
      permissions: { mix: true, effects: true, loopAndSample: true, saveReferences: false },
    };
  }

  subscribe(l: () => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  all() {
    return [...this.tracks.values()].map((g) => g.meta);
  }

  async importFile(file: File): Promise<TrackMeta> {
    if (file.size > MAX_BYTES) throw new PlaybackError(`"${file.name}" is larger than 80 MB.`, 'failed');
    if (file.type && !file.type.startsWith('audio/')) throw new PlaybackError(`"${file.name}" is not an audio file.`, 'failed');
    const bytes = await file.arrayBuffer();
    let audio: AudioBuffer;
    try {
      const ctx = new OfflineAudioContext(2, 1, 44100);
      audio = await ctx.decodeAudioData(bytes);
    } catch {
      throw new PlaybackError(`Your browser couldn't decode "${file.name}". Try MP3, WAV, OGG or M4A.`, 'failed');
    }
    const left = audio.getChannelData(0).slice();
    const right = (audio.numberOfChannels > 1 ? audio.getChannelData(1) : audio.getChannelData(0)).slice();
    const est = estimateBpm(left, audio.sampleRate);
    const id = `${LOCAL_PROVIDER_ID}:${crypto.randomUUID()}`;
    const base = file.name.replace(/\.[^.]+$/, '');
    const [artist, title] = base.includes(' - ') ? base.split(' - ', 2) : ['Unknown artist', base];
    const meta: TrackMeta = {
      id,
      providerId: LOCAL_PROVIDER_ID,
      title: title.trim(),
      artist: artist.trim(),
      genre: 'Local file',
      durationSec: Math.round(audio.duration * 100) / 100,
      bpm: est?.bpm ?? null,
      bpmSource: est ? 'estimated' : null,
      key: null,
      firstBeat: 0,
      artwork: null,
      license: 'Your own file. You are responsible for having the rights to use it.',
    };
    const analysis = analyse(left, right, audio.sampleRate, meta.bpm, 0);
    analysisCache.set(id, analysis);
    this.tracks.set(id, { meta, pcm: { sampleRate: audio.sampleRate, left, right }, analysis });
    this.listeners.forEach((l) => l());
    return meta;
  }

  async search(query: string, filters?: SearchFilters) {
    return this.all().filter((m) => matches(m, query, filters));
  }
  async getTrack(id: string) {
    return this.tracks.get(id)?.meta ?? null;
  }
  async checkAvailability(id: string): Promise<Availability> {
    return this.tracks.has(id)
      ? { status: 'playable' }
      : { status: 'unavailable', reason: 'Local files are only available in the browser session where they were added. Add the file again to use it.' };
  }
  async requestPlayback(id: string, onProgress?: (p: number) => void) {
    const g = this.tracks.get(id);
    if (!g) throw new PlaybackError('This local file is no longer loaded. Add it again from the Music Library.', 'unavailable');
    onProgress?.(1);
    return g;
  }
}
