import { useEffect, useState } from 'react';
import { Save, Sparkles, SlidersHorizontal, Drum, Grid3x3, Rocket, ListMusic, Check, Loader2, AlertTriangle, CircleDot, Play, Pause } from 'lucide-react';
import { useApp, type StudioPanel } from '../../state/store';
import { saveProject, renameProject } from '../../state/actions';
import { engine } from '../../audio/engine';
import { DeckPanel } from './Deck';
import { Mixer } from './Mixer';
import { FxPanel } from './FxPanel';
import { Sequencer } from '../beats/Sequencer';
import { Pads } from '../beats/Pads';
import { BuildDrop } from '../build/BuildDrop';
import { Timeline } from '../timeline/Timeline';
import { AssistantPanel } from '../assistant/Assistant';
import { useEngineVersion, useMediaQuery } from '../../ui/hooks';
import { hotCuePress } from '../../state/deckActions';
import { Range } from '../../ui/Range';
import type { DeckId } from '../../project/types';

const PANELS: { id: StudioPanel; label: string; icon: typeof Drum }[] = [
  { id: 'fx', label: 'Effects', icon: SlidersHorizontal },
  { id: 'beats', label: 'Beats', icon: Drum },
  { id: 'pads', label: 'Pads', icon: Grid3x3 },
  { id: 'build', label: 'Build & Drop', icon: Rocket },
  { id: 'timeline', label: 'Timeline', icon: ListMusic },
];

export function SaveIndicator() {
  const st = useApp((s) => s.saveState);
  const err = useApp((s) => s.saveError);
  const map = {
    saved: { icon: <Check size={14} />, text: 'Saved', cls: 'ok-text' },
    saving: { icon: <Loader2 size={14} className="spin" />, text: 'Saving…', cls: 'muted' },
    unsaved: { icon: <CircleDot size={14} />, text: 'Unsaved changes', cls: 'warn-text' },
    new: { icon: <CircleDot size={14} />, text: 'Not saved yet', cls: 'warn-text' },
    error: { icon: <AlertTriangle size={14} />, text: 'Save failed', cls: 'danger-text' },
  }[st];
  return (
    <span className={`save-ind small ${map.cls}`} title={err ?? undefined} data-testid="save-state">
      {map.icon} {map.text}
    </span>
  );
}

