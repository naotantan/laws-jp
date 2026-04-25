#!/usr/bin/env node
'use strict';
// laws-jp: e-Gov 法令 API CLI
//
// Subcommands:
//   fetch <name>                  Fetch full statute text → Markdown on stdout
//   meta <name>                   Print metadata JSON
//   article <name> <article>      Print a specific article (e.g. "166", "166-2", "第166条")
//   search <keyword>              Keyword search across all 9,500+ Japanese statutes
//   watch-list                    List entries in the watchlist
//   watch-add <name> [--tags=]    Add a statute to the watchlist
//   watch-remove <name>           Remove a statute from the watchlist
//   check-all [--dry-run]         Check every watched statute for amendments
//   seed                          Seed watchlist from built-in 44-statute list
//   cache info                    Show cache size / count
//   cache clear [<law_id>]        Clear cache (all if no law_id)
//   expand-law-names              --laws='["名称"]' → JSON with 施行令/施行規則 added
//   report-build-refs             --laws='...' --query='...' [--mode=full|toc-first] [--article-ids='...'] → refs JSON
//   report-build-prompt           --query='...' --refs-json=<path> → system prompt JSON
//   report-finalize               --report-text='...' --refs-json=<path> → post-processed report
//
// Environment variables:
//   LAWS_JP_HOME            State dir (watchlist, manifest, alerts) — default: ~/.local/share/laws-jp
//   LAWS_JP_CACHE_DIR       Body cache dir — default: ~/.cache/laws-jp/body
//   LAWS_JP_TOC_DIR         TOC cache dir — default: ~/.cache/laws-jp/toc
//   LAWS_JP_USER_AGENT      User-Agent for e-Gov API requests

const fs = require('fs');
const path = require('path');
const os = require('os');

// Pollution guard: in NODE_ENV=test, all storage env vars must be set
// explicitly. Run this BEFORE requiring any lib module so the lib-level guards
// don't fire first and obscure the laws-jp-specific message.
if (process.env.NODE_ENV === 'test') {
  const required = ['LAWS_JP_HOME', 'LAWS_JP_CACHE_DIR', 'LAWS_JP_TOC_DIR'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    process.stderr.write(
      `laws-jp: refusing to run in test mode without explicit overrides for ${missing.join(', ')}. ` +
      'Set these env vars to isolated paths to avoid polluting the production state. ' +
      'See test/_env.js for the recommended setup.\n'
    );
    process.exit(2);
  }
}

const api = require('../lib/egov-api');
const cache = require('../lib/cache');
const toc = require('../lib/toc');
const SEED = require('../lib/seed');
const reportUtils = require('../lib/laws-report-utils');
const reportBuildRefs = require('../lib/laws-report-build-refs');
const reportPrompt = require('../lib/laws-report-prompt');

// Handle EPIPE silently — happens when stdout is closed early (e.g. `... | head`).
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') process.exit(0);
  throw err;
});

const HOME = os.homedir();

const STATE_DIR = process.env.LAWS_JP_HOME || path.join(HOME, '.local/share/laws-jp');
const WATCHLIST = path.join(STATE_DIR, 'watchlist.json');
const MANIFEST = path.join(STATE_DIR, 'manifest.json');
const ALERTS_DIR = path.join(STATE_DIR, 'alerts');

// ---------- helpers ----------
function ensureDirs() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(ALERTS_DIR, { recursive: true });
}
function readJson(p, def) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return def; }
}
function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}
function nowIsoJst() {
  const d = new Date();
  const z = n => String(n).padStart(2, '0');
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}-${z(j.getUTCMonth()+1)}-${z(j.getUTCDate())}T${z(j.getUTCHours())}:${z(j.getUTCMinutes())}:${z(j.getUTCSeconds())}+09:00`;
}
function jstDate() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadWatchlist() { return readJson(WATCHLIST, []); }
function saveWatchlist(wl) { writeJson(WATCHLIST, wl); }
function loadManifest() { return readJson(MANIFEST, {}); }
function saveManifest(m) { writeJson(MANIFEST, m); }

// ---------- search & resolve ----------
async function resolveLaw(name) {
  if (!name) throw new Error('NAME_REQUIRED: pass a statute title or law_id.');
  // law_id direct lookup
  if (/^[A-Z0-9]{12,}$/i.test(name)) {
    const entry = await api.searchByLawId(name);
    if (!entry) throw new Error(`NOT_FOUND: no statute with law_id ${name}.`);
    return api.flattenMeta(entry);
  }
  // Title search — prefer Acts, then anything
  let results = await api.searchByTitle(name, { limit: 5, law_type: 'Act' });
  if (results.length === 0) results = await api.searchByTitle(name, { limit: 10 });
  if (results.length === 0) throw new Error(`NOT_FOUND: "${name}" matched no statute. Try \`laws-jp search <keyword>\`.`);
  const exact = results.find(r => (r.revision_info?.law_title || '') === name);
  return api.flattenMeta(exact || results[0]);
}

