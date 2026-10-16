import type { ReactElement } from 'react';
import type { Artwork as Art } from '../catalog/types';
import { Music2 } from 'lucide-react';

/** Generated, original cover art for demo tracks (no third-party imagery). */
export function Artwork({ art, size = 48, radius = 10, title }: { art: Art | null; size?: number; radius?: number; title?: string }) {
  if (!art) {
    return (
      <div className="art art-empty" style={{ width: size, height: size, borderRadius: radius }} aria-hidden>
        <Music2 size={size * 0.4} />
      </div>
    );
  }
  const [h1, h2] = art.hues;
  const id = `g${h1}-${h2}-${art.pattern}`;
  const c1 = `hsl(${h1} 85% 60%)`;
  const c2 = `hsl(${h2} 70% 38%)`;
  const ink = `hsl(${h1} 90% 88% / 0.55)`;
  let body: ReactElement;
  switch (art.pattern) {
    case 'rings':
      body = <>{[14, 22, 30, 38].map((r) => <circle key={r} cx="50" cy="50" r={r} fill="none" stroke={ink} strokeWidth="2" />)}</>;
      break;
    case 'grid':
      body = <>{[20, 40, 60, 80].map((p) => <g key={p}><line x1={p} y1="0" x2={p} y2="100" stroke={ink} strokeWidth="1.5" /><line x1="0" y1={p} x2="100" y2={p} stroke={ink} strokeWidth="1.5" /></g>)}</>;
      break;
    case 'waves':
      body = <>{[30, 45, 60, 75].map((y) => <path key={y} d={`M0 ${y} Q 25 ${y - 12} 50 ${y} T 100 ${y}`} fill="none" stroke={ink} strokeWidth="2.5" />)}</>;
      break;
    case 'sun':
      body = (
        <>
          <circle cx="50" cy="56" r="26" fill={`hsl(${h1} 95% 70%)`} />
          {[62, 68, 74, 80].map((y, i) => <rect key={y} x="18" y={y} width="64" height={2 + i} fill={c2} />)}
        </>
      );
      break;
    case 'stripes':
      body = <>{[0, 16, 32, 48, 64, 80].map((x) => <rect key={x} x={x} y="-20" width="7" height="140" fill={ink} transform="rotate(30 50 50)" />)}</>;
      break;
    case 'dots':
      body = <>{Array.from({ length: 25 }, (_, i) => <circle key={i} cx={10 + (i % 5) * 20} cy={10 + Math.floor(i / 5) * 20} r={2 + ((i * 7) % 5)} fill={ink} />)}</>;
      break;
  }
  return (
    <svg className="art" width={size} height={size} viewBox="0 0 100 100" style={{ borderRadius: radius }} role="img" aria-label={title ? `Artwork for ${title}` : 'Artwork'}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id})`} />
      {body}
    </svg>
  );
}
