'use strict';

// Pure utility functions for /laws --report post-processing.
// No file I/O. All functions are deterministic and side-effect-free
// (sanitizeMermaid logs to stderr on Fix4 auto-correction — acceptable for debugging).

// Re-export kanji-to-int and article-number parser from egov-api to avoid duplication.
const { parseArticleNum, articleNumToInt } = require('./egov-api');

// ─── kanjiToInt / parseArticleNumber ──────────────────────────────────────

// Re-exported as canonical names for the report subsystem.
// kanjiToInt: "百六十六" → 166,  "5" → 5
function kanjiToInt(s) {
  return articleNumToInt(`第${s}条`);
}

// parseArticleNumber: "第五条の二" → { num: 5, sub: 2 }, "第五条の二の三" → { num: 5, sub: 2, subSub: 3 }
function parseArticleNumber(text) {
  const p = parseArticleNum(text);
  if (!p) return null;
  return { num: p.num, sub: p.sub, subSub: p.subSub };
}

// ─── bigramSimilarity ─────────────────────────────────────────────────────

function bigrams(s) {
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

function bigramSimilarity(a, b) {
  if (a === b) return 1.0;
  const ba = bigrams(a);
  const bb = bigrams(b);
  if (ba.size === 0 && bb.size === 0) return 1.0;
  if (ba.size === 0 || bb.size === 0) return 0.0;
  let intersection = 0;
  for (const bg of ba) if (bb.has(bg)) intersection++;
  return (2 * intersection) / (ba.size + bb.size);
}

// ─── expandLawNames ───────────────────────────────────────────────────────

// Add 施行令 and 施行規則 variants for any base law name ending in 法, unless already present.
function expandLawNames(names) {
  const result = [...names];
  const set = new Set(names);
  for (const name of names) {
    if (name.endsWith('法') || name.endsWith('令') || name.endsWith('規則')) {
      // Only expand base law names (ending in 法)
      if (name.endsWith('法')) {
        const rei = name + '施行令';
        const kisoku = name + '施行規則';
        if (!set.has(rei)) { result.push(rei); set.add(rei); }
        if (!set.has(kisoku)) { result.push(kisoku); set.add(kisoku); }
      }
    }
  }
  return result;
}

// ─── filterCitations ─────────────────────────────────────────────────────

// Strip mermaid code blocks from text before scanning for citation numbers.
function stripMermaidBlocks(text) {
  return text.replace(/```mermaid[\s\S]*?```/g, '');
}

// Return only the refs whose [N] appears in body (outside mermaid blocks).
// Handles [N] and [N,M,...] forms.
function filterCitations(body, refs) {
  const stripped = stripMermaidBlocks(body);
  const used = new Set();
  for (const m of stripped.matchAll(/\[(\d+(?:,\s*\d+)*)\]/g)) {
    for (const num of m[1].split(',')) used.add(parseInt(num.trim(), 10));
  }
  return refs.filter(r => used.has(r.n));
}

// ─── linkifyCitations ────────────────────────────────────────────────────

// Convert [N] → [[N]](url) and [N,M] → [[N]](url1) [[M]](url2).
// Refs without a URL are left as plain [N].
// Mermaid blocks are passed through unchanged (their [N] node IDs are not citations).
function linkifyCitations(body, refs) {
  const urlMap = new Map(refs.map(r => [r.n, r.url]));

  function linkify(text) {
    // Replace [N,M,...] multi-ref first (longer pattern first to avoid partial matches)
    let result = text.replace(/\[(\d+(?:,\s*\d+)+)\]/g, (_, inner) =>
      inner.split(',').map(s => {
        const n = parseInt(s.trim(), 10);
        const url = urlMap.get(n);
        return url ? `[[${n}]](${url})` : `[${n}]`;
      }).join(' ')
    );
    // Replace single [N] — (?<!\[) prevents re-matching [N] inside already-linked [[N]](url)
    result = result.replace(/(?<!\[)\[(\d+)\]/g, (match, n) => {
      const url = urlMap.get(parseInt(n, 10));
      return url ? `[[${n}]](${url})` : match;
    });
    return result;
  }

  // Split on mermaid blocks (capturing group keeps them in the array at odd indices).
  // Even-index segments are plain text → linkify; odd-index segments are mermaid → pass through.
  return body.split(/(```mermaid[\s\S]*?```)/g)
    .map((seg, i) => i % 2 === 0 ? linkify(seg) : seg)
    .join('');
}

// ─── sanitizeMermaid ─────────────────────────────────────────────────────

const MERMAID_BLOCK_RE = /```mermaid([\s\S]*?)```/g;
const DIRECTIVE_LINE_RE = /^\s*(click|style|class|subgraph|linkStyle)\s/;

// Fix4: auto-correct LLM-generated node shapes to A[...] form.
// Applied as a pre-pass before the parenthesis→fullwidth conversion.
function fixNodeShapes(block) {
  return block
    .split('\n')
    .map(line => {
      if (DIRECTIVE_LINE_RE.test(line)) return line; // skip directive lines
      // Circle: A((text)) → A[text]
      line = line.replace(/\b([A-Za-z_]\w*)\(\(([^)]+)\)\)/g, (_, id, text) => {
        process.stderr.write(`[sanitizeMermaid] node shape auto-corrected: circle → ${id}[${text}]\n`);
        return `${id}[${text}]`;
      });
      // Round: A(text) → A[text]  (after circle to avoid partial match)
      line = line.replace(/\b([A-Za-z_]\w*)\(([^)]+)\)/g, (_, id, text) => {
        process.stderr.write(`[sanitizeMermaid] node shape auto-corrected: round → ${id}[${text}]\n`);
        return `${id}[${text}]`;
      });
      // Diamond: A{text} → A[text]
      line = line.replace(/\b([A-Za-z_]\w*)\{([^}]+)\}/g, (_, id, text) => {
        process.stderr.write(`[sanitizeMermaid] node shape auto-corrected: diamond → ${id}[${text}]\n`);
        return `${id}[${text}]`;
      });
      return line;
    })
    .join('\n');
}

// Sanitize Mermaid code blocks:
//   1. Fix4 node-shape pre-pass
//   2. ( ) → （ ） inside string labels (after node-shape correction)
//   3. " → ' inside labels
function sanitizeMermaid(text) {
  return text.replace(MERMAID_BLOCK_RE, (_, block) => {
    // Fix4: node shape auto-correction
    let safe = fixNodeShapes(block);
    // Replace remaining bare ( ) in string labels with fullwidth equivalents.
    // Only inside quoted strings or text segments (not in --> or special syntax).
    safe = safe
      .split('\n')
      .map(line => {
        if (DIRECTIVE_LINE_RE.test(line)) return line;
        // After Fix4, remaining ( ) are inside label text — convert to fullwidth.
        // Use a narrow heuristic: ( ) that are NOT immediately preceded by a node ID pattern.
        return line.replace(/\(([^)]*)\)/g, '（$1）');
      })
      .join('\n');
    return '```mermaid' + safe + '```';
  });
}

// ─── Exports ─────────────────────────────────────────────────────────────

module.exports = {
  bigramSimilarity,
  expandLawNames,
  filterCitations,
  linkifyCitations,
  sanitizeMermaid,
  kanjiToInt,
  parseArticleNumber,
};
