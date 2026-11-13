import { createApp } from './app.js';
import { buildDeps } from './config.js';
import type { Env } from './env.js';

const app = createApp({
  deps: (c) => buildDeps(c.env as Env),
  allowedOrigin: (c) => (c.env as Env).ALLOWED_ORIGIN || '*',
  maxSessionsPerIpHour: (c) => Number((c.env as Env).MAX_SESSIONS_PER_IP_HOUR ?? 8),
  elevenLabsKey: (c) => (c.env as Env).ELEVENLABS_API_KEY,
  cache: () => (typeof caches !== 'undefined' ? ((caches as unknown as { default: Cache }).default as never) : null),
});

export default app;
