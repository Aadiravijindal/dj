import { useEffect, useRef, useSyncExternalStore } from 'react';
import { engine } from '../audio/engine';

/** Re-render when the engine reports a discrete state change (play/pause, load, loop…). */
export function useEngineVersion() {
  return useSyncExternalStore(engine.subscribe, engine.getVersion, engine.getVersion);
}

/** Run a callback every animation frame while mounted (for playheads and meters). */
export function useRaf(cb: (t: number) => void, active = true) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const loop = (t: number) => {
      ref.current(t);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);
}

export function useMediaQuery(q: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(q);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(q).matches,
    () => false,
  );
}

export const fmtTime = (s: number | null | undefined) => {
  if (s === null || s === undefined || !isFinite(s)) return '–:––';
  const neg = s < 0;
  s = Math.abs(s);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${neg ? '-' : ''}${m}:${sec.toString().padStart(2, '0')}`;
};

export const fmtTimeFine = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
};

export const fmtAgo = (t: number) => {
  const d = (Date.now() - t) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
};
