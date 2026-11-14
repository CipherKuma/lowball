import { useEffect, useState } from 'react';
import { TESTNET_RPCS } from './wallet';

/** Polls the latest testnet block height while `active`, for the on-chain leniency countdown. */
export function useBlockHeight(active: boolean, everyMs = 1500): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    let i = 0;
    const tick = async () => {
      const url = TESTNET_RPCS[i++ % TESTNET_RPCS.length];
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 'h', method: 'block', params: { finality: 'optimistic' } }),
        });
        const j = (await res.json()) as { result?: { header?: { height?: number } } };
        const h = j.result?.header?.height;
        if (alive && typeof h === 'number') setHeight(h);
      } catch {
        /* next tick tries the other provider */
      }
    };
    void tick();
    const id = window.setInterval(tick, everyMs);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [active, everyMs]);
  return height;
}
