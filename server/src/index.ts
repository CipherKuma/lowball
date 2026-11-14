import { createApp } from './app.js';
import { DEFAULT_RECIPIENT } from './auth/service.js';
import { buildDeps, ttsMaxPerSession } from './config.js';
import type { Env } from './env.js';
import { DEFAULT_RPC_URLS, Rpc } from './near/rpc.js';
import { D1Store } from './store/d1.js';

const app = createApp({
  deps: (c) => buildDeps(c.env as Env),
  auth: (c) => {
    const env = c.env as Env;
    return {
      store: new D1Store(env.DB),
      rpc: new Rpc({ urls: env.RPC_URLS ? env.RPC_URLS.split(',').map((s) => s.trim()) : DEFAULT_RPC_URLS }),
      recipient: env.AUTH_RECIPIENT || DEFAULT_RECIPIENT,
    };
  },
  allowedOrigin: (c) => (c.env as Env).ALLOWED_ORIGIN || '*',
  maxSessionsPerIpHour: (c) => Number((c.env as Env).MAX_SESSIONS_PER_IP_HOUR ?? 8),
  elevenLabsKey: (c) => (c.env as Env).ELEVENLABS_API_KEY,
  ttsMaxPerSession: (c) => ttsMaxPerSession(c.env as Env),
  cache: () => (typeof caches !== 'undefined' ? ((caches as unknown as { default: Cache }).default as never) : null),
});

export default app;
