import { describe, expect, it } from 'vitest';
import { SURVEY_ITEMS, completedSets, surveyFind } from '../src/game/survey.js';
import { call, harness, newWallet, signIn } from './helpers.js';

describe('crews', () => {
  it('founds, joins, hands over the captaincy and dissolves', async () => {
    const h = await harness();
    const [a, b, c] = await Promise.all([
      signIn(h, newWallet()),
      signIn(h, newWallet()),
      signIn(h, newWallet()),
    ]);
    const created = await call(h, 'POST', '/crews', {
      cookie: a,
      body: { name: 'Night Shift', tag: 'nite' },
    });
    expect(created.status).toBe(201);
    const id = Number(created.json['id']);
    expect((await call(h, 'POST', `/crews/${id}/join`, { cookie: b, body: {} })).status).toBe(200);
    expect((await call(h, 'POST', `/crews/${id}/join`, { cookie: c, body: {} })).status).toBe(200);

    let crew = await call(h, 'GET', `/crews/${id}`);
    expect(crew.json).toMatchObject({ name: 'Night Shift', tag: 'NITE', ranked: false });
    expect((crew.json['members'] as { captain: boolean }[]).map((m) => m.captain)).toEqual([
      true,
      false,
      false,
    ]);

    // One crew per player.
    expect(
      (await call(h, 'POST', '/crews', { cookie: b, body: { name: 'Other Crew', tag: 'OTH' } }))
        .status,
    ).toBe(409);
    expect((await call(h, 'POST', `/crews/${id}/join`, { cookie: b, body: {} })).status).toBe(409);

    // The captain leaves: the longest-standing member takes over.
    expect((await call(h, 'POST', '/crews/leave', { cookie: a, body: {} })).status).toBe(200);
    crew = await call(h, 'GET', `/crews/${id}`);
    expect((crew.json['members'] as { captain: boolean }[]).map((m) => m.captain)).toEqual([
      true,
      false,
    ]);
    await call(h, 'POST', '/crews/leave', { cookie: b, body: {} });
    await call(h, 'POST', '/crews/leave', { cookie: c, body: {} });
    expect((await call(h, 'GET', `/crews/${id}`)).status).toBe(404); // the last one out closes it
  });

  it('talks in set phrases only: members send, the crew page shows the latest, newest first', async () => {
    const h = await harness();
    const captain = newWallet();
    const [a, outsider] = await Promise.all([signIn(h, captain), signIn(h, newWallet())]);
    const created = await call(h, 'POST', '/crews', {
      cookie: a,
      body: { name: 'Night Shift', tag: 'nite' },
    });
    const id = Number(created.json['id']);
    const send = (cookie: string, signal: unknown) =>
      call(h, 'POST', '/crews/signal', { cookie, body: { signal } });

    expect((await send(a, 'welcome')).status).toBe(200);
    expect((await send(a, 'nice-core')).status).toBe(200);
    // No free text, no crew, no session.
    expect((await send(a, 'buy now')).status).toBe(400);
    expect((await send(outsider, 'welcome')).status).toBe(404);
    expect((await call(h, 'POST', '/crews/signal', { body: { signal: 'welcome' } })).status).toBe(
      401,
    );

    const crew = await call(h, 'GET', `/crews/${id}`);
    expect(crew.json['signals']).toMatchObject([
      { signal: 'nice-core', text: 'Nice coring, crew.', wallet: captain.address },
      { signal: 'welcome', text: 'Welcome to the crew.' },
    ]);

    // Twelve tries an hour per player (the refused phrase counted too).
    for (let i = 0; i < 9; i++) expect((await send(a, 'survey')).status).toBe(200);
    expect((await send(a, 'survey')).status).toBe(429);
    const kept = (await call(h, 'GET', `/crews/${id}`)).json['signals'] as { signal: string }[];
    expect(kept).toHaveLength(11);
    expect(kept.at(-1)?.signal).toBe('welcome');
    // Only the latest twelve are kept.
    h.clock.now += 3_600_000;
    expect((await send(a, 'fuel-check')).status).toBe(200);
    expect((await send(a, 'signing-off')).status).toBe(200);
    const later = (await call(h, 'GET', `/crews/${id}`)).json['signals'] as { signal: string }[];
    expect(later).toHaveLength(12);
    expect(later[0]?.signal).toBe('signing-off');
    expect(later.map((x) => x.signal)).not.toContain('welcome');
  });

  it('keeps names and tags unique and caps crews at 25', async () => {
    const h = await harness();
    const founder = await signIn(h, newWallet());
    const id = Number(
      (
        await call(h, 'POST', '/crews', {
          cookie: founder,
          body: { name: 'Deep Crew', tag: 'DEEP' },
        })
      ).json['id'],
    );
    const other = await signIn(h, newWallet());
    expect(
      (await call(h, 'POST', '/crews', { cookie: other, body: { name: 'deep crew', tag: 'XYZ' } }))
        .status,
    ).toBe(409);
    expect(
      (await call(h, 'POST', '/crews', { cookie: other, body: { name: 'Other', tag: 'deep' } }))
        .status,
    ).toBe(409);
    expect(
      (await call(h, 'POST', '/crews', { cookie: other, body: { name: '<script>', tag: 'X' } }))
        .status,
    ).toBe(400);
    for (let i = 0; i < 24; i++) {
      const member = await signIn(h, newWallet(), `198.51.100.${i}`);
      expect(
        (await call(h, 'POST', `/crews/${id}/join`, { cookie: member, body: {} })).status,
      ).toBe(200);
    }
    const crew = await call(h, 'GET', `/crews/${id}`);
    expect(crew.json['ranked']).toBe(true);
    expect((crew.json['members'] as unknown[]).length).toBe(25);
    const late = await call(h, 'POST', `/crews/${id}/join`, { cookie: other, body: {} });
    expect(late.status).toBe(409);
    expect(late.json.error).toBe('crew is full');
  });

  it('needs a session', async () => {
    const h = await harness();
    expect((await call(h, 'POST', '/crews', { body: { name: 'Nobody', tag: 'NOB' } })).status).toBe(
      401,
    );
  });
});

