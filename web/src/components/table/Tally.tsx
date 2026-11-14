/** Hand-cut tally marks: groups of four strokes and a slash. Reads as a count, never a progress bar. */
export function Tally({ n, max, label }: { n: number; max?: number; label: string }) {
  const count = Math.max(0, Math.round(n));
  if (count === 0) {
    return (
      <span className="tally tally--none" aria-label={`${label}: none`}>
        none
      </span>
    );
  }
  const groups = Math.ceil(count / 5);
  const w = groups * 22;
  return (
    <span className="tally" aria-label={`${label}: ${count}${max ? ` of ${max}` : ''}`} role="img">
      <svg width={w} height="14" viewBox={`0 0 ${w} 14`} aria-hidden>
        {Array.from({ length: groups }, (_, g) => {
          const inGroup = Math.min(5, count - g * 5);
          const x0 = g * 22 + 2;
          return (
            <g key={g}>
              {Array.from({ length: Math.min(4, inGroup) }, (_, i) => (
                <path key={i} d={`M${x0 + i * 4 + 0.4} 1.6 L${x0 + i * 4} 12.6`} />
              ))}
              {inGroup === 5 && <path d={`M${x0 - 2} 10.5 L${x0 + 15} 3.2`} />}
            </g>
          );
        })}
      </svg>
    </span>
  );
}
