'use strict';
// cache: Layer 2 statute body cache
// Owns: <CACHE_DIR>/<law_id>.md only

const fs = require('fs');
const path = require('path');
const os = require('os');

// CACHE_DIR is overridable via LAWS_JP_CACHE_DIR env var.
//
// Pollution guard: when NODE_ENV === 'test' and no override is set, refuse to
// fall back to the production path. This forces test code to set an isolated
// directory explicitly (see test/_env.js) so a forgotten env var can never
// accidentally write into ~/.cache/laws-jp/body.
if (process.env.NODE_ENV === 'test' && !process.env.LAWS_JP_CACHE_DIR) {
  throw new Error(
    'cache: refusing to fall back to ~/.cache/laws-jp/body in test mode. ' +
    'Set LAWS_JP_CACHE_DIR=<isolated-path> BEFORE require() to avoid polluting the production cache. ' +
    'See test/_env.js for the recommended setup.'
  );
}
const CACHE_DIR = process.env.LAWS_JP_CACHE_DIR
  || path.join(os.homedir(), '.cache/laws-jp/body');

// e-Gov の law_id は英数字のみ。path traversal 防御
const LAW_ID_RE = /^[A-Za-z0-9_-]+$/;
function assertSafeLawId(lawId) {
  if (typeof lawId !== 'string' || !LAW_ID_RE.test(lawId)) {
    throw new Error(`unsafe law_id: ${lawId}`);
  }
}

function ensureDir() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function bodyPath(lawId) {
  assertSafeLawId(lawId);
  return path.join(CACHE_DIR, `${lawId}.md`);
}

// frontmatter 形式: 上部 3 行に key: value（cached_at, law_revision_id, byte_size）
// 残りが本文 MD
function parseFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return null;
  const meta = {};
  let i = 1;
  while (i < lines.length && lines[i] !== '---') {
    const m = lines[i].match(/^([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/);
    if (m) meta[m[1]] = m[2];
    i++;
  }
  if (i >= lines.length) return null;
  const body = lines.slice(i + 1).join('\n');
  return { meta, body };
}

function buildFrontmatter(meta) {
  return [
    '---',
    `cached_at: ${meta.cached_at}`,
    `law_revision_id: ${meta.law_revision_id}`,
    `byte_size: ${meta.byte_size}`,
    '---',
    '',
  ].join('\n');
}

// 公開 API ----------------------------------------

/**
 * Get cached body MD if cached revision matches expected.
 * @param {string} lawId            e-Gov law_id (英数字のみ)
 * @param {string} expectedRevisionId 期待 law_revision_id (空なら revision 検査スキップ)
 * @returns {{hit: boolean, md?: string, meta?: object, reason?: string, cached_revision?: string, error?: string}}
 */
function getCached(lawId, expectedRevisionId) {
  const p = bodyPath(lawId);
  if (!fs.existsSync(p)) return { hit: false, reason: 'absent' };
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    process.stderr.write(`WARN_CACHE_READ: ${p}: ${e.message}\n`);
    return { hit: false, reason: 'read_error', error: e.message };
  }
  const parsed = parseFrontmatter(raw);
  if (!parsed) {
    // 破損 → 退避
    const broken = `${p}.broken-${Date.now()}`;
    try {
      fs.renameSync(p, broken);
      process.stderr.write(`WARN_CACHE_BROKEN: ${p} broken, renamed to ${broken} and re-fetching.\n`);
    } catch (e) {
      process.stderr.write(`WARN_CACHE_BROKEN: ${p} broken (could not rename: ${e.message}), re-fetching.\n`);
    }
    return { hit: false, reason: 'broken' };
  }
  if (expectedRevisionId && parsed.meta.law_revision_id !== expectedRevisionId) {
    return { hit: false, reason: 'stale', cached_revision: parsed.meta.law_revision_id };
  }
  return { hit: true, md: parsed.body, meta: parsed.meta };
}

/**
 * Write body MD to cache atomically (tmp file + rename).
 * @param {string} lawId
 * @param {string} revisionId
 * @param {string} md           body markdown (without frontmatter)
 */
function setCached(lawId, revisionId, md) {
  ensureDir();
  const fm = buildFrontmatter({
    cached_at: new Date().toISOString(),
    law_revision_id: revisionId || '',
    byte_size: Buffer.byteLength(md, 'utf8'),
  });
  // atomic rename: tmp に書いてから mv。pid + random で並行安全
  const tmp = bodyPath(lawId) + `.tmp.${process.pid}.${Math.floor(Math.random()*1e6)}`;
  fs.writeFileSync(tmp, fm + md, 'utf8');
  fs.renameSync(tmp, bodyPath(lawId));
}

/**
 * Remove cached body for a law. ENOENT 以外のエラーは WARN 出力。
 * 不在ファイルへの呼び出しは no-op。
 * @param {string} lawId
 */
function invalidate(lawId) {
  const p = bodyPath(lawId);
  try {
    fs.unlinkSync(p);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      process.stderr.write(`WARN_CACHE_INVALIDATE: ${p}: ${e.message}\n`);
    }
  }
}

/**
 * List all cached entries (sorted by file name).
 * @returns {{law_id: string, revision_id: string, byte_size: number, cached_at: string}[]}
 */
function list() {
  ensureDir();
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(CACHE_DIR);
  } catch (e) {
    process.stderr.write(`WARN_CACHE_LIST: ${CACHE_DIR}: ${e.message}\n`);
    return out;
  }
  for (const f of entries) {
    if (!f.endsWith('.md')) continue;
    const p = path.join(CACHE_DIR, f);
    let stat;
    try { stat = fs.statSync(p); } catch (e) {
      process.stderr.write(`WARN_CACHE_LIST: stat ${p}: ${e.message}\n`);
      continue;
    }
    let parsed = null;
    try { parsed = parseFrontmatter(fs.readFileSync(p, 'utf8')); } catch (e) {
      process.stderr.write(`WARN_CACHE_LIST: parse ${p}: ${e.message}\n`);
    }
    if (!parsed) {
      process.stderr.write(`WARN_CACHE_LIST: malformed frontmatter ${p}, listing with empty metadata\n`);
    }
    // Note: byte_size here is the **whole file size** (incl. frontmatter)
    // The body-only size is stored in frontmatter.byte_size by setCached()
    out.push({
      law_id: f.replace(/\.md$/, ''),
      revision_id: parsed?.meta.law_revision_id || '',
      byte_size: stat.size,
      cached_at: parsed?.meta.cached_at || '',
    });
  }
  return out;
}

/**
 * Aggregate cache size.
 * @returns {{count: number, total_bytes: number}}
 */
function size() {
  const items = list();
  return {
    count: items.length,
    total_bytes: items.reduce((s, x) => s + x.byte_size, 0),
  };
}

module.exports = {
  getCached,
  setCached,
  invalidate,
  list,
  size,
  CACHE_DIR,
};
