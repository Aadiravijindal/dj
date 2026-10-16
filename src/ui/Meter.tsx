import { useRef } from 'react';
import { useRaf } from './hooks';

/** Segmented level meter driven by requestAnimationFrame (no React re-renders). */
export function Meter({ read, vertical = true, segments = 16, label }: { read: () => number; vertical?: boolean; segments?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const hold = useRef({ v: 0, t: 0, peak: 0 });
  useRaf((t) => {
    const el = ref.current;
    if (!el) return;
    const raw = read();
    // display in dB: -48..+3
    const db = 20 * Math.log10(Math.max(raw, 1e-5));
    const norm = Math.max(0, Math.min(1, (db + 48) / 51));
    const h = hold.current;
    h.v = norm > h.v ? norm : h.v * 0.9 + norm * 0.1;
    if (norm >= h.peak || t - h.t > 900) {
      h.peak = norm;
      h.t = t;
    }
    const lit = Math.round(h.v * segments);
    const pk = Math.min(segments - 1, Math.round(h.peak * segments) - 1);
    const kids = el.children;
    for (let i = 0; i < kids.length; i++) {
      const on = i < lit || i === pk;
      (kids[i] as HTMLElement).dataset.on = on ? '1' : '0';
    }
  });
  return (
    <div ref={ref} className={`meter${vertical ? ' v' : ' h'}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={1}>
      {Array.from({ length: segments }, (_, i) => (
        <i key={i} data-zone={i >= segments - 2 ? 'hot' : i >= segments - 5 ? 'warm' : 'ok'} />
      ))}
    </div>
  );
}
