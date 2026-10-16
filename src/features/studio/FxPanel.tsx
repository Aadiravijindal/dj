import { useState, type ReactElement } from 'react';
import { Power, Waves, AudioWaveform, Sparkles, Wind, Flame, Orbit, RotateCcw, TrendingUp, TrendingDown, Maximize2, Repeat2, Mountain } from 'lucide-react';
import type { DeckId, FxName, FxSettings } from '../../project/types';
import { useApp } from '../../state/store';
import { Knob } from '../../ui/Knob';
import { Range } from '../../ui/Range';
import { defaultFx } from '../../project/defaults';
import { engine } from '../../audio/engine';
import { useEngineVersion } from '../../ui/hooks';

type Patch = { [K in FxName]?: Partial<FxSettings[K]> };

export function patchFx(deck: DeckId, patch: Patch) {
  useApp.getState().mutate((p) => {
    for (const k of Object.keys(patch) as FxName[]) Object.assign(p.fx[deck][k], patch[k]);
  });
}

const FX_META: Record<FxName, { name: string; icon: typeof Waves; desc: string }> = {
  filter: { name: 'Filter', icon: AudioWaveform, desc: 'Left: low-pass (muffled, darker). Right: high-pass (thin, tense). Centre: off.' },
  echo: { name: 'Echo', icon: Repeat2, desc: 'Repeats the sound in time with the beat. Feedback = how many repeats.' },
  reverb: { name: 'Reverb', icon: Mountain, desc: 'Puts the track in a bigger room. Decay = how long the space rings.' },
  flanger: { name: 'Flanger', icon: Orbit, desc: 'A sweeping jet-plane swoosh.' },
  phaser: { name: 'Phaser', icon: Wind, desc: 'A softer, swirling sweep.' },
  drive: { name: 'Drive', icon: Flame, desc: 'Adds grit and saturation. Use gently — it gets loud.' },
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const beats = (v: number) => (v >= 1 ? `${v} beat${v > 1 ? 's' : ''}` : `1/${Math.round(1 / v)} beat`);

/** Beginner macros: each maps to specific, visible parameter changes. */
const MACROS: { key: string; label: string; icon: typeof Waves; tip: string; patch: (f: FxSettings) => Patch }[] = [
  {
    key: 'tension',
    label: 'Build tension',
    icon: TrendingUp,
    tip: 'High-pass filter up + a little echo. Pull it back at the drop.',
    patch: () => ({ filter: { enabled: true, amount: 0.55, resonance: 0.45 }, echo: { enabled: true, time: 0.5, feedback: 0.45, mix: 0.3 } }),
  },
  {
    key: 'spacious',
    label: 'Make it spacious',
    icon: Maximize2,
    tip: 'Turns on a large reverb.',
    patch: () => ({ reverb: { enabled: true, decay: 4, mix: 0.45 } }),
  },
  {
    key: 'repeat',
    label: 'Rhythmic repeats',
    icon: Repeat2,
    tip: 'Half-beat echo with plenty of feedback.',
    patch: () => ({ echo: { enabled: true, time: 0.5, feedback: 0.6, mix: 0.5 } }),
  },
  {
    key: 'intense',
    label: 'More intense',
    icon: Flame,
    tip: 'Adds drive and a touch of flanger.',
    patch: () => ({ drive: { enabled: true, amount: 0.45, mix: 0.45 }, flanger: { enabled: true, rate: 0.25, depth: 0.5, feedback: 0.4, mix: 0.3 } }),
  },
  {
    key: 'calmer',
    label: 'Less intense',
    icon: TrendingDown,
    tip: 'Low-pass filter takes the edge off; drive and flanger off.',
    patch: () => ({ filter: { enabled: true, amount: -0.45, resonance: 0.2 }, drive: { enabled: false }, flanger: { enabled: false } }),
  },
];

function FxCard({ deck, name, f, pro }: { deck: DeckId; name: FxName; f: FxSettings; pro: boolean }) {
  const m = FX_META[name];
  const Icon = m.icon;
  const on = f[name].enabled;
  const color = deck === 'A' ? 'var(--deck-a)' : 'var(--deck-b)';
  const set = (patch: Partial<FxSettings[typeof name]>) => patchFx(deck, { [name]: patch } as Patch);
  let controls: ReactElement | null = null;
  switch (name) {
    case 'filter':
      controls = (
        <>
          <div className="fx-filter">
            <span className="muted">Darker</span>
            <Range
              label={`Deck ${deck} filter`}
              value={f.filter.amount}
              min={-1}
              max={1}
              step={0.01}
              center
              color={color}
              testId={`fx-filter-${deck}`}
              onChange={(v) => set({ amount: v, enabled: Math.abs(v) > 0.01 || on })}
              onDoubleClick={() => set({ amount: 0 })}
              format={(v) => (v < 0 ? `low-pass ${pct(-v)}` : v > 0 ? `high-pass ${pct(v)}` : 'open')}
            />
            <span className="muted">Thinner</span>
          </div>
          {pro && <Knob label="Resonance" value={f.filter.resonance} min={0} max={1} onChange={(v) => set({ resonance: v })} format={pct} size={34} color={color} />}
        </>
      );
      break;
    case 'echo':
      controls = (
        <>
          <Knob label="Amount" value={f.echo.mix} min={0} max={1} onChange={(v) => set({ mix: v })} format={pct} size={38} color={color} />
          <Knob label="Repeats" value={f.echo.feedback} min={0} max={0.85} onChange={(v) => set({ feedback: v })} format={pct} size={38} color={color} />
          {pro ? (
            <div className="stack" style={{ gap: 4 }}>
              <span className="eyebrow">Time</span>
              <div className="loops tight">
                {[0.25, 0.5, 0.75, 1].map((t) => (
                  <button key={t} className={`loopbtn${f.echo.time === t ? ' active' : ''}`} onClick={() => set({ time: t })} aria-pressed={f.echo.time === t}>
                    {t === 0.75 ? '3/4' : t < 1 ? `1/${1 / t}` : '1'}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <span className="muted small">{beats(f.echo.time)}</span>
          )}
        </>
      );
      break;
    case 'reverb':
      controls = (
        <>
          <Knob label="Amount" value={f.reverb.mix} min={0} max={1} onChange={(v) => set({ mix: v })} format={pct} size={38} color={color} />
          <Knob label="Size" value={f.reverb.decay} min={0.5} max={8} onChange={(v) => set({ decay: v })} format={(v) => `${v.toFixed(1)} s`} size={38} color={color} />
        </>
      );
      break;
    case 'flanger':
      controls = (
        <>
          <Knob label="Amount" value={f.flanger.mix} min={0} max={1} onChange={(v) => set({ mix: v })} format={pct} size={38} color={color} />
          <Knob label="Speed" value={f.flanger.rate} min={0.05} max={4} onChange={(v) => set({ rate: v })} format={(v) => `${v.toFixed(2)} Hz`} size={38} color={color} />
          {pro && <Knob label="Depth" value={f.flanger.depth} min={0} max={1} onChange={(v) => set({ depth: v })} format={pct} size={34} color={color} />}
          {pro && <Knob label="Feedback" value={f.flanger.feedback} min={0} max={0.8} onChange={(v) => set({ feedback: v })} format={pct} size={34} color={color} />}
        </>
      );
      break;
    case 'phaser':
      controls = (
        <>
          <Knob label="Amount" value={f.phaser.mix} min={0} max={1} onChange={(v) => set({ mix: v })} format={pct} size={38} color={color} />
          <Knob label="Speed" value={f.phaser.rate} min={0.05} max={4} onChange={(v) => set({ rate: v })} format={(v) => `${v.toFixed(2)} Hz`} size={38} color={color} />
          {pro && <Knob label="Depth" value={f.phaser.depth} min={0} max={1} onChange={(v) => set({ depth: v })} format={pct} size={34} color={color} />}
        </>
      );
      break;
    case 'drive':
      controls = (
        <>
          <Knob label="Amount" value={f.drive.mix} min={0} max={1} onChange={(v) => set({ mix: v })} format={pct} size={38} color={color} />
          <Knob label="Grit" value={f.drive.amount} min={0} max={1} onChange={(v) => set({ amount: v })} format={pct} size={38} color={color} />
        </>
      );
      break;
  }
  return (
    <div className={`fx-card${on ? ' on' : ''}`} style={{ ['--deck' as string]: color }} data-testid={`fx-card-${name}-${deck}`}>
      <div className="fx-card-head">
        <Icon size={16} />
        <b>{m.name}</b>
        <span className="spacer" />
        <button
          className={`fx-power${on ? ' on' : ''}`}
          role="switch"
          aria-checked={on}
          aria-label={`${m.name} on deck ${deck}`}
          data-testid={`fx-toggle-${name}-${deck}`}
          onClick={() => {
            engine.resume();
            set({ enabled: !on } as Partial<FxSettings[typeof name]>);
          }}
        >
          <Power size={13} />
        </button>
      </div>
      <p className="fx-desc">{m.desc}</p>
      <div className="fx-controls">{controls}</div>
    </div>
  );
}

export function FxPanel({ initialDeck = 'A' as DeckId }) {
  useEngineVersion();
  const [deck, setDeck] = useState<DeckId>(initialDeck);
  const f = useApp((s) => s.project.fx[deck]);
  const mode = useApp((s) => s.settings.mode);
  const pro = mode === 'pro';
  const names: FxName[] = ['filter', 'echo', 'reverb', 'flanger', 'phaser', 'drive'];
  const playing = engine.ctx ? engine.decks[deck].playing : false;
  return (
    <div className="fx-panel">
      <div className="panel-toolbar">
        <div className="seg" role="group" aria-label="Effects target deck">
          {(['A', 'B'] as DeckId[]).map((d) => (
            <button key={d} aria-pressed={deck === d} onClick={() => setDeck(d)} className={`deck-seg-${d.toLowerCase()}`}>
              Deck {d}
            </button>
          ))}
        </div>
        {!playing && <span className="muted small">Effects apply to Deck {deck}. Press play to hear them.</span>}
        <span className="spacer" />
        <button className="btn ghost sm" onClick={() => useApp.getState().mutate((p) => void (p.fx[deck] = defaultFx()))} data-tip="Turn every effect off and reset its settings">
          <RotateCcw /> Reset all
        </button>
      </div>
      <div className="macros" role="group" aria-label="Quick effect ideas">
        <Sparkles size={15} className="muted" />
        {MACROS.map((m) => (
          <button
            key={m.key}
            className="btn sm"
            data-tip={m.tip}
            onClick={() => {
              engine.resume();
              patchFx(deck, m.patch(f));
              useApp.getState().toast('info', `${m.label} applied to Deck ${deck}. Tweak the controls below, or Reset all.`);
            }}
          >
            <m.icon /> {m.label}
          </button>
        ))}
      </div>
      <div className="fx-grid">
        {names.map((n) => (
          <FxCard key={n} deck={deck} name={n} f={f} pro={pro} />
        ))}
      </div>
    </div>
  );
}
