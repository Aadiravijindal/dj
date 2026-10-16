import { useEffect, useRef, useState } from 'react';
import { engine } from '../../audio/engine';
import type { DeckId } from '../../project/types';
import { useApp } from '../../state/store';
import { useRaf, useEngineVersion } from '../../ui/hooks';
import { demoSections } from '../../catalog/demoTracks';
import { ZoomIn, ZoomOut, AlertTriangle, Disc3 } from 'lucide-react';

const DECK_RGB: Record<DeckId, [number, number, number]> = { A: [255, 138, 76], B: [56, 208, 192] };
const HOT_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9', '#4dabf7', '#9775fa', '#f783ac'];
const ZOOMS = [2, 4, 8, 16, 32];

function setupCanvas(c: HTMLCanvasElement) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function colorFor(id: DeckId, low: number, mid: number, high: number, alpha = 1) {
  const [r, g, b] = DECK_RGB[id];
  // lows take the deck colour, mids lean neutral, highs go bright
  const R = r * (low + mid * 0.55) + 235 * high + 120 * mid * 0.45;
  const G = g * (low + mid * 0.55) + 240 * high + 125 * mid * 0.45;
  const B = b * (low + mid * 0.55) + 255 * high + 140 * mid * 0.45;
  return `rgba(${Math.min(255, R) | 0},${Math.min(255, G) | 0},${Math.min(255, B) | 0},${alpha})`;
}

