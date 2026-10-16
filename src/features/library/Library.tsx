import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Search, Heart, Clock, Play, Square, Upload, FlaskConical, PlugZap, Info, Loader2, HardDrive } from 'lucide-react';
import { demoCatalog, localFiles, PLANNED_INTEGRATIONS, requestPlayback } from '../../catalog/registry';
import type { TrackMeta } from '../../catalog/types';
import { useApp, toast } from '../../state/store';
import { loadTrack } from '../../state/actions';
import { Artwork } from '../../ui/Artwork';
import { fmtTime, useEngineVersion } from '../../ui/hooks';
import { engine } from '../../audio/engine';
import { matches } from '../../catalog/demoCatalog';
import type { DeckId } from '../../project/types';

type Tab = 'all' | 'saved' | 'recent' | 'local';

/** Simple preview player: plays 20 s from the first drop through the master bus. */
let previewSrc: AudioBufferSourceNode | null = null;
let previewId: string | null = null;
const previewListeners = new Set<() => void>();
const notifyPreview = () => previewListeners.forEach((l) => l());

async function togglePreview(m: TrackMeta, setBusy: (b: string | null) => void) {
  await engine.resume();
  if (!engine.ctx) return;
  if (previewId === m.id) {
    previewSrc?.stop();
    previewSrc = null;
    previewId = null;
    notifyPreview();
    return;
  }
  previewSrc?.stop();
  setBusy(m.id);
  try {
    const g = await requestPlayback(m.id);
    const ctx = engine.ctx;
    const buf = ctx.createBuffer(2, g.pcm.left.length, g.pcm.sampleRate);
    buf.copyToChannel(g.pcm.left as Float32Array<ArrayBuffer>, 0);
    buf.copyToChannel(g.pcm.right as Float32Array<ArrayBuffer>, 1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.7;
    src.connect(gain).connect(ctx.destination);
    const start = m.bpm ? Math.min(buf.duration - 25, (60 / m.bpm) * 4 * 24) : buf.duration * 0.3;
    src.start(0, Math.max(0, start), 20);
    src.onended = () => {
      if (previewSrc === src) {
        previewSrc = null;
        previewId = null;
        notifyPreview();
      }
    };
    previewSrc = src;
    previewId = m.id;
    notifyPreview();
  } catch (e) {
    toast('error', (e as Error).message);
  }
  setBusy(null);
}

function TrackRow({ m, target, busy, setBusy }: { m: TrackMeta; target: DeckId | null; busy: string | null; setBusy: (b: string | null) => void }) {
  const saved = useApp((s) => s.settings.savedTracks.includes(m.id));
  const update = useApp((s) => s.updateSettings);
  const go = useApp((s) => s.go);
  const playingPreview = useSyncExternalStore(
    (cb) => {
      previewListeners.add(cb);
      return () => previewListeners.delete(cb);
    },
    () => previewId === m.id,
  );
  useEngineVersion();
  const onDeck = (['A', 'B'] as DeckId[]).filter((d) => engine.ctx && engine.decks[d].meta?.id === m.id);
  const load = async (d: DeckId) => {
    await engine.resume();
    const p = loadTrack(d, m.id);
    toast('info', `Loading “${m.title}” onto Deck ${d}…`);
    if (target) {
      useApp.getState().setLibraryTarget(null);
      go('studio');
    }
    const ok = await p;
    if (ok) toast('success', `“${m.title}” is ready on Deck ${d}.`);
  };
  return (
    <div className="track-row" data-testid="track-row">
      <button className="track-art" onClick={() => togglePreview(m, setBusy)} aria-label={playingPreview ? `Stop preview of ${m.title}` : `Preview ${m.title}`}>
        <Artwork art={m.artwork} size={44} title={m.title} />
        <span className="track-art-play">{busy === m.id ? <Loader2 size={16} className="spin" /> : playingPreview ? <Square size={14} /> : <Play size={16} />}</span>
      </button>
      <div className="track-main">
        <div className="t">
          {m.title}
          {onDeck.map((d) => (
            <span key={d} className={`chip tiny ${d.toLowerCase()}`}>
              on {d}
            </span>
          ))}
        </div>
        <div className="muted small">
          {m.artist} · {m.genre}
          {m.mood ? ` · ${m.mood}` : ''}
        </div>
      </div>
      <div className="track-meta mono">
        <span data-tip={m.bpmSource === 'composed' ? 'Exact tempo (we composed it)' : m.bpmSource === 'estimated' ? 'Estimated from the audio' : m.bpm ? 'From the provider' : 'Tempo unknown'}>
          {m.bpm ? `${m.bpm}${m.bpmSource === 'estimated' ? '≈' : ''}` : '—'} <span className="muted">BPM</span>
        </span>
        <span className="hide-sm">{m.key ?? '—'}</span>
        <span>{fmtTime(m.durationSec)}</span>
      </div>
      <div className="track-actions">
        <button
          className={`btn ghost icon-btn sm${saved ? ' fav-on' : ''}`}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${m.title} from saved` : `Save ${m.title}`}
          onClick={() => update((s) => void (s.savedTracks = saved ? s.savedTracks.filter((x) => x !== m.id) : [m.id, ...s.savedTracks]))}
        >
          <Heart />
        </button>
        <button className={`btn sm deck-load a${target === 'A' ? ' target' : ''}`} onClick={() => load('A')} data-testid={`load-${m.id}-A`}>
          Deck A
        </button>
        <button className={`btn sm deck-load b${target === 'B' ? ' target' : ''}`} onClick={() => load('B')} data-testid={`load-${m.id}-B`}>
          Deck B
        </button>
      </div>
    </div>
  );
}

export function Library() {
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const target = useApp((s) => s.libraryTarget);
  const settings = useApp((s) => s.settings);
  const fileRef = useRef<HTMLInputElement>(null);
  const localVersion = useSyncExternalStore(
    (cb) => localFiles.subscribe(cb),
    () => localFiles.all().length,
  );
  useEffect(() => () => void previewSrc?.stop(), []);

  const demo = demoCatalog.all();
  const genres = [...new Set(demo.map((m) => m.genre))];
  const list = useMemo(() => {
    let base: TrackMeta[] = tab === 'local' ? localFiles.all() : demo;
    if (tab === 'saved') base = settings.savedTracks.map((id) => demo.find((m) => m.id === id) ?? localFiles.all().find((m) => m.id === id)).filter(Boolean) as TrackMeta[];
    if (tab === 'recent') base = settings.recentTracks.map((id) => demo.find((m) => m.id === id) ?? localFiles.all().find((m) => m.id === id)).filter(Boolean) as TrackMeta[];
    return base.filter((m) => matches(m, q, genre ? { genre } : undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, genre, tab, settings.savedTracks, settings.recentTracks, localVersion]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setImporting(true);
    for (const f of Array.from(files).slice(0, 10)) {
      try {
        const m = await localFiles.importFile(f);
        toast('success', `Added “${m.title}”${m.bpm ? ` — tempo estimated at ${m.bpm} BPM` : ' — tempo could not be estimated'}.`);
      } catch (e) {
        toast('error', (e as Error).message);
      }
    }
    setImporting(false);
    setTab('local');
  };

  return (
    <div className="page library" data-testid="library">
      <header className="page-head">
        <div>
          <h1>Music Library</h1>
          <p className="muted">Pick music and send it to a deck. No files to manage.</p>
        </div>
        {target && (
          <span className="chip b-or-a">
            Choosing a track for <b>&nbsp;Deck {target}</b>
          </span>
        )}
      </header>

      <div className="catalog-banner" role="note">
        <FlaskConical size={18} />
        <div>
          <b>You’re using the MIXPLAY Demo Catalog.</b> {demoCatalog.status().detail} It’s original music made for MIXPLAY, cleared for mixing, looping and effects.{' '}
          <span className="muted">
            No commercial streaming catalog is connected — those need a licence that allows DJ use.{' '}
            <button className="linklike" onClick={() => useApp.getState().go('settings')}>
              See catalog settings
            </button>
            .
          </span>
        </div>
      </div>

      <div className="lib-controls">
        <div className="search-box">
          <Search size={16} />
          <input className="input" placeholder="Search title, artist, genre, mood or BPM" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the catalog" data-testid="library-search" />
        </div>
        <select className="select" value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="Genre">
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <div className="seg" role="tablist" aria-label="Library view">
          <button aria-pressed={tab === 'all'} onClick={() => setTab('all')}>
            Demo catalog
          </button>
          <button aria-pressed={tab === 'saved'} onClick={() => setTab('saved')}>
            <Heart /> Saved
          </button>
          <button aria-pressed={tab === 'recent'} onClick={() => setTab('recent')}>
            <Clock /> Recent
          </button>
          <button aria-pressed={tab === 'local'} onClick={() => setTab('local')}>
            <HardDrive /> My files
          </button>
        </div>
      </div>

      {tab === 'local' && (
        <div className="local-note">
          <Info size={16} />
          <div className="spacer small">
            <b>Optional: files on this device.</b> A fallback for testing — audio is decoded in your browser for this session only, never uploaded, and not stored in your mixes. Tempo is <i>estimated</i>. Only use audio you have the right to use.
          </div>
          <input ref={fileRef} type="file" accept="audio/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <button className="btn sm" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="spin" /> : <Upload />} Add audio files
          </button>
        </div>
      )}

      <div className="track-list" role="list">
        {list.map((m) => (
          <TrackRow key={m.id} m={m} target={target} busy={busy} setBusy={setBusy} />
        ))}
        {list.length === 0 && (
          <div className="empty">
            <Search />
            {tab === 'saved' ? 'Tap the heart on any track to save it here.' : tab === 'recent' ? 'Tracks you load onto a deck appear here.' : tab === 'local' ? 'No local files added in this session.' : `No tracks match “${q}”.`}
          </div>
        )}
      </div>

      <section className="integrations">
        <h3>
          <PlugZap size={16} /> Licensed catalogs
        </h3>
        <p className="muted small">MIXPLAY is built so a properly licensed catalog can plug in later without changing the studio. None of these are connected.</p>
        <div className="integration-grid">
          {PLANNED_INTEGRATIONS.map((p) => (
            <div key={p.id} className="integration">
              <b>{p.name}</b>
              <span className="chip">Not connected</span>
              <p className="small muted">{p.requirement}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