describe('Survey', () => {
  it('gives one deterministic find per UTC day', async () => {
    const h = await harness();
    const cookie = await signIn(h, newWallet());
    const first = await call(h, 'POST', '/survey', { cookie, body: {} });
    expect(first.json).toMatchObject({ isNew: true });
    const again = await call(h, 'POST', '/survey', { cookie, body: {} });
    expect(again.json).toMatchObject({ isNew: false, find: first.json['find'] });
    h.clock.now += 86_400_000;
    expect((await call(h, 'POST', '/survey', { cookie, body: {} })).json['isNew']).toBe(true);
    const collection = await call(h, 'GET', '/me/collection', { cookie });
    expect((collection.json['finds'] as unknown[]).length).toBe(2);
    expect((collection.json['sets'] as unknown[]).length).toBe(4);
  });

  it('is a uniform, secret-keyed choice', () => {
    const counts = new Map<string, number>();
    for (let day = 0; day < 24_000; day++) {
      const id = surveyFind('secret-a', 7, day).id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.size).toBe(SURVEY_ITEMS.length);
    for (const n of counts.values()) expect(n).toBeGreaterThan(800); // expectation 1,000 each
    expect(surveyFind('secret-a', 7, 1)).toEqual(surveyFind('secret-a', 7, 1));
    const differs = [...Array(50).keys()].some(
      (d) => surveyFind('secret-a', 7, d).id !== surveyFind('secret-b', 7, d).id,
    );
    expect(differs).toBe(true);
  });

  it('completes a set when every item is found', () => {
    const fossils = SURVEY_ITEMS.filter((i) => i.setId === 'fossils').map((i) => i.id);
    expect(completedSets(fossils.slice(1))).toEqual([]);
    expect(completedSets(fossils)).toEqual(['fossils']);
  });
});

describe('notification preferences', () => {
  it('validates and stores them', async () => {
    const h = await harness();
    const cookie = await signIn(h, newWallet());
    expect((await call(h, 'GET', '/me/notifications', { cookie })).json).toEqual({
      email: null,
      telegramChatId: null,
      events: [],
    });
    const prefs = {
      email: 'miner@example.com',
      telegramChatId: '12345',
      events: ['fuel-low', 'refine-ready'],
    };
    expect((await call(h, 'PUT', '/me/notifications', { cookie, body: prefs })).status).toBe(200);
    expect((await call(h, 'GET', '/me/notifications', { cookie })).json).toEqual(prefs);
    const bad = await call(h, 'PUT', '/me/notifications', {
      cookie,
      body: { ...prefs, email: 'nope' },
    });
    expect(bad.status).toBe(400);
    const unknownEvent = await call(h, 'PUT', '/me/notifications', {
      cookie,
      body: { ...prefs, events: ['price-alert'] },
    });
    expect(unknownEvent.status).toBe(400);
  });
});
