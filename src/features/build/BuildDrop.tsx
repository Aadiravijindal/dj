import { useRef, useState } from 'react';
import { Rocket, Square, Zap, Trash2, LayoutTemplate, Info } from 'lucide-react';
import { useApp, toast } from '../../state/store';
import type { BuildEvent, BuildLane, DeckId } from '../../project/types';
import { BUILD_TEMPLATES, uid } from '../../project/defaults';
import { performBuild, type BuildRun } from '../../audio/performance';
import { engine } from '../../audio/engine';
import { useEngineVersion, useRaf } from '../../ui/hooks';
import { Range } from '../../ui/Range';

const LANES: { lane: BuildLane; label: string; hint: string; atDrop?: boolean }[] = [
  { lane: 'roll', label: 'Drum roll', hint: 'Snare hits that speed up toward the drop' },
  { lane: 'riser', label: 'Riser', hint: 'Rising noise sweep, exactly as long as the block' },
  { lane: 'filter', label: 'Filter sweep', hint: 'High-pass filter on the deck rises — the track gets thinner' },
  { lane: 'echo', label: 'Echo throw', hint: 'Echo on the deck ramps up' },
  { lane: 'loop', label: 'Loop roll', hint: 'Deck loops 4 → 2 → 1 → ½ beats, then jumps back in time' },
  { lane: 'perc', label: 'Percussion', hint: 'Congas and shakers on 8th notes' },
  { lane: 'silence', label: 'Silence', hint: 'Cut the deck right before the drop' },
  { lane: 'impact', label: 'Impact', hint: 'Big boom on the drop', atDrop: true },
  { lane: 'bass', label: 'Bass hit', hint: '808 / sub drop on the drop', atDrop: true },
];

