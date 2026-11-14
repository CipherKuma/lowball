import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { AppError, toApiError } from './errors.js';
import { debug } from './log.js';
import { issueNonce, requireAccount, tokenHash, VerifyEvmSchema, VerifySchema, verifyEvmSignIn, verifySignIn, type AuthDeps } from './auth/service.js';
import { casefile, createSession, getEvents, leniency, step } from './game/engine.js';
import type { GameDeps } from './game/ctx.js';
import {
  CreateSessionSchema,
  WalletSessionSchema,
  EventsQuerySchema,
  LeniencySchema,
  SessionIdSchema,
  StepSchema,
  TtsQuerySchema,
} from './schemas.js';
import { synthesize, type CacheLike } from './tts.js';
import { registerFeatureRoutes } from './features/routes.js';
import { speakable } from './features/voice.js';

export interface AppOptions {
  deps: (c: Context) => GameDeps;
  /** wallet sign-in (NEP-413); without it the auth routes and wallet mode answer 503 */
  auth?: (c: Context) => AuthDeps;
  allowedOrigin: (c: Context) => string;
  maxSessionsPerIpHour: (c: Context) => number;
  elevenLabsKey: (c: Context) => string;
  /** upstream ElevenLabs calls one session may cause (cache hits are free) */
  ttsMaxPerSession: (c: Context) => number;
  cache?: () => CacheLike | null;
  ttsFetch?: typeof fetch;
}

async function parseBody<S extends ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new AppError('BAD_REQUEST', 'Body must be JSON.');
  }
  const r = schema.safeParse(json);
  if (!r.success) throw new AppError('BAD_REQUEST', r.error.issues[0]?.message ?? 'Invalid request.');
  return r.data;
}

function sessionId(c: Context): string {
  const r = SessionIdSchema.safeParse(c.req.param('id'));
  if (!r.success) throw new AppError('BAD_REQUEST', 'Invalid session id.');
  return r.data;
}

export function createApp(o: AppOptions): Hono {
  const app = new Hono();

  app.use('/api/*', async (c, next) => {
    const origin = o.allowedOrigin(c);
    return cors({ origin, allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['content-type', 'authorization'], maxAge: 600 })(c, next);
  });

  app.onError((e, c) => {
    if (e instanceof ZodError) return c.json({ error: 'Invalid request.', code: 'BAD_REQUEST' }, 400);
    debug('app', 'error', e instanceof AppError ? e.code : String(e));
    const { body, status } = toApiError(e);
    return c.json(body, status as 400);
  });

  app.notFound((c) => c.json({ error: 'Not found.', code: 'NOT_FOUND' }, 404));

  app.get('/api/health', (c) => c.json({ ok: true }));

  const authOf = (c: Context): AuthDeps => {
    if (!o.auth) throw new AppError('INTERNAL', 'Sign-in is not configured.');
    return o.auth(c);
  };

  app.post('/api/auth/nonce', async (c) => c.json(await issueNonce(authOf(c))));

  app.post('/api/auth/verify', async (c) => {
    const body = await parseBody(c, VerifySchema);
    return c.json(await verifySignIn(authOf(c), body));
  });

  app.post('/api/auth/verify-evm', async (c) => {
    const body = await parseBody(c, VerifyEvmSchema);
    return c.json(await verifyEvmSignIn(authOf(c), body));
  });

  app.post('/api/auth/logout', async (c) => {
    const a = authOf(c);
    const { token } = await requireAccount(a, c.req.header('authorization'));
    await a.store.deleteAuthSession(tokenHash(token));
    return c.json({ ok: true });
  });

  app.get('/api/auth/me', async (c) => {
    const { accountId } = await requireAccount(authOf(c), c.req.header('authorization'));
    return c.json({ accountId });
  });

  app.post('/api/session', async (c) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new AppError('BAD_REQUEST', 'Body must be JSON.');
    }
    const isWallet = typeof raw === 'object' && raw !== null && (raw as { mode?: unknown }).mode === 'wallet';
    const parse = <S extends ZodTypeAny>(schema: S): z.infer<S> => {
      const r = schema.safeParse(raw);
      if (!r.success) throw new AppError('BAD_REQUEST', r.error.issues[0]?.message ?? 'Invalid request.');
      return r.data;
    };
    const wallet = isWallet ? parse(WalletSessionSchema) : null;
    const guest = wallet ? null : parse(CreateSessionSchema);
    // wallet mode needs the bearer token before anything else is touched
    const account = wallet ? await requireAccount(authOf(c), c.req.header('authorization')) : null;
    const deps = o.deps(c);
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'local';
    const used = await deps.store.countSessionsSince(ip, Date.now() - 3_600_000);
    if (used >= o.maxSessionsPerIpHour(c)) throw new AppError('RATE_LIMITED');
    if (wallet && account) return c.json(await createSession(deps, '', ip, wallet.payoutEvm, { accountId: account.accountId }));
    return c.json(await createSession(deps, guest!.playerPublicKey, ip, guest!.payoutEvm));
  });

  app.get('/api/session/:id/events', async (c) => {
    const id = sessionId(c);
    const q = EventsQuerySchema.parse({ after: c.req.query('after') ?? 0 });
    return c.json(await getEvents(o.deps(c), id, q.after));
  });

  app.post('/api/session/:id/step', async (c) => {
    const id = sessionId(c);
    const body = await parseBody(c, StepSchema);
    return c.json(await step(o.deps(c), id, body.action));
  });

  app.post('/api/session/:id/leniency', async (c) => {
    const id = sessionId(c);
    const body = await parseBody(c, LeniencySchema);
    return c.json(await leniency(o.deps(c), id, body.txHash ?? null));
  });

  app.get('/api/session/:id/casefile', async (c) => {
    const id = sessionId(c);
    return c.json(await casefile(o.deps(c), id));
  });

  app.get('/api/tts', async (c) => {
    const q = TtsQuerySchema.safeParse({ session: c.req.query('session'), seq: c.req.query('seq') });
    if (!q.success) throw new AppError('BAD_REQUEST', 'session and seq are required.');
    const store = o.deps(c).store;
    const ev = await store.getEvent(q.data.session, q.data.seq);
    // lines, interrogation answers (buyer voice, mood tagged) and recaps (narrator)
    const spoken = speakable(ev);
    if (!spoken) throw new AppError('NOT_FOUND', 'That event is not a spoken line.');
    const max = o.ttsMaxPerSession(c);
    return synthesize(spoken.speaker, spoken.text, {
      mood: spoken.mood,
      apiKey: o.elevenLabsKey(c),
      // the per-session cap is enforced here, in code, before any upstream (billed) call
      reserve: () => store.reserveTts(q.data.session, max),
      release: () => store.releaseTts(q.data.session),
      cache: o.cache?.() ?? null,
      fetchFn: o.ttsFetch,
    });
  });

  registerFeatureRoutes(app, { deps: o.deps, elevenLabsKey: o.elevenLabsKey, ttsMaxPerSession: o.ttsMaxPerSession, cache: o.cache, fetchFn: o.ttsFetch });

  return app;
}
