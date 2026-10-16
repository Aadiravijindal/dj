import { useEffect } from 'react';
import { Home as HomeIcon, Library as LibIcon, Disc3, FolderOpen, Drum, AudioLines, GraduationCap, Sparkles, Settings as SettingsIcon } from 'lucide-react';
import { useApp, type Route } from './state/store';
import { Home } from './features/home/Home';
import { Library } from './features/library/Library';
import { Studio } from './features/studio/Studio';
import { MyMixes } from './features/mixes/MyMixes';
import { BeatPlayground } from './features/beats/BeatPlayground';
import { SoundLibrary } from './features/sounds/SoundLibrary';
import { Learn } from './features/learn/Learn';
import { Coach } from './features/learn/Coach';
import { AssistantPanel } from './features/assistant/Assistant';
import { Settings } from './features/settings/Settings';
import { Onboarding } from './features/onboarding/Onboarding';
import { Toasts } from './ui/Toasts';
import { ErrorBoundary } from './ui/ErrorBoundary';

const NAV: { id: Route; label: string; icon: typeof HomeIcon; short?: string }[] = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'studio', label: 'DJ Studio', icon: Disc3, short: 'Studio' },
  { id: 'library', label: 'Music Library', icon: LibIcon, short: 'Library' },
  { id: 'mixes', label: 'My Mixes', icon: FolderOpen, short: 'Mixes' },
  { id: 'beats', label: 'Beat Playground', icon: Drum, short: 'Beats' },
  { id: 'sounds', label: 'Sound Library', icon: AudioLines, short: 'Sounds' },
  { id: 'learn', label: 'Learn DJing', icon: GraduationCap, short: 'Learn' },
  { id: 'assistant', label: 'AI Assistant', icon: Sparkles, short: 'Assistant' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

function Page({ route }: { route: Route }) {
  switch (route) {
    case 'home':
      return <Home />;
    case 'library':
      return <Library />;
    case 'studio':
      return <Studio />;
    case 'mixes':
      return <MyMixes />;
    case 'beats':
      return <BeatPlayground />;
    case 'sounds':
      return <SoundLibrary />;
    case 'learn':
      return <Learn />;
    case 'assistant':
      return (
        <div className="page assistant-page">
          <header className="page-head">
            <div>
              <h1>AI Creative Assistant</h1>
              <p className="muted">Ideas, explanations and troubleshooting — applied only when you say so. It’s also available inside the DJ Studio.</p>
            </div>
          </header>
          <AssistantPanel />
        </div>
      );
    case 'settings':
      return <Settings />;
  }
}

export function App() {
  const route = useApp((s) => s.route);
  const go = useApp((s) => s.go);
  const tips = useApp((s) => s.settings.tips);
  const projectName = useApp((s) => s.project.name);

  useEffect(() => {
    const label = NAV.find((n) => n.id === route)?.label ?? '';
    document.title = route === 'studio' ? `${projectName} · MIXPLAY` : `${label} · MIXPLAY`;
  }, [route, projectName]);

  return (
    <div className={`app${tips ? '' : ' no-tips'}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <nav className="sidenav" aria-label="Main">
        <button className="brand" onClick={() => go('home')} aria-label="MIXPLAY home">
          <span className="brand-mark" aria-hidden>
            <i />
            <i />
          </span>
          <span className="brand-name">MIXPLAY</span>
        </button>
        <ul>
          {NAV.map((n) => (
            <li key={n.id} className={n.id === 'settings' ? 'nav-settings' : n.id === 'assistant' ? 'nav-assistant' : undefined}>
              <button className={`nav-item${route === n.id ? ' on' : ''}`} aria-current={route === n.id ? 'page' : undefined} onClick={() => go(n.id)} data-testid={`nav-${n.id}`}>
                <n.icon size={18} />
                <span className="nav-label">{n.label}</span>
                <span className="nav-short">{n.short ?? n.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="nav-foot small muted">
          You are the DJ.
          <br />
          AI is your creative assistant.
        </div>
      </nav>
      <main id="main" className="main">
        <ErrorBoundary key={route}>
          <Page route={route} />
        </ErrorBoundary>
      </main>
      <Coach />
      <Onboarding />
      <Toasts />
    </div>
  );
}
