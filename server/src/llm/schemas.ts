import { z } from 'zod';

export const MoodSchema = z.enum(['calm', 'tense', 'cracking', 'cold']);

export const CartelOut = z.object({
  say: z.string().min(1).max(400),
  propose_cap: z.number().int().min(1).max(100000),
  sign: z.boolean(),
  mood: MoodSchema,
});
export type CartelOut = z.infer<typeof CartelOut>;

export const BidOut = z.object({
  amount: z.number().int().min(0).max(1000000),
  say: z.string().min(1).max(400),
  mood: MoodSchema,
});
export type BidOut = z.infer<typeof BidOut>;

export const DeliberateOut = z.object({
  confess: z.boolean(),
  say: z.string().min(1).max(400),
  reasoning: z.string().min(1).max(1500),
  mood: MoodSchema,
});
export type DeliberateOut = z.infer<typeof DeliberateOut>;

export const ReactOut = z.object({
  say: z.string().min(1).max(400),
  mood: MoodSchema,
});
export type ReactOut = z.infer<typeof ReactOut>;

const mood = { type: 'string', enum: ['calm', 'tense', 'cracking', 'cold'] };
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const JSON_SCHEMAS = {
  cartel: obj({
    say: { type: 'string', description: 'What you say in the private channel, in character, under 200 characters.' },
    propose_cap: { type: 'integer', description: 'The cap in marks you would hold to on every lot.' },
    sign: { type: 'boolean', description: 'Whether you will sign the pact.' },
    mood,
  }),
  bid: obj({
    amount: { type: 'integer', description: 'Your sealed bid in marks.' },
    say: { type: 'string', description: 'A short line you say aloud at the quay, in character.' },
    mood,
  }),
  deliberate: obj({
    confess: { type: 'boolean', description: 'true to hand the signed pact to the contract now.' },
    say: { type: 'string', description: 'What you say aloud in front of the fisher.' },
    reasoning: { type: 'string', description: 'Your private reasoning, with the numbers you weighed.' },
    mood,
  }),
  react: obj({
    say: { type: 'string', description: 'A short line you say aloud, in character.' },
    mood,
  }),
};
