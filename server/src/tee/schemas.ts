// Shapes of what a buyer's enclave job returns (outlayer/src/main.rs), checked before anything in it is trusted.
import { z } from 'zod';

const NearAiSig = z
  .object({ text: z.string(), signature: z.string(), signing_address: z.string(), signing_algo: z.string(), signature_kind: z.string().optional() })
  .nullable();

const Common = {
  ok: z.literal(true),
  buyer: z.string(),
  buyer_account: z.string(),
  season_id: z.number(),
  decision: z.string(),
  say: z.string(),
  mood: z.string(),
  public_key_b64: z.string(),
  pact_message_sha256: z.string(),
  signed_message_sha256: z.string(),
  nearai: z.object({
    model: z.string(),
    chat_id: z.string(),
    request_sha256: z.string(),
    response_sha256: z.string(),
    signature: NearAiSig,
  }),
  receipt: z.object({ message: z.string(), signature: z.string() }),
  run: z.object({ request_id: z.string().optional() }).passthrough(),
};
export type CommonOut = z.infer<z.ZodObject<typeof Common>>;
export const PactOut = z.object({ ...Common, op: z.literal('sign_pact'), signature: z.string().nullable() });
export const DeliberateOut = z.object({ ...Common, op: z.literal('deliberate'), reasoning: z.string().nullable(), confession_sig: z.string().nullable() });

