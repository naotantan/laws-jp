'use strict';

// laws-report-build-refs.js
// Builds the refs JSON for /laws --report.
// Handles: parallel law fetch, article extraction, [N] numbering,
// URL construction, bigram warnings, toc-first mode, and substitution detection.

const { fetchFullText, searchByTitle, extractArticles, flattenMeta } = require('./egov-api');
const { bigramSimilarity, parseArticleNumber } = require('./laws-report-utils');

const MAX_PARALLEL = 5;
const TOC_FIRST_THRESHOLD = 150_000;
const DIVERGENCE_THRESHOLD = 0.40;
const SUBSTITUTION_THRESHOLD = 0.30;
const MAX_ARTICLES = 100;

// Build the e-Gov viewer URL for a given law_id.
// §10 confirmed: #Mp-At_N fragment format is unverified (SPA). Law-level URL only.
function buildArticleUrl(lawId) {
  return `https://laws.e-gov.go.jp/law/${lawId}`;
}

// Fetch one law safely — returns null on failure rather than throwing.
async function fetchLawSafe(lawName) {
  try {
    const hits = await searchByTitle(lawName, { limit: 1 });
    if (!hits || hits.length === 0) return null;
    const meta = hits[0];
    const flatMeta = flattenMeta(meta);
    if (flatMeta.repeal_status === 'Repeal') return null; // M2: skip repealed laws
    const fullText = await fetchFullText(flatMeta.law_id);
    const articles = extractArticles(fullText.law_full_text || fullText);
    const totalBytes = articles.reduce((s, a) => s + (a.byte_size || a.body_md.length), 0);
    return { meta: flatMeta, articles, totalBytes };
  } catch {
    return null;
  }
}

// Detect mentioned article numbers in the query.
function detectMentionedArticles(query, allRefs) {
  const pattern = /第([〇一二三四五六七八九十百千\d]+)条(?:の([〇一二三四五六七八九十百千\d]+))?/g;
  const mentions = [];
  for (const m of query.matchAll(pattern)) {
    const p = parseArticleNumber(m[0]);
    if (!p) continue;
    const match = allRefs.find(r => r.article_num_int === p.num && r.article_sub === p.sub);
    if (match) {
      mentions.push(`${m[0]} の正式タイトル: 「${match.caption || match.article_num_text}」（${match.law_title} ${match.article_num_text}）`);
    }
  }
  return mentions.length > 0 ? mentions.join('\n') : '';
}

// Build refs_for_prompt string from refs array.
function buildRefsForPrompt(refs, urlContext) {
  const lines = refs.map(r =>
    `[${r.n}] 【e-Gov公式条文】 ${r.law_title} ${r.article_num_text}${r.caption ? `　${r.caption}` : ''}\n${r.body_md}`
  );
  if (urlContext) {
    lines.push(`[${refs.length + 1}] 【URLコンテキスト】 ${urlContext.url}\n${urlContext.content}`);
  }
  return lines.join('\n\n');
}

/**
 * Build refs for report generation.
 *
 * @param {object} opts
 * @param {string[]}  opts.lawNames         - Law names to fetch (post-expansion)
 * @param {string}    opts.query            - Original user query
 * @param {string}    [opts.mode]           - 'full' (default) or 'toc-first'
 * @param {string[]}  [opts.articleIds]     - Article num texts for toc-first second call
 * @param {Array<{from:string,to:string}>} [opts.substitutions] - B2: substitution pairs
 * @param {string[]}  [opts.estimatedNames] - Original estimated names for divergence check
 * @param {{url:string,content:string}} [opts.urlContext] - URL context if query had URL
 * @returns {Promise<object>}
 */
