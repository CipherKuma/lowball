// BRIEF-3 F3: the voice interrogation route.
import { describe, expect, it } from 'vitest';
import { MAX_AUDIO_BYTES } from '../src/features/stt.js';
import { createSession, step } from '../src/game/engine.js';
import { deliberatePrompt, interrogationPrompt } from '../src/game/prompts.js';
import { PLAYER_PK } from './helpers.js';
import { asked, audio, begun, body, form, post, rig } from './features-rig.js';

describe('F3 interrogation: validation', () => {
  it('refuses malformed input with {error, code} before any model or ElevenLabs call', async () => {
    const r = rig();
    const id = await begun(r);
    const cases: [string, FormData][] = [
      ['no buyer', form({ text: 'hello' })],
      ['unknown buyer', form({ buyer: 'nobody', text: 'hello' })],
      ['neither audio nor text', form({ buyer: 'marlow' })],
      ['both audio and text', form({ buyer: 'marlow', text: 'hi', audio: audio() })],
      ['text over 240', form({ buyer: 'marlow', text: 'x'.repeat(241) })],
      ['audio over 1.5 MB', form({ buyer: 'marlow', audio: audio('audio/webm', MAX_AUDIO_BYTES + 1) })],
      ['audio of the wrong type', form({ buyer: 'marlow', audio: audio('text/plain') })],
    ];
    for (const [name, f] of cases) {
      const res = await post(r, id, f);
      expect(res.status, name).toBe(400);
      expect((await body(res)).code, name).toBe('BAD_REQUEST');
    }
    const json = await r.app.request(`/api/session/${id}/interrogate`, { method: 'POST', body: '{"buyer":"marlow"}', headers: { 'content-type': 'application/json' } });
    expect(json.status).toBe(400);
    expect((await post(r, 'not-a-session', form({ buyer: 'marlow', text: 'hi' }))).status).toBe(400);
    expect(asked(r)).toBe(0);
    expect(r.up.stt).toBe(0);
  });

  it('accepts exactly 240 characters and the largest allowed recording', async () => {
    const r = rig();
    const id = await begun(r);
    expect((await post(r, id, form({ buyer: 'marlow', text: 'ab '.repeat(80).trim() }))).status).toBe(200);
    const r2 = rig();
    const id2 = await begun(r2);
    expect((await post(r2, id2, form({ buyer: 'sully', audio: audio('audio/mp4', MAX_AUDIO_BYTES) }))).status).toBe(200);
  });

  it('404 for an unknown session and 409 BAD_PHASE before the season starts', async () => {
    const r = rig();
    expect((await post(r, '00000000-0000-4000-8000-000000000000', form({ buyer: 'marlow', text: 'hi' }))).status).toBe(404);
    const c = await createSession(r.deps, PLAYER_PK, '4.4.4.4');
    const res = await post(r, c.sessionId, form({ buyer: 'marlow', text: 'hi' }));
    expect(res.status).toBe(409);
    expect((await body(res)).code).toBe('BAD_PHASE');
  });
});

