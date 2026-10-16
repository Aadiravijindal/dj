/**
 * Project persistence. The app talks to a `ProjectRepository`; this build
 * ships a browser-storage implementation. A server-backed implementation
 * (e.g. PostgreSQL behind an authenticated API — see docs/ARCHITECTURE.md)
 * can be dropped in without touching the UI.
 *
 * Only creative settings and track *references* are stored — never audio.
 */
import type { Project, ProjectSummary } from './types';
import { normalizeProject } from './defaults';

export interface ProjectRepository {
  list(): ProjectSummary[];
  get(id: string): Project | null;
  save(p: Project): void;
  remove(id: string): void;
}

export class StorageError extends Error {}

const INDEX_KEY = 'mixplay.projects.v1';
const PROJECT_KEY = (id: string) => `mixplay.project.v1.${id}`;

export function summarize(p: Project): ProjectSummary {
  const ids = new Set<string>();
  for (const d of [p.decks.A, p.decks.B]) if (d.trackId) ids.add(d.trackId);
  for (const a of p.timeline.arrangements) for (const i of a.items) ids.add(i.trackId);
  return { id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, openedAt: p.openedAt, favorite: p.favorite, trackIds: [...ids] };
}

export class LocalProjectRepository implements ProjectRepository {
  constructor(private storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null) {}

  private readIndex(): ProjectSummary[] {
    if (!this.storage) return [];
    try {
      const raw = this.storage.getItem(INDEX_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((s) => s && typeof s.id === 'string') : [];
    } catch {
      return [];
    }
  }

  private writeIndex(list: ProjectSummary[]) {
    this.write(INDEX_KEY, JSON.stringify(list));
  }

  private write(key: string, value: string) {
    if (!this.storage) throw new StorageError('Browser storage is unavailable (private browsing or blocked site data). Your mix cannot be saved on this device.');
    try {
      this.storage.setItem(key, value);
    } catch (e) {
      const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
      throw new StorageError(quota ? 'Browser storage is full. Delete some old mixes and try again.' : `Could not save: ${(e as Error).message}`);
    }
  }

  list() {
    return this.readIndex().sort((a, b) => b.openedAt - a.openedAt);
  }

  get(id: string): Project | null {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(PROJECT_KEY(id));
      return raw ? normalizeProject(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  save(p: Project) {
    this.write(PROJECT_KEY(p.id), JSON.stringify(p));
    const idx = this.readIndex().filter((s) => s.id !== p.id);
    idx.push(summarize(p));
    this.writeIndex(idx);
  }

  remove(id: string) {
    if (!this.storage) return;
    this.storage.removeItem(PROJECT_KEY(id));
    this.writeIndex(this.readIndex().filter((s) => s.id !== id));
  }
}

export const repository: ProjectRepository = new LocalProjectRepository();

// ---- app-wide (non-project) preferences -----------------------------------

export interface AppSettings {
  mode: 'play' | 'pro';
  onboarded: boolean;
  experience: 'new' | 'experienced' | null;
  savedTracks: string[];
  recentTracks: string[];
  recentSounds: string[];
  lastProjectId: string | null;
  autosave: boolean;
  cueDeviceId: string | null;
  cueMode: 'off' | 'split' | 'device';
  midiEnabled: boolean;
  /** MIDI message key ("cc:1:7" / "note:1:36") → action id */
  midiMap: Record<string, string>;
  tips: boolean;
  keyboard: boolean;
  completedLessons: string[];
}

export const defaultSettings = (): AppSettings => ({
  mode: 'play',
  onboarded: false,
  experience: null,
  savedTracks: [],
  recentTracks: [],
  recentSounds: [],
  lastProjectId: null,
  autosave: true,
  cueDeviceId: null,
  cueMode: 'off',
  midiEnabled: false,
  midiMap: {},
  tips: true,
  keyboard: true,
  completedLessons: [],
});

const SETTINGS_KEY = 'mixplay.settings.v1';

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return { ...defaultSettings(), ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: AppSettings): boolean {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function clearAllData() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('mixplay.')) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable */
  }
}
