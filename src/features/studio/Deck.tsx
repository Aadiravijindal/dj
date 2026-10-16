import { useRef, useState } from 'react';
import {
  Play,
  Pause,
  Disc3,
  RefreshCcw,
  Minus,
  Plus,
  ChevronsLeft,
  ChevronsRight,
  Repeat,
  LogIn,
  LogOut,
  Save,
  Trash2,
  Library,
  Eject,
  Magnet,
  OctagonPause,
  Eraser,
  Info,
} from 'lucide-react';
import { engine } from '../../audio/engine';
import type { DeckId } from '../../project/types';
import { useApp } from '../../state/store';
import { useEngineVersion, useRaf, fmtTime } from '../../ui/hooks';
import { Artwork } from '../../ui/Artwork';
import { Range } from '../../ui/Range';
import { JogWheel } from './JogWheel';
import { Waveform } from './Waveform';
import * as D from '../../state/deckActions';
import { ejectDeck } from '../../state/actions';

const HOT_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#9775fa', '#f783ac'];

function DeckClock({ id }: { id: DeckId }) {
  const el = useRef<HTMLSpanElement>(null);
  const rem = useRef<HTMLSpanElement>(null);
  const bpmEl = useRef<HTMLSpanElement>(null);
  useRaf(() => {
    if (!engine.ctx) return;
    const d = engine.decks[id];
    if (el.current) el.current.textContent = fmtTime(d.getPosition());
    if (rem.current) rem.current.textContent = fmtTime(-(d.duration - d.getPosition()));
    if (bpmEl.current) bpmEl.current.textContent = d.effectiveBpm ? d.effectiveBpm.toFixed(1) : '—';
  });
  return (
    <div className="deck-clock">
      <div>
        <span className="mono big" ref={el}>
          0:00
        </span>
        <span className="mono muted" ref={rem}>
          -0:00
        </span>
      </div>
      <div className="deck-bpm" data-tip="Live tempo after your tempo adjustment">
        <span className="mono big" ref={bpmEl}>
          —
        </span>
        <span className="muted">BPM</span>
      </div>
    </div>
  );
}

