import { useRef } from 'react';
import { engine } from '../../audio/engine';
import { SECONDS_PER_REV } from '../../audio/deck';
import type { DeckId } from '../../project/types';
import { useRaf } from '../../ui/hooks';
import { Artwork } from '../../ui/Artwork';

interface Props {
  id: DeckId;
  vinyl: boolean;
  size?: number;
}

/**
 * Virtual jog wheel, wired to the audio engine:
 *  - Vinyl mode: touching the platter grabs the record — drag to scratch
 *    (forward and backward), release to let it play on.
 *  - Otherwise: while playing, spinning nudges the tempo (pitch bend) to
 *    line up beats; while paused, it scrubs through the track.
 */
export function JogWheel({ id, vinyl, size = 168 }: Props) {
  const platter = useRef<HTMLDivElement>(null);
  const wheel = useRef<HTMLDivElement>(null);
  const g = useRef<{ angle: number; t: number; mode: 'scratch' | 'nudge' | 'scrub'; cx: number; cy: number } | null>(null);
  const deck = engine.ctx ? engine.decks[id] : null;

  useRaf(() => {
    const el = platter.current;
    if (!el || !deck) return;
    const pos = deck.getPosition();
    el.style.transform = `rotate(${(pos / SECONDS_PER_REV) * 360}deg)`;
    if (wheel.current) wheel.current.dataset.touch = g.current ? '1' : '0';
  });

  const angleOf = (e: React.PointerEvent) => {
    const s = g.current!;
    return (Math.atan2(e.clientY - s.cy, e.clientX - s.cx) * 180) / Math.PI;
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!deck || deck.status !== 'ready') return;
    engine.resume();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    const mode = vinyl ? 'scratch' : deck.playing ? 'nudge' : 'scrub';
    g.current = { angle: 0, t: performance.now(), mode, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    g.current.angle = angleOf(e);
    if (mode === 'scratch') deck.scratchStart();
  };

  const onMove = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s || !deck) return;
    const a = angleOf(e);
    let d = a - s.angle;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    const now = performance.now();
    const dt = Math.max(0.001, (now - s.t) / 1000);
    const deltaSec = (d / 360) * SECONDS_PER_REV;
    if (s.mode === 'scratch') deck.scratchMove(deltaSec, dt);
    else if (s.mode === 'nudge') {
      const degPerSec = d / dt;
      deck.nudge(Math.max(-0.08, Math.min(0.08, degPerSec / 4000)));
    } else deck.scrub(deltaSec);
    s.angle = a;
    s.t = now;
  };

  const onUp = () => {
    const s = g.current;
    g.current = null;
    if (!s || !deck) return;
    if (s.mode === 'scratch') deck.scratchEnd();
    if (s.mode === 'nudge') deck.nudge(0);
  };

  const meta = deck?.meta;
  return (
    <div
      className={`jog deck-${id.toLowerCase()}${vinyl ? ' vinyl' : ''}`}
      style={{ width: size, height: size }}
      ref={wheel}
      role="slider"
      aria-label={`Deck ${id} jog wheel — ${vinyl ? 'drag to scratch' : 'drag to nudge or scrub'}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
      tabIndex={0}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={(e) => {
        if (!deck || deck.status !== 'ready') return;
        const step = e.shiftKey ? 1 : 0.1;
        if (e.key === 'ArrowLeft') deck.scrub(-step);
        else if (e.key === 'ArrowRight') deck.scrub(step);
        else return;
        e.preventDefault();
      }}
      onWheel={(e) => {
        if (!deck || deck.status !== 'ready') return;
        if (deck.playing) {
          deck.nudge(e.deltaY > 0 ? -0.03 : 0.03);
          setTimeout(() => deck.nudge(0), 120);
        } else deck.scrub(e.deltaY > 0 ? 0.05 : -0.05);
      }}
    >
      <div className="jog-platter" ref={platter}>
        <div className="jog-grooves" />
        <div className="jog-label">{meta ? <Artwork art={meta.artwork} size={size * 0.34} radius={size} /> : null}</div>
        <div className="jog-mark" />
      </div>
    </div>
  );
}
