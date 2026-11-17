import type { BuyerId } from '../../../shared/api.js';

/** One buyer's deployed enclave build (outlayer/deployed.json). */
export interface TeeBuyerDeployment {
  /** sha256 of the exact WASM; the buyer's TEE key belongs to this build alone */
  wasmSha256: string;
  wasmUrl: string;
  /** the TEE-derived ed25519 key the contract has registered for this buyer, base64 / hex of 32 bytes */
  publicKeyB64: string;
  publicKeyHex: string;
}

export interface TeeDeployment {
  network: string;
  /** OutLayer contract the jobs are requested from */
  outlayerContract: string;
  /** account that owns the sealed NEARAI_API_KEY rows, and the profile name */
  secretsOwner: string;
  secretsProfile: string;
  /** coordinator API; GET {attestationBase}/attestations/by-tx/{tx} */
  attestationBase: string;
  buyers: Record<BuyerId, TeeBuyerDeployment>;
}

/** What one finished OutLayer job returns to the server. */
export interface TeeRun {
  /** the guest's JSON output (already parsed); null when the guest failed */
  output: unknown;
  /** the request_execution transaction, signed by the house */
  txHash: string;
  /** wall clock from send to the final result, for the latency record */
  ms: number;
  /** OutLayer's own failure text from the receipt logs (e.g. output_storage_unpaid) when the output came back null */
  error?: string;
}

/** TEE_MODE: 'auto' picks per season from enclave health, 'on' always uses enclaves, 'off' never does. */
export type TeeMode = 'auto' | 'on' | 'off';

export interface TeeJobOptions {
  /** wait at most this long for the result (default: the transport's own cap) */
  timeoutMs?: number;
}

/** Sends a job to a buyer's enclave and waits for its result. Faked in tests. */
export interface TeeTransport {
  run(buyer: BuyerId, input: Record<string, unknown>, opts?: TeeJobOptions): Promise<TeeRun>;
}
