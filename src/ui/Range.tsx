import type { CSSProperties } from 'react';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  color?: string;
  vertical?: boolean;
  className?: string;
  /** fill from the centre (bipolar) */
  center?: boolean;
  format?: (v: number) => string;
  onDoubleClick?: () => void;
  testId?: string;
  disabled?: boolean;
  style?: CSSProperties;
}

/** Native range input (keyboard + screen-reader accessible) with MIXPLAY styling. */
export function Range({ label, value, min, max, step = 0.001, onChange, color, vertical, className = '', center, format, onDoubleClick, testId, disabled, style }: Props) {
  const pct = ((value - min) / (max - min)) * 100;
  const css = {
    '--pct': center ? '0%' : `${pct}%`,
    '--fill': color ?? 'var(--text-2)',
    ...style,
  } as CSSProperties;
  return (
    <input
      type="range"
      className={`range${vertical ? ' vertical' : ''}${center ? ' center' : ''} ${className}`}
      aria-label={label}
      aria-valuetext={format ? format(value) : undefined}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      data-testid={testId}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      onDoubleClick={onDoubleClick}
      style={css}
    />
  );
}
