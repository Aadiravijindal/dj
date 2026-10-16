/**
 * Glue between the project store and the audio engine. User-facing actions
 * live here so components stay thin and every action reports success or
 * failure honestly.
 */
import { engine } from '../audio/engine';
import { useApp, toast } from './store';
import type { DeckId, Project } from '../project/types';
import { DECK_IDS } from '../project/types';
import { createProject, normalizeProject, uid } from '../project/defaults';
import { repository, StorageError } from '../project/storage';
import { SAMPLE_PROJECTS } from '../project/samples';
import { getTrackMeta, requestPlayback } from '../catalog/registry';
import { PlaybackError } from '../catalog/types';
import { midi } from '../midi/midi';

const get = () => useApp.getState();

// ------------------------------------------------------------ engine sync

/** Push every engine-relevant part of the project into the engine. */
export function applyAllToEngine(p: Project = get().project) {
  if (!engine.ctx) return;
  engine.applyMixer(p.mixer);
  for (const id of DECK_IDS) {
    engine.applyFx(id, p.fx[id]);
    const d = engine.decks[id];
    d.setTempo(p.decks[id].tempo);
    d.setKeyLock(p.decks[id].keyLock);
    d.setKeyShift(p.decks[id].keyShift);
    d.cuePoint = p.decks[id].cue;
    d.quantize = p.decks[id].quantize;
  }
  engine.applyBeats(p.beats);
  engine.setPadVolume(p.pads.volume);
}

let started = false;

export function startEngineSync() {
  if (started) return;
  started = true;
  if (!engine.init()) return;
  applyAllToEngine();

  useApp.subscribe((s, prev) => {
    const p = s.project;
    const q = prev.project;
    if (p === q) return;
    if (p.mixer !== q.mixer) engine.applyMixer(p.mixer);
    for (const id of DECK_IDS) {
      if (p.fx[id] !== q.fx[id]) engine.applyFx(id, p.fx[id]);
      const d = p.decks[id];
      const e = engine.decks[id];
      if (d.tempo !== q.decks[id].tempo) e.setTempo(d.tempo);
      if (d.keyLock !== q.decks[id].keyLock) e.setKeyLock(d.keyLock);
      if (d.keyShift !== q.decks[id].keyShift) e.setKeyShift(d.keyShift);
      if (d.quantize !== q.decks[id].quantize) e.quantize = d.quantize;
      if (d.cue !== q.decks[id].cue) e.cuePoint = d.cue;
    }
    if (p.beats !== q.beats) engine.applyBeats(p.beats);
    if (p.pads.volume !== q.pads.volume) engine.setPadVolume(p.pads.volume);
  });

  // engine → project (cue points / loops set from the decks themselves)
  engine.onDeckEvent((id, e) => {
    if (e.type === 'cue') {
      get().mutate((p) => {
        p.decks[id].cue = e.time;
      });
    } else if (e.type === 'loop') {
      if (engine.decks[id].isRolling) return;
      get().mutate((p) => {
        p.decks[id].loop = e.loop ? { ...e.loop } : null;
        p.decks[id].loopActive = e.active;
      });
    }
  });

  // autosave
  let timer: ReturnType<typeof setTimeout> | null = null;
  useApp.subscribe((s, prev) => {
    if (s.project === prev.project || !s.settings.autosave || s.saveState !== 'unsaved') return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (get().saveState === 'unsaved') saveProject({ quiet: true });
    }, 1500);
  });

  // restore headphone cue routing and the MIDI controller from preferences
  const st = get().settings;
  if (st.cueMode === 'split') engine.setCueMode('split');
  if (st.midiEnabled) midi.enable();

  // resume audio on the first user gesture (browser autoplay policy)
  const unlock = () => {
    engine.resume();
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
}

// ---------------------------------------------------------------- tracks

const loadSeq: Record<DeckId, number> = { A: 0, B: 0 };