async function buildRefs(opts) {
  const {
    lawNames = [],
    query = '',
    mode = 'full',
    articleIds = [],
    substitutions = [],
    estimatedNames = [],
    urlContext = null,
  } = opts;

  // M1: base laws first so they aren't dropped by MAX_PARALLEL slice
  const baseFirst = [
    ...lawNames.filter(n => !n.endsWith('施行令') && !n.endsWith('施行規則')),
    ...lawNames.filter(n => n.endsWith('施行令') || n.endsWith('施行規則')),
  ];

  const fetchTargets = baseFirst.slice(0, MAX_PARALLEL);
  const results = (await Promise.all(fetchTargets.map(n => fetchLawSafe(n)))).filter(Boolean);

  if (results.length === 0) {
    return { refs: [], law_metas: [], warnings: {}, refs_for_prompt: '', mode: 'empty' };
  }

  // toc-first: if total bytes exceed threshold and no article IDs specified
  const totalBytes = results.reduce((s, r) => s + r.totalBytes, 0);
  if (totalBytes > TOC_FIRST_THRESHOLD && articleIds.length === 0) {
    const toc = results.map(r => ({
      law_title: r.meta.law_title,
      articles: r.articles.map(a => ({
        article_num_text: a.article_num_text,
        caption: a.caption || '',
        byte_size: a.byte_size || a.body_md.length,
      })),
    }));
    return {
      mode: 'toc-first',
      toc,
      message: `法令の総文字数が${Math.round(totalBytes / 1000)}k文字を超えています。以下の目次から参照する条文番号を指定してください。`,
    };
  }

  // Build flat article list (filtered by articleIds if provided)
  const allArticles = [];
  for (const r of results) {
    for (const art of r.articles) {
      if (articleIds.length > 0 && !articleIds.includes(art.article_num_text)) continue;
      allArticles.push({ ...art, law_title: r.meta.law_title, law_id: r.meta.law_id });
    }
  }

  // Assign [N] numbers (max MAX_ARTICLES)
  const refs = allArticles.slice(0, MAX_ARTICLES).map((art, i) => ({
    n: i + 1,
    law_title: art.law_title,
    article_num_text: art.article_num_text,
    article_num_int: art.article_num_int || null,
    article_sub: art.article_sub || 0,
    caption: art.caption || '',
    url: buildArticleUrl(art.law_id),
    body_md: art.body_md,
  }));

  // Build warnings
  const warnings = {};

  // Divergence: estimated name vs actual e-Gov title
  for (let i = 0; i < estimatedNames.length; i++) {
    const r = results[i];
    if (!r) continue;
    const sim = bigramSimilarity(estimatedNames[i], r.meta.law_title);
    if (sim < DIVERGENCE_THRESHOLD) {
      warnings.divergence = (warnings.divergence ? warnings.divergence + '\n' : '') +
        `⚠️ 推定法令名「${estimatedNames[i]}」とe-Gov取得名「${r.meta.law_title}」の類似度: ${sim.toFixed(2)}（しきい値${DIVERGENCE_THRESHOLD}未満）。法令名が乖離しています。`;
    }
  }

  // Substitution: B2 — passed in as explicit pairs
  for (const { from, to } of substitutions) {
    const sim = bigramSimilarity(from, to);
    if (sim < SUBSTITUTION_THRESHOLD) {
      warnings.substitution = (warnings.substitution ? warnings.substitution + '\n' : '') +
        `⚠️ 検索段階で法令名が「${from}」→「${to}」に変換されました（類似度: ${sim.toFixed(2)}）。読み替えが発生しています。`;
    }
  }

  // Mentioned articles: query に「第N条」が含まれる場合の照合情報
  const mentioned = detectMentionedArticles(query, refs);
  if (mentioned) warnings.mentioned_articles = mentioned;

  const law_metas = results.map(r => ({
    law_title: r.meta.law_title,
    law_id: r.meta.law_id,
    law_num: r.meta.law_num,
    egov_url: `https://laws.e-gov.go.jp/law/${r.meta.law_id}`,
    article_count: r.articles.length,
    total_chars: r.totalBytes,
  }));

  const refs_for_prompt = buildRefsForPrompt(refs, urlContext);

  return { refs, law_metas, warnings, refs_for_prompt, mode: 'full' };
}

module.exports = { buildRefs };
