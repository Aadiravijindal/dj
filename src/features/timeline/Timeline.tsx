import { useEffect, useState, useSyncExternalStore } from 'react';
import { Plus, Copy, Trash2, ChevronLeft, ChevronRight, Play, Flag, Columns2, BarChart3, Info, GripVertical, Search } from 'lucide-react';
import { useApp, toast } from '../../state/store';
import type { Arrangement, DeckId, TimelineItem, TransitionKind } from '../../project/types';
import { newArrangement, uid } from '../../project/defaults';
import { getTrackMetaSync, searchAll, requestPlayback } from '../../catalog/registry';
import { analysisCache } from '../../catalog/analysisCache';
import { Artwork } from '../../ui/Artwork';
import { fmtTime } from '../../ui/hooks';
import { Modal } from '../../ui/Modal';
import { loadTrack } from '../../state/actions';
import { engine } from '../../audio/engine';
import type { TrackMeta } from '../../catalog/types';

const TRANSITIONS: Record<TransitionKind, string> = {
  blend: 'Blend',
  cut: 'Quick cut',
  'echo-out': 'Echo out',
  'filter-fade': 'Filter fade',
  'build-drop': 'Build & drop',
};

function useAnalysisVersion() {
  return useSyncExternalStore(analysisCache.subscribe, analysisCache.version);
}

function itemLength(it: TimelineItem, meta: TrackMeta | null) {
  const end = it.end ?? meta?.durationSec ?? 0;
  return Math.max(0, end - it.start);
}

