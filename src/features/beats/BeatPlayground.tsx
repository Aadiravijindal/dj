import { Play, Pause, Disc3 } from 'lucide-react';
import { Sequencer } from './Sequencer';
import { Pads } from './Pads';
import { engine } from '../../audio/engine';
import { useApp } from '../../state/store';
import { useEngineVersion } from '../../ui/hooks';
import { Artwork } from '../../ui/Artwork';
import type { DeckId } from '../../project/types';

/** Compact view of both decks so beats can be built against the music. */
export function MiniDecks() {
  useEngineVersion();
  const go = useApp((s) => s.go);
  return (
    <div className="mini-decks">
      {(['A', 'B'] as DeckId[]).map((id) => {
        const d = engine.ctx ? engine.decks[id] : null;
        const ready = d?.status === 'ready';
        return (
          <div key={id} className={`mini-deck deck-${id.toLowerCase()}`}>
            <span className="deck-badge sm">{id}</span>
            {ready ? <Artwork art={d!.meta!.artwork} size={32} radius={8} /> : <Disc3 size={22} className="muted" />}
            <div className="spacer" style={{ minWidth: 0 }}>
              <div className="ellipsis small">{ready ? d!.meta!.title : d?.status === 'loading' ? 'Loading…' : 'Empty deck'}</div>
              <div className="muted small mono">{ready && d!.effectiveBpm ? `${d!.effectiveBpm.toFixed(1)} BPM` : '—'}</div>
            </div>
            <button
              className="btn icon-btn sm"
              disabled={!ready}
              aria-label={d?.playing ? `Pause deck ${id}` : `Play deck ${id}`}
              onClick={async () => {
                await engine.resume();
                d?.toggle();
              }}
            >
              {d?.playing ? <Pause /> : <Play />}
            </button>
          </div>
        );
      })}
      <button className="btn ghost sm" onClick={() => go('studio')}>
        Open DJ Studio
      </button>
    </div>
  );
}

export function BeatPlayground() {
  return (
    <div className="page beats-page" data-testid="beat-playground">
      <header className="page-head">
        <div>
          <h1>Beat Playground</h1>
          <p className="muted">Program drum patterns and fire pads on top of whatever’s playing. Everything here is saved with your mix.</p>
        </div>
      </header>
      <MiniDecks />
      <section className="panel pad-section">
        <h3>Step sequencer</h3>
        <Sequencer />
      </section>
      <section className="panel pad-section">
        <h3>Performance pads</h3>
        <Pads />
      </section>
    </div>
  );
}
