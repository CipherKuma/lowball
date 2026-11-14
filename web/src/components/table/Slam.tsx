import type { ComponentProps } from 'react';
import { Stamp } from '../ui/Stamp';

/** <Stamp/> animates scale with an inline transform, which drops the CSS tilt; the tilt lives on this wrapper. */
export function Slam({ angle = -7, className = '', ...rest }: ComponentProps<typeof Stamp>) {
  return (
    <span className={`slam ${className}`} style={{ transform: `rotate(${angle}deg)` }}>
      <Stamp {...rest} angle={0} />
    </span>
  );
}