describe('F3 interrogation: the exchange', () => {
  it('typed question: the buyer answers through the model, pressure and history are persisted, an event is written', async () => {
    const r = rig();
    const id = await begun(r);
    const res = await post(r, id, form({ buyer: 'marlow', text: 'Who else is in on it?' }));
    expect(res.status).toBe(200);
    const j = await body(res);
    expect(j).toMatchObject({ ok: true, question: 'Who else is in on it?', buyer: 'marlow', mood: 'tense', pressure: 2, tell: 'Thumb worrying the ledger edge.' });
    expect(r.up.stt).toBe(0);
    const s = (await r.store.loadState(id))!;
    expect(s.pressure).toEqual({ marlow: 2 });
    expect(s.interrogations).toEqual([{ day: 1, buyer: 'marlow', question: 'Who else is in on it?', answer: j.answer, mood: 'tense', tell: 'Thumb worrying the ledger edge.', pressure: 2 }]);
    const ev = (await r.store.getEvent(id, j.seq))!;
    expect(ev).toMatchObject({ type: 'interrogation', buyer: 'marlow', day: 1, question: 'Who else is in on it?', answer: j.answer, mood: 'tense', pressure: 2 });
    expect(r.llm.prompts[0]).toContain('Who else is in on it?');
    expect((await r.store.listArtifacts<{ kind: string }>(id, 'receipt')).some((x) => x.kind === 'interrogate')).toBe(true);
  });

  it('voice question: transcribed by scribe_v3 with the game keyterms, then answered', async () => {
    const r = rig();
    const id = await begun(r);
    const res = await post(r, id, form({ buyer: 'odile', audio: audio() }));
    expect(res.status).toBe(200);
    expect((await body(res)).question).toBe('Where were you on Tuesday night, Marlow?');
    expect(r.up.stt).toBe(1);
    expect(r.up.sttKeyterms).toEqual(['Marlow', 'Odile', 'Sully', 'Ines', 'Deacon', 'Marguerite', 'Pier Nine', 'leniency', 'cartel', 'pact', 'bond', 'envelope', 'immunity']);
  });

  it('one per day: the second is ALREADY_INTERROGATED (even for another buyer); the next day allows another', async () => {
    const r = rig();
    const id = await begun(r);
    expect((await post(r, id, form({ buyer: 'marlow', text: 'one two three' }))).status).toBe(200);
    const again = await post(r, id, form({ buyer: 'sully', text: 'two two three' }));
    expect(again.status).toBe(409);
    expect(await body(again)).toMatchObject({ code: 'ALREADY_INTERROGATED' });
    expect(asked(r)).toBe(1);
    expect((await post(r, id, form({ buyer: 'sully', audio: audio() }))).status).toBe(409); // refused without a transcription
    expect(r.up.stt).toBe(0);
    await step(r.deps, id, 'sell');
    await step(r.deps, id, 'next_day');
    const d2 = await post(r, id, form({ buyer: 'marlow', text: 'three three three' }));
    expect(d2.status).toBe(200);
    expect((await body(d2)).pressure).toBe(4); // 2 + 2
  });

  it('pressure is clamped to 0..6', async () => {
    const r = rig();
    const id = await begun(r);
    r.llm.next = { ...r.llm.next, pressure: -2 };
    expect((await body(await post(r, id, form({ buyer: 'deacon', text: 'a b c' })))).pressure).toBe(0);
    const s = (await r.store.loadState(id))!;
    s.interrogations = [];
    s.pressure = { deacon: 5 };
    await r.store.saveState(id, s);
    r.llm.next = { ...r.llm.next, pressure: 3 };
    expect((await body(await post(r, id, form({ buyer: 'deacon', text: 'b b b' })))).pressure).toBe(6);
  });

  it('works after the lot settles, but not after a confession', async () => {
    const r = rig();
    const id = await begun(r);
    await step(r.deps, id, 'sell');
    expect((await post(r, id, form({ buyer: 'ines', text: 'after the sale' }))).status).toBe(200);
    const s = (await r.store.loadState(id))!;
    s.interrogations = [];
    s.confessed = true;
    await r.store.saveState(id, s);
    const res = await post(r, id, form({ buyer: 'ines', text: 'too late' }));
    expect(res.status).toBe(409);
    expect((await body(res)).code).toBe('BAD_PHASE');
  });

  it('an STT failure is STT_UNAVAILABLE, gives the voice slot back, and does not use up the day', async () => {
    const r = rig();
    const id = await begun(r);
    r.up.sttText = null;
    const res = await post(r, id, form({ buyer: 'marlow', audio: audio() }));
    expect(res.status).toBe(502);
    expect((await body(res)).code).toBe('STT_UNAVAILABLE');
    expect(r.store.tts.get(id) ?? 0).toBe(0);
    r.up.sttText = 'Try that again please';
    expect((await post(r, id, form({ buyer: 'marlow', audio: audio() }))).status).toBe(200);
  });

  it('an unintelligible or overlong recording is refused without calling the buyer', async () => {
    const r = rig();
    const id = await begun(r);
    r.up.sttText = '   ';
    expect((await post(r, id, form({ buyer: 'marlow', audio: audio() }))).status).toBe(422);
    r.up.sttText = 'a long speech';
    r.up.words = [{ end: 40 }];
    expect((await post(r, id, form({ buyer: 'marlow', audio: audio() }))).status).toBe(400);
    expect(asked(r)).toBe(0);
  });

  it('a model failure leaves no trace, releases the lock, and the day is still available', async () => {
    const r = rig();
    const id = await begun(r);
    r.llm.failInterrogate = true;
    const res = await post(r, id, form({ buyer: 'marlow', text: 'hi there friend' }));
    expect(res.status).toBe(502);
    expect((await body(res)).code).toBe('MODEL_UNAVAILABLE');
    expect((await r.store.loadState(id))!.interrogations ?? []).toEqual([]);
    expect(await r.store.isLocked(id)).toBe(false);
    r.llm.failInterrogate = false;
    expect((await post(r, id, form({ buyer: 'marlow', text: 'hi again friend' }))).status).toBe(200);
  });

  it('a running step blocks it (BUSY)', async () => {
    const r = rig();
    const id = await begun(r);
    await r.store.tryLock(id, 60_000);
    const res = await post(r, id, form({ buyer: 'marlow', text: 'hi' }));
    expect(res.status).toBe(409);
    expect((await body(res)).code).toBe('BUSY');
  });

  it('the exchange reaches the buyer when the leniency offer lands (deliberatePrompt)', async () => {
    const r = rig();
    const id = await begun(r);
    await post(r, id, form({ buyer: 'marlow', text: 'Is it true you set the cap?' }));
    const s = (await r.store.loadState(id))!;
    expect(deliberatePrompt('marlow', s)).toContain(
      'On day 1 the fisher cornered you and said: "Is it true you set the cap?". You answered: "You are barking at the wrong dog, fisher.". Pressure on you now: 2/6.',
    );
    expect(deliberatePrompt('odile', s)).not.toContain('cornered you');
    expect(interrogationPrompt('marlow', s, 'Q?')).toContain('Pressure on you so far: 2/6');
  });
});

