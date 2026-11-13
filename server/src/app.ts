import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { AppError, toApiError } from './errors.js';
import { debug } from './log.js';
import { casefile, createSession, getEvents, leniency, step } from './game/engine.js';
import type { GameDeps } from './game/ctx.js';
import {
  CreateSessionSchema,
  EventsQuerySchema,
  LeniencySchema,
  SessionIdSchema,
  StepSchema,
  TtsQuerySchema,
} from './schemas.js';
import { synthesize, type CacheLike } from './tts.js';
import type { BuyerId } from '../../shared/api.js';

export interface AppOptions {
  deps: (c: Context) => GameDeps;
  allowedOrigin: (c: Context) => string;
  maxSessionsPerIpHour: (c: Context) => number;
  elevenLabsKey: (c: Context) => string;
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
    return cors({ origin, allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['content-type'], maxAge: 600 })(c, next);
  });

  app.onError((e, c) => {
    if (e instanceof ZodError) return c.json({ error: 'Invalid request.', code: 'BAD_REQUEST' }, 400);
    debug('app', 'error', e instanceof AppError ? e.code : String(e));
    const { body, status } = toApiError(e);
    return c.json(body, status as 400);
  });

  app.notFound((c) => c.json({ error: 'Not found.', code: 'NOT_FOUND' }, 404));

  app.get('/api/health', (c) => c.json({ ok: true }));

  app.post('/api/session', async (c) => {
    const body = await parseBody(c, CreateSessionSchema);
    const deps = o.deps(c);
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'local';
    const used = await deps.store.countSessionsSince(ip, Date.now() - 3_600_000);
    if (used >= o.maxSessionsPerIpHour(c)) throw new AppError('RATE_LIMITED');
    return c.json(await createSession(deps, body.playerPublicKey, ip));
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
    return c.json(await leniency(o.deps(c), id, body.txHash));
  });

  app.get('/api/session/:id/casefile', async (c) => {
    const id = sessionId(c);
    return c.json(await casefile(o.deps(c), id));
  });

  app.get('/api/tts', async (c) => {
    const q = TtsQuerySchema.safeParse({ session: c.req.query('session'), seq: c.req.query('seq') });
    if (!q.success) throw new AppError('BAD_REQUEST', 'session and seq are required.');
    const ev = await o.deps(c).store.getEvent(q.data.session, q.data.seq);
    if (!ev || ev.type !== 'line') throw new AppError('NOT_FOUND', 'That event is not a spoken line.');
    return synthesize(ev.buyer as BuyerId, ev.text, {
      apiKey: o.elevenLabsKey(c),
      cache: o.cache?.() ?? null,
      fetchFn: o.ttsFetch,
    });
  });

  return app;
}