// ---------- subcommands ----------
async function cmdFetch(name) {
  const meta = await resolveLaw(name);
  const cached = cache.getCached(meta.law_id, meta.law_revision_id);
  if (cached.hit) {
    process.stdout.write(cached.md);
    return;
  }
  const data = await api.fetchFullText(meta.law_id);
  const md = api.toMarkdown(data.law_full_text, meta);
  try { cache.setCached(meta.law_id, meta.law_revision_id, md); }
  catch (e) { process.stderr.write(`WARN_CACHE_WRITE: ${e.message}\n`); }
  process.stdout.write(md);
}

async function cmdMeta(name) {
  const meta = await resolveLaw(name);
  process.stdout.write(JSON.stringify(meta, null, 2) + '\n');
}

async function cmdArticle(name, articleQuery) {
  if (!articleQuery) throw new Error('USAGE: laws-jp article <name> <article-number>');
  const meta = await resolveLaw(name);

  // Build TOC if missing or stale
  const existing = toc.loadToc(meta.law_id);
  if (!existing || existing.law_revision_id !== meta.law_revision_id) {
    const data = await api.fetchFullText(meta.law_id);
    const t = toc.buildToc(data, meta);
    toc.saveToc(meta.law_id, t);
  }

  const found = toc.getArticle(meta.law_id, articleQuery);
  if (!found) {
    const t = toc.loadToc(meta.law_id);
    const sample = (t.articles || []).slice(0, 20).map(a => a.article_num_text).join(', ');
    throw new Error(`INPUT_NO_ARTICLE: ${articleQuery} not found in ${meta.law_title}. Sample: ${sample}.`);
  }
  const a = found.article;
  const breadcrumb = (a.path || found.path || []).join(' / ');
  const out = [
    `# ${meta.law_title} ${a.article_num_text || ''}`,
    breadcrumb ? `> ${breadcrumb}` : '',
    '',
    a.body_md || '',
    '',
  ].filter(s => s !== null && s !== undefined).join('\n');
  process.stdout.write(out);
}

async function cmdSearch(keyword, opts = {}) {
  if (!keyword) throw new Error('USAGE: laws-jp search <keyword> [--limit=N] [--type=Act|CabinetOrder|MinisterialOrdinance]');
  const limit = parseInt(opts.limit || '15', 10);
  const lawType = opts.type;
  const raw = await api.searchByTitle(keyword, { limit: limit + 1, law_type: lawType });
  const truncated = raw.length > limit;
  const results = truncated ? raw.slice(0, limit) : raw;
  const compact = results.map(r => {
    const m = api.flattenMeta(r);
    return {
      law_title: m.law_title,
      law_id: m.law_id,
      law_num: m.law_num,
      category: m.category,
      promulgation_date: m.promulgation_date,
      last_amendment: m.amendment_enforcement_date,
      abbrev: m.abbrev,
    };
  });
  process.stdout.write(JSON.stringify({
    keyword,
    returned: compact.length,
    truncated,
    note: 'Use `laws-jp fetch <law_title>` to retrieve full text of any of these.',
    results: compact,
  }, null, 2) + '\n');
}

function cmdWatchList() {
  const wl = loadWatchlist();
  if (wl.length === 0) {
    process.stderr.write('Watchlist is empty. Run `laws-jp seed` to populate from defaults.\n');
    return;
  }
  for (const w of wl) {
    process.stdout.write(`${w.title}\tlaw_id=${w.law_id || '-'}\ttags=${(w.tags || []).join(',')}\n`);
  }
  process.stdout.write(`\nTotal: ${wl.length}\n`);
}

async function cmdWatchAdd(name, opts = {}) {
  const meta = await resolveLaw(name);
  const wl = loadWatchlist();
  if (wl.some(w => w.law_id === meta.law_id)) {
    process.stderr.write(`Already in watchlist: ${meta.law_title} (${meta.law_id})\n`);
    return;
  }
  const tags = opts.tags ? String(opts.tags).split(',').map(s => s.trim()).filter(Boolean) : [];
  ensureDirs();
  saveWatchlist([...wl, { title: meta.law_title, law_id: meta.law_id, tags, added_at: nowIsoJst() }]);
  process.stdout.write(`Added: ${meta.law_title} (${meta.law_id})\n`);
}

