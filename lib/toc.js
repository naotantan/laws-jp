'use strict';
// toc: Layer 3 article-level table of contents index
// Owns: <TOC_DIR>/<law_id>.json only

const fs = require('fs');
const path = require('path');
const os = require('os');
const api = require('./egov-api');

const TOC_DIR = process.env.LAWS_JP_TOC_DIR
  || path.join(os.homedir(), '.cache/laws-jp/toc');

const LAW_ID_RE = /^[A-Za-z0-9_-]+$/;
function assertSafeLawId(lawId) {
  if (typeof lawId !== 'string' || !LAW_ID_RE.test(lawId)) {
    throw new Error(`unsafe law_id: ${lawId}`);
  }
}

function ensureDir() {
  fs.mkdirSync(TOC_DIR, { recursive: true });
}

function tocPath(lawId) {
  assertSafeLawId(lawId);
  return path.join(TOC_DIR, `${lawId}.json`);
}

function nowIso() {
  return new Date().toISOString();
}

// 公開 API ----------------------------------------

/**
 * Build TOC structure from a law_data API response + flattened meta.
 * @param {object} lawData       result of api.fetchFullText (has law_full_text)
 * @param {object} meta          flattened meta with law_id, law_title, law_revision_id
 * @returns {object}             TOC ready for saveToc
 */
function buildToc(lawData, meta) {
  if (!lawData || !lawData.law_full_text) {
    throw new Error('buildToc: invalid lawData (missing law_full_text)');
  }
  const articles = api.extractArticles(lawData.law_full_text);
  return {
    law_id: meta.law_id,
    law_title: meta.law_title,
    law_revision_id: meta.law_revision_id || '',
    built_at: nowIso(),
    article_count: articles.length,
    articles,
  };
}

/**
 * Persist a TOC for one law atomically.
 * @param {string} lawId
 * @param {object} toc
 */
function saveToc(lawId, toc) {
  ensureDir();
  const tmp = tocPath(lawId) + `.tmp.${process.pid}.${Math.floor(Math.random()*1e6)}`;
  fs.writeFileSync(tmp, JSON.stringify(toc, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, tocPath(lawId));
}

/**
 * Load TOC if it exists. Returns null on absence; throws on broken JSON.
 * @param {string} lawId
 * @returns {object | null}
 */
function loadToc(lawId) {
  const p = tocPath(lawId);
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    process.stderr.write(`WARN_TOC_READ: ${p}: ${e.message}\n`);
    throw new Error(`TOC_READ_FAILED: ${e.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    const broken = p + `.broken-${Date.now()}`;
    try { fs.renameSync(p, broken); } catch {}
    process.stderr.write(`WARN_TOC_BROKEN: ${p} corrupt JSON, renamed to ${broken}.\n`);
    throw new Error(`TOC_BROKEN: ${e.message}`);
  }
}

/**
 * Look up a single article by query. Supports sub-article notation (枝番).
 * @param {string} lawId
 * @param {string|number} articleQuery
 *   "166"            → 第166条 (sub=0)
 *   166              → 同上
 *   "第百六十六条"    → 同上
 *   "第百六十六条の二" → 第166条の二 (sub=2)
 *   "166-2"          → 第166条の二
 *   "166.2"          → 同上
 * @returns {{article: object, path: string[]} | null}
 */
function getArticle(lawId, articleQuery) {
  const t = loadToc(lawId);
  if (!t || !Array.isArray(t.articles)) return null;

  let targetNum = null;
  let targetSub = 0;
  let targetSubSub = 0;

  if (typeof articleQuery === 'number') {
    targetNum = articleQuery;
  } else {
    const s = String(articleQuery);
    // Try kanji form first ("第百六十六条の二の三")
    const parsed = api.parseArticleNum(s);
    if (parsed && parsed.num != null) {
      targetNum = parsed.num;
      targetSub = parsed.sub;
      targetSubSub = parsed.subSub;
    } else {
      // Plain digit form: "166", "166-2", "166.2", "166-2-3", "166.2.3"
      const m = s.match(/^(\d+)(?:[-.](\d+)(?:[-.](\d+))?)?$/);
      if (m) {
        targetNum = parseInt(m[1], 10);
        targetSub = m[2] ? parseInt(m[2], 10) : 0;
        targetSubSub = m[3] ? parseInt(m[3], 10) : 0;
      }
    }
  }

  if (targetNum == null || Number.isNaN(targetNum)) return null;
  const match = t.articles.find(a =>
    a.article_num_int === targetNum &&
    (a.article_sub || 0) === targetSub &&
    (a.article_sub_sub || 0) === targetSubSub
  );
  if (!match) return null;
  return { article: match, path: match.path || [] };
}

/**
 * Remove the cached TOC for one law. Idempotent: ENOENT silent.
 * Other errors are logged via WARN_TOC_INVALIDATE.
 * @param {string} lawId
 */
function invalidate(lawId) {
  const p = tocPath(lawId);
  try {
    fs.unlinkSync(p);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      process.stderr.write(`WARN_TOC_INVALIDATE: ${p}: ${e.message}\n`);
    }
  }
}

/**
 * List all cached TOC entries (file name + size). Useful for `cache-info` style ops.
 * @returns {{law_id: string, byte_size: number}[]}
 */
function list() {
  ensureDir();
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(TOC_DIR);
  } catch (e) {
    process.stderr.write(`WARN_TOC_LIST: ${TOC_DIR}: ${e.message}\n`);
    return out;
  }
  for (const f of entries) {
    if (!f.endsWith('.json')) continue;
    const p = path.join(TOC_DIR, f);
    let stat;
    try { stat = fs.statSync(p); } catch (e) {
      process.stderr.write(`WARN_TOC_LIST: stat ${p}: ${e.message}\n`);
      continue;
    }
    out.push({ law_id: f.replace(/\.json$/, ''), byte_size: stat.size });
  }
  return out;
}

module.exports = {
  buildToc,
  saveToc,
  loadToc,
  getArticle,
  invalidate,
  list,
  TOC_DIR,
};
