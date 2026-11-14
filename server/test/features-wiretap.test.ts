// BRIEF-3 F4 (wiretap) and the voicing of the new events through GET /api/tts.
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { wiretapInputs } from '../src/features/wiretap.js';
import { step } from '../src/game/engine.js';
import { begun, body, form, post, rig, type Rig } from './features-rig.js';

describe('F4 wiretap', () => {
  async function closed(r: Rig) {
    const id = await begun(r);
    for (let d = 1; d <= 3; d++) {
      await step(r.deps, id, 'sell');
      await step(r.deps, id, 'next_day');
    }
    return id;
  }

  it('is sealed (409 BAD_PHASE) until the season is closed, 404 for an unknown session', async () => {
    const r = rig();
    const id = await begun(r);
    const res = await r.app.request(`/api/session/${id}/wiretap`);
    expect(res.status).toBe(409);
    expect((await body(res)).code).toBe('BAD_PHASE');
    expect(r.up.dialogue).toBe(0);
    expect((await r.app.request('/api/session/00000000-0000-4000-8000-000000000000/wiretap')).status).toBe(404);
  });

  it('renders the channel as one eleven_v3 dialogue with a narrator intro and mood tags, and caches it', async () => {
    const r = rig();
    const id = await closed(r);
    const a = await r.app.request(`/api/session/${id}/wiretap`);
    expect(a.status).toBe(200);
    expect(a.headers.get('content-type')).toBe('audio/mpeg');
    expect(a.headers.get('x-wiretap-cache')).toBe('miss');
    expect(new Uint8Array(await a.arrayBuffer())).toEqual(new Uint8Array([9, 9, 9]));
    const sent = r.up.lastDialogue!;
    expect(sent.model_id).toBe('eleven_v3');
    const s = (await r.store.loadState(id))!;
    expect(sent.inputs).toHaveLength(1 + s.channel.length);
    expect(sent.inputs[0]).toEqual({ text: `Recording recovered from the warehouse, season ${s.seasonId}.`, voice_id: '1pSjK1R2NZAimD0fb85p' });
    expect(sent.inputs[1]!.voice_id).toBe('dCK9SovCB6A1EDcX4QDM'); // marlow speaks first
    expect(sent.inputs.every((i) => i.text.length > 0)).toBe(true);
    const b = await r.app.request(`/api/session/${id}/wiretap`);
    expect(b.headers.get('x-wiretap-cache')).toBe('hit');
    expect(r.up.dialogue).toBe(1);
  });

  it('tags lines from the channel mood, in round order', () => {
    const ch = [
      { round: 2, buyer: 'sully', say: 'I cannot sleep.', proposeCap: 40, sign: true, mood: 'cracking', chatId: 'b' },
      { round: 1, buyer: 'marlow', say: 'Quiet, all of you.', proposeCap: 50, sign: true, mood: 'cold', chatId: 'a' },
    ] as const;
    const inputs = wiretapInputs([...ch], 7, { narrator: 'N', marlow: 'M', sully: 'S' });
    expect(inputs.map((i) => i.voice_id)).toEqual(['N', 'M', 'S']);
    expect(inputs[1]!.text).toBe('[cold] Quiet, all of you.');
    expect(inputs[2]!.text).toMatch(/^\[(nervous|shaky)\] I cannot sleep\.$/);
  });

  it('an ElevenLabs failure is TTS_UNAVAILABLE and returns the slot', async () => {
    const r = rig();
    const id = await closed(r);
    const bad = createApp({
      deps: () => r.deps,
      allowedOrigin: () => '*',
      maxSessionsPerIpHour: () => 99,
      elevenLabsKey: () => 'k',
      ttsMaxPerSession: () => 80,
      ttsFetch: (async () => new Response('no', { status: 500 })) as never,
    });
    const res = await bad.request(`/api/session/${id}/wiretap`);
    expect(res.status).toBe(502);
    expect((await body(res)).code).toBe('TTS_UNAVAILABLE');
    expect(r.store.tts.get(id) ?? 0).toBe(0);
  });
});

describe('voicing the new events with GET /api/tts', () => {
  it('voices an interrogation answer in the buyer voice with its mood tag, and a recap in the narrator voice', async () => {
    const r = rig();
    const id = await begun(r);
    const j = await body(await post(r, id, form({ buyer: 'marlow', text: 'Talk.' })));
    const a = await r.app.request(`/api/tts?session=${id}&seq=${j.seq}`);
    expect(a.status).toBe(200);
    expect(r.up.lastTts!.model_id).toBe('eleven_v3');
    expect(r.up.lastTts!.text).toBe('[tense] You are barking at the wrong dog, fisher.');

    await step(r.deps, id, 'sell');
    const evs = await body(await r.app.request(`/api/session/${id}/events?after=0`));
    const recap = evs.events.find((e: { type: string }) => e.type === 'recap');
    const before = r.up.tts;
    const rr = await r.app.request(`/api/tts?session=${id}&seq=${recap.seq}`);
    expect(rr.status).toBe(200);
    expect(r.up.tts).toBe(before + 1);
    expect(r.up.lastTts!.text).toBe(recap.text); // the narrator reads plain copy, no tags
    expect((await r.app.request(`/api/tts?session=${id}&seq=${recap.seq}`)).headers.get('x-tts-cache')).toBe('hit');
  });
});

