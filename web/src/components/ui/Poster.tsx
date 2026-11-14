import type { ReactNode } from 'react';

/** A buyer's wanted poster pinned to the wall. `portrait` is /art/<id>_calm|cracked.webp. */
export function Poster({ name, role, portrait, tilt = 0, children, className = '' }: { name: string; role: string; portrait: string; tilt?: number; children?: ReactNode; className?: string }) {
  return (
    <figure className={`poster pin ${className}`} style={{ ['--tilt' as string]: `${tilt}deg`, margin: 0 }}>
      <img className="poster-photo" src={portrait} alt="" loading="lazy" />
      <figcaption>
        <p className="poster-name">{name}</p>
        <p className="poster-role">{role}</p>
      </figcaption>
      {children}
    </figure>
  );
}
