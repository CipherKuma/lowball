import { useEffect, useState } from 'react';

const pad = (n: number) => String(n).padStart(2, '0');

/** Security-camera overlay over the pier: corner brackets, REC, a clock that starts at 4 a.m. and ticks. */
export function Osd() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const id = window.setInterval(() => setT(Math.floor((performance.now() - start) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);
  const s = 13 + t;
  const clock = `04:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  return (
    <div className="osd camera" aria-hidden>
      <span className="osd-tl data">
        <span className="rec-dot" /> REC · CAM 01 · PIER NINE, NEW BEDFORD
      </span>
      <span className="osd-tr data">14 NOV · {clock}</span>
      <span className="osd-bl data">
        <kbd>CLICK</kbd> an envelope to slit it <kbd>HOVER</kbd> a buyer to listen
      </span>
      <span className="osd-br data">NEAR TESTNET · BUYERS ON NEAR AI CLOUD · VOICES BY ELEVENLABS</span>
    </div>
  );
}
