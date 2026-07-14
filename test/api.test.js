'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Point the store at a throwaway data dir BEFORE the server loads it.
process.env.SIDEQUEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sidequest-test-'));

const test = require('node:test');
const assert = require('node:assert');
const { server } = require('../server');

const MITTE = { lat: 52.52, lng: 13.405 };
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

test.after(() => server.close());

async function api(pathname, options) {
  const res = await fetch(baseUrl + pathname, options);
  return { status: res.status, body: await res.json() };
}

test('GET /api/quests returns seeded quests', async () => {
  const { status, body } = await api('/api/quests');
  assert.strictEqual(status, 200);
  assert.ok(body.count >= 10, `expected seeded quests, got ${body.count}`);
  assert.ok(body.quests[0].title);
});

test('radius filter narrows results and adds sorted distances', async () => {
  const q = (radius) => `/api/quests?lat=${MITTE.lat}&lng=${MITTE.lng}&radius=${radius}`;
  const within5 = (await api(q(5))).body;
  const within10 = (await api(q(10))).body;
  const within50 = (await api(q(50))).body;

  assert.ok(within5.count > 0, 'expected some quests within 5 km of Mitte');
  assert.ok(within5.count < within10.count, '5 km should return fewer than 10 km');
  assert.ok(within10.count < within50.count, '10 km should return fewer than 50 km');

  for (const quest of within5.quests) {
    assert.ok(quest.distanceKm <= 5, `${quest.title} is ${quest.distanceKm} km away`);
  }
  const distances = within50.quests.map((q2) => q2.distanceKm);
  assert.deepStrictEqual(distances, [...distances].sort((a, b) => a - b), 'nearest first');
});

test('radius without coordinates is rejected', async () => {
  const { status } = await api('/api/quests?radius=5');
  assert.strictEqual(status, 400);
});

test('invalid coordinates are rejected', async () => {
  const { status } = await api('/api/quests?lat=999&lng=13.4&radius=5');
  assert.strictEqual(status, 400);
});

test('POST creates a quest that then appears in radius search', async () => {
  const created = await api('/api/quests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Test: rake leaves',
      description: 'Small front yard, rake and bags provided.',
      pay: 20,
      duration: '~1 hour',
      category: 'Garden',
      locationName: 'Mitte, Berlin',
      lat: 52.521,
      lng: 13.406,
      postedBy: 'Test User',
    }),
  });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.body.quest.status, 'open');

  const { body } = await api(`/api/quests?lat=${MITTE.lat}&lng=${MITTE.lng}&radius=1`);
  assert.ok(body.quests.some((q) => q.id === created.body.quest.id));
});

test('POST with missing fields returns validation errors', async () => {
  const { status, body } = await api('/api/quests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'No description', pay: -5, lat: 200, lng: 13 }),
  });
  assert.strictEqual(status, 400);
  assert.ok(body.details.length >= 3);
});

test('accepting a quest marks it taken; second accept conflicts', async () => {
  const { body: list } = await api('/api/quests?status=open');
  const quest = list.quests[0];

  const first = await api(`/api/quests/${quest.id}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acceptedBy: 'Helper Hanna' }),
  });
  assert.strictEqual(first.status, 200);
  assert.strictEqual(first.body.quest.status, 'accepted');
  assert.strictEqual(first.body.quest.acceptedBy, 'Helper Hanna');

  const second = await api(`/api/quests/${quest.id}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acceptedBy: 'Too Late Theo' }),
  });
  assert.strictEqual(second.status, 409);
});
