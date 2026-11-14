import { z } from 'zod';
import { parsePublicKey } from './near/keys.js';

/** "ed25519:<base58>" that decodes to exactly 32 bytes. */
export const PublicKeySchema = z
  .string()
  .max(100)
  .refine((s) => {
    try {
      parsePublicKey(s);
      return true;
    } catch {
      return false;
    }
  }, 'playerPublicKey must be ed25519:<base58> (32 bytes)');

/** Sepolia address: "0x" + 40 hex. Checked here and again by the contract (E_BAD_EVM). */
export const EvmAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'payoutEvm must be 0x followed by 40 hex characters');

export const CreateSessionSchema = z.object({ playerPublicKey: PublicKeySchema, payoutEvm: EvmAddressSchema.optional() }).strict();

export const StepSchema = z.object({ action: z.enum(['begin', 'sell', 'hold', 'next_day']) }).strict();

/** NEAR tx hashes are base58 of 32 bytes: 43 or 44 chars. */
export const LeniencySchema = z
  .object({ txHash: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{42,46}$/, 'txHash must be a base58 transaction hash') })
  .strict();

export const SessionIdSchema = z.string().uuid();

export const EventsQuerySchema = z.object({
  after: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export const TtsQuerySchema = z.object({
  session: z.string().uuid(),
  seq: z.coerce.number().int().min(1).max(1_000_000),
});
