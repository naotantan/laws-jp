#!/usr/bin/env node
'use strict';
// Example: use laws-jp as a Node.js library.
//
// Demonstrates:
//   1. Search e-Gov for a statute by title
//   2. Fetch its full text
//   3. Render it as Markdown
//   4. Detect a change vs. a baseline metadata snapshot
//
// Run: node examples/library-usage.js

const api = require('../lib/egov-api');

(async () => {
  // 1. Search for "民法" (Civil Code), Acts only, top 1 result
  const results = await api.searchByTitle('民法', { limit: 1, law_type: 'Act' });
  if (results.length === 0) {
    console.error('No statute matched.');
    process.exit(1);
  }

  // 2. Flatten the top hit's metadata
  const meta = api.flattenMeta(results[0]);
  console.log('=== meta ===');
  console.log({
    law_id: meta.law_id,
    law_title: meta.law_title,
    law_revision_id: meta.law_revision_id,
    last_amended: meta.amendment_enforcement_date,
  });

  // 3. Fetch full text and render to Markdown
  const data = await api.fetchFullText(meta.law_id);
  const md = api.toMarkdown(data.law_full_text, meta);
  console.log(`\n=== Markdown size: ${md.length} chars ===`);
  console.log(md.split('\n').slice(0, 5).join('\n'));

  // 4. Detect change against an old baseline (simulate a previous run)
  const oldBaseline = {
    law_revision_id: 'OLD_REVISION_ID',
    amendment_enforcement_date: '1900-01-01',
    updated: '1900-01-01T00:00:00+09:00',
  };
  const change = api.detectChange(oldBaseline, meta);
  console.log('\n=== change detection ===');
  console.log({
    changed: change.changed,
    reason: change.reason,
    field_count: Object.keys(change.fields).length,
  });
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