function cmdWatchRemove(name) {
  const wl = loadWatchlist();
  const filtered = wl.filter(w => w.title !== name && w.law_id !== name);
  if (filtered.length === wl.length) {
    process.stderr.write(`Not found in watchlist: ${name}\n`);
    process.exit(1);
  }
  ensureDirs();
  saveWatchlist(filtered);
  process.stdout.write(`Removed: ${name}\n`);
}

async function cmdCheckAll(opts = {}) {
  const wl = loadWatchlist();
  if (wl.length === 0) {
    process.stderr.write('Watchlist is empty. Run `laws-jp seed` first.\n');
    return;
  }
  ensureDirs();
  const manifest = loadManifest();
  const dryRun = !!opts.dryRun;
  const today = jstDate();
  const changes = [];
  const updatedWl = [];

  for (const w of wl) {
    let resolvedLawId = w.law_id;
    if (!resolvedLawId) {
      try {
        const meta = await resolveLaw(w.title);
        resolvedLawId = meta.law_id;
      } catch (e) {
        process.stderr.write(`SKIP ${w.title}: ${e.message}\n`);
        updatedWl.push(w);
        continue;
      }
    }
    let entry;
    try {
      entry = await api.searchByLawId(resolvedLawId);
    } catch (e) {
      process.stderr.write(`ERR ${w.title} (${resolvedLawId}): ${e.message}\n`);
      updatedWl.push(w);
      continue;
    }
    if (!entry) {
      process.stderr.write(`SKIP ${w.title}: searchByLawId returned null\n`);
      updatedWl.push(w);
      continue;
    }
    const curr = api.flattenMeta(entry);
    const prev = manifest[resolvedLawId];
    const change = api.detectChange(prev, curr);
    if (change.changed && change.reason === 'new') {
      changes.push({ kind: 'initial', title: curr.law_title, law_id: curr.law_id, curr });
    } else if (change.changed) {
      changes.push({
        kind: 'amendment',
        title: curr.law_title,
        law_id: curr.law_id,
        prev,
        curr,
        fields: change.fields,
      });
    }
    if (!dryRun && change.changed) {
      manifest[resolvedLawId] = pickManifestFields(curr);
      // Invalidate caches when revision changed so next fetch is fresh.
      try { cache.invalidate(resolvedLawId); } catch {}
      try { toc.invalidate(resolvedLawId); } catch {}
    }
    updatedWl.push({ ...w, law_id: resolvedLawId });
    await sleep(80); // be polite
  }

  if (changes.length === 0) {
    process.stdout.write(`[${today}] No amendments detected (${wl.length} statutes checked).\n`);
    if (!dryRun) saveWatchlist(updatedWl);
    return;
  }

  if (!dryRun) {
    saveWatchlist(updatedWl);
    saveManifest(manifest);
    const alertPath = path.join(ALERTS_DIR, `${today}.json`);
    writeJson(alertPath, { date: today, changes });
    process.stdout.write(`Detected ${changes.length} change(s). Saved alert to ${alertPath}\n`);
  } else {
    process.stdout.write(`[dry-run] Would record ${changes.length} change(s):\n`);
  }

  for (const c of changes) {
    process.stdout.write(`- [${c.kind}] ${c.title} (${c.law_id})\n`);
    if (c.kind === 'amendment') {
      const prevTitle = c.prev?.amendment_law_title || '?';
      const currTitle = c.curr?.amendment_law_title || '?';
      const prevDate = c.prev?.amendment_enforcement_date || '?';
      const currDate = c.curr?.amendment_enforcement_date || '?';
      process.stdout.write(`    amendment_law_title: ${prevTitle} → ${currTitle}\n`);
      process.stdout.write(`    enforcement_date:    ${prevDate} → ${currDate}\n`);
    }
  }
}

function pickManifestFields(meta) {
  return {
    law_id: meta.law_id,
    law_title: meta.law_title,
    law_revision_id: meta.law_revision_id,
    updated: meta.updated,
    amendment_law_id: meta.amendment_law_id,
    amendment_law_title: meta.amendment_law_title,
    amendment_law_num: meta.amendment_law_num,
    amendment_promulgate_date: meta.amendment_promulgate_date,
    amendment_enforcement_date: meta.amendment_enforcement_date,
    repeal_status: meta.repeal_status,
    last_seen_at: nowIsoJst(),
  };
}

