import { useRef, useState } from 'react';
import { Play, Square, Plus, Copy, Trash2, Eraser, VolumeX, Volume2, Link2 } from 'lucide-react';
import { engine } from '../../audio/engine';
import { useApp, toast } from '../../state/store';
import { useEngineVersion, useRaf } from '../../ui/hooks';
import { Range } from '../../ui/Range';
import { allSounds, soundById } from '../../audio/soundLibrary';
import { makePattern, PATTERN_PRESETS, uid } from '../../project/defaults';
import type { DeckId, Pattern } from '../../project/types';

const ONE_SHOTS = allSounds().filter((s) => !s.loop);

export function Sequencer() {
  useEngineVersion();
  const beats = useApp((s) => s.project.beats);
  const mutate = useApp((s) => s.mutate);
  const gridRef = useRef<HTMLDivElement>(null);
  const lastStep = useRef(-1);
  const [renaming, setRenaming] = useState(false);
  const pattern = beats.patterns.find((p) => p.id === beats.activePatternId) ?? beats.patterns[0];
  const running = engine.ctx ? engine.sequencer.running : false;
  const followDeck = beats.follow ? (engine.ctx ? engine.decks[beats.follow] : null) : null;
  const following = !!followDeck?.playing && !!followDeck.effectiveBpm;

  useRaf(() => {
    if (!engine.ctx || !gridRef.current) return;
    const step = engine.sequencer.currentStep();
    if (step === lastStep.current) return;
    lastStep.current = step;
    gridRef.current.querySelectorAll<HTMLElement>('[data-col]').forEach((el) => {
      el.dataset.now = el.dataset.col === String(step) ? '1' : '0';
    });
  });

  const editPattern = (fn: (p: Pattern) => void) =>
    mutate((pr) => {
      const p = pr.beats.patterns.find((x) => x.id === pr.beats.activePatternId);
      if (p) fn(p as Pattern);
    });

  const toggleStep = (ti: number, si: number, accent: boolean) => {
    engine.resume();
    editPattern((p) => {
      const cur = p.tracks[ti].steps[si];
      p.tracks[ti].steps[si] = accent ? (cur === 2 ? 0 : 2) : cur ? 0 : 1;
    });
    if (!running) {
      const t = pattern.tracks[ti];
      if (!pattern.tracks[ti].steps[si] && engine.ctx) engine.sampler.trigger(t.soundId, { volume: t.volume * 0.8, destination: engine.sequencer.bus });
    }
  };

  const transport = async () => {
    await engine.resume();
    if (running) engine.sequencer.stop();
    else engine.sequencer.start();
  };

  return (
    <div className="seq">
      <div className="panel-toolbar wrap">
        <button className={`btn${running ? ' on' : ' accent'}`} onClick={transport} data-testid="seq-play" aria-label={running ? 'Stop pattern' : 'Play pattern'}>
          {running ? <Square /> : <Play />} {running ? 'Stop' : 'Play pattern'}
        </button>
        <label className="row small">
          <span className="eyebrow">Tempo</span>
          {following ? (
            <span className="chip ok" data-tip={`Locked to Deck ${beats.follow}'s live tempo and beat`}>
              <Link2 /> {followDeck!.effectiveBpm!.toFixed(1)} BPM
            </span>
          ) : (
            <input
              className="input mono"
              type="number"
              min={60}
              max={180}
              value={beats.bpm}
              style={{ width: 70, height: 30 }}
              aria-label="Pattern tempo in BPM"
              onChange={(e) => {
                const v = Math.max(60, Math.min(180, Number(e.target.value) || 120));
                mutate((p) => void (p.beats.bpm = v));
              }}
            />
          )}
        </label>
        <label className="row small" data-tip="Follow a deck: the pattern locks to its tempo and lands on its beats">
          <span className="eyebrow">Follow</span>
          <select
            className="select"
            style={{ height: 30 }}
            value={beats.follow ?? ''}
            onChange={(e) => mutate((p) => void (p.beats.follow = (e.target.value || null) as DeckId | null))}
            aria-label="Follow deck"
          >
            <option value="">Off (own tempo)</option>
            <option value="A">Deck A</option>
            <option value="B">Deck B</option>
          </select>
        </label>
        <label className="row small" style={{ minWidth: 150 }}>
          <span className="eyebrow">Swing</span>
          <Range label="Swing" value={beats.swing} min={0} max={0.6} step={0.01} onChange={(v) => mutate((p) => void (p.beats.swing = v))} format={(v) => `${Math.round(v * 100)} percent`} />
        </label>
        <label className="row small" style={{ minWidth: 150 }}>
          <span className="eyebrow">Volume</span>
          <Range label="Beat volume" value={beats.volume} min={0} max={1} step={0.01} onChange={(v) => mutate((p) => void (p.beats.volume = v))} />
        </label>
      </div>

      <div className="pattern-tabs" role="tablist" aria-label="Saved patterns">
        {beats.patterns.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={p.id === pattern.id}
            className={`ptab${p.id === pattern.id ? ' on' : ''}`}
            onClick={() => mutate((pr) => void (pr.beats.activePatternId = p.id))}
            onDoubleClick={() => setRenaming(true)}
          >
            {p.id === pattern.id && renaming ? (
              <input
                autoFocus
                className="input"
                style={{ height: 24, width: 140 }}
                defaultValue={p.name}
                aria-label="Pattern name"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v) editPattern((x) => void (x.name = v.slice(0, 40)));
                  setRenaming(false);
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              p.name
            )}
          </button>
        ))}
        <div className="spacer" />
        <select
          className="select"
          style={{ height: 30 }}
          aria-label="Add a pattern"
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            const np = v === 'empty' ? { ...makePattern(0, 'Empty pattern'), tracks: makePattern(0).tracks.map((t) => ({ ...t, steps: Array(16).fill(0) })) } : makePattern(Number(v));
            mutate((pr) => {
              pr.beats.patterns.push(np);
              pr.beats.activePatternId = np.id;
            });
          }}
        >
          <option value="">+ New pattern…</option>
          <option value="empty">Empty</option>
          {PATTERN_PRESETS.map((p, i) => (
            <option key={p.name} value={i}>
              From “{p.name}”
            </option>
          ))}
        </select>
        <button
          className="btn ghost icon-btn sm"
          aria-label="Duplicate pattern"
          data-tip="Duplicate"
          onClick={() =>
            mutate((pr) => {
              const copy = JSON.parse(JSON.stringify(pattern)) as Pattern;
              copy.id = uid('p');
              copy.name = `${pattern.name} 2`;
              pr.beats.patterns.push(copy);
              pr.beats.activePatternId = copy.id;
            })
          }
        >
          <Copy />
        </button>
        <button
          className="btn ghost icon-btn sm"
          aria-label="Clear pattern"
          data-tip="Clear all steps"
          onClick={() => editPattern((p) => p.tracks.forEach((t) => (t.steps = Array(16).fill(0))))}
        >
          <Eraser />
        </button>
        <button
          className="btn ghost icon-btn sm"
          aria-label="Delete pattern"
          data-tip="Delete pattern"
          disabled={beats.patterns.length <= 1}
          onClick={() => {
            mutate((pr) => {
              pr.beats.patterns = pr.beats.patterns.filter((p) => p.id !== pattern.id);
              pr.beats.activePatternId = pr.beats.patterns[0].id;
            });
            toast('info', `Deleted “${pattern.name}”.`);
          }}
        >
          <Trash2 />
        </button>
      </div>

      <div className="seq-grid" ref={gridRef} data-testid="seq-grid">
        {pattern.tracks.map((t, ti) => {
          const s = soundById(t.soundId);
          return (
            <div className={`seq-row${t.muted ? ' muted-row' : ''}`} key={t.id} style={{ ['--hue' as string]: s?.hue ?? 200 }}>
              <div className="seq-row-head">
                <select
                  className="select seq-sound"
                  value={t.soundId}
                  aria-label={`Row ${ti + 1} sound`}
                  onChange={(e) => editPattern((p) => void (p.tracks[ti].soundId = e.target.value))}
                >
                  {ONE_SHOTS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <button
                  className={`btn ghost icon-btn xs${t.muted ? ' on' : ''}`}
                  aria-pressed={t.muted}
                  aria-label={`Mute row ${ti + 1}`}
                  onClick={() => editPattern((p) => void (p.tracks[ti].muted = !p.tracks[ti].muted))}
                >
                  {t.muted ? <VolumeX /> : <Volume2 />}
                </button>
                <div className="seq-vol">
                  <Range label={`Row ${ti + 1} volume`} value={t.volume} min={0} max={1} step={0.01} onChange={(v) => editPattern((p) => void (p.tracks[ti].volume = v))} />
                </div>
              </div>
              <div className="seq-steps">
                {t.steps.map((v, si) => (
                  <button
                    key={si}
                    data-col={si}
                    data-v={v}
                    className={`step${si % 4 === 0 ? ' beat' : ''}`}
                    aria-label={`${s?.name ?? t.soundId} step ${si + 1}${v ? (v === 2 ? ', accent' : ', on') : ', off'}`}
                    aria-pressed={!!v}
                    data-testid={`step-${ti}-${si}`}
                    onClick={(e) => toggleStep(ti, si, e.shiftKey || e.altKey)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      toggleStep(ti, si, true);
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
        <div className="seq-foot muted small">
          Click a step to add a hit · Shift-click (or right-click) for an accent · Double-click a pattern tab to rename it
          <span className="spacer" />
          <button
            className="btn ghost xs"
            onClick={() =>
              editPattern((p) => {
                if (p.tracks.length >= 12) return;
                p.tracks.push({ id: uid('t'), soundId: 'perc-rim', volume: 0.7, muted: false, steps: Array(16).fill(0) });
              })
            }
            disabled={pattern.tracks.length >= 12}
          >
            <Plus /> Add row
          </button>
        </div>
      </div>
    </div>
  );
}
