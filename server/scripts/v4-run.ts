// Real-API checks for the v4 upgrade, through the shipped code paths (transcribe, renderWiretap, synthesize).
// Usage: npx tsx scripts/v4-run.ts <outDir>      Key is read from .dev.vars into process.env, never printed.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { transcribe, STT_KEYTERMS } from '../src/features/stt.js';
import { renderWiretap, wiretapInputs, WIRETAP_EFFECTS } from '../src/features/wiretap.js';
import { synthesize } from '../src/tts.js';
import type { ChannelMessage } from '../../shared/api.js';

const out = process.argv[2] ?? '';
if (!out) throw new Error('usage: v4-run.ts <outDir>');
mkdirSync(out, { recursive: true });
for (const line of readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (m) process.env[m[1]!] = m[2]!.replace(/^"|"$/g, '');
}
const key = process.env.ELEVENLABS_API_KEY!;
if (!key) throw new Error('ELEVENLABS_API_KEY missing in .dev.vars');
const probe = (f: string, fields: string) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', fields, '-of', 'csv=p=0', f]).toString().trim();
const result: Record<string, unknown> = {};

// 1. live STT on a recorded clip (macOS speech -> webm/opus, what MediaRecorder sends), with keyterms and without
const q = 'Odile, Sully and Deacon signed the pact on the Marguerite. Who gets leniency, Marlow?';
execFileSync('say', ['-v', 'Daniel', '-o', join(out, 'q.aiff'), q]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(out, 'q.aiff'), '-c:a', 'libopus', '-b:a', '24k', join(out, 'q.webm')]);
const blob = new Blob([readFileSync(join(out, 'q.webm'))], { type: 'audio/webm;codecs=opus' });
let t = Date.now();
const withTerms = await transcribe(blob, key);
const msTerms = Date.now() - t;
const form = new FormData();
form.append('model_id', 'scribe_v3');
form.append('tag_audio_events', 'false');
form.append('file', blob, 'q.webm');
t = Date.now();
const plain = (await (await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: form })).json()) as { text: string };
result.stt = { script: q, keyterms: STT_KEYTERMS.length, clipBytes: blob.size, clipSeconds: Number(probe(join(out, 'q.webm'), 'format=duration')), withKeyterms: { ms: msTerms, ...withTerms }, withoutKeyterms: { ms: Date.now() - t, text: plain.text } };

// 2. wiretap: Text-to-Dialogue on eleven_v4 with the recovered-recording audio_effects
const ch = (round: number, buyer: ChannelMessage['buyer'], say: string, mood: ChannelMessage['mood']): ChannelMessage => ({ round, buyer, say, proposeCap: 50, sign: true, mood, chatId: `c${round}` });
const channel = [
  ch(1, 'marlow', 'Quiet, all of you. Nobody sells under sixty, not this week, and nobody talks to the fisher.', 'cold'),
  ch(2, 'odile', 'The arithmetic holds. Sixty each, and the bond stays where it is.', 'calm'),
  ch(3, 'sully', 'I cannot sleep. If the fisher asks me straight, I do not know what I will say.', 'cracking'),
  ch(4, 'ines', 'Darling, loyalty is lovely. Immunity is lovelier. Think about it.', 'calm'),
  ch(5, 'deacon', 'Peace. Nobody speaks.', 'tense'),
  ch(6, 'marlow', 'Sully, one more word like that and the pier will remember it.', 'tense'),
];
const inputs = wiretapInputs(channel, 7);
t = Date.now();
const wt = await renderWiretap('v4-run', inputs, { apiKey: key });
const wtBytes = new Uint8Array(await wt.arrayBuffer());
const wtMs = Date.now() - t;
writeFileSync(join(out, 'wiretap.mp3'), wtBytes);
const wtRead = await transcribe(new Blob([wtBytes], { type: 'audio/mpeg' }), key);
result.wiretap = { model: 'eleven_v4', effects: WIRETAP_EFFECTS, inputs: inputs.length, chars: inputs.reduce((n, i) => n + i.text.length, 0), ms: wtMs, bytes: wtBytes.length, seconds: Number(probe(join(out, 'wiretap.mp3'), 'format=duration')), channels: Number(probe(join(out, 'wiretap.mp3'), 'stream=channels')), transcript: wtRead.text };

// 3. latency: three v4_turbo buyer lines (uncached), one v4 narrator line for comparison
const lat: { model: string; ms: number; bytes: number }[] = [];
for (const [who, text, mood] of [['marlow', 'You are barking at the wrong dog, fisher.', 'tense'], ['ines', 'It is a generous offer, considering.', 'calm'], ['sully', 'No, no, no, that was my money!', 'cracking']] as const) {
  t = Date.now();
  const r = await synthesize(who, text, { apiKey: key, mood });
  const b = new Uint8Array(await r.arrayBuffer());
  lat.push({ model: 'eleven_v4_turbo', ms: Date.now() - t, bytes: b.length });
}
t = Date.now();
const nr = await synthesize('narrator', 'Day one. Atlantic cod, one hundred thirty-four on the board. Sold for eighty-five.', { apiKey: key });
lat.push({ model: 'eleven_v4', ms: Date.now() - t, bytes: (await nr.arrayBuffer()).byteLength });
result.latency = lat;
writeFileSync(join(out, 'v4-run.json'), JSON.stringify(result, null, 2));
console.info(JSON.stringify(result, null, 2));
