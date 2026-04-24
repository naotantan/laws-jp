'use strict';
// e-Gov Laws API v2 client (Japanese government statute API)
// https://laws.e-gov.go.jp/api/2/swagger-ui

const BASE = 'https://laws.e-gov.go.jp/api/2';
const UA = process.env.LAWS_JP_USER_AGENT || 'laws-jp/0.1 (+https://github.com/naotantan/laws-jp)';

async function req(path, params = {}) {
  const u = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) u.searchParams.set(k, String(v));
  }
  const res = await fetch(u.toString(), { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`e-Gov API ${res.status} ${res.statusText}: ${u.pathname}${u.search}`);
  return res.json();
}

async function searchByTitle(title, opts = {}) {
  const data = await req('/laws', { law_title: title, limit: opts.limit ?? 10, law_type: opts.law_type });
  return data.laws || [];
}

async function searchByLawId(lawId) {
  const data = await req('/laws', { law_id: lawId, limit: 1 });
  return (data.laws && data.laws[0]) || null;
}

async function fetchFullText(lawId) {
  return req('/law_data/' + encodeURIComponent(lawId));
}

// Extract flat metadata from a search-result entry (for manifest comparison)
function flattenMeta(entry) {
  const li = entry.law_info || {};
  const ri = entry.revision_info || entry.current_revision_info || {};
  return {
    law_id: li.law_id,
    law_num: li.law_num,
    promulgation_date: li.promulgation_date,
    law_revision_id: ri.law_revision_id,
    law_title: ri.law_title,
    law_title_kana: ri.law_title_kana,
    abbrev: ri.abbrev || null,
    category: ri.category,
    updated: ri.updated,
    amendment_promulgate_date: ri.amendment_promulgate_date,
    amendment_enforcement_date: ri.amendment_enforcement_date,
    amendment_law_id: ri.amendment_law_id,
    amendment_law_title: ri.amendment_law_title,
    amendment_law_num: ri.amendment_law_num,
    amendment_type: ri.amendment_type,
    repeal_status: ri.repeal_status,
    current_revision_status: ri.current_revision_status,
  };
}

function detectChange(prev, curr) {
  if (!prev) return { changed: true, reason: 'new', fields: {} };
  const fields = {};
  const watched = ['updated', 'law_revision_id', 'amendment_enforcement_date', 'amendment_law_id', 'repeal_status'];
  for (const k of watched) {
    if (prev[k] !== curr[k]) fields[k] = { prev: prev[k], curr: curr[k] };
  }
  const changed = Object.keys(fields).length > 0;
  return { changed, reason: changed ? 'amendment' : 'unchanged', fields };
}

// --- XML-tree (law_full_text) → Markdown conversion ---
// The API returns the statute as a nested tree of {tag, attr, children}.
// We walk known tags to produce readable MD. Unknown tags fall through to text concat.

function textOf(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node.children) return textOf(node.children);
  return '';
}

function toMarkdown(lawFullText, meta) {
  const lines = [];
  const title = meta?.law_title || '（法令）';
  lines.push('# ' + title);
  if (meta?.law_num) lines.push('');
  if (meta?.law_num) lines.push('> ' + meta.law_num);
  if (meta?.amendment_enforcement_date) {
    lines.push('> 最終改正施行: ' + meta.amendment_enforcement_date + (meta.amendment_law_title ? '（' + meta.amendment_law_title + '）' : ''));
  }
  lines.push('');

  walk(lawFullText, lines, 0);
  return lines.join('\n');
}