export async function loadTrack(
  deckId: DeckId,
  trackId: string,
  restore?: { position: number; loop: Project['decks']['A']['loop']; loopActive: boolean },
): Promise<boolean> {
  if (!engine.init()) {
    toast('error', engine.unsupportedReason ?? 'Audio is not available in this browser.');
    return false;
  }
  const deck = engine.decks[deckId];
  const seq = ++loadSeq[deckId];
  const meta = await getTrackMeta(trackId);
  if (!meta) {
    const msg = trackId.startsWith('local:')
      ? 'This mix used a file from your device that is not loaded in this session. Add it again in the Music Library.'
      : `Track "${trackId}" is no longer available from its catalog.`;
    deck.setError(msg);
    if (!restore) toast('error', msg);
    return false;
  }
  deck.setLoading(meta);
  if (!restore) {
    get().mutate((p) => {
      const d = p.decks[deckId];
      if (d.trackId !== trackId) {
        d.trackId = trackId;
        d.hotCues = Array(8).fill(null);
        d.loop = null;
        d.loopActive = false;
        d.savedLoops = [];
        d.cue = meta.firstBeat;
        d.position = 0;
      }
    });
  }
  try {
    const grant = await requestPlayback(trackId, (pr) => deck.setProgress(pr));
    if (seq !== loadSeq[deckId]) return false; // a newer load replaced this one
    deck.load(grant.meta, grant.pcm, grant.analysis);
    const ds = get().project.decks[deckId];
    deck.setTempo(ds.tempo);
    deck.cuePoint = ds.cue;
    deck.quantize = ds.quantize;
    if (restore) {
      if (restore.loop) deck.setLoop(restore.loop, restore.loopActive);
      if (restore.position > 0) deck.seek(restore.position);
    } else if (ds.cue > 0) deck.seek(ds.cue);
    get().updateSettings((s) => {
      s.recentTracks = [trackId, ...s.recentTracks.filter((t) => t !== trackId)].slice(0, 12);
    });
    return true;
  } catch (e) {
    if (seq !== loadSeq[deckId]) return false;
    const msg = e instanceof PlaybackError ? e.message : `Couldn't load "${meta.title}": ${(e as Error).message}`;
    deck.setError(msg);
    toast('error', msg);
    return false;
  }
}

export function ejectDeck(deckId: DeckId) {
  engine.decks[deckId].eject();
  get().mutate((p) => {
    p.decks[deckId].trackId = null;
    p.decks[deckId].loop = null;
    p.decks[deckId].loopActive = false;
  });
}

// --------------------------------------------------------------- projects

function captureRuntime() {
  if (!engine.ctx) return;
  get().mutate((p) => {
    for (const id of DECK_IDS) {
      const d = engine.decks[id];
      if (d.status === 'ready' && d.meta?.id === p.decks[id].trackId) p.decks[id].position = Math.round(d.getPosition() * 1000) / 1000;
    }
  });
}

/** Count of explicit (non-auto) saves — used by onboarding to confirm the user saved. */
export let manualSaves = 0;

export function saveProject(opts: { quiet?: boolean } = {}): boolean {
  captureRuntime();
  const s = get();
  s.setSaveState('saving');
  try {
    repository.save(s.project);
    s.setSaveState('saved');
    s.refreshProjects();
    s.updateSettings((st) => {
      st.lastProjectId = s.project.id;
    });
    if (!opts.quiet) {
      manualSaves++;
      toast('success', `Saved “${s.project.name}”.`);
    }
    return true;
  } catch (e) {
    const msg = e instanceof StorageError ? e.message : `Save failed: ${(e as Error).message}`;
    s.setSaveState('error', msg);
    toast('error', msg);
    return false;
  }
}

/** Stop everything that's playing before switching projects. */
function stopAll() {
  if (!engine.ctx) return;
  for (const id of DECK_IDS) engine.decks[id].pause();
  engine.sequencer.stop();
  engine.sampler.stopAll();
}

export async function openProject(p: Project, saved: boolean) {
  stopAll();
  p = { ...p, openedAt: Date.now() };
  get().replaceProject(p, saved);
  applyAllToEngine(p);
  if (saved) {
    try {
      repository.save(p);
    } catch {
      /* opening still works without updating the timestamp */
    }
    get().refreshProjects();
    get().updateSettings((s) => {
      s.lastProjectId = p.id;
    });
  }
  const loads: Promise<boolean>[] = [];
  for (const id of DECK_IDS) {
    const d = p.decks[id];
    if (d.trackId) loads.push(loadTrack(id, d.trackId, { position: d.position, loop: d.loop, loopActive: d.loopActive }));
    else engine.decks[id]?.eject();
  }
  const results = await Promise.all(loads);
  if (results.some((r) => !r)) toast('info', 'Some tracks in this mix are unavailable — the rest of your settings were restored.');
}

