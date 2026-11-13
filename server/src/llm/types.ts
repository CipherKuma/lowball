import type { z } from 'zod';
import type { BuyerId, Receipt } from '../../../shared/api.js';

export type CallKind = Receipt['kind'];

export interface CompleteRequest<T> {
  buyer: BuyerId;
  kind: CallKind;
  day: number | null;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  maxTokens?: number;
}

export interface CompleteResult<T> {
  value: T;
  /** NEAR AI chat completion id */
  chatId: string;
  /** resolves once the NEAR AI signature has been fetched and verified (never rejects) */
  receipt: Promise<Receipt>;
}

export interface Llm {
  readonly model: string;
  complete<T>(req: CompleteRequest<T>): Promise<CompleteResult<T>>;
}