function walk(node, out, depth) {
  if (node == null) return;
  if (typeof node === 'string') { out.push(node); return; }
  if (Array.isArray(node)) { for (const c of node) walk(c, out, depth); return; }
  const tag = node.tag;
  const children = node.children || [];
  switch (tag) {
    case 'Law':
    case 'LawBody':
    case 'MainProvision':
      for (const c of children) walk(c, out, depth);
      break;
    case 'LawNum':
    case 'EnactStatement':
    case 'Preamble':
      out.push(textOf(children));
      out.push('');
      break;
    case 'LawTitle':
      break; // title already emitted
    case 'Part':
      out.push('');
      out.push('## ' + textOf(findChild(children, 'PartTitle')));
      for (const c of children) if (c.tag !== 'PartTitle') walk(c, out, depth + 1);
      break;
    case 'Chapter':
      out.push('');
      out.push('### ' + textOf(findChild(children, 'ChapterTitle')));
      for (const c of children) if (c.tag !== 'ChapterTitle') walk(c, out, depth + 1);
      break;
    case 'Section':
      out.push('');
      out.push('#### ' + textOf(findChild(children, 'SectionTitle')));
      for (const c of children) if (c.tag !== 'SectionTitle') walk(c, out, depth + 1);
      break;
    case 'Subsection':
      out.push('');
      out.push('##### ' + textOf(findChild(children, 'SubsectionTitle')));
      for (const c of children) if (c.tag !== 'SubsectionTitle') walk(c, out, depth + 1);
      break;
    case 'Division':
      out.push('');
      out.push('###### ' + textOf(findChild(children, 'DivisionTitle')));
      for (const c of children) if (c.tag !== 'DivisionTitle') walk(c, out, depth + 1);
      break;
    case 'Article': {
      const artNum = textOf(findChild(children, 'ArticleTitle'));
      const caption = textOf(findChild(children, 'ArticleCaption'));
      out.push('');
      out.push(`**${artNum}**${caption ? '　' + caption : ''}`);
      for (const c of children) {
        if (c.tag === 'ArticleTitle' || c.tag === 'ArticleCaption') continue;
        walk(c, out, depth + 1);
      }
      break;
    }
    case 'Paragraph': {
      const pnum = textOf(findChild(children, 'ParagraphNum'));
      const sentences = findAllChildren(children, 'ParagraphSentence')
        .map(ps => textOf(findAllChildren(ps.children || [], 'Sentence').map(s => s.children).flat())).join('');
      const combined = pnum ? `${pnum} ${sentences}` : sentences;
      if (combined) out.push(combined);
      for (const c of children) {
        if (['ParagraphNum', 'ParagraphSentence'].includes(c.tag)) continue;
        walk(c, out, depth + 1);
      }
      break;
    }
    case 'Item': {
      const inum = textOf(findChild(children, 'ItemTitle'));
      const isent = textOf(findAllChildren(findAllChildren(children, 'ItemSentence')
        .map(x => x.children).flat(), 'Sentence').map(s => s.children).flat());
      if (inum || isent) out.push(`  ${inum}${inum && isent ? ' ' : ''}${isent}`);
      for (const c of children) {
        if (['ItemTitle', 'ItemSentence'].includes(c.tag)) continue;
        walk(c, out, depth + 1);
      }
      break;
    }
    case 'Subitem1':
    case 'Subitem2':
    case 'Subitem3': {
      const n = tag.slice(-1);
      const indent = '  '.repeat(1 + parseInt(n, 10));
      const titleNode = findChild(children, tag + 'Title');
      const sentNode = findChild(children, tag + 'Sentence');
      const t = textOf(titleNode);
      const s = textOf(sentNode);
      if (t || s) out.push(`${indent}${t}${t && s ? ' ' : ''}${s}`);
      for (const c of children) {
        if (c.tag === tag + 'Title' || c.tag === tag + 'Sentence') continue;
        walk(c, out, depth + 1);
      }
      break;
    }
    case 'SupplProvision':
      out.push('');
      out.push('## 附則');
      for (const c of children) walk(c, out, depth + 1);
      break;
    case 'TOC':
    case 'TOCPreambleLabel':
    case 'TOCPart':
    case 'TOCChapter':
    case 'TOCSection':
    case 'TOCArticle':
    case 'TOCAppdxTableLabel':
    case 'TOCSupplProvision':
      // Skip table of contents — redundant with MD headings
      break;
    default:
      // Unknown tag: concatenate descendant text
      for (const c of children) walk(c, out, depth);
  }
}

function findChild(children, tag) {
  for (const c of children || []) if (c && c.tag === tag) return c;
  return null;
}
function findAllChildren(children, tag) {
  return (children || []).filter(c => c && c.tag === tag);
}

// --- Article-level extraction (Layer 3 TOC) ---
// e-Gov の law_full_text を「条」単位の構造化リストに変換する
// 各 article: { id, article_num_text, article_num_int, caption, path, body_md, byte_size }

