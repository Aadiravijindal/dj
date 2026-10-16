import { useRef } from 'react';
import { Headphones, VolumeX, ShieldCheck } from 'lucide-react';
import { engine } from '../../audio/engine';
import type { DeckId } from '../../project/types';
import { useApp } from '../../state/store';
import { Knob } from '../../ui/Knob';
import { Range } from '../../ui/Range';
import { Meter } from '../../ui/Meter';
import { useRaf } from '../../ui/hooks';

const db = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;

function Strip({ id }: { id: DeckId }) {
  const ch = useApp((s) => s.project.mixer.channels[id]);
  const mode = useApp((s) => s.settings.mode);
  const mutate = useApp((s) => s.mutate);
  const pro = mode === 'pro';
  const color = id === 'A' ? 'var(--deck-a)' : 'var(--deck-b)';
  const set = (fn: (c: typeof ch) => void) =>
    mutate((p) => {
      fn(p.mixer.channels[id]);
    });
  const eqTip = {
    high: 'High (treble): hi-hats, cymbals, sparkle. Turn down to soften.',
    mid: 'Mid: vocals, synths, snares. Cut to make room for the other track.',
    low: 'Low (bass): kick and bassline. Swap lows between decks during a blend — never run two basslines at full.',
  };
  return (
    <div className={`strip strip-${id.toLowerCase()}`} data-testid={`strip-${id}`}>
      <div className="strip-head" style={{ color }}>
        {id}
      </div>
      {pro && (
        <Knob label="Trim" value={ch.gain} min={-12} max={12} defaultValue={0} bipolar onChange={(v) => set((c) => (c.gain = v))} format={db} size={34} color={color} tip="Input gain — match the loudness of the two tracks before mixing." />
      )}
      {(['high', 'mid', 'low'] as const).map((band) => (
        <Knob
          key={band}
          label={band === 'high' ? 'High' : band === 'mid' ? 'Mid' : 'Low'}
          value={ch.eq[band]}
          min={-26}
          max={6}
          defaultValue={0}
          step={0.5}
          bipolar
          size={pro ? 38 : 42}
          color={color}
          tip={eqTip[band]}
          onChange={(v) => set((c) => (c.eq[band] = v))}
          format={(v) => (v <= -25.5 ? 'kill' : db(v))}
        />
      ))}
      <div className="strip-fader">
        <Meter label={`Deck ${id} level`} read={() => (engine.ctx ? engine.channels[id].peak() : 0)} segments={14} />
        <Range
          label={`Deck ${id} volume`}
          value={ch.volume}
          min={0}
          max={1}
          vertical
          color={color}
          testId={`volume-${id}`}
          onChange={(v) => set((c) => (c.volume = v))}
          format={(v) => `${Math.round(v * 100)} percent`}
        />
      </div>
      <div className="row" style={{ justifyContent: 'center', gap: 4 }}>
        <button className={`btn icon-btn xs${ch.mute ? ' on mute-on' : ''}`} aria-pressed={ch.mute} aria-label={`Mute deck ${id}`} data-tip="Mute" onClick={() => set((c) => (c.mute = !c.mute))}>
          <VolumeX />
        </button>
        {pro && (
          <button
            className={`btn icon-btn xs${ch.cue ? ' on' : ''}`}
            aria-pressed={ch.cue}
            aria-label={`Headphone cue deck ${id}`}
            data-tip={engine.cueRouted ? 'Send this deck to your headphones' : 'Headphone cue: choose a second output device in Settings to hear this separately'}
            onClick={() => set((c) => (c.cue = !c.cue))}
          >
            <Headphones />
          </button>
        )}
      </div>
    </div>
  );
}

function MasterStatus() {
  const clip = useRef<HTMLSpanElement>(null);
  const lim = useRef<HTMLSpanElement>(null);
  useRaf(() => {
    if (!engine.ctx) return;
    const m = engine.meters();
    if (clip.current) clip.current.dataset.on = m.clipping ? '1' : '0';
    if (lim.current) lim.current.dataset.on = m.limiterReduction < -1 ? '1' : '0';
  });
  return (
    <div className="master-status">
      <span ref={clip} className="clip-led" data-tip="Lights when the mix goes over 0 dB before the safety limiter. Turn something down." data-testid="clip-led">
        CLIP
      </span>
      <span ref={lim} className="lim-led" data-tip="Safety limiter is working: it stops sudden volume spikes from hurting your ears or speakers.">
        <ShieldCheck size={12} /> LIMIT
      </span>
    </div>
  );
}

export function Mixer() {
  const mixer = useApp((s) => s.project.mixer);
  const mode = useApp((s) => s.settings.mode);
  const mutate = useApp((s) => s.mutate);
  const pro = mode === 'pro';
  const setX = (v: number) =>
    mutate((p) => {
      p.mixer.crossfader = Math.abs(v) < 0.03 ? 0 : v;
    });
  return (
    <section className="mixer" aria-label="Mixer" data-testid="mixer">
      <div className="mixer-strips">
        <Strip id="A" />
        <div className="master">
          <span className="eyebrow">Master</span>
          <Knob
            label="Master"
            value={mixer.master}
            min={0}
            max={1}
            defaultValue={0.9}
            onChange={(v) =>
              mutate((p) => {
                p.mixer.master = v;
              })
            }
            format={(v) => `${Math.round(v * 100)}%`}
            size={44}
            tip="Overall output volume"
          />
          <div className="master-meter">
            <Meter label="Master level" read={() => (engine.ctx ? engine.meters().master : 0)} segments={14} />
          </div>
          <MasterStatus />
          {pro && (
            <Knob
              label="Cue mix"
              value={mixer.cueMix}
              min={0}
              max={1}
              onChange={(v) =>
                mutate((p) => {
                  p.mixer.cueMix = v;
                })
              }
              format={(v) => `${Math.round(v * 100)}%`}
              size={30}
              tip="Headphone (cue) volume"
            />
          )}
        </div>
        <Strip id="B" />
      </div>
      <div className="xfader">
        <div className="row">
          <span className="xf-label a">A</span>
          <span className="eyebrow spacer" style={{ textAlign: 'center' }}>
            Crossfader
          </span>
          <span className="xf-label b">B</span>
        </div>
        <Range
          label="Crossfader"
          value={mixer.crossfader}
          min={-1}
          max={1}
          step={0.005}
          center
          className="xf-range"
          testId="crossfader"
          onChange={setX}
          onDoubleClick={() => setX(0)}
          format={(v) => (v < -0.95 ? 'Deck A only' : v > 0.95 ? 'Deck B only' : v === 0 ? 'Centre — both decks' : `${Math.round(((v + 1) / 2) * 100)} percent toward B`)}
        />
        {pro && (
          <div className="seg" role="group" aria-label="Crossfader curve" style={{ alignSelf: 'center' }}>
            {(['smooth', 'sharp'] as const).map((c) => (
              <button
                key={c}
                aria-pressed={mixer.curve === c}
                onClick={() =>
                  mutate((p) => {
                    p.mixer.curve = c;
                  })
                }
                data-tip={c === 'smooth' ? 'Smooth: gradual blend (constant power)' : 'Sharp: both decks stay loud until the very edge — for cuts and scratching'}
              >
                {c === 'smooth' ? 'Blend' : 'Cut'}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
