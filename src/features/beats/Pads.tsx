import { useState } from 'react';
import { Pencil, Check, Magnet, Square, Repeat, Star, Search } from 'lucide-react';
import { engine } from '../../audio/engine';
import { useApp } from '../../state/store';
import { useEngineVersion } from '../../ui/hooks';
import { Range } from '../../ui/Range';
import { Modal } from '../../ui/Modal';
import { allSounds, soundById, CATEGORIES } from '../../audio/soundLibrary';
import { recordSound } from '../../state/actions';
import type { DeckId } from '../../project/types';

/** The deck that sets the groove for quantised pads/loops: the playing one closest to the crossfader. */
export function grooveDeck(): DeckId | null {
  if (!engine.ctx) return null;
  const x = useApp.getState().project.mixer.crossfader;
  const order: DeckId[] = x > 0 ? ['B', 'A'] : ['A', 'B'];
  return order.find((d) => engine.decks[d].playing && engine.decks[d].effectiveBpm) ?? null;
}

/** Trigger a library sound on the pad bus, optionally quantised to the music. */
export function triggerSound(soundId: string, volume = 0.85, quantize = true) {
  if (!engine.ctx) return false;
  engine.resume();
  const def = soundById(soundId);
  if (!def) return false;
  if (def.loop && engine.sampler.isPlaying(soundId)) {
    const g = grooveDeck();
    engine.sampler.stop(soundId, quantize && g ? engine.decks[g].nextBeatTime(1) ?? undefined : undefined);
    return true;
  }
  const g = grooveDeck();
  const deck = g ? engine.decks[g] : null;
  let when: number | undefined;
  if (quantize && deck) when = (def.loop ? deck.nextBeatTime(4) : deck.nextBeatTime(0.25)) ?? undefined;
  const ok = engine.sampler.trigger(soundId, {
    when,
    volume,
    destination: engine.padBus,
    tempoBpm: def.loop ? (deck?.effectiveBpm ?? useApp.getState().project.beats.bpm) : null,
  });
  if (ok) recordSound(soundId);
  return ok;
}

export function SoundPicker({ onPick, onClose, title = 'Choose a sound' }: { onPick: (id: string) => void; onClose: () => void; title?: string }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('');
  const favs = useApp((s) => s.project.pads.favorites);
  const list = allSounds().filter((s) => (!cat || (cat === 'fav' ? favs.includes(s.id) : s.category === cat)) && s.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="search-box" style={{ flex: 1, minWidth: 180 }}>
          <Search size={15} />
          <input className="input" placeholder="Search sounds" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sounds" autoFocus />
        </div>
        <select className="select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          <option value="fav">★ Favourites</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="sound-pick-grid">
        {list.map((s) => (
          <div key={s.id} className="sound-pick" style={{ ['--hue' as string]: s.hue }}>
            <button className="btn ghost sm" onClick={() => triggerSound(s.id, 0.8, false)} aria-label={`Preview ${s.name}`}>
              ▶
            </button>
            <div className="spacer">
              <div className="t">{s.name}</div>
              <div className="muted small">{s.category}</div>
            </div>
            <button className="btn sm" onClick={() => onPick(s.id)}>
              Choose
            </button>
          </div>
        ))}
        {list.length === 0 && <div className="empty">No sounds match.</div>}
      </div>
    </Modal>
  );
}

export function Pads() {
  useEngineVersion();
  const pads = useApp((s) => s.project.pads);
  const mutate = useApp((s) => s.mutate);
  const [edit, setEdit] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const g = grooveDeck();

  return (
    <div className="pads-panel">
      <div className="panel-toolbar wrap">
        <button
          className={`btn sm${pads.quantize ? ' on' : ''}`}
          aria-pressed={pads.quantize}
          onClick={() => mutate((p) => void (p.pads.quantize = !p.pads.quantize))}
          data-tip="Quantize: hits land on the next 16th note of the playing deck, loops start on the next bar"
        >
          <Magnet /> Quantize {pads.quantize ? 'on' : 'off'}
        </button>
        <span className="muted small">{g ? `Locked to Deck ${g}` : 'No deck playing — pads fire instantly'}</span>
        <span className="spacer" />
        <label className="row small" style={{ minWidth: 160 }}>
          <span className="eyebrow">Pads</span>
          <Range label="Pad volume" value={pads.volume} min={0} max={1} step={0.01} onChange={(v) => mutate((p) => void (p.pads.volume = v))} />
        </label>
        <button className="btn ghost sm" onClick={() => engine.ctx && engine.sampler.stopAll()} data-tip="Stop all pads and loops">
          <Square /> Stop all
        </button>
        <button className={`btn sm${edit ? ' on' : ''}`} aria-pressed={edit} onClick={() => setEdit((e) => !e)}>
          {edit ? <Check /> : <Pencil />} {edit ? 'Done' : 'Edit pads'}
        </button>
      </div>
      <div className={`pad-grid${edit ? ' editing' : ''}`} data-testid="pad-grid">
        {pads.assignments.map((id, i) => {
          const s = id ? soundById(id) : null;
          const looping = !!id && !!s?.loop && !!engine.ctx && engine.sampler.isPlaying(id);
          return (
            <div key={i} className="pad-cell">
              <button
                className={`pad${s ? '' : ' empty'}${looping ? ' looping' : ''}`}
                style={{ ['--hue' as string]: s?.hue ?? 220 }}
                data-testid={`pad-${i}`}
                aria-label={s ? `${s.name}${s.loop ? (looping ? ' (looping — tap to stop)' : ' (loop)') : ''}` : `Empty pad ${i + 1}`}
                onPointerDown={(e) => {
                  if (edit || !id) {
                    setPicking(i);
                    return;
                  }
                  e.currentTarget.dataset.hit = '1';
                  const el = e.currentTarget;
                  setTimeout(() => (el.dataset.hit = '0'), 140);
                  triggerSound(id, pads.volumes[i], pads.quantize);
                }}
              >
                <span className="pad-name">{s ? s.name : '+ Assign'}</span>
                {s && <span className="pad-cat">{s.loop ? <><Repeat size={11} /> loop</> : s.category}</span>}
                {s && pads.favorites.includes(s.id) && <Star size={11} className="pad-fav" />}
              </button>
              {edit && s && (
                <div className="pad-edit">
                  <Range label={`Pad ${i + 1} volume`} value={pads.volumes[i]} min={0} max={1.2} step={0.01} onChange={(v) => mutate((p) => void (p.pads.volumes[i] = v))} />
                  <button className="btn ghost xs" onClick={() => mutate((p) => void (p.pads.assignments[i] = null))}>
                    Clear
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {picking !== null && (
        <SoundPicker
          title={`Assign a sound to pad ${picking + 1}`}
          onClose={() => setPicking(null)}
          onPick={(sid) => {
            mutate((p) => void (p.pads.assignments[picking] = sid));
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}
