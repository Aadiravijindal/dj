import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Draft } from 'immer';
import type { DeckId, Project, ProjectSummary } from '../project/types';
import { createProject } from '../project/defaults';
import { loadSettings, saveSettings, repository, type AppSettings } from '../project/storage';

export type Route = 'home' | 'library' | 'studio' | 'mixes' | 'beats' | 'sounds' | 'learn' | 'assistant' | 'settings';
export const ROUTES: Route[] = ['home', 'library', 'studio', 'mixes', 'beats', 'sounds', 'learn', 'assistant', 'settings'];

export type StudioPanel = 'fx' | 'beats' | 'pads' | 'build' | 'timeline';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
  action?: { label: string; run: () => void };
}

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error' | 'new';

interface AppState {
  route: Route;
  settings: AppSettings;
  project: Project;
  saveState: SaveState;
  saveError: string | null;
  projects: ProjectSummary[];
  studioPanel: StudioPanel;
  assistantOpen: boolean;
  /** which deck the library should load into when opened from a deck */
  libraryTarget: DeckId | null;
  mobileView: 'A' | 'mixer' | 'B';
  toasts: Toast[];
  coachLesson: string | null;
  showOnboarding: boolean;

  go: (r: Route) => void;
  setPanel: (p: StudioPanel) => void;
  setAssistantOpen: (open: boolean) => void;
  setLibraryTarget: (d: DeckId | null) => void;
  setMobileView: (v: 'A' | 'mixer' | 'B') => void;
  updateSettings: (fn: (s: Draft<AppSettings>) => void) => void;
  /** Change the current project. Every creative edit goes through here. */
  mutate: (fn: (p: Draft<Project>) => void) => void;
  replaceProject: (p: Project, saved: boolean) => void;
  setSaveState: (s: SaveState, err?: string | null) => void;
  refreshProjects: () => void;
  toast: (kind: Toast['kind'], message: string, action?: Toast['action']) => void;
  dismissToast: (id: number) => void;
  setCoach: (lesson: string | null) => void;
  setShowOnboarding: (v: boolean) => void;
}

let toastId = 0;

const routeFromHash = (): Route => {
  if (typeof location === 'undefined') return 'home';
  const h = location.hash.replace(/^#\/?/, '').split('?')[0] as Route;
  return ROUTES.includes(h) ? h : 'home';
};

const initialSettings = loadSettings();

export const useApp = create<AppState>()(
  immer((set, get) => ({
    route: routeFromHash(),
    settings: initialSettings,
    project: createProject('My first mix'),
    saveState: 'new',
    saveError: null,
    projects: repository.list(),
    studioPanel: 'fx',
    assistantOpen: false,
    libraryTarget: null,
    mobileView: 'A',
    toasts: [],
    coachLesson: null,
    showOnboarding: !initialSettings.onboarded,

    go: (r) => {
      set((s) => {
        s.route = r;
      });
      if (typeof location !== 'undefined' && routeFromHash() !== r) location.hash = `/${r}`;
      if (typeof window !== 'undefined') window.scrollTo?.(0, 0);
    },
    setPanel: (p) =>
      set((s) => {
        s.studioPanel = p;
      }),
    setAssistantOpen: (open) =>
      set((s) => {
        s.assistantOpen = open;
      }),
    setLibraryTarget: (d) =>
      set((s) => {
        s.libraryTarget = d;
      }),
    setMobileView: (v) =>
      set((s) => {
        s.mobileView = v;
      }),
    updateSettings: (fn) => {
      set((s) => {
        fn(s.settings);
      });
      saveSettings(get().settings);
    },
    mutate: (fn) =>
      set((s) => {
        fn(s.project);
        s.project.updatedAt = Date.now();
        if (s.saveState !== 'new') s.saveState = 'unsaved';
      }),
    replaceProject: (p, saved) =>
      set((s) => {
        s.project = p;
        s.saveState = saved ? 'saved' : 'new';
        s.saveError = null;
      }),
    setSaveState: (st, err = null) =>
      set((s) => {
        s.saveState = st;
        s.saveError = err;
      }),
    refreshProjects: () =>
      set((s) => {
        s.projects = repository.list();
      }),
    toast: (kind, message, action) => {
      const id = ++toastId;
      set((s) => {
        s.toasts.push({ id, kind, message, action });
        if (s.toasts.length > 4) s.toasts.shift();
      });
      setTimeout(() => get().dismissToast(id), kind === 'error' ? 7000 : action ? 6000 : 3200);
    },
    dismissToast: (id) =>
      set((s) => {
        s.toasts = s.toasts.filter((t) => t.id !== id);
      }),
    setCoach: (lesson) =>
      set((s) => {
        s.coachLesson = lesson;
      }),
    setShowOnboarding: (v) =>
      set((s) => {
        s.showOnboarding = v;
      }),
  })),
);

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const r = routeFromHash();
    if (useApp.getState().route !== r) useApp.setState({ route: r });
  });
  (window as unknown as { __mixplayStore?: unknown }).__mixplayStore = useApp;
}

export const toast = (kind: Toast['kind'], message: string, action?: Toast['action']) => useApp.getState().toast(kind, message, action);
