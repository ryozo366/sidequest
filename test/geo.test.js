'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { haversineKm, isValidLat, isValidLng } = require('../lib/geo');

test('haversineKm: identical points are 0 km apart', () => {
  assert.strictEqual(haversineKm(52.52, 13.405, 52.52, 13.405), 0);
});

test('haversineKm: Berlin Mitte to Potsdam is roughly 27 km', () => {
  const km = haversineKm(52.52, 13.405, 52.3906, 13.0645);
  assert.ok(km > 25 && km < 30, `expected ~27 km, got ${km}`);
});

test('haversineKm: Berlin to Munich is roughly 500 km', () => {
  const km = haversineKm(52.52, 13.405, 48.1374, 11.5755);
  assert.ok(km > 480 && km < 520, `expected ~500 km, got ${km}`);
});

test('lat/lng validation bounds', () => {
  assert.ok(isValidLat(52.52) && isValidLat(-90) && isValidLat(90));
  assert.ok(!isValidLat(90.1) && !isValidLat(NaN) && !isValidLat('52'));
  assert.ok(isValidLng(13.4) && isValidLng(-180) && isValidLng(180));
  assert.ok(!isValidLng(180.1) && !isValidLng(Infinity));
});
