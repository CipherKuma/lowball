/** SVG filters the materials reference by id (chalk on the slate, torn paper edges). Render once, near the root. */
export function MaterialDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <defs>
        <filter id="chalk" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.25" result="holes" />
          <feComposite in="SourceGraphic" in2="holes" operator="in" result="dusty" />
          <feDisplacementMap in="dusty" in2="n" scale="1.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="torn" x="-3%" y="-3%" width="106%" height="106%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="3" seed="2" result="t" />
          <feDisplacementMap in="SourceGraphic" in2="t" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}