describe('F3 interrogation: a too-short question never spends the day', () => {
  const expectUnspent = async (r: ReturnType<typeof rig>, id: string, res: Response) => {
    expect(res.status).toBe(422);
    expect(await body(res)).toEqual({ error: 'That was too short to hear. Try again.', code: 'TOO_SHORT' });
    const s = (await r.store.loadState(id))!;
    expect(s.interrogations ?? []).toEqual([]);
    expect(s.pressure ?? {}).toEqual({});
    expect(asked(r)).toBe(0);
    expect(await r.store.isLocked(id)).toBe(false);
  };

  for (const text of ['', '   ', 'hey', 'hey you', '... ?!']) {
    it(`typed ${JSON.stringify(text)} is TOO_SHORT and leaves the day available`, async () => {
      const r = rig();
      const id = await begun(r);
      await expectUnspent(r, id, await post(r, id, form({ buyer: 'marlow', text })));
      expect((await post(r, id, form({ buyer: 'marlow', text: 'Who set the cap?' }))).status).toBe(200);
    });
  }

  it('a recording cut off after "hey" (transcript of one word) is TOO_SHORT and leaves the day available', async () => {
    const r = rig();
    const id = await begun(r);
    r.up.sttText = 'hey';
    await expectUnspent(r, id, await post(r, id, form({ buyer: 'marlow', audio: audio() })));
    r.up.sttText = 'Where were you Tuesday?';
    expect((await post(r, id, form({ buyer: 'marlow', audio: audio() }))).status).toBe(200);
  });

  it('an empty recording is TOO_SHORT without any upstream call', async () => {
    const r = rig();
    const id = await begun(r);
    await expectUnspent(r, id, await post(r, id, form({ buyer: 'marlow', audio: audio('audio/webm', 0) })));
    expect(r.up.stt).toBe(0);
  });

  it('an STT or model failure after a long-enough question also leaves the day available', async () => {
    const r = rig();
    const id = await begun(r);
    r.up.sttText = null;
    expect((await post(r, id, form({ buyer: 'marlow', audio: audio() }))).status).toBe(502);
    r.up.sttText = 'Where were you Tuesday?';
    r.llm.failInterrogate = true;
    expect((await post(r, id, form({ buyer: 'marlow', audio: audio() }))).status).toBe(502);
    expect((await r.store.loadState(id))!.interrogations ?? []).toEqual([]);
    r.llm.failInterrogate = false;
    expect((await post(r, id, form({ buyer: 'marlow', audio: audio() }))).status).toBe(200);
  });
});
