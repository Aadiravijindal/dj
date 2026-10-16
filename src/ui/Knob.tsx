import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  /** value shown when double-clicked / reset */
  defaultValue?: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  size?: number;
  color?: string;
  /** draw the arc from the centre (for bipolar controls like EQ and filter) */
  bipolar?: boolean;
  tip?: string;
  disabled?: boolean;
  hideLabel?: boolean;
}

/** Rotary control: drag up/down, scroll, arrow keys; double-click resets. */
export function Knob({ label, value, min, max, defaultValue, step, onChange, format, size = 46, color = 'var(--text)', bipolar, tip, disabled, hideLabel }: Props) {
  const drag = useRef<{ y: number; v: number } | null>(null);
  const range = max - min;
  const t = (value - min) / range;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const quant = (v: number) => (step ? Math.round(v / step) * step : v);
  const set = (v: number) => onChange(clamp(quant(v)));

  const angle = -135 + t * 270;
  const r = size / 2 - 4;
  const cx = size / 2;
  const polar = (a: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cx + r * Math.sin(rad)];
  };
  const arc = (a0: number, a1: number) => {
    if (Math.abs(a1 - a0) < 0.5) return '';
    const [x0, y0] = polar(Math.min(a0, a1));
    const [x1, y1] = polar(Math.max(a0, a1));
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
  };
  const from = bipolar ? 0 : -135;

  const onPointerDown = (e: PointerEvent) => {
    if (disabled) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, v: value };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!drag.current) return;
    const fine = e.shiftKey ? 0.25 : 1;
    const dv = ((drag.current.y - e.clientY) / 160) * range * fine;
    set(drag.current.v + dv);
  };
  const onKey = (e: KeyboardEvent) => {
    const inc = (step ?? range / 100) * (e.shiftKey ? 5 : 1);
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(value + inc);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(value - inc);
    else if (e.key === 'Home') set(min);
    else if (e.key === 'End') set(max);
    else if (e.key === 'Enter' || e.key === 'Backspace') set(defaultValue ?? (bipolar ? (min + max) / 2 : min));
    else return;
    e.preventDefault();
  };

  return (
    <div className={`knob${disabled ? ' disabled' : ''}`} style={{ width: Math.max(size, 44) }} data-tip={tip}>
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value * 100) / 100}
        aria-valuetext={format ? format(value) : undefined}
        aria-disabled={disabled}
        className="knob-dial"
        style={{ width: size, height: size }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => set(defaultValue ?? (bipolar ? (min + max) / 2 : min))}
        onWheel={(e) => {
          if (disabled) return;
          set(value - Math.sign(e.deltaY) * (step ?? range / 50));
        }}
        onKeyDown={onKey}
      >
        <svg width={size} height={size} aria-hidden>
          <path d={arc(-135, 135)} stroke="var(--surface-4)" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d={arc(from, angle)} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx={cx} cy={cx} r={r - 6} fill="var(--surface-3)" stroke="var(--line-2)" />
          <line
            x1={cx}
            y1={cx}
            x2={cx + (r - 9) * Math.sin((angle * Math.PI) / 180)}
            y2={cx - (r - 9) * Math.cos((angle * Math.PI) / 180)}
            stroke="var(--text)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      {!hideLabel && (
        <div className="knob-label">
          <span>{label}</span>
          {format && <span className="mono knob-val">{format(value)}</span>}
        </div>
      )}
    </div>
  );
}