function ProjectName() {
  const project = useApp((s) => s.project);
  const [editing, setEditing] = useState(false);
  return editing ? (
    <input
      className="input proj-name-input"
      autoFocus
      defaultValue={project.name}
      aria-label="Mix name"
      onBlur={(e) => {
        renameProject(project.id, e.target.value);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  ) : (
    <button className="proj-name" onClick={() => setEditing(true)} data-tip="Rename this mix" data-tip-pos="bottom">
      {project.name}
    </button>
  );
}

export function ModeSwitch() {
  const mode = useApp((s) => s.settings.mode);
  const update = useApp((s) => s.updateSettings);
  return (
    <div className="seg" role="group" aria-label="Interface mode">
      <button aria-pressed={mode === 'play'} onClick={() => update((s) => void (s.mode = 'play'))} data-tip="Play mode: the essentials, with friendly explanations" data-tip-pos="bottom" data-testid="mode-play">
        Play
      </button>
      <button aria-pressed={mode === 'pro'} onClick={() => update((s) => void (s.mode = 'pro'))} data-tip="Pro mode: trim, 8 hot cues, manual loops, beat repeat, headphone cue and more" data-tip-pos="bottom" data-testid="mode-pro">
        Pro
      </button>
    </div>
  );
}

/** Always-visible compact transport for small screens. */
function MobileTransport() {
  useEngineVersion();
  const x = useApp((s) => s.project.mixer.crossfader);
  const mutate = useApp((s) => s.mutate);
  const btn = (id: DeckId) => {
    const d = engine.ctx ? engine.decks[id] : null;
    return (
      <button
        className={`btn icon-btn play-mini deck-${id.toLowerCase()}`}
        disabled={d?.status !== 'ready'}
        aria-label={d?.playing ? `Pause deck ${id}` : `Play deck ${id}`}
        onClick={async () => {
          await engine.resume();
          d?.toggle();
        }}
      >
        {d?.playing ? <Pause /> : <Play />}
      </button>
    );
  };
  return (
    <div className="mobile-transport">
      {btn('A')}
      <Range label="Crossfader" value={x} min={-1} max={1} step={0.01} center onChange={(v) => mutate((p) => void (p.mixer.crossfader = v))} />
      {btn('B')}
    </div>
  );
}

function useStudioKeys() {
  const enabled = useApp((s) => s.settings.keyboard);
  useEffect(() => {
    if (!enabled) return;
    const down = new Set<string>();
    const onDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable], [role="slider"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!engine.ctx) return;
      const k = e.key.toLowerCase();
      if (down.has(k)) return;
      down.add(k);
      const A = engine.decks.A;
      const B = engine.decks.B;
      const map: Record<string, () => void> = {
        f: () => A.toggle(),
        j: () => B.toggle(),
        d: () => A.cueDown(),
        k: () => B.cueDown(),
        '1': () => hotCuePress('A', 0),
        '2': () => hotCuePress('A', 1),
        '3': () => hotCuePress('A', 2),
        '4': () => hotCuePress('A', 3),
        '7': () => hotCuePress('B', 0),
        '8': () => hotCuePress('B', 1),
        '9': () => hotCuePress('B', 2),
        '0': () => hotCuePress('B', 3),
        s: () => useApp.getState().mutate((p) => void (p.mixer.crossfader = Math.max(-1, p.mixer.crossfader - 0.1))),
        l: () => useApp.getState().mutate((p) => void (p.mixer.crossfader = Math.min(1, p.mixer.crossfader + 0.1))),
      };
      const fn = map[k];
      if (fn) {
        e.preventDefault();
        engine.resume();
        fn();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      down.delete(k);
      if (!engine.ctx) return;
      if (k === 'd') engine.decks.A.cueUp();
      if (k === 'k') engine.decks.B.cueUp();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [enabled]);
}

export function Studio() {
  const panel = useApp((s) => s.studioPanel);
  const setPanel = useApp((s) => s.setPanel);
  const assistantOpen = useApp((s) => s.assistantOpen);
  const setAssistant = useApp((s) => s.setAssistantOpen);
  const mobileView = useApp((s) => s.mobileView);
  const setMobileView = useApp((s) => s.setMobileView);
  const mode = useApp((s) => s.settings.mode);
  const narrow = useMediaQuery('(max-width: 980px)');
  const wideEnoughForSide = useMediaQuery('(min-width: 1480px)');
  useStudioKeys();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveProject();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!engine.ctx && engine.unsupportedReason) {
    return (
      <div className="page">
        <div className="empty" role="alert">
          <AlertTriangle />
          {engine.unsupportedReason} Try a recent version of Chrome, Edge, Firefox or Safari.
        </div>
      </div>
    );
  }

  return (
    <div className={`studio mode-${mode}${assistantOpen && wideEnoughForSide ? ' with-side' : ''}`} data-testid="studio">
      <div className="studio-bar">
        <ProjectName />
        <SaveIndicator />
        <button className="btn sm" onClick={() => saveProject()} data-testid="save-btn">
          <Save /> Save
        </button>
        <span className="spacer" />
        <ModeSwitch />
        <button className={`btn sm${assistantOpen ? ' on' : ''}`} aria-pressed={assistantOpen} onClick={() => setAssistant(!assistantOpen)} data-testid="assistant-toggle">
          <Sparkles /> Assistant
        </button>
      </div>

      <div className="studio-main">
        <div className="studio-core">
          {narrow ? (
            <>
              <div className="seg mobile-tabs" role="tablist" aria-label="Studio view">
                {(['A', 'mixer', 'B'] as const).map((v) => (
                  <button key={v} role="tab" aria-selected={mobileView === v} aria-pressed={mobileView === v} onClick={() => setMobileView(v)}>
                    {v === 'mixer' ? 'Mixer' : `Deck ${v}`}
                  </button>
                ))}
              </div>
              <div className="decks-row single">
                {mobileView === 'A' && <DeckPanel id="A" />}
                {mobileView === 'mixer' && <Mixer />}
                {mobileView === 'B' && <DeckPanel id="B" />}
              </div>
              <MobileTransport />
            </>
          ) : (
            <div className="decks-row">
              <DeckPanel id="A" />
              <Mixer />
              <DeckPanel id="B" />
            </div>
          )}

          <div className="dock">
            <div className="dock-tabs" role="tablist" aria-label="Creative panels">
              {PANELS.map((p) => (
                <button key={p.id} role="tab" aria-selected={panel === p.id} className={`dock-tab${panel === p.id ? ' on' : ''}`} onClick={() => setPanel(p.id)} data-testid={`tab-${p.id}`}>
                  <p.icon size={15} /> {p.label}
                </button>
              ))}
            </div>
            <div className="dock-body" role="tabpanel">
              {panel === 'fx' && <FxPanel />}
              {panel === 'beats' && <Sequencer />}
              {panel === 'pads' && <Pads />}
              {panel === 'build' && <BuildDrop />}
              {panel === 'timeline' && <Timeline />}
            </div>
          </div>
        </div>
        {assistantOpen && (
          <aside className={`studio-side${wideEnoughForSide ? '' : ' overlay'}`} aria-label="Creative assistant">
            <AssistantPanel compact />
          </aside>
        )}
      </div>
    </div>
  );
}
