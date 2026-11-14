import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'starting' | 'recording' | 'denied' | 'unsupported';

/** Microphone capture with a hard length cap. `stop()` resolves the recording and how long it ran. */
export function useRecorder(maxMs = 20_000) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const resolver = useRef<((r: { blob: Blob | null; ms: number }) => void) | null>(null);
  const timer = useRef<number | null>(null);
  const started = useRef(0);
  const live = useRef(false);

  useEffect(() => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) setState('unsupported');
  }, []);

  const stop = useCallback((): Promise<{ blob: Blob | null; ms: number }> => {
    const r = rec.current;
    if (!r || r.state === 'inactive') return Promise.resolve({ blob: null, ms: 0 });
    return new Promise((res) => {
      resolver.current = res;
      r.stop();
    });
  }, []);

  const start = useCallback(async () => {
    if (live.current) return;
    live.current = true;
    setState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (ev) => ev.data.size && chunks.current.push(ev.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) window.clearInterval(timer.current);
        live.current = false;
        setState('idle');
        const ms = performance.now() - started.current;
        const blob = chunks.current.length ? new Blob(chunks.current, { type: r.mimeType || 'audio/webm' }) : null;
        resolver.current?.({ blob, ms });
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
      live.current = false;
      setState('denied');
    }
  }, [maxMs, stop]);

  useEffect(() => () => void stop(), [stop]);
  return { state, elapsed, maxMs, start, stop };
}
