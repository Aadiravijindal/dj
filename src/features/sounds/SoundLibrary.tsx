import { useState, useSyncExternalStore } from 'react';
import { Play, Square, Star, Search, Repeat, Package } from 'lucide-react';
import { allPacks, CATEGORIES, type SoundDef } from '../../audio/soundLibrary';
import { useApp, toast } from '../../state/store';
import { triggerSound } from '../beats/Pads';
import { engine } from '../../audio/engine';
import { MiniDecks } from '../beats/BeatPlayground';

function SoundRow({ s }: { s: SoundDef }) {
  const fav = useApp((st) => st.project.pads.favorites.includes(s.id));
  const pads = useApp((st) => st.project.pads.assignments);
  const mutate = useApp((st) => st.mutate);
  const playing = useSyncExternalStore(
    (cb) => (engine.ctx ? engine.sampler.onChange(cb) : () => {}),
    () => !!engine.ctx && !!s.loop && engine.sampler.isPlaying(s.id),
  );
  const assigned = pads.map((p, i) => (p === s.id ? i + 1 : 0)).filter(Boolean);
  return (
    <div className="sound-row" style={{ ['--hue' as string]: s.hue }} data-testid="sound-row">
      <button className={`sound-play${playing ? ' on' : ''}`} onClick={() => triggerSound(s.id, 0.85, true)} aria-label={playing ? `Stop ${s.name}` : `Play ${s.name}`}>
        {playing ? <Square size={14} /> : <Play size={15} />}
      </button>
      <div className="spacer" style={{ minWidth: 0 }}>
        <div className="ellipsis">
          {s.name} {s.loop && <span className="chip tiny"><Repeat size={10} /> loop · follows tempo</span>}
        </div>
        <div className="small muted">
          {s.category}
          {assigned.length ? ` · on pad ${assigned.join(', ')}` : ''}
        </div>
      </div>
      <button
        className={`btn ghost icon-btn sm${fav ? ' fav-on' : ''}`}
        aria-pressed={fav}
        aria-label={fav ? `Unfavourite ${s.name}` : `Favourite ${s.name}`}
        onClick={() => mutate((p) => void (p.pads.favorites = fav ? p.pads.favorites.filter((x) => x !== s.id) : [...p.pads.favorites, s.id]))}
      >
        <Star />
      </button>
      <select
        className="select"
        style={{ height: 30, width: 112 }}
        value=""
        aria-label={`Assign ${s.name} to a pad`}
        onChange={(e) => {
          const i = Number(e.target.value);
          if (!e.target.value) return;
          mutate((p) => void (p.pads.assignments[i] = s.id));
          toast('success', `${s.name} assigned to pad ${i + 1}.`);
        }}
      >
        <option value="">Assign to…</option>
        {pads.map((p, i) => (
          <option key={i} value={i}>
            Pad {i + 1}
            {p ? '' : ' (empty)'}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SoundLibrary() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const favs = useApp((s) => s.project.pads.favorites);
  const packs = allPacks();
  return (
    <div className="page sounds" data-testid="sound-library">
      <header className="page-head">
        <div>
          <h1>Sound Library</h1>
          <p className="muted">Drums, rolls, risers, impacts, vocal-style chops and tempo loops — all synthesised by MIXPLAY, so they’re yours to use.</p>
        </div>
      </header>
      <MiniDecks />
      <div className="lib-controls">
        <div className="search-box">
          <Search size={16} />
          <input className="input" placeholder="Search sounds" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sounds" />
        </div>
        <div className="chip-row" role="group" aria-label="Category filter">
          <button className="chip" aria-pressed={cat === ''} onClick={() => setCat('')}>
            All
          </button>
          <button className="chip" aria-pressed={cat === 'fav'} onClick={() => setCat('fav')}>
            ★ Favourites
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>
      {packs.map((p) => {
        const list = p.sounds.filter((s) => (cat === '' || (cat === 'fav' ? favs.includes(s.id) : s.category === cat)) && s.name.toLowerCase().includes(q.toLowerCase()));
        if (!list.length) return null;
        return (
          <section key={p.id} className="pack">
            <div className="pack-head">
              <Package size={16} />
              <b>{p.name}</b>
              <span className="muted small">{p.description}</span>
              <span className="spacer" />
              <span className="chip tiny ok">{p.license}</span>
            </div>
            <div className="sound-list">
              {list.map((s) => (
                <SoundRow key={s.id} s={s} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
