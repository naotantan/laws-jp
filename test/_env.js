'use strict';
// Test isolation helper. Require this FIRST in every test file.
//
// Goals:
//   1. Never write to the production cache (~/.cache/laws-jp/*) or state dir
//      (~/.local/share/laws-jp/) from tests.
//   2. Force NODE_ENV=test so the lib-level fail-fast guards engage.
//   3. Provide unique mkdtemp dirs (no PID collisions, no leftover state).
//   4. Auto-cleanup on process exit (unless LAWS_JP_TEST_KEEP=1).
//
// Usage:
//   require('./_env');                  // sets up isolated env vars
//   const { testRoot, dirs } = require('./_env');

const fs = require('fs');
const path = require('path');
const os = require('os');

const PROD_PATTERN = /\/\.(cache|local\/share)\/laws-jp(\/|$)/;

function assertNotProd(label, value) {
  if (typeof value === 'string' && PROD_PATTERN.test(value)) {
    throw new Error(
      `test/_env.js: ${label}=${value} points at the production cache or state dir. ` +
      'Refusing to run. Use mkdtempSync-based isolation only.'
    );
  }
}

[
  'LAWS_JP_HOME',
  'LAWS_JP_CACHE_DIR',
  'LAWS_JP_TOC_DIR',
].forEach((k) => assertNotProd(k, process.env[k]));

process.env.NODE_ENV = 'test';

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'laws-jp-test-'));

const dirs = {
  state: path.join(testRoot, 'state'),
  cache: path.join(testRoot, 'cache/body'),
  toc:   path.join(testRoot, 'cache/toc'),
};

function setIfMissing(k, v) {
  if (!process.env[k]) process.env[k] = v;
}
setIfMissing('LAWS_JP_HOME',      dirs.state);
setIfMissing('LAWS_JP_CACHE_DIR', dirs.cache);
setIfMissing('LAWS_JP_TOC_DIR',   dirs.toc);

function cleanup() {
  if (process.env.LAWS_JP_TEST_KEEP === '1') {
    process.stderr.write(`[test/_env] kept: ${testRoot}\n`);
    return;
  }
  try { fs.rmSync(testRoot, { recursive: true, force: true }); }
  catch { /* best effort */ }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });

module.exports = { testRoot, dirs };