function EnergySpark({ trackId, start, end, w = 160, h = 34 }: { trackId: string; start: number; end: number | null; w?: number; h?: number }) {
  const a = analysisCache.get(trackId);
  const meta = getTrackMetaSync(trackId);
  if (!a?.energyPerBar || !meta?.bpm) return null;
  const barSec = (60 / meta.bpm) * 4;
  const b0 = Math.floor(start / barSec);
  const b1 = Math.ceil((end ?? meta.durationSec ?? 0) / barSec);
  const vals = a.energyPerBar.slice(b0, b1);
  if (vals.length < 2) return null;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - 2 - v * (h - 4)}`).join(' ');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="spark" aria-label="Measured energy">
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill="currentColor" opacity="0.18" />
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function TrackPicker({ onPick, onClose }: { onPick: (m: TrackMeta) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<TrackMeta[] | null>(null);
  useEffect(() => {
    let live = true;
    searchAll(q).then((r) => live && setRes(r));
    return () => {
      live = false;
    };
  }, [q]);
  return (
    <Modal title="Add a track to the timeline" onClose={onClose} wide>
      <div className="search-box" style={{ marginBottom: 12 }}>
        <Search size={15} />
        <input
          className="input"
          autoFocus
          placeholder="Search title, artist, genre, BPM…"
          value={q}
          aria-label="Search tracks"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="stack">
        {(res ?? []).map((m) => (
          <button key={m.id} className="pick-row" onClick={() => onPick(m)}>
            <Artwork art={m.artwork} size={36} />
            <span className="spacer" style={{ textAlign: 'left' }}>
              <b>{m.title}</b> <span className="muted">· {m.artist}</span>
            </span>
            <span className="mono muted">{m.bpm ?? '—'} BPM</span>
            <span className="mono muted">{fmtTime(m.durationSec)}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function ItemCard({ it, idx, count, arr }: { it: TimelineItem; idx: number; count: number; arr: Arrangement }) {
  const mutate = useApp((s) => s.mutate);
  const meta = getTrackMetaSync(it.trackId);
  const analysed = !!analysisCache.get(it.trackId);
  const [busy, setBusy] = useState(false);
  const edit = (fn: (x: TimelineItem) => void) =>
    mutate((p) => {
      const a = p.timeline.arrangements.find((x) => x.id === arr.id);
      const x = a?.items.find((y) => y.id === it.id);
      if (x) fn(x);
    });
  const move = (dir: -1 | 1) =>
    mutate((p) => {
      const a = p.timeline.arrangements.find((x) => x.id === arr.id)!;
      const i = a.items.findIndex((y) => y.id === it.id);
      const j = i + dir;
      if (j < 0 || j >= a.items.length) return;
      [a.items[i], a.items[j]] = [a.items[j], a.items[i]];
    });
  const loadedOn = (['A', 'B'] as DeckId[]).find((d) => engine.ctx && engine.decks[d].meta?.id === it.trackId && engine.decks[d].status === 'ready');

  const preview = async () => {
    await engine.resume();
    const d: DeckId = loadedOn ?? (engine.decks.A.playing ? 'B' : 'A');
    if (!loadedOn) {
      setBusy(true);
      const ok = await loadTrack(d, it.trackId);
      setBusy(false);
      if (!ok) return;
    }
    const deck = engine.decks[d];
    deck.seek(it.start);
    deck.play();
    toast('info', `Previewing on Deck ${d} from ${fmtTime(it.start)}.`);
    if (it.end !== null) {
      const stopAt = it.end;
      const check = setInterval(() => {
        if (!deck.playing || deck.meta?.id !== it.trackId) return clearInterval(check);
        if (deck.getPosition() >= stopAt) {
          deck.pause();
          clearInterval(check);
        }
      }, 100);
    }
  };

  const addMarker = () => {
    const t = loadedOn ? engine.decks[loadedOn].getPosition() : it.start;
    edit((x) => {
      x.markers.push({ id: uid('m'), time: Math.round(t * 10) / 10, label: `Marker ${x.markers.length + 1}` });
      x.markers.sort((a, b) => a.time - b.time);
    });
    if (!loadedOn) toast('info', 'Marker added at the section start. Load the track on a deck to drop markers at the playhead.');
  };

  return (
    <div
      className="tl-item"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/mixplay-item', it.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const from = e.dataTransfer.getData('text/mixplay-item');
        if (!from || from === it.id) return;
        mutate((p) => {
          const a = p.timeline.arrangements.find((x) => x.id === arr.id)!;
          const i = a.items.findIndex((y) => y.id === from);
          const [m] = a.items.splice(i, 1);
          a.items.splice(a.items.findIndex((y) => y.id === it.id), 0, m);
        });
      }}
      data-testid="tl-item"
    >
      <div className="tl-item-head">
        <GripVertical size={14} className="muted grab" aria-hidden />
        <span className="tl-num">{idx + 1}</span>
        <Artwork art={meta?.artwork ?? null} size={34} radius={8} />
        <div className="spacer" style={{ minWidth: 0 }}>
          <div className="t ellipsis">{meta?.title ?? 'Unavailable track'}</div>
          <div className="muted small ellipsis">
            {meta ? `${meta.artist} · ${meta.bpm ?? '—'} BPM · ${meta.key ?? 'key unknown'}` : 'This track is not available in the connected catalogs.'}
          </div>
        </div>
      </div>
      <div className={`tl-energy deck-color-${idx % 2 ? 'b' : 'a'}`}>
        {analysed ? (
          <EnergySpark trackId={it.trackId} start={it.start} end={it.end} />
        ) : meta ? (
          <button
            className="btn ghost xs"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await requestPlayback(it.trackId);
              } catch (e) {
                toast('error', (e as Error).message);
              }
              setBusy(false);
            }}
          >
            <BarChart3 /> {busy ? 'Analysing…' : 'Analyse energy'}
          </button>
        ) : null}
      </div>
      <div className="row small">
        <span className="mono">{fmtTime(it.start)}</span>
        <span className="muted">→</span>
        <span className="mono">{fmtTime(it.end ?? meta?.durationSec ?? null)}</span>
        <span className="spacer" />
        <span className="muted mono">{fmtTime(itemLength(it, meta))}</span>
      </div>
      {it.markers.length > 0 && (
        <div className="tl-markers">
          {it.markers.map((m) => (
            <span key={m.id} className="chip tiny">
              <Flag size={10} />
              <input
                className="marker-input"
                value={m.label}
                aria-label="Marker label"
                onChange={(e) => edit((x) => void (x.markers.find((y) => y.id === m.id)!.label = e.target.value.slice(0, 30)))}
              />
              <span className="mono muted">{fmtTime(m.time)}</span>
              <button className="x" aria-label={`Remove marker ${m.label}`} onClick={() => edit((x) => void (x.markers = x.markers.filter((y) => y.id !== m.id)))}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <textarea className="input tl-note" rows={2} placeholder="Notes for this track…" value={it.note} onChange={(e) => edit((x) => void (x.note = e.target.value.slice(0, 500)))} aria-label="Track notes" />
      <div className="row wrap tl-actions">
        <button className="btn xs" onClick={preview} disabled={!meta || busy} data-tip="Load to a free deck and play this section">
          <Play /> Preview
        </button>
        <button className="btn xs" onClick={() => loadTrack('A', it.trackId)} disabled={!meta}>
          → A
        </button>
        <button className="btn xs" onClick={() => loadTrack('B', it.trackId)} disabled={!meta}>
          → B
        </button>
        <button className="btn ghost xs" onClick={addMarker} aria-label="Add marker">
          <Flag /> Marker
        </button>
        <span className="spacer" />
        <button className="btn ghost icon-btn xs" aria-label="Move earlier" disabled={idx === 0} onClick={() => move(-1)}>
          <ChevronLeft />
        </button>
        <button className="btn ghost icon-btn xs" aria-label="Move later" disabled={idx === count - 1} onClick={() => move(1)}>
          <ChevronRight />
        </button>
        <button
          className="btn ghost icon-btn xs"
          aria-label="Remove from timeline"
          onClick={() =>
            mutate((p) => {
              const a = p.timeline.arrangements.find((x) => x.id === arr.id)!;
              a.items = a.items.filter((y) => y.id !== it.id);
            })
          }
        >
          <Trash2 />
        </button>
      </div>
    </div>
  );
}

function summary(a: Arrangement) {
  let total = 0;
  const bpms: (number | null)[] = [];
  for (const it of a.items) {
    const m = getTrackMetaSync(it.trackId);
    total += itemLength(it, m);
    bpms.push(m?.bpm ?? null);
  }
  return { total, bpms };
}

export function Timeline() {
  useAnalysisVersion();
  const tl = useApp((s) => s.project.timeline);
  const mutate = useApp((s) => s.mutate);
  const [picking, setPicking] = useState(false);
  const [compare, setCompare] = useState(false);
  const arr = tl.arrangements.find((a) => a.id === tl.activeId) ?? tl.arrangements[0];
  const editArr = (fn: (a: Arrangement) => void) =>
    mutate((p) => {
      const a = p.timeline.arrangements.find((x) => x.id === arr.id);
      if (a) fn(a);
    });
  const sum = summary(arr);

  return (
    <div className="timeline">
      <div className="panel-toolbar wrap">
        <select className="select" value={arr.id} onChange={(e) => mutate((p) => void (p.timeline.activeId = e.target.value))} aria-label="Arrangement">
          {tl.arrangements.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <input className="input" style={{ width: 160, height: 32 }} value={arr.name} onChange={(e) => editArr((a) => void (a.name = e.target.value.slice(0, 40)))} aria-label="Arrangement name" />
        <button
          className="btn ghost sm"
          onClick={() =>
            mutate((p) => {
              const copy = JSON.parse(JSON.stringify(arr)) as Arrangement;
              copy.id = uid('a');
              copy.name = `${arr.name} (alt)`;
              p.timeline.arrangements.push(copy);
              p.timeline.activeId = copy.id;
            })
          }
          data-tip="Duplicate to try an alternative order"
        >
          <Copy /> Alternative
        </button>
        <button
          className="btn ghost sm"
          onClick={() =>
            mutate((p) => {
              const a = newArrangement(`Arrangement ${p.timeline.arrangements.length + 1}`);
              p.timeline.arrangements.push(a);
              p.timeline.activeId = a.id;
            })
          }
        >
          <Plus /> New
        </button>
        <button
          className="btn ghost icon-btn sm"
          aria-label="Delete arrangement"
          disabled={tl.arrangements.length <= 1}
          onClick={() =>
            mutate((p) => {
              p.timeline.arrangements = p.timeline.arrangements.filter((a) => a.id !== arr.id);
              p.timeline.activeId = p.timeline.arrangements[0].id;
            })
          }
        >
          <Trash2 />
        </button>
        <button className={`btn sm${compare ? ' on' : ''}`} aria-pressed={compare} onClick={() => setCompare((c) => !c)} disabled={tl.arrangements.length < 2} data-tip="Compare arrangements side by side">
          <Columns2 /> Compare
        </button>
        <span className="spacer" />
        <span className="muted small">
          {arr.items.length} tracks · <span className="mono">{fmtTime(sum.total)}</span>
        </span>
      </div>

      {compare && (
        <div className="tl-compare">
          {tl.arrangements.map((a) => {
            const s = summary(a);
            return (
              <button key={a.id} className={`tl-compare-col${a.id === arr.id ? ' on' : ''}`} onClick={() => mutate((p) => void (p.timeline.activeId = a.id))}>
                <b>{a.name}</b>
                <span className="muted small">
                  {a.items.length} tracks · {fmtTime(s.total)}
                </span>
                <span className="mono small">{s.bpms.map((b) => b ?? '?').join(' → ') || '—'}</span>
                <ol>
                  {a.items.map((it) => (
                    <li key={it.id}>{getTrackMetaSync(it.trackId)?.title ?? 'Unavailable'}</li>
                  ))}
                </ol>
              </button>
            );
          })}
        </div>
      )}

      <div className="tl-track" role="list">
        {arr.items.map((it, i) => (
          <div className="tl-slot" key={it.id} role="listitem">
            <ItemCard it={it} idx={i} count={arr.items.length} arr={arr} />
            {i < arr.items.length - 1 && (
              <div className="tl-trans">
                <select
                  className="select"
                  value={it.transition}
                  aria-label={`Transition after track ${i + 1}`}
                  onChange={(e) => editArr((a) => void (a.items[i].transition = e.target.value as TransitionKind))}
                >
                  {Object.entries(TRANSITIONS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                {(() => {
                  const a = getTrackMetaSync(it.trackId)?.bpm;
                  const b = getTrackMetaSync(arr.items[i + 1].trackId)?.bpm;
                  if (!a || !b) return null;
                  const diff = ((b - a) / a) * 100;
                  return <span className={`small mono ${Math.abs(diff) > 8 ? 'warn-text' : 'muted'}`}>{diff === 0 ? 'same tempo' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}% tempo`}</span>;
                })()}
              </div>
            )}
          </div>
        ))}
        <button className="tl-add" onClick={() => setPicking(true)} data-testid="tl-add">
          <Plus /> Add track
        </button>
      </div>

      <div className="tl-bottom">
        <textarea className="input" rows={2} placeholder="Set notes — vibe, venue, timing…" value={arr.notes} onChange={(e) => editArr((a) => void (a.notes = e.target.value.slice(0, 2000)))} aria-label="Arrangement notes" />
        <p className="muted small">
          <Info size={12} /> The timeline is your plan, saved with the mix. It doesn’t play by itself — preview sections or load tracks to the decks and perform the transitions yourself. Energy curves are measured from the audio (loudness per bar).
        </p>
      </div>

      {picking && (
        <TrackPicker
          onClose={() => setPicking(false)}
          onPick={(m) => {
            editArr((a) => void a.items.push({ id: uid('i'), trackId: m.id, start: 0, end: null, transition: 'blend', note: '', markers: [] }));
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}