export function openProjectById(id: string) {
  const p = repository.get(id);
  if (!p) {
    toast('error', 'That mix could not be found. It may have been deleted on this device.');
    get().refreshProjects();
    return false;
  }
  openProject(p, true);
  get().go('studio');
  return true;
}

export function newProject(name = 'Untitled mix') {
  const p = createProject(name);
  openProject(p, false);
  saveProject({ quiet: true });
  get().go('studio');
  toast('success', `Created “${name}”.`);
}

export function openSample(key: string) {
  const s = SAMPLE_PROJECTS.find((x) => x.key === key);
  if (!s) return;
  const p = s.make();
  openProject(p, false);
  saveProject({ quiet: true });
  get().go('studio');
}

export function renameProject(id: string, name: string) {
  const clean = name.trim().slice(0, 80);
  if (!clean) {
    toast('error', 'A mix needs a name.');
    return;
  }
  if (get().project.id === id) {
    get().mutate((p) => {
      p.name = clean;
    });
    if (get().saveState !== 'new') saveProject({ quiet: true });
  } else {
    const p = repository.get(id);
    if (!p) return;
    p.name = clean;
    try {
      repository.save(p);
    } catch (e) {
      toast('error', (e as Error).message);
    }
    get().refreshProjects();
  }
}

export function duplicateProject(id: string) {
  const src = get().project.id === id ? get().project : repository.get(id);
  if (!src) return;
  const copy = normalizeProject(JSON.parse(JSON.stringify(src)))!;
  copy.id = uid('mix-');
  copy.name = `${src.name} (copy)`;
  copy.createdAt = copy.updatedAt = copy.openedAt = Date.now();
  copy.favorite = false;
  try {
    repository.save(copy);
    get().refreshProjects();
    toast('success', `Duplicated as “${copy.name}”.`);
  } catch (e) {
    toast('error', (e as Error).message);
  }
}

export function deleteProject(id: string) {
  repository.remove(id);
  get().refreshProjects();
  if (get().project.id === id) {
    stopAll();
    for (const d of DECK_IDS) engine.ctx && engine.decks[d].eject();
    get().replaceProject(createProject('Untitled mix'), false);
    applyAllToEngine();
  }
  toast('success', 'Mix deleted.');
}

export function toggleFavorite(id: string) {
  if (get().project.id === id) {
    get().mutate((p) => {
      p.favorite = !p.favorite;
    });
    if (get().saveState !== 'new') saveProject({ quiet: true });
    return;
  }
  const p = repository.get(id);
  if (!p) return;
  p.favorite = !p.favorite;
  repository.save(p);
  get().refreshProjects();
}

export function exportProject(p: Project) {
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${p.name.replace(/[^\w\- ]+/g, '').trim() || 'mix'}.mixplay.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importProjectFile(file: File) {
  try {
    if (file.size > 2_000_000) throw new Error('File is too large to be a MIXPLAY project.');
    const p = normalizeProject(JSON.parse(await file.text()));
    if (!p) throw new Error('This file is not a MIXPLAY project.');
    p.id = uid('mix-');
    p.openedAt = Date.now();
    repository.save(p);
    get().refreshProjects();
    toast('success', `Imported “${p.name}”.`);
  } catch (e) {
    toast('error', `Import failed: ${(e as Error).message}`);
  }
}

/** Restore the last project on startup (or keep the fresh one). */
export function restoreLastSession() {
  const id = get().settings.lastProjectId;
  if (!id) return;
  const p = repository.get(id);
  if (p) openProject(p, true);
}

export function recordSound(id: string) {
  get().updateSettings((s) => {
    s.recentSounds = [id, ...s.recentSounds.filter((x) => x !== id)].slice(0, 12);
  });
}
