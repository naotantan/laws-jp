'use strict';
// Smoke tests using node:test (built-in, no dependencies).
// These tests do NOT hit the network — they exercise pure-function helpers.
//
// Run: node --test test/

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const api = require('../lib/egov-api');

test('parseArticleNum: kanji form', () => {
  const r = api.parseArticleNum('第百六十六条');
  assert.deepEqual(r, { num: 166, sub: 0, subSub: 0 });
});

test('parseArticleNum: kanji with sub-article', () => {
  const r = api.parseArticleNum('第百六十六条の二');
  assert.deepEqual(r, { num: 166, sub: 2, subSub: 0 });
});

test('parseArticleNum: kanji with two-level sub', () => {
  const r = api.parseArticleNum('第三条の二の三');
  assert.deepEqual(r, { num: 3, sub: 2, subSub: 3 });
});

test('parseArticleNum: rejects non-kanji form', () => {
  assert.equal(api.parseArticleNum('166'), null);
});

test('articleNumToInt: extracts the number from kanji form', () => {
  assert.equal(api.articleNumToInt('第百六十六条'), 166);
});

test('detectChange: new baseline -> reason "new"', () => {
  const r = api.detectChange(null, {
    law_revision_id: 'X',
    updated: '2026-01-01',
  });
  assert.equal(r.changed, true);
  assert.equal(r.reason, 'new');
});

test('detectChange: identical -> not changed', () => {
  const meta = { law_revision_id: 'X', updated: 'U', amendment_enforcement_date: 'D' };
  const r = api.detectChange(meta, meta);
  assert.equal(r.changed, false);
  assert.equal(r.reason, 'unchanged');
});

test('detectChange: amendment detection on revision change', () => {
  const prev = { law_revision_id: 'A', updated: 'U1' };
  const curr = { law_revision_id: 'B', updated: 'U2' };
  const r = api.detectChange(prev, curr);
  assert.equal(r.changed, true);
  assert.equal(r.reason, 'amendment');
  assert.ok(r.fields.law_revision_id);
});

test('flattenMeta: handles missing nested fields gracefully', () => {
  const r = api.flattenMeta({});
  assert.equal(r.law_id, undefined);
  assert.equal(r.abbrev, null);
});

test('cache module: sanitizes law_id (path traversal blocked)', () => {
  const cache = require('../lib/cache');
  // Use a temp dir for this test
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'laws-jp-test-'));
  process.env.LAWS_JP_CACHE_DIR = path.join(tmp, 'body');
  // Re-require to pick up new env (cache module captures CACHE_DIR at import)
  // For this test we just verify the regex catches bad input.
  assert.throws(() => {
    cache.invalidate('../../etc/passwd');
  }, /unsafe law_id/);
  assert.throws(() => {
    cache.invalidate('test;rm -rf /');
  }, /unsafe law_id/);
});

test('toc module: sanitizes law_id', () => {
  const toc = require('../lib/toc');
  assert.throws(() => {
    toc.invalidate('../../../etc/shadow');
  }, /unsafe law_id/);
});

test('seed module: returns a non-empty array of statute records', () => {
  const seed = require('../lib/seed');
  assert.ok(Array.isArray(seed));
  assert.ok(seed.length >= 40, `expected >= 40 entries, got ${seed.length}`);
  for (const s of seed) {
    assert.ok(typeof s.title === 'string' && s.title.length > 0);
    assert.ok(Array.isArray(s.tags));
  }
});
