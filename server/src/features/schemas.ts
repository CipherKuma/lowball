import { z } from 'zod';
import { BUYER_IDS } from '../../../shared/api.js';
import { MoodSchema } from '../llm/schemas.js';

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** What a cornered buyer returns. */
export const InterrogateOut = z.object({
  say: z.string().min(1).max(400).refine((s) => words(s) <= 25, 'say: at most 25 words'),
  mood: MoodSchema,
  pressure: z.number().int().min(-2).max(3),
  tell: z.string().min(1).max(120).refine((s) => words(s) <= 12, 'tell: at most 12 words'),
});
export type InterrogateOut = z.infer<typeof InterrogateOut>;

export const INTERROGATE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    say: { type: 'string', description: 'What you say to the fisher, in character, at most 25 words.' },
    mood: { type: 'string', enum: ['calm', 'tense', 'cracking', 'cold'] },
    pressure: { type: 'integer', description: 'How much this exchange rattled you: -2 (it steadied you) to 3 (it shook you badly).' },
    tell: { type: 'string', description: 'A visible nervous tic the fisher can see, at most 12 words.' },
  },
  required: ['say', 'mood', 'pressure', 'tell'],
  additionalProperties: false,
};

export const InterrogateFormSchema = z.object({
  buyer: z.enum(BUYER_IDS),
  text: z.string().trim().min(1, 'text is empty').max(240, 'text is at most 240 characters').optional(),
});

/** POST /forge takes no input. */
export const ForgeBodySchema = z.object({}).strict();
