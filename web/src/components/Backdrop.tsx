import { useEffect, useRef } from 'react';

/** Rain streaks drawn on a canvas; cheap (one path per frame), paused when the tab is hidden. */
function Rain({ density = 140, opacity = 0.32 }: { density?: number; opacity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let w = 0;
    let h = 0;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const drops = Array.from({ length: density }, () => ({
      x: Math.random(),
      y: Math.random(),
      len: 10 + Math.random() * 22,
      v: 0.55 + Math.random() * 0.7,
      a: 0.25 + Math.random() * 0.6,
    }));
    let raf = 0;
    let last = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(48, t - last) / 16.7;
      last = t;
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (const d of drops) {
        d.y += (d.v * dt * 18) / h;
        d.x -= (d.v * dt * 2.2) / w;
        if (d.y > 1.05) {
          d.y = -0.05;
          d.x = Math.random() * 1.1;
        }
        const x = d.x * w;
        const y = d.y * h;
        ctx.strokeStyle = `rgba(200,215,210,${d.a * opacity})`;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - d.len * 0.12, y + d.len);
        ctx.stroke();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [density, opacity]);
  return <canvas ref={ref} className="rain" aria-hidden />;
}

/** The painted room plus living light: slow drift, lamp flicker, rain, grain, vignette. */
export function Backdrop({ src, dim = 0, tense = false }: { src: string; dim?: number; tense?: boolean }) {
  return (
    <div className="backdrop" aria-hidden data-tense={tense || undefined}>
      <div className="backdrop-img" style={{ backgroundImage: `url(${src})` }} />
      <div className="lamp-glow" />
      <Rain />
      <div className="backdrop-dim" style={{ opacity: dim }} />
      <div className="vignette" />
      <div className="grain" />
    </div>
  );
}