// Convert "第百六十六条" / "第百六十六条の二" / "第1条" → integer 166 (sub-articles share parent number)
const KANJI_DIGITS = { '〇':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9 };
function kanjiToInt(s) {
  if (!s) return null;
  // try plain number first
  const m = String(s).match(/(\d+)/);
  if (m) return parseInt(m[1], 10);
  // 漢数字: 千 百 十 with prefix 一-九
  let total = 0, current = 0;
  for (const ch of s) {
    if (ch in KANJI_DIGITS) {
      current = KANJI_DIGITS[ch];
    } else if (ch === '十') {
      total += (current === 0 ? 1 : current) * 10;
      current = 0;
    } else if (ch === '百') {
      total += (current === 0 ? 1 : current) * 100;
      current = 0;
    } else if (ch === '千') {
      total += (current === 0 ? 1 : current) * 1000;
      current = 0;
    }
  }
  total += current;
  return total > 0 ? total : null;
}

/**
 * Parse article number text into structured form.
 * - "第百六十六条" → { num: 166, sub: 0 }
 * - "第百六十六条の二" → { num: 166, sub: 2 }
 * - "第百六十六条の二の三" → { num: 166, sub: 2, subSub: 3 } (rarely seen)
 * Returns null if not parsable.
 */
function parseArticleNum(text) {
  if (!text) return null;
  const m = text.match(/第([〇一二三四五六七八九十百千\d]+)条(?:の([〇一二三四五六七八九十百千\d]+))?(?:の([〇一二三四五六七八九十百千\d]+))?/);
  if (!m) return null;
  const num = kanjiToInt(m[1]);
  if (num == null) return null;
  return {
    num,
    sub: m[2] ? (kanjiToInt(m[2]) || 0) : 0,
    subSub: m[3] ? (kanjiToInt(m[3]) || 0) : 0,
  };
}

// Backward-compat scalar accessor
function articleNumToInt(text) {
  const p = parseArticleNum(text);
  return p ? p.num : null;
}

function extractArticles(lawFullText) {
  const articles = [];
  const stack = [];  // [{tag, title}]
  function recurse(node) {
    if (!node) return;
    if (Array.isArray(node)) { for (const c of node) recurse(c); return; }
    if (typeof node !== 'object') return;
    const tag = node.tag;
    const children = node.children || [];

    if (tag === 'Part' || tag === 'Chapter' || tag === 'Section' || tag === 'Subsection' || tag === 'Division') {
      const titleTag = tag + 'Title';
      const title = textOf(findChild(children, titleTag));
      stack.push({ tag, title });
      for (const c of children) if (c.tag !== titleTag) recurse(c);
      stack.pop();
      return;
    }

    if (tag === 'Article') {
      const articleNumText = textOf(findChild(children, 'ArticleTitle'));
      const caption = textOf(findChild(children, 'ArticleCaption'));
      const parsed = parseArticleNum(articleNumText) || { num: null, sub: 0, subSub: 0 };
      const lines = [];
      const captionLine = caption ? `${articleNumText}　${caption}` : articleNumText;
      lines.push(`**${captionLine}**`);
      for (const c of children) {
        if (c.tag === 'ArticleTitle' || c.tag === 'ArticleCaption') continue;
        walk(c, lines, 0);
      }
      const body_md = lines.join('\n');
      articles.push({
        id: `art-${parsed.num ?? articleNumText}-${parsed.sub}-${parsed.subSub}-${articles.length}`,
        article_num_text: articleNumText,
        article_num_int: parsed.num,
        article_sub: parsed.sub,           // 枝番（"の二" → 2）
        article_sub_sub: parsed.subSub,    // 二段枝番（"の二の三" → 3）
        caption,
        path: stack.map(s => s.title),
        body_md,
        byte_size: Buffer.byteLength(body_md, 'utf8'),
      });
      return;
    }

    // Containers we walk through transparently
    for (const c of children) recurse(c);
  }
  recurse(lawFullText);
  return articles;
}

module.exports = {
  searchByTitle,
  searchByLawId,
  fetchFullText,
  flattenMeta,
  detectChange,
  toMarkdown,
  extractArticles,
  articleNumToInt,
  parseArticleNum,
  BASE,
};
