'use strict';
// article-diff: article-level diff helpers
// Owns: tokenize / diffTokens / renderDiff / safeCachePath / loadCacheJson

const fs = require('fs');
const path = require('path');

/**
 * Validate a cache file path. Rejects null-byte / empty / non-string / non-file.
 * @returns {string} resolved absolute path
 * @throws {Error} INPUT_BAD_CACHE_FILE: <label>: <reason>
 */
function safeCachePath(p, label) {
  if (typeof p !== 'string' || p.length === 0 || /\x00/.test(p)) {
    throw new Error(`INPUT_BAD_CACHE_FILE: ${label}: invalid path`);
  }
  const resolved = path.resolve(p);
  let stat;
  try { stat = fs.statSync(resolved); }
  catch (e) { throw new Error(`INPUT_BAD_CACHE_FILE: ${label}: stat failed (${e.message})`); }
  if (!stat.isFile()) {
    throw new Error(`INPUT_BAD_CACHE_FILE: ${label}: not a regular file (${resolved})`);
  }
  return resolved;
}

/**
 * Load + parse a JSON cache file, with all errors prefixed INPUT_BAD_CACHE_FILE.
 * @returns {object} parsed JSON
 */
function loadCacheJson(p, label) {
  const safe = safeCachePath(p, label);
  let raw;
  try { raw = fs.readFileSync(safe, 'utf8'); }
  catch (e) { throw new Error(`INPUT_BAD_CACHE_FILE: ${label}: read failed (${e.message})`); }
  try { return JSON.parse(raw); }
  catch (e) { throw new Error(`INPUT_BAD_CACHE_FILE: ${label}: malformed JSON (${e.message})`); }
}

/**
 * Tokenize text for diff (word-level + Japanese punctuation boundaries).
 * Preserves whitespace and punctuation as tokens (necessary for byte-perfect reconstruction).
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  return (text || '').split(/(\s+|[、。「」（）()\[\]【】　,.;:!?])/g).filter(t => t !== '');
}

/**
 * Compute token-level diff via Myers LCS DP.
 * O(MN) time / space; suitable for typical statute articles (≤500 tokens).
 * For very long articles (>5000 tokens) consider patience or histogram diff.
 * @param {string[]} a   tokens of "old" text
 * @param {string[]} b   tokens of "new" text
 * @returns {{type:'eq'|'del'|'ins', text:string}[]}  ordered operations
 */
function diffTokens(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = (a[i] === b[j]) ? (dp[i+1][j+1] + 1) : Math.max(dp[i+1][j], dp[i][j+1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { ops.push({ type: 'eq', text: a[i] }); i++; j++; }
    else if (dp[i+1][j] >= dp[i][j+1]) { ops.push({ type: 'del', text: a[i] }); i++; }
    else { ops.push({ type: 'ins', text: b[j] }); j++; }
  }
  while (i < m) { ops.push({ type: 'del', text: a[i++] }); }
  while (j < n) { ops.push({ type: 'ins', text: b[j++] }); }
  return ops;
}

/**
 * Render diff ops in the requested format.
 * @param {object[]} ops    output of diffTokens
 * @param {'side-by-side'|'unified'|'json'} format  default 'side-by-side'
 * @returns {string}
 */
function renderDiff(ops, format) {
  if (format === 'unified') {
    return ops.map(o => o.type === 'eq' ? o.text : (o.type === 'del' ? `[-${o.text}-]` : `{+${o.text}+}`)).join('');
  }
  if (format === 'json') {
    return JSON.stringify(ops, null, 2);
  }
  const oldText = ops.filter(o => o.type !== 'ins').map(o => o.text).join('');
  const newText = ops.filter(o => o.type !== 'del').map(o => o.text).join('');
  return `--- 旧条文 ---\n${oldText}\n\n--- 新条文 ---\n${newText}\n\n--- 差分 (-削除- +追加+) ---\n${renderDiff(ops, 'unified')}`;
}

module.exports = {
  safeCachePath,
  loadCacheJson,
  tokenize,
  diffTokens,
  renderDiff,
};