async function cmdSeed() {
  const wl = loadWatchlist();
  let added = 0;
  for (const s of SEED) {
    if (wl.some(w => w.title === s.title)) continue;
    try {
      const meta = await resolveLaw(s.title);
      wl.push({ title: meta.law_title, law_id: meta.law_id, tags: s.tags || [], added_at: nowIsoJst() });
      added++;
      process.stdout.write(`Added: ${meta.law_title} (${meta.law_id})\n`);
    } catch (e) {
      process.stderr.write(`SKIP ${s.title}: ${e.message}\n`);
    }
    await sleep(80);
  }
  ensureDirs();
  saveWatchlist(wl);
  process.stdout.write(`\nSeeded ${added} new statute(s). Watchlist now contains ${wl.length}.\n`);
}

function cmdCacheInfo() {
  const bs = cache.size();
  const tl = toc.list();
  const tBytes = tl.reduce((s, x) => s + x.byte_size, 0);
  process.stdout.write(`Body cache: ${bs.count} files, ${(bs.total_bytes / 1024 / 1024).toFixed(2)} MB at ${cache.CACHE_DIR}\n`);
  process.stdout.write(`TOC  cache: ${tl.length} files, ${(tBytes / 1024 / 1024).toFixed(2)} MB at ${toc.TOC_DIR}\n`);
}

function cmdCacheClear(target) {
  if (target) {
    cache.invalidate(target);
    toc.invalidate(target);
    process.stdout.write(`Cleared cache for ${target}\n`);
  } else {
    for (const f of cache.list()) cache.invalidate(f.law_id);
    for (const f of toc.list()) toc.invalidate(f.law_id);
    process.stdout.write('Cleared all cache\n');
  }
}

// ---------- report subcommands ----------

async function cmdExpandLawNames(args) {
  const raw = args.laws;
  if (!raw) { process.stderr.write('Usage: expand-law-names --laws=\'["法令名"]\'\n'); process.exit(1); }
  let names;
  try { names = JSON.parse(raw); } catch { process.stderr.write('--laws must be valid JSON array\n'); process.exit(4); }
  process.stdout.write(JSON.stringify(reportUtils.expandLawNames(names)) + '\n');
}

async function cmdReportBuildRefs(args) {
  const raw = args.laws;
  const query = args.query || '';
  if (!raw) { process.stderr.write('Usage: report-build-refs --laws=\'["法令名"]\' --query=\'...\'\n'); process.exit(1); }
  let lawNames;
  try { lawNames = JSON.parse(raw); } catch { process.stderr.write('--laws must be valid JSON array\n'); process.exit(4); }
  const mode = args.mode || 'full';
  const articleIds = args['article-ids'] ? JSON.parse(args['article-ids']) : [];
  const substitutions = args.substitutions ? JSON.parse(args.substitutions) : [];
  const estimatedNames = args['estimated-names'] ? JSON.parse(args['estimated-names']) : lawNames;
  let urlContext = null;
  if (args['url-context']) {
    try { urlContext = JSON.parse(args['url-context']); } catch { /* ignore */ }
  }
  const result = await reportBuildRefs.buildRefs({ lawNames, query, mode, articleIds, substitutions, estimatedNames, urlContext });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

async function cmdReportBuildPrompt(args) {
  const query = args.query || '';
  const refsJsonPath = args['refs-json'];
  if (!refsJsonPath) { process.stderr.write('Usage: report-build-prompt --query=\'...\' --refs-json=<path>\n'); process.exit(1); }
  let refsData;
  try { refsData = JSON.parse(fs.readFileSync(refsJsonPath, 'utf8')); }
  catch (e) { process.stderr.write(`Cannot read refs JSON: ${e.message}\n`); process.exit(4); }
  const refsForPrompt = refsData.refs_for_prompt || '';
  const warnings = Object.values(refsData.warnings || {}).join('\n');
  const patternId = reportPrompt.classifyQuery(query);
  const patternDef = reportPrompt.QUERY_PATTERNS.find(p => p.id === patternId) || reportPrompt.QUERY_PATTERNS[5];
  const sections = reportPrompt.PATTERN_SECTIONS[patternId] || [];
  const systemPrompt = reportPrompt.buildSystemPrompt(query, refsForPrompt, warnings);
  process.stdout.write(JSON.stringify({ pattern_id: patternId, pattern_label: patternDef.label, sections, system_prompt: systemPrompt }, null, 2) + '\n');
}

async function cmdReportFinalize(args) {
  const reportText = args['report-text'];
  const refsJsonPath = args['refs-json'];
  if (!reportText || !refsJsonPath) { process.stderr.write('Usage: report-finalize --report-text=\'...\' --refs-json=<path>\n'); process.exit(1); }
  let refsData;
  try { refsData = JSON.parse(fs.readFileSync(refsJsonPath, 'utf8')); }
  catch (e) { process.stderr.write(`Cannot read refs JSON: ${e.message}\n`); process.exit(4); }
  const refs = refsData.refs || [];
  const filtered = reportUtils.filterCitations(reportText, refs);
  let output = reportUtils.linkifyCitations(reportText, refs);
  const sourcesSection = filtered.map(r =>
    `- [[${r.n}]](${r.url}) ${r.law_title} ${r.article_num_text}${r.caption ? `　${r.caption}` : ''}`
  ).join('\n');
  const fullSources = `## 出典\n\n${sourcesSection || '（引用なし）'}`;
  output = output.includes('[SOURCES_PLACEHOLDER]')
    ? output.replace('[SOURCES_PLACEHOLDER]', fullSources)
    : output + '\n\n' + fullSources;
  output = reportUtils.sanitizeMermaid(output);
  process.stdout.write(output + '\n');
}

// ---------- argv ----------
function parseArgs(argv) {
  const out = { _: [] };
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
      else out[a.slice(2)] = true;
    } else {
      out._.push(a);
    }
  }
  return out;
}

