// Real-API run of BRIEF-3 features against the in-memory chain: Open-Meteo sea, NOAA prices (from prices.json),
// ElevenLabs Speech-to-Text + Text-to-Dialogue + v4 TTS, and NEAR AI (Qwen TEE) buyers.
// Usage: npx tsx scripts/features-run.ts <outDir>      Keys are read from .dev.vars into process.env, never printed.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { fetchSea } from '../src/features/sea.js';
import { createSession, step } from '../src/game/engine.js';
import { NearAiLlm } from '../src/llm/client.js';
import { BUYER_IDS, type BuyerId } from '../../shared/api.js';
import { makeRig, PLAYER_PK } from '../test/helpers.js';

const out: string = process.argv[2] ?? '';
if (!out) throw new Error('usage: features-run.ts <outDir>');
mkdirSync(out, { recursive: true });
for (const line of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (m) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, '');
}
const EL = process.env.ELEVENLABS_API_KEY!;
const NEAR = process.env.NEARAI_API_KEY!;
if (!EL || !NEAR) throw new Error('keys missing in .dev.vars');

const dur = (f: string) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const result: Record<string, unknown> = {};

// F2 live sea
result.sea = await fetchSea();

// a real microphone-style clip: macOS speech -> webm/opus (what MediaRecorder sends)
const question = 'Marlow, I have watched five identical bids in a row. Who set the price?';
execFileSync('say', ['-v', 'Daniel', '-o', join(out, 'q.aiff'), question]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(out, 'q.aiff'), '-c:a', 'libopus', '-b:a', '24k', join(out, 'q.webm')]);
const webm = readFileSync(join(out, 'q.webm'));
result.clip = { bytes: webm.length, seconds: dur(join(out, 'q.webm')) };

// a full 3-day season on the in-memory chain with the REAL buyer model
const rig = makeRig({}, { days: 3 });
const llm = new NearAiLlm({ apiKey: NEAR });
rig.deps.llm = llm;
rig.deps.features = { seaFetch: (...a) => fetch(...a) };
const app = createApp({ deps: () => rig.deps, allowedOrigin: () => '*', maxSessionsPerIpHour: () => 99, elevenLabsKey: () => EL, ttsMaxPerSession: () => 80 });

const c = await createSession(rig.deps, PLAYER_PK, '9.9.9.9');
const id = c.sessionId;
await step(rig.deps, id, 'begin');
await step(rig.deps, id, 'sell');

// F3: voice interrogation through the real route (STT + Qwen)
const f = new FormData();
f.set('buyer', 'marlow' satisfies BuyerId);
f.set('audio', new Blob([webm], { type: 'audio/webm;codecs=opus' }), 'question.webm');
const t0 = Date.now();
const ir = await app.request(`/api/session/${id}/interrogate`, { method: 'POST', body: f });
const ij = (await ir.json()) as Record<string, unknown>;
result.interrogate = { status: ir.status, ms: Date.now() - t0, ...ij, status_obj: undefined };

// F5/F6: voice the answer (buyer, tagged) and the recap (narrator)
const evs = ((await (await app.request(`/api/session/${id}/events?after=0`)).json()) as { events: { type: string; seq: number; text?: string }[] }).events;
const recap = evs.find((e) => e.type === 'recap')!;
result.recapText = recap.text;
async function voice(label: string, seq: number): Promise<void> {
  const r = await app.request(`/api/tts?session=${id}&seq=${seq}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  writeFileSync(join(out, `${label}.mp3`), buf);
  result[label] = { status: r.status, bytes: buf.length, seconds: r.ok ? dur(join(out, `${label}.mp3`)) : null };
}
await voice('answer', ij.seq as number);
await voice('recap', recap.seq);
const line = evs.find((e) => e.type === 'line')!;
await voice('line', line.seq);

// finish the season, then F4 wiretap
await step(rig.deps, id, 'next_day');
for (let d = 2; d <= 3; d++) {
  await step(rig.deps, id, 'sell');
  await step(rig.deps, id, 'next_day');
}
const w0 = Date.now();
const w = await app.request(`/api/session/${id}/wiretap`);
const wbuf = new Uint8Array(await w.arrayBuffer());
writeFileSync(join(out, 'wiretap.mp3'), wbuf);
const s = (await rig.store.loadState(id))!;
result.wiretap = { status: w.status, ms: Date.now() - w0, bytes: wbuf.length, seconds: w.ok ? dur(join(out, 'wiretap.mp3')) : null, lines: s.channel.length + 1 };
const all = ((await (await app.request(`/api/session/${id}/events?after=0`)).json()) as { events: Record<string, unknown>[] }).events;
result.eventTypes = all.map((e) => e.type);
result.dayOpened = all.filter((e) => e.type === 'day_opened').map((e) => ({ species: e.species, kg: e.weightKg, marks: e.fairValue, market: e.market }));
result.seaEvent = all.find((e) => e.type === 'sea') ?? null;
result.recaps = all.filter((e) => e.type === 'recap').map((e) => e.text);
result.modelCalls = llm.calls;
result.buyers = BUYER_IDS.length;
console.log(JSON.stringify(result, null, 2));
