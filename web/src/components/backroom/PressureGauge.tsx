import { useEffect, useState } from 'react';

const MAX = 6;
const CX = 100;
const CY = 104;
const R = 78;

/** value 0..6 → point on the dial's upper half (0 at the far left, 6 at the far right) */
function at(v: number, r = R) {
  const t = Math.PI - (v / MAX) * Math.PI;
  return [CX + r * Math.cos(t), CY - r * Math.sin(t)] as const;
}
function arc(a: number, b: number, r = R) {
  const [x1, y1] = at(a, r);
  const [x2, y2] = at(b, r);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * A brass pressure dial, 0 to 6. The needle swings up from zero when the answer lands; the last two
 * segments are the red zone where a buyer starts to crack.
 */
export function PressureGauge({ value, delay = 450 }: { value: number; delay?: number }) {
  const v = Math.max(0, Math.min(MAX, value));
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = window.setTimeout(() => setShown(v), delay);
    return () => window.clearTimeout(t);
  }, [v, delay]);
  const cracking = v >= 4;

  return (
    <div className="gauge" data-tour="pressure" role="img" aria-label={`Pressure ${v} of ${MAX}${cracking ? ', rattled' : ''}`}>
      <svg viewBox="0 0 200 122" aria-hidden>
        <defs>
          <radialGradient id="gauge-face" cx="50%" cy="85%" r="80%">
            <stop offset="0" stopColor="#efe3c4" />
            <stop offset="1" stopColor="#c9b88f" />
          </radialGradient>
          <linearGradient id="gauge-brass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--brass-hi)" />
            <stop offset="1" stopColor="#5a4320" />
          </linearGradient>
        </defs>
        <path d={`M 6 ${CY + 8} A 94 94 0 0 1 194 ${CY + 8} Z`} fill="url(#gauge-brass)" />
        <path d={`M 14 ${CY + 6} A 86 86 0 0 1 186 ${CY + 6} Z`} fill="url(#gauge-face)" />
        {Array.from({ length: MAX }, (_, i) => (
          <path
            key={i}
            d={arc(i + 0.06, i + 0.94, R - 8)}
            className="gauge-seg"
            data-red={i >= 4 || undefined}
            data-on={i < shown || undefined}
            style={{ transitionDelay: `${i * 110}ms` }}
          />
        ))}
        {Array.from({ length: MAX + 1 }, (_, i) => {
          const [x1, y1] = at(i, R + 2);
          const [x2, y2] = at(i, R - 18);
          const [tx, ty] = at(i, R - 27);
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} className="gauge-tick" />
              <text x={tx} y={ty + 4} className="gauge-num">{i}</text>
            </g>
          );
        })}
        <g className="gauge-needle" style={{ transform: `rotate(${(shown / MAX) * 180}deg)` }}>
          <path d={`M ${CX} ${CY - 3} L ${CX - R + 6} ${CY} L ${CX} ${CY + 3} Z`} />
        </g>
        <circle cx={CX} cy={CY} r="8" fill="url(#gauge-brass)" />
        <text x={CX} y={CY - 16} className="gauge-word">PRESSURE</text>
      </svg>
      <p className="gauge-read">
        <span className="sign">{v}</span>
        <span className="typed">of {MAX}{cracking ? ' · rattled' : ''}</span>
      </p>
    </div>
  );
}