export function Waveform({ id, compact = false }: { id: DeckId; compact?: boolean }) {
  useEngineVersion();
  const deck = engine.ctx ? engine.decks[id] : null;
  const hotCues = useApp((s) => s.project.decks[id].hotCues);
  const cue = useApp((s) => s.project.decks[id].cue);
  const [zoomIdx, setZoomIdx] = useState(2);
  const zoomRef = useRef<HTMLCanvasElement>(null);
  const overRef = useRef<HTMLCanvasElement>(null);
  const overCache = useRef<{ key: string; img: HTMLCanvasElement } | null>(null);
  const drag = useRef<{ x: number; pos: number; t: number; scratch: boolean } | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const status = deck?.status ?? 'empty';
  const meta = deck?.meta;
  const sections = meta?.providerId === 'demo' ? demoSections(meta.id.slice(5)) : [];
  const windowSec = ZOOMS[zoomIdx];

  useEffect(() => {
    overCache.current = null;
  }, [deck?.analysis]);

  useRaf(() => {
    if (!deck) return;
    if (status === 'loading' && progressRef.current) progressRef.current.style.width = `${Math.round(deck.loadProgress * 100)}%`;
    const wf = deck.analysis?.waveform;
    if (status !== 'ready' || !wf) return;
    const pos = deck.getPosition();
    const dur = deck.duration;
    const bl = deck.beatLen;
    const fb = deck.meta?.firstBeat ?? 0;

    // ---------- zoomed view
    const zc = zoomRef.current;
    if (zc && zc.clientWidth > 0) {
      const { ctx, w, h } = setupCanvas(zc);
      ctx.clearRect(0, 0, w, h);
      const t0 = pos - windowSec / 2;
      const secPerPx = windowSec / w;
      const mid = h / 2;
      // loop region
      const L = deck.loop;
      if (L) {
        const x0 = (L.start - t0) / secPerPx;
        const x1 = (L.end - t0) / secPerPx;
        ctx.fillStyle = deck.loopActive || deck.isRolling ? 'rgba(90,212,138,0.18)' : 'rgba(255,255,255,0.06)';
        ctx.fillRect(x0, 0, x1 - x0, h);
        ctx.fillStyle = deck.loopActive || deck.isRolling ? 'rgba(90,212,138,0.9)' : 'rgba(255,255,255,0.3)';
        ctx.fillRect(x0, 0, 2, h);
        ctx.fillRect(x1 - 2, 0, 2, h);
      }
      // beat grid
      if (bl) {
        const firstBeat = Math.ceil((t0 - fb) / bl);
        for (let b = firstBeat; fb + b * bl < t0 + windowSec; b++) {
          const x = (fb + b * bl - t0) / secPerPx;
          const isBar = ((b % 4) + 4) % 4 === 0;
          ctx.fillStyle = isBar ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)';
          ctx.fillRect(Math.round(x), 0, 1, h);
          if (isBar && b >= 0 && windowSec <= 16) {
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.font = '10px "JetBrains Mono Variable", monospace';
            ctx.fillText(String(b / 4 + 1), x + 3, 11);
          }
        }
      }
      // waveform columns
      const bs = wf.bucketSeconds;
      for (let x = 0; x < w; x++) {
        const ta = t0 + x * secPerPx;
        if (ta < 0 || ta > dur) continue;
        const i0 = Math.floor(ta / bs);
        const i1 = Math.max(i0 + 1, Math.floor((ta + secPerPx) / bs));
        let p = 0, lo = 0, md = 0, hi = 0, n = 0;
        for (let i = i0; i < i1 && i < wf.length; i++) {
          if (wf.peak[i] > p) p = wf.peak[i];
          lo += wf.low[i];
          md += wf.mid[i];
          hi += wf.high[i];
          n++;
        }
        if (!n) continue;
        const played = ta < pos;
        ctx.fillStyle = colorFor(id, lo / n, md / n, hi / n, played ? 0.55 : 1);
        const ph = Math.max(1, p * (mid - 4));
        ctx.fillRect(x, mid - ph, 1, ph * 2);
      }
      // cue + hot cues
      const marker = (t: number, color: string, label: string) => {
        const x = (t - t0) / secPerPx;
        if (x < -10 || x > w + 10) return;
        ctx.fillStyle = color;
        ctx.fillRect(x - 1, 0, 2, h);
        ctx.beginPath();
        ctx.moveTo(x - 6, h);
        ctx.lineTo(x + 6, h);
        ctx.lineTo(x, h - 8);
        ctx.fill();
        if (label) {
          ctx.fillRect(x, 0, 14, 14);
          ctx.fillStyle = '#111';
          ctx.font = 'bold 10px Inter, sans-serif';
          ctx.fillText(label, x + 4, 11);
        }
      };
      marker(cue, '#f4f4f8', '');
      hotCues.forEach((t, i) => t !== null && marker(t, HOT_COLORS[i], String(i + 1)));
      // playhead
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.round(w / 2) - 1, 0, 2, h);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.moveTo(w / 2 - 6, 0);
      ctx.lineTo(w / 2 + 6, 0);
      ctx.lineTo(w / 2, 7);
      ctx.fill();
    }

    // ---------- overview
    const oc = overRef.current;
    if (oc && oc.clientWidth > 0) {
      const { ctx, w, h } = setupCanvas(oc);
      const key = `${w}x${h}`;
      if (!overCache.current || overCache.current.key !== key) {
        const img = document.createElement('canvas');
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        img.width = w * dpr;
        img.height = h * dpr;
        const ic = img.getContext('2d')!;
        ic.scale(dpr, dpr);
        const per = wf.length / w;
        for (let x = 0; x < w; x++) {
          const i0 = Math.floor(x * per);
          const i1 = Math.max(i0 + 1, Math.floor((x + 1) * per));
          let p = 0, lo = 0, md = 0, hi = 0, n = 0;
          for (let i = i0; i < i1; i++) {
            if (wf.peak[i] > p) p = wf.peak[i];
            lo += wf.low[i];
            md += wf.mid[i];
            hi += wf.high[i];
            n++;
          }
          ic.fillStyle = colorFor(id, lo / n, md / n, hi / n);
          const ph = Math.max(1, p * (h / 2 - 2));
          ic.fillRect(x, h / 2 - ph, 1, ph * 2);
        }
        overCache.current = { key, img };
      }
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(overCache.current.img, 0, 0, w, h);
      const px = (pos / dur) * w;
      ctx.fillStyle = 'rgba(10,11,15,0.55)';
      ctx.fillRect(0, 0, px, h);
      if (deck.loop) {
        ctx.fillStyle = deck.loopActive ? 'rgba(90,212,138,0.5)' : 'rgba(255,255,255,0.25)';
        ctx.fillRect((deck.loop.start / dur) * w, 0, Math.max(2, ((deck.loop.end - deck.loop.start) / dur) * w), h);
      }
      hotCues.forEach((t, i) => {
        if (t === null) return;
        ctx.fillStyle = HOT_COLORS[i];
        ctx.fillRect((t / dur) * w - 1, 0, 2, h);
      });
      ctx.fillStyle = '#fff';
      ctx.fillRect(px - 1, 0, 2, h);
    }
  });

  if (!deck || status === 'empty') {
    return (
      <div className={`wave-empty${compact ? ' compact' : ''}`}>
        <Disc3 size={18} />
        <span>Deck {id} is empty — load a track from the library.</span>
      </div>
    );
  }
  if (status === 'loading') {
    return (
      <div className={`wave-empty loading${compact ? ' compact' : ''}`} aria-busy="true">
        <span>
          Preparing <b>{meta?.title}</b>… rendering audio and analysing the waveform
        </span>
        <div className="progress" style={{ width: '60%' }}>
          <i ref={progressRef} style={{ width: '0%' }} />
        </div>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className={`wave-empty error${compact ? ' compact' : ''}`} role="alert">
        <AlertTriangle size={18} />
        <span>{deck.error}</span>
      </div>
    );
  }

  const seekFromOverview = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    deck.seek(((e.clientX - r.left) / r.width) * deck.duration);
  };

  return (
    <div className={`wave${compact ? ' compact' : ''}`} data-deck={id}>
      <div className="wave-zoom-wrap">
        <canvas
          ref={zoomRef}
          className="wave-zoom"
          aria-label={`Deck ${id} waveform, drag to scrub`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const scratch = deck.playing;
            drag.current = { x: e.clientX, pos: deck.getPosition(), t: performance.now(), scratch };
            if (scratch) deck.scratchStart();
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const w = e.currentTarget.clientWidth;
            const deltaSec = -((e.clientX - d.x) / w) * windowSec;
            const now = performance.now();
            if (d.scratch) deck.scratchMove(deltaSec, (now - d.t) / 1000);
            else deck.seek(d.pos + deltaSec);
            if (d.scratch) {
              d.x = e.clientX;
              d.t = now;
            }
          }}
          onPointerUp={() => {
            if (drag.current?.scratch) deck.scratchEnd();
            drag.current = null;
          }}
          onPointerCancel={() => {
            if (drag.current?.scratch) deck.scratchEnd();
            drag.current = null;
          }}
          onWheel={(e) => {
            if (!e.ctrlKey && !e.altKey) return;
            setZoomIdx((z) => Math.max(0, Math.min(ZOOMS.length - 1, z + (e.deltaY > 0 ? 1 : -1))));
          }}
        />
        <div className="wave-zoom-ctl">
          <button className="btn ghost icon-btn xs" aria-label="Zoom in" data-tip="Zoom in" onClick={() => setZoomIdx((z) => Math.max(0, z - 1))} disabled={zoomIdx === 0}>
            <ZoomIn size={13} />
          </button>
          <span className="mono">{windowSec}s</span>
          <button className="btn ghost icon-btn xs" aria-label="Zoom out" data-tip="Zoom out" onClick={() => setZoomIdx((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoomIdx === ZOOMS.length - 1}>
            <ZoomOut size={13} />
          </button>
        </div>
      </div>
      <div className="wave-over-wrap">
        <canvas
          ref={overRef}
          className="wave-over"
          aria-label={`Deck ${id} track overview, click to jump`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            seekFromOverview(e);
          }}
          onPointerMove={(e) => e.buttons && seekFromOverview(e)}
        />
        {sections.length > 0 && (
          <div className="wave-sections" aria-hidden>
            {sections.map((s) => (
              <span key={s.name + s.start} style={{ left: `${(s.start / deck.duration) * 100}%`, width: `${((s.end - s.start) / deck.duration) * 100}%` }}>
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