export function BuildDrop() {
  useEngineVersion();
  const build = useApp((s) => s.project.build);
  const mutate = useApp((s) => s.mutate);
  const [sel, setSel] = useState<string | null>(null);
  const [run, setRun] = useState<BuildRun | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; x: number; start: number; length: number } | null>(null);
  const total = build.bars * 4;
  const selected = build.events.find((e) => e.id === sel) ?? null;
  const deck = engine.ctx ? engine.decks[build.deck] : null;

  useRaf(() => {
    if (!run || !engine.ctx) return;
    const beat = (engine.now() - run.startTime) / run.beatSec;
    if (headRef.current) {
      headRef.current.style.left = `${Math.max(0, Math.min(1, beat / total)) * 100}%`;
      headRef.current.style.opacity = beat >= 0 ? '1' : '0.4';
    }
    if (countRef.current) {
      const left = total - beat;
      countRef.current.textContent = beat < 0 ? `starts in ${(-beat).toFixed(1)} beats` : left > 0 ? `drop in ${Math.ceil(left)} beats` : 'DROP!';
    }
  }, !!run);

  const update = (id: string, fn: (e: BuildEvent) => void) =>
    mutate((p) => {
      const e = p.build.events.find((x) => x.id === id);
      if (e) fn(e);
    });

  const beatAt = (clientX: number) => {
    const r = gridRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(total, Math.round(((clientX - r.left) / r.width) * total)));
  };

  const addAt = (lane: BuildLane, beat: number, atDrop?: boolean) => {
    const id = uid('e');
    mutate((p) => {
      if (atDrop) {
        p.build.events = p.build.events.filter((e) => e.lane !== lane);
        p.build.events.push({ id, lane, start: total, length: 0, intensity: 0.8 });
      } else {
        const len = lane === 'silence' ? 1 : Math.min(8, total - beat) || 4;
        p.build.events.push({ id, lane, start: Math.min(beat, total - len), length: len, intensity: 0.7 });
      }
      p.build.templateName = null;
    });
    setSel(id);
  };

  const perform = async () => {
    await engine.resume();
    const r = performBuild(useApp.getState().project.build);
    if ('error' in r) {
      toast('error', r.error);
      return;
    }
    setRun(r);
    r.done.then((how) => {
      setRun(null);
      if (how === 'dropped') toast('success', 'Drop! 🎉 How did that feel? Tweak the timing and try again.');
    });
  };

  return (
    <div className="build">
      <div className="panel-toolbar wrap">
        <div className="seg" role="group" aria-label="Deck for the build-up">
          {(['A', 'B'] as DeckId[]).map((d) => (
            <button key={d} aria-pressed={build.deck === d} onClick={() => mutate((p) => void (p.build.deck = d))} disabled={!!run}>
              Deck {d}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Build length">
          {([4, 8, 16] as const).map((b) => (
            <button
              key={b}
              aria-pressed={build.bars === b}
              disabled={!!run}
              onClick={() =>
                mutate((p) => {
                  const old = p.build.bars * 4;
                  p.build.bars = b;
                  const nt = b * 4;
                  // keep events proportionally placed, drop hits on the new drop
                  p.build.events = p.build.events.map((e) => (e.length === 0 ? { ...e, start: nt } : { ...e, start: Math.round((e.start / old) * nt), length: Math.max(1, Math.round((e.length / old) * nt)) }));
                })
              }
            >
              {b} bars
            </button>
          ))}
        </div>
        <label className="row small">
          <LayoutTemplate size={15} className="muted" />
          <select
            className="select"
            style={{ height: 30 }}
            value=""
            disabled={!!run}
            aria-label="Load a template"
            onChange={(e) => {
              const t = BUILD_TEMPLATES[e.target.value];
              if (!t) return;
              mutate((p) => {
                p.build = { ...t.make(), deck: p.build.deck };
              });
              toast('info', `Loaded “${t.name}” — it's a starting point. Move, stretch and delete blocks to make it yours.`);
            }}
          >
            <option value="">Templates…</option>
            {Object.entries(BUILD_TEMPLATES).map(([k, t]) => (
              <option key={k} value={k}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        {run ? (
          <>
            <span className="chip ok mono" ref={countRef}>
              …
            </span>
            <button className="btn accent" onClick={() => run.dropNow()} data-tip="Drop now — cut the build-up and hit the drop">
              <Zap /> Drop now
            </button>
            <button className="btn" onClick={() => run.cancel()}>
              <Square /> Cancel
            </button>
          </>
        ) : (
          <button
            className="btn accent"
            onClick={perform}
            disabled={!deck?.playing}
            data-testid="build-perform"
            data-tip={deck?.playing ? 'Starts on the next bar of the deck' : `Play Deck ${build.deck} first — the build-up locks to its beat`}
          >
            <Rocket /> Perform build-up
          </button>
        )}
      </div>

      <div className="build-board">
        <div className="build-lanes-head">
          {LANES.map((l) => (
            <div key={l.lane} className="lane-label" data-tip={l.hint}>
              {l.label}
            </div>
          ))}
        </div>
        <div className="build-grid-wrap">
          <div className="build-ruler">
            {Array.from({ length: build.bars }, (_, b) => (
              <span key={b} style={{ left: `${(b / build.bars) * 100}%` }}>
                {b + 1}
              </span>
            ))}
            <span className="drop-label">DROP</span>
          </div>
          <div className="build-grid" ref={gridRef} style={{ ['--beats' as string]: total }}>
            {LANES.map((l) => (
              <div
                key={l.lane}
                className={`build-lane${l.atDrop ? ' at-drop' : ''}`}
                onPointerDown={(e) => {
                  if (e.target !== e.currentTarget || run) return;
                  addAt(l.lane, beatAt(e.clientX), l.atDrop);
                }}
                aria-label={`${l.label} lane — click to add`}
              >
                {build.events
                  .filter((e) => e.lane === l.lane)
                  .map((e) =>
                    e.length === 0 ? (
                      <button
                        key={e.id}
                        className={`build-hit${sel === e.id ? ' sel' : ''}`}
                        style={{ ['--k' as string]: e.intensity }}
                        onClick={() => setSel(e.id)}
                        aria-label={`${l.label} on the drop`}
                      >
                        <Zap size={12} />
                      </button>
                    ) : (
                      <div
                        key={e.id}
                        className={`build-block lane-${l.lane}${sel === e.id ? ' sel' : ''}`}
                        style={{ left: `${(e.start / total) * 100}%`, width: `${(e.length / total) * 100}%`, ['--k' as string]: e.intensity }}
                        role="button"
                        tabIndex={0}
                        aria-label={`${l.label}, beats ${e.start + 1} to ${e.start + e.length}, intensity ${Math.round(e.intensity * 100)}%`}
                        onKeyDown={(k) => {
                          if (k.key === 'Delete' || k.key === 'Backspace') mutate((p) => void (p.build.events = p.build.events.filter((x) => x.id !== e.id)));
                          if (k.key === 'ArrowLeft') update(e.id, (x) => void (x.start = Math.max(0, x.start - 1)));
                          if (k.key === 'ArrowRight') update(e.id, (x) => void (x.start = Math.min(total - x.length, x.start + 1)));
                        }}
                        onPointerDown={(pe) => {
                          if (run) return;
                          pe.stopPropagation();
                          (pe.target as Element).setPointerCapture(pe.pointerId);
                          setSel(e.id);
                          const resize = (pe.target as HTMLElement).classList.contains('grip');
                          drag.current = { id: e.id, mode: resize ? 'resize' : 'move', x: pe.clientX, start: e.start, length: e.length };
                        }}
                        onPointerMove={(pe) => {
                          const d = drag.current;
                          if (!d || d.id !== e.id) return;
                          const r = gridRef.current!.getBoundingClientRect();
                          const db = Math.round(((pe.clientX - d.x) / r.width) * total);
                          if (d.mode === 'move') update(e.id, (x) => void (x.start = Math.max(0, Math.min(total - x.length, d.start + db))));
                          else update(e.id, (x) => void (x.length = Math.max(1, Math.min(total - x.start, d.length + db))));
                        }}
                        onPointerUp={() => (drag.current = null)}
                      >
                        <span className="grip" aria-hidden />
                      </div>
                    ),
                  )}
              </div>
            ))}
            {run && <div className="build-head" ref={headRef} />}
          </div>
        </div>
      </div>

      <div className="build-inspector">
        {selected ? (
          <>
            <b>{LANES.find((l) => l.lane === selected.lane)?.label}</b>
            <span className="muted small">
              {selected.length === 0 ? 'on the drop' : `beat ${selected.start + 1} → ${selected.start + selected.length} (${selected.length} beats)`}
            </span>
            <label className="row small" style={{ minWidth: 220 }}>
              <span className="eyebrow">Intensity</span>
              <Range label="Intensity" value={selected.intensity} min={0} max={1} step={0.05} onChange={(v) => update(selected.id, (x) => void (x.intensity = v))} format={(v) => `${Math.round(v * 100)} percent`} />
            </label>
            <button
              className="btn ghost sm"
              onClick={() => {
                mutate((p) => void (p.build.events = p.build.events.filter((x) => x.id !== selected.id)));
                setSel(null);
              }}
            >
              <Trash2 /> Remove
            </button>
          </>
        ) : (
          <span className="muted small">
            <Info size={13} /> Click a lane to add an element · drag blocks to move · drag the right edge to stretch · you choose when the drop lands — or hit “Drop now” mid-build.
          </span>
        )}
      </div>
    </div>
  );
}
