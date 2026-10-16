import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/studio.css';
import { App } from './App';
import { startEngineSync, restoreLastSession } from './state/actions';
import { engine } from './audio/engine';
import { DEFAULT_PADS } from './project/defaults';
import { demoCatalog } from './catalog/registry';
import { useApp } from './state/store';

startEngineSync();
restoreLastSession();
// pre-render pad sounds in idle time so the first hit is instant
if (engine.ctx) engine.sampler.warm(['kick-club', 'clap-classic', 'hat-closed', 'hat-open', 'perc-shaker', 'snare-tight', ...DEFAULT_PADS]);

// render and cache demo tracks in the background: the current mix first, then the catalog
setTimeout(() => {
  const p = useApp.getState().project;
  const first = [p.decks.A.trackId, p.decks.B.trackId, ...p.timeline.arrangements.flatMap((a) => a.items.map((i) => i.trackId))].filter(Boolean) as string[];
  demoCatalog.prefetch([...first, ...demoCatalog.all().map((m) => m.id)]);
}, 2500);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
