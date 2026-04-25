'use strict';
// Regression test for the production-cache pollution guards.
//
// Verifies:
//   1) NODE_ENV=test + no env override → lib + CLI fail-fast
//   2) test/_env.js refuses any LAWS_JP_* env that points at a production path
//   3) After requiring test/_env.js, all LAWS_JP_* env vars resolve to tmpdir
//   4) NODE_ENV unset → fall-back to default paths is allowed (back-compat)
//   5) NODE_ENV=test + explicit env → works fine

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const HOME = os.homedir();
const PROD_PATHS = {
  cache: path.join(HOME, '.cache/laws-jp/body'),
  toc:   path.join(HOME, '.cache/laws-jp/toc'),
  state: path.join(HOME, '.local/share/laws-jp'),
};

function runWithEnv(extraEnv, code) {
  const cleanEnv = { ...process.env };
  for (const k of Object.keys(cleanEnv)) {
    if (k.startsWith('LAWS_JP_')) delete cleanEnv[k];
  }
  delete cleanEnv.NODE_ENV;
  const env = { ...cleanEnv, ...extraEnv };
  const r = spawnSync(process.execPath, ['-e', code], { cwd: ROOT, env, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('(1) cache: NODE_ENV=test + LAWS_JP_CACHE_DIR unset → fail-fast', () => {
  const r = runWithEnv({ NODE_ENV: 'test' }, "require('./lib/cache');");
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /refusing to fall back/);
  assert.match(r.stderr, /LAWS_JP_CACHE_DIR/);
});

test('(1) toc: NODE_ENV=test + LAWS_JP_TOC_DIR unset → fail-fast', () => {
  const r = runWithEnv({ NODE_ENV: 'test' }, "require('./lib/toc');");
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /refusing to fall back/);
  assert.match(r.stderr, /LAWS_JP_TOC_DIR/);
});

test('(1) bin: NODE_ENV=test + storage env unset → exit 2 with clear stderr', () => {
  const r = spawnSync(process.execPath, ['bin/laws-jp.js', '--help'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'test', LAWS_JP_HOME: '', LAWS_JP_CACHE_DIR: '', LAWS_JP_TOC_DIR: '' },
    encoding: 'utf8',
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /refusing to run in test mode/);
});

test('(2) _env.js refuses LAWS_JP_CACHE_DIR pointing at production', () => {
  const r = runWithEnv(
    { LAWS_JP_CACHE_DIR: PROD_PATHS.cache },
    "require('./test/_env');"
  );
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /production/);
});

test('(2) _env.js refuses LAWS_JP_TOC_DIR pointing at production', () => {
  const r = runWithEnv(
    { LAWS_JP_TOC_DIR: PROD_PATHS.toc },
    "require('./test/_env');"
  );
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /production/);
});

test('(2) _env.js refuses LAWS_JP_HOME pointing at production state dir', () => {
  const r = runWithEnv(
    { LAWS_JP_HOME: PROD_PATHS.state },
    "require('./test/_env');"
  );
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /production/);
});

test('(3) After _env.js: all LAWS_JP_* env vars are under tmpdir', () => {
  const r = runWithEnv({}, `
    require('./test/_env');
    const out = {};
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('LAWS_JP_')) out[k] = process.env[k];
    }
    process.stdout.write(JSON.stringify(out));
  `);
  assert.equal(r.code, 0, r.stderr);
  const env = JSON.parse(r.stdout);
  for (const [k, v] of Object.entries(env)) {
    if (k === 'LAWS_JP_TEST_KEEP') continue;
    assert.ok(
      v.includes(os.tmpdir()) || v.startsWith('/tmp/') || v.startsWith('/var/folders/'),
      `${k}=${v} should resolve under tmpdir`
    );
    for (const p of Object.values(PROD_PATHS)) {
      assert.ok(!v.startsWith(p), `${k}=${v} must NOT start with prod path ${p}`);
    }
  }
});

test('(4) Backward compat: NODE_ENV unset → default fall-back is allowed', () => {
  const r = runWithEnv({}, `
    const c = require('./lib/cache');
    process.stdout.write(c.CACHE_DIR);
  `);
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.endsWith('.cache/laws-jp/body'), `unexpected: ${r.stdout}`);
});

test('(5) NODE_ENV=test + explicit LAWS_JP_CACHE_DIR works', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'laws-jp-guard-'));
  const r = runWithEnv(
    { NODE_ENV: 'test', LAWS_JP_CACHE_DIR: path.join(tmp, 'body') },
    `
      const c = require('./lib/cache');
      process.stdout.write(c.CACHE_DIR);
    `
  );
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.equal(r.code, 0, r.stderr);
  assert.ok(r.stdout.includes(tmp));
});
