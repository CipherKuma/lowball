// OutlayerTransport: the request_execution it sends and how it waits for the result (fake signer and RPC).
import { describe, expect, it } from 'vitest';
import { RpcError } from '../src/near/rpc.js';
import { OutlayerTransport } from '../src/tee/outlayer.js';
import type { TeeDeployment } from '../src/tee/types.js';

const deployment: TeeDeployment = {
  network: 'testnet', outlayerContract: 'outlayer.testnet', secretsOwner: 'owner.testnet', secretsProfile: 'default',
  attestationBase: 'https://testnet-api.outlayer.ai',
  buyers: {
    marlow: { wasmSha256: 'aa', wasmUrl: 'https://f/aa.wasm', publicKeyB64: '', publicKeyHex: '' },
    odile: { wasmSha256: 'bb', wasmUrl: 'https://f/bb.wasm', publicKeyB64: '', publicKeyHex: '' },
    sully: { wasmSha256: 'cc', wasmUrl: 'https://f/cc.wasm', publicKeyB64: '', publicKeyHex: '' },
    ines: { wasmSha256: 'dd', wasmUrl: 'https://f/dd.wasm', publicKeyB64: '', publicKeyHex: '' },
    deacon: { wasmSha256: 'ee', wasmUrl: 'https://f/ee.wasm', publicKeyB64: '', publicKeyHex: '' },
  },
};

function rig(results: (() => unknown)[], sendOk = true) {
  const sent: { receiver: string; action: any; wait: string }[] = [];
  const signer = {
    accountId: 'house.testnet',
    send: async (receiver: string, actions: any[], wait: string) => {
      sent.push({ receiver, action: actions[0], wait });
      return { hash: 'HASH1', ok: sendOk, errorCode: sendOk ? undefined : 'TX_FAILED' };
    },
  };
  let i = 0;
  const calls: any[] = [];
  const rpc = {
    call: async (method: string, params: unknown) => {
      calls.push({ method, params });
      const r = results[Math.min(i++, results.length - 1)]!();
      if (r instanceof Error) throw r;
      return r;
    },
  };
  let t = 0;
  const transport = new OutlayerTransport({
    deployment, signer: signer as never, rpc: rpc as never, sleep: async () => { t += 3000; }, now: () => t, timeoutMs: 20_000, pollMs: 3000,
  });
  return { transport, sent, calls };
}
const ok = (obj: unknown) => ({ status: { SuccessValue: btoa(JSON.stringify(obj)) } });

describe('OutlayerTransport', () => {
  it('sends request_execution for the buyer\'s own wasm with the sealed-secret reference, waits INCLUDED, polls FINAL', async () => {
    const { transport, sent, calls } = rig([() => new RpcError('unknown', 'UNKNOWN_TRANSACTION', {}), () => ok({ ok: true, x: 1 })]);
    const r = await transport.run('odile', { op: 'probe' });
    expect(r.output).toEqual({ ok: true, x: 1 });
    expect(r.txHash).toBe('HASH1');
    expect(sent).toHaveLength(1);
    const s = sent[0]!;
    expect(s.receiver).toBe('outlayer.testnet');
    expect(s.wait).toBe('INCLUDED');
    expect(s.action.method).toBe('request_execution');
    expect(s.action.gas).toBe(300n * 10n ** 12n);
    expect(s.action.deposit).toBe(7_100_000_000_000_000_000_000n);
    const args = JSON.parse(new TextDecoder().decode(s.action.args));
    expect(args.source.WasmUrl).toEqual({ url: 'https://f/bb.wasm', hash: 'bb', build_target: 'wasm32-wasip2' });
    expect(args.secrets_ref).toEqual({ profile: 'default', account_id: 'owner.testnet' });
    expect(args.resource_limits.max_execution_seconds).toBe(60);
    expect(JSON.parse(args.input_data)).toEqual({ op: 'probe' });
    expect(args.response_format).toBe('Json');
    // never broadcast_tx_commit: only the tx status poll
    expect(calls.every((c) => c.method === 'tx' && c.params.wait_until === 'FINAL' && c.params.sender_account_id === 'house.testnet')).toBe(true);
  });

  it('a guest failure (null output) comes back as null for the caller to refuse', async () => {
    const { transport } = rig([() => ({ status: { SuccessValue: btoa('null') } })]);
    expect((await transport.run('sully', { op: 'x' })).output).toBeNull();
  });

  it('a failed job transaction is TEE_UNAVAILABLE; a job that never finishes times out the same way', async () => {
    const f = rig([() => ({ status: { Failure: { ActionError: 'boom' } } })]);
    await expect(f.transport.run('ines', {})).rejects.toMatchObject({ code: 'TEE_UNAVAILABLE' });
    const never = rig([() => new RpcError('unknown', 'UNKNOWN_TRANSACTION', {})]);
    await expect(never.transport.run('ines', {})).rejects.toMatchObject({ code: 'TEE_UNAVAILABLE' });
    const rejected = rig([() => ok({})], false);
    await expect(rejected.transport.run('ines', {})).rejects.toMatchObject({ code: 'TEE_UNAVAILABLE' });
  });
});