const HELP = `laws-jp — Japanese statute (e-Gov) CLI

Usage:
  laws-jp fetch <name>                  Print full statute as Markdown
  laws-jp meta  <name>                  Print metadata JSON
  laws-jp article <name> <article>      Print a specific article
                                        (e.g. "166", "166-2", "第百六十六条")
  laws-jp search <keyword> [--limit=N] [--type=Act]

  laws-jp watch-list
  laws-jp watch-add <name> [--tags=a,b]
  laws-jp watch-remove <name>
  laws-jp check-all [--dry-run]
  laws-jp seed

  laws-jp cache info
  laws-jp cache clear [<law_id>]

  laws-jp expand-law-names --laws='["個人情報保護法"]'
  laws-jp report-build-refs --laws='["民法"]' --query='消滅時効の起算点は'
  laws-jp report-build-prompt --query='消滅時効の起算点は' --refs-json=<path>
  laws-jp report-finalize --report-text='...' --refs-json=<path>
  laws-jp --help

Environment variables:
  LAWS_JP_HOME            State dir (watchlist/manifest/alerts).
                          Default: ~/.local/share/laws-jp
  LAWS_JP_CACHE_DIR       Body cache dir.
                          Default: ~/.cache/laws-jp/body
  LAWS_JP_TOC_DIR         Article TOC cache dir.
                          Default: ~/.cache/laws-jp/toc
  LAWS_JP_USER_AGENT      User-Agent for e-Gov API requests.
                          Default: laws-jp/<version>

Current paths:
  State directory: ${STATE_DIR}
  Body cache:      ${cache.CACHE_DIR}
  TOC cache:       ${toc.TOC_DIR}

Source:    https://github.com/naotantan/laws-jp
e-Gov API: https://laws.e-gov.go.jp/api/2/swagger-ui
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [sub, ...rest] = args._;

  if (!sub || args.help) { process.stdout.write(HELP); return; }

  try {
    switch (sub) {
      case 'fetch':        return await cmdFetch(rest[0]);
      case 'meta':         return await cmdMeta(rest[0]);
      case 'article':      return await cmdArticle(rest[0], rest[1]);
      case 'search':       return await cmdSearch(rest[0], args);
      case 'watch-list':   return cmdWatchList();
      case 'watch-add':    return await cmdWatchAdd(rest[0], args);
      case 'watch-remove': return cmdWatchRemove(rest[0]);
      case 'check-all':    return await cmdCheckAll({ dryRun: !!args['dry-run'] });
      case 'seed':         return await cmdSeed();
      case 'cache':        return rest[0] === 'clear'
                                    ? cmdCacheClear(rest[1])
                                    : cmdCacheInfo();
      case 'expand-law-names':    return await cmdExpandLawNames(args);
      case 'report-build-refs':   return await cmdReportBuildRefs(args);
      case 'report-build-prompt': return await cmdReportBuildPrompt(args);
      case 'report-finalize':     return await cmdReportFinalize(args);
      default:
        process.stderr.write(`Unknown subcommand: ${sub}\n\n${HELP}`);
        process.exit(2);
    }
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  }
}

main();
