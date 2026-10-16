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

startEngineSync();
restoreLastSession();
// pre-render pad sounds in idle time so the first hit is instant
if (engine.ctx) engine.sampler.warm(['kick-club', 'clap-classic', 'hat-closed', 'hat-open', 'perc-shaker', 'snare-tight', ...DEFAULT_PADS]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