export function DeckPanel({ id }: { id: DeckId }) {
  useEngineVersion();
  const mode = useApp((s) => s.settings.mode);
  const ds = useApp((s) => s.project.decks[id]);
  const go = useApp((s) => s.go);
  const setTarget = useApp((s) => s.setLibraryTarget);
  const mutate = useApp((s) => s.mutate);
  const [vinyl, setVinyl] = useState(false);
  const [clearMode, setClearMode] = useState(false);
  const pro = mode === 'pro';
  const deck = engine.ctx ? engine.decks[id] : null;
  const ready = deck?.status === 'ready';
  const meta = deck?.meta;
  const loopBeats = pro ? [0.25, 0.5, 1, 2, 4, 8, 16] : [1, 2, 4, 8];
  const activeBeats = deck?.loopActive ? deck.loop?.beats : null;
  const hotCount = pro ? 8 : 4;
  const color = id === 'A' ? 'var(--deck-a)' : 'var(--deck-b)';

  const openLibrary = () => {
    setTarget(id);
    go('library');
  };

  const bpmLabel = meta?.bpm
    ? meta.bpmSource === 'composed'
      ? 'exact (composed)'
      : meta.bpmSource === 'estimated'
        ? 'estimated from audio'
        : 'from provider'
    : null;

  return (
    <section className={`deck deck-${id.toLowerCase()}${pro ? ' pro' : ''}`} aria-label={`Deck ${id}`} data-testid={`deck-${id}`}>
      <header className="deck-head">
        <div className="deck-badge" aria-hidden>
          {id}
        </div>
        <Artwork art={meta?.artwork ?? null} size={44} title={meta?.title} />
        <div className="deck-title">
          {meta ? (
            <>
              <div className="t" title={meta.title}>
                {meta.title}
              </div>
              <div className="a" title={`${meta.artist}${meta.key ? ` · ${meta.key}` : ''}`}>
                <span className="ellipsis">{meta.artist}</span>
                {meta.key && (
                  <span className="deck-key" data-tip="Musical key (Camelot code). Neighbouring codes mix harmonically.">
                    {meta.key}
                  </span>
                )}
                {meta.bpm && (
                  <span className="deck-key mono" data-tip={`Original tempo — ${bpmLabel}`}>
                    {meta.bpm} BPM
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="t muted">No track loaded</div>
              <div className="a">Choose music from the library</div>
            </>
          )}
        </div>
        <div className="spacer" />
        <button className="btn sm" onClick={openLibrary} data-testid={`load-${id}`}>
          <Library /> <span className="hide-narrow">{meta ? 'Change' : 'Load track'}</span>
        </button>
        {meta && pro && (
          <button className="btn ghost icon-btn sm" aria-label={`Eject deck ${id}`} data-tip="Eject" onClick={() => ejectDeck(id)}>
            <Eject />
          </button>
        )}
      </header>

      <Waveform id={id} />

      <div className="deck-body">
        <div className="deck-jog-col">
          <JogWheel id={id} vinyl={vinyl} size={pro ? 156 : 168} />
          <div className="row" style={{ justifyContent: 'center' }}>
            <button
              className={`btn xs${vinyl ? ' on' : ''}`}
              aria-pressed={vinyl}
              onClick={() => setVinyl((v) => !v)}
              data-tip="Vinyl mode: grab the wheel (or drag the waveform) to scratch backwards and forwards. Off: the wheel nudges tempo to line up beats."
            >
              <Disc3 /> Scratch
            </button>
          </div>
        </div>

        <div className="deck-controls">
          <DeckClock id={id} />

          <div className="transport">
            <button
              className="btn cue-btn"
              disabled={!ready}
              aria-label={`Cue deck ${id}`}
              data-tip="CUE — paused: sets the cue point here and previews while held. Playing: jumps back to the cue point."
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                engine.resume();
                deck?.cueDown();
              }}
              onPointerUp={() => deck?.cueUp()}
              onPointerCancel={() => deck?.cueUp()}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  if (!e.repeat) deck?.cueDown();
                }
              }}
              onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && deck?.cueUp()}
            >
              CUE
            </button>
            <button
              className={`btn play-btn${deck?.playing ? ' playing' : ''}`}
              style={{ ['--deck' as string]: color }}
              disabled={!ready}
              aria-label={deck?.playing ? `Pause deck ${id}` : `Play deck ${id}`}
              data-testid={`play-${id}`}
              onClick={async () => {
                await engine.resume();
                deck?.toggle();
              }}
            >
              {deck?.playing ? <Pause /> : <Play />}
            </button>
            {pro && (
              <button className="btn icon-btn" disabled={!ready || !deck?.playing} aria-label="Brake" data-tip="Brake — slow the record to a stop" onClick={() => deck?.brake()}>
                <OctagonPause />
              </button>
            )}
          </div>

          <div className="tempo">
            <div className="row">
              <span className="eyebrow">Tempo</span>
              <span className="mono tempo-val" data-testid={`tempo-${id}`}>
                {ds.tempo > 0 ? '+' : ''}
                {ds.tempo.toFixed(pro ? 2 : 1)}%
              </span>
              <span className="spacer" />
              <span
                className="keylock-note"
                data-tip="Tempo works like a turntable: speeding up also raises the pitch. Pitch-preserving time-stretch (key lock) isn't available in this version."
              >
                <Info size={13} /> pitch follows tempo
              </span>
            </div>
            <div className="row">
              <button className="btn icon-btn xs" aria-label="Tempo down" disabled={!ready} onClick={() => D.setTempo(id, ds.tempo - (pro ? 0.1 : 0.5))}>
                <Minus />
              </button>
              <Range
                label={`Deck ${id} tempo`}
                value={ds.tempo}
                min={-ds.tempoRange}
                max={ds.tempoRange}
                step={0.01}
                center
                color={color}
                disabled={!ready}
                onChange={(v) => D.setTempo(id, v)}
                onDoubleClick={() => D.setTempo(id, 0)}
                format={(v) => `${v.toFixed(1)} percent`}
              />
              <button className="btn icon-btn xs" aria-label="Tempo up" disabled={!ready} onClick={() => D.setTempo(id, ds.tempo + (pro ? 0.1 : 0.5))}>
                <Plus />
              </button>
            </div>
            <div className="row">
              <button
                className="btn xs icon-btn"
                aria-label="Nudge slower"
                disabled={!ready}
                data-tip="Hold to slow down briefly — pulls the beat back"
                onPointerDown={() => deck?.nudge(-0.04)}
                onPointerUp={() => deck?.nudge(0)}
                onPointerLeave={() => deck?.nudge(0)}
              >
                <ChevronsLeft />
              </button>
              <button
                className="btn xs icon-btn"
                aria-label="Nudge faster"
                disabled={!ready}
                data-tip="Hold to speed up briefly — pushes the beat forward"
                onPointerDown={() => deck?.nudge(0.04)}
                onPointerUp={() => deck?.nudge(0)}
                onPointerLeave={() => deck?.nudge(0)}
              >
                <ChevronsRight />
              </button>
              <button
                className="btn xs"
                disabled={!ready}
                onClick={() => D.syncDeck(id)}
                data-testid={`sync-${id}`}
                data-tip="Match this deck's tempo to the other deck and line up the beats. Optional — you can always beatmatch by ear."
              >
                <RefreshCcw /> Sync
              </button>
              <span className="spacer" />
              {pro && (
                <select
                  className="select"
                  style={{ height: 26, fontSize: 12 }}
                  aria-label="Tempo range"
                  value={ds.tempoRange}
                  onChange={(e) =>
                    mutate((p) => {
                      p.decks[id].tempoRange = Number(e.target.value) as 8 | 16 | 50;
                    })
                  }
                >
                  <option value={8}>±8%</option>
                  <option value={16}>±16%</option>
                  <option value={50}>±50%</option>
                </select>
              )}
              {pro && (
                <button
                  className={`btn xs icon-btn${ds.quantize ? ' on' : ''}`}
                  aria-pressed={ds.quantize}
                  aria-label="Quantize"
                  data-tip="Quantize: cue points and loops snap to the beat grid"
                  onClick={() =>
                    mutate((p) => {
                      p.decks[id].quantize = !p.decks[id].quantize;
                    })
                  }
                >
                  <Magnet />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="deck-pads">
        <div className="pad-group">
          <div className="row">
            <span className="eyebrow">Hot cues</span>
            <span className="spacer" />
            <button
              className={`btn ghost xs${clearMode ? ' on' : ''}`}
              aria-pressed={clearMode}
              onClick={() => setClearMode((c) => !c)}
              data-tip="Turn on, then tap a hot cue to delete it (or Shift-click any time)"
            >
              <Eraser /> {clearMode ? 'Tap to clear' : 'Clear'}
            </button>
          </div>
          <div className={`hotcues n${hotCount}`}>
            {Array.from({ length: hotCount }, (_, i) => {
              const t = ds.hotCues[i];
              return (
                <button
                  key={i}
                  className={`hotcue${t !== null ? ' set' : ''}`}
                  style={{ ['--hc' as string]: HOT_COLORS[i] }}
                  disabled={!ready}
                  aria-label={t !== null ? `Hot cue ${i + 1} at ${fmtTime(t)} — jump` : `Set hot cue ${i + 1}`}
                  onClick={(e) => {
                    engine.resume();
                    D.hotCuePress(id, i, clearMode || e.shiftKey);
                    if (clearMode) setClearMode(false);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    D.hotCuePress(id, i, true);
                  }}
                >
                  <b>{i + 1}</b>
                  <span className="mono">{t !== null ? fmtTime(t) : 'set'}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="pad-group">
          <div className="row">
            <span className="eyebrow">Loop</span>
            <span className="spacer" />
            <button
              className={`btn xs${deck?.loopActive ? ' on loop-on' : ''}`}
              disabled={!ready}
              onClick={() => D.toggleLoop(id)}
              aria-pressed={!!deck?.loopActive}
              data-testid={`loop-toggle-${id}`}
              data-tip={deck?.loop ? 'Turn the current loop on/off' : 'Start a 4-beat loop'}
            >
              <Repeat /> {deck?.loopActive ? 'Exit loop' : deck?.loop ? 'Reloop' : 'Loop'}
            </button>
          </div>
          <div className="loops">
            {loopBeats.map((b) => (
              <button
                key={b}
                className={`loopbtn${activeBeats === b ? ' active' : ''}`}
                disabled={!ready || !deck?.bpm}
                onClick={() => {
                  engine.resume();
                  if (activeBeats === b) deck?.setLoop(deck.loop, false);
                  else deck?.autoLoop(b);
                }}
                aria-pressed={activeBeats === b}
                data-testid={`loop-${id}-${b}`}
                aria-label={`${b} beat loop`}
              >
                {b < 1 ? `1/${1 / b}` : b}
              </button>
            ))}
          </div>
          {pro && (
            <div className="row wrap" style={{ marginTop: 6 }}>
              <button className="btn xs" disabled={!ready} onClick={() => D.loopIn(id)} data-tip="Loop in: mark the loop start">
                <LogIn /> In
              </button>
              <button className="btn xs" disabled={!ready || !deck?.loop} onClick={() => D.loopOut(id)} data-tip="Loop out: mark the end and start looping">
                <LogOut /> Out
              </button>
              <button className="btn xs" disabled={!deck?.loop} onClick={() => D.resizeLoop(id, 0.5)} aria-label="Halve loop">
                ½×
              </button>
              <button className="btn xs" disabled={!deck?.loop} onClick={() => D.resizeLoop(id, 2)} aria-label="Double loop">
                2×
              </button>
              <button className="btn xs" disabled={!deck?.loop} onClick={() => D.saveCurrentLoop(id)} data-tip="Save this loop in the mix">
                <Save /> Save
              </button>
            </div>
          )}
          {pro && ds.savedLoops.length > 0 && (
            <div className="saved-loops">
              {ds.savedLoops.map((l) => (
                <div key={l.id} className="saved-loop">
                  <button className="btn ghost xs" disabled={!ready} onClick={() => D.recallLoop(id, l.id)}>
                    <Repeat /> {l.label} <span className="mono muted">{fmtTime(l.start)}</span>
                  </button>
                  <button className="btn ghost icon-btn xs" aria-label={`Delete ${l.label}`} onClick={() => D.deleteLoop(id, l.id)}>
                    <Trash2 />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {pro && (
          <div className="pad-group">
            <span className="eyebrow" data-tip="Hold to repeat a tiny slice of the beat. Release and the track carries on where it would have been (slip).">
              Beat repeat · hold
            </span>
            <div className="loops">
              {[1, 0.5, 0.25, 0.125].map((b) => (
                <button
                  key={b}
                  className="loopbtn roll"
                  disabled={!ready || !deck?.playing || !deck?.bpm}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    deck?.rollStart(b);
                  }}
                  onPointerUp={() => deck?.rollEnd()}
                  onPointerCancel={() => deck?.rollEnd()}
                  aria-label={`Beat repeat ${b} beat`}
                >
                  {b < 1 ? `1/${1 / b}` : '1'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
