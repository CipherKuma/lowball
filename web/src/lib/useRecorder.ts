import { useCallback, useEffect, useRef, useState } from 'react';

/** Push-to-talk microphone capture with a hard length cap. Returns a Blob when stopped. */
export function useRecorder(maxMs = 12_000) {
  const [state, setState] = useState<'idle' | 'recording' | 'denied' | 'unsupported'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const resolver = useRef<((b: Blob | null) => void) | null>(null);
  const timer = useRef<number | null>(null);
  const started = useRef(0);

  useEffect(() => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) setState('unsupported');
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    const r = rec.current;
    if (!r || r.state === 'inactive') return Promise.resolve(null);
    return new Promise((res) => {
      resolver.current = res;
      r.stop();
    });
  }, []);

  const start = useCallback(async () => {
    if (state === 'recording') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (ev) => ev.data.size && chunks.current.push(ev.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) window.clearInterval(timer.current);
        setState('idle');
        const blob = chunks.current.length ? new Blob(chunks.current, { type: r.mimeType || 'audio/webm' }) : null;
        resolver.current?.(blob);
        resolver.current = null;
      };
      rec.current = r;
      started.current = performance.now();
      setElapsed(0);
      r.start(250);
      setState('recording');
      timer.current = window.setInterval(() => {
        const t = performance.now() - started.current;
        setElapsed(t);
        if (t >= maxMs) void stop();
      }, 100);
    } catch {
      setState('denied');
    }
  }, [maxMs, state, stop]);

  useEffect(() => () => void stop(), [stop]);
  return { state, elapsed, maxMs, start, stop };
}
