# laws-jp

> **日本の法律をターミナルから引く。** Japanese statute CLI for the canonical e-Gov 法令 API. Zero dependencies.

[![CI](https://github.com/naotantan/laws-jp/actions/workflows/ci.yml/badge.svg)](https://github.com/naotantan/laws-jp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](https://nodejs.org)
[![Source](https://img.shields.io/badge/source-e--Gov%20official-blue)](https://laws.e-gov.go.jp/api/2/swagger-ui)

[**日本語の README は↓こちら**](#日本語) | [Quick start](#quick-start) | [Subcommands](#subcommand-reference) | [FAQ](#faq) | [Troubleshooting](#troubleshooting)

---

## 30-second demo

```console
$ git clone https://github.com/naotantan/laws-jp.git && cd laws-jp

$ node bin/laws-jp.js article 民法 166
# 民法 第百六十六条
> 第一編　総則 / 第七章　時効 / 第三節　消滅時効

**第百六十六条　（債権等の消滅時効）**
債権は、次に掲げる場合には、時効によって消滅する。
  一 債権者が権利を行使することができることを知った時から五年間行使しないとき。
  二 権利を行使することができる時から十年間行使しないとき。
２ 債権又は所有権以外の財産権は、権利を行使することができる時から二十年間行使しないときは、時効によって消滅する。
...
```

That's it. No API key, no `npm install`, no third-party paid database. The text is the official version from the Japanese government, fetched live from the e-Gov 法令 API.

---

## What it does

The Japanese government publishes the canonical text of every law and ordinance via the [e-Gov 法令 API](https://laws.e-gov.go.jp/api/2/swagger-ui). The API itself is free — but the JSON responses are nested XML-like trees with kanji-numbered articles, traditional government structures (編／章／節／款／目), and metadata in fields no human wants to parse by hand.

`laws-jp` does the parsing for you and gives you:

- **Markdown output** suitable for prompt context, AI knowledge bases, or just reading
- **Article-level lookup** by Arabic numerals (`166-2`), kanji (`第百六十六条の二`), or sub-articles
- **Search across all 9,500+ statutes** when you don't know the title
- **Watchlist + amendment detection** so a daily cron can ping you when any tracked statute is amended
- **Local caching** keyed on the official `law_revision_id` — once fetched, a statute never hits the API again until it's actually amended
- **Zero runtime dependencies** — only Node 18+. No native modules. No API keys.

## Use cases

> **A tax advisor wants to know the moment 法人税法 is amended each year.**
> ```bash
> laws-jp watch-add 法人税法 --tags=tax
> # Add to crontab: 0 6 * * *  laws-jp check-all
> ```
> Result: a Slack ping the morning of any 法人税法 amendment, with a link to the new text.

> **A lawyer drafts a contract and needs to cite 民法 第415条 verbatim.**
> ```bash
> laws-jp article 民法 415 > clause.md
> ```
> Result: the official text in Markdown, ready to paste — no transcription error risk.

> **An AI app grounds its answers in real Japanese law instead of hallucinating.**
> ```javascript
> const data = await api.fetchFullText('129AC0000000089'); // 民法
> const md = api.toMarkdown(data.law_full_text, meta);
> // Pass `md` to your LLM as context. Done.
> ```
> Result: cited answers backed by official source. No subscription DB required.

---

## Install

Pick whichever block fits — paste, hit Enter, done.

**Requires:** Node.js 18+. No other prerequisites. No API key. No `npm install` (zero runtime dependencies).

### A) Use globally (recommended)

```bash
git clone https://github.com/naotantan/laws-jp.git ~/.local/src/laws-jp \
  && cd ~/.local/src/laws-jp \
  && npm install -g . \
  && laws-jp --help
```

After this, `laws-jp` is on your `$PATH`. Try `laws-jp article 民法 166`.

### B) Run from source without installing globally

```bash
git clone https://github.com/naotantan/laws-jp.git \
  && cd laws-jp \
  && node bin/laws-jp.js --help
```

### C) One-liner install via `npx` (no global pollution)

```bash
npx --yes github:naotantan/laws-jp --help
```

Subsequent calls: `npx github:naotantan/laws-jp article 民法 166`.

### D) Install as a library dependency in a Node project

```bash
npm install --save git+https://github.com/naotantan/laws-jp.git
```

Then `const api = require('laws-jp/lib/egov-api');` — see [Library usage](#library-usage).

> The package is **not yet published to the npm registry**. Install from this Git repo until v1.0.

### Verify install

```bash
laws-jp --help                       # if option A or C
node bin/laws-jp.js --help           # if option B
laws-jp article 民法 166             # should print 民法 第百六十六条
```

---

## Quick start

```bash
# 1. Search across all 9,500+ Japanese statutes
laws-jp search 個人情報 --limit=5

# 2. Fetch the full text of a statute as Markdown
laws-jp fetch 民法 > minpo.md

# 3. Look up a specific article (Arabic, kanji, sub-article all work)
laws-jp article 民法 166-2
laws-jp article 民法 第百六十六条の二

# 4. Get metadata only (law_id, current revision, last amendment)
laws-jp meta 著作権法

# 5. Add to the watchlist + check for amendments tomorrow
laws-jp watch-add 民法 --tags=civil
laws-jp check-all
```

---

## Sample output

### `fetch 民法`

```markdown
# 民法

> 明治二十九年法律第八十九号
> 最終改正施行: 2026-04-01（民法等の一部を改正する法律）

## 第一編　総則

### 第一章　通則

**第一条**　（基本原則）
私権は、公共の福祉に適合しなければならない。
２ 権利の行使及び義務の履行は、信義に従い誠実に行わなければならない。
３ 権利の濫用は、これを許さない。

**第二条**　（解釈の基準）
この法律は、個人の尊厳と両性の本質的平等を旨として、解釈しなければならない。

…(continues for all 1,050+ articles)
```

### `article 民法 第三条の二`

```markdown
# 民法 第三条の二
> 第一編　総則 / 第二章　人 / 第二節　意思能力

**第三条の二**
法律行為の当事者が意思表示をした時に意思能力を有しなかったときは、その法律行為は、無効とする。
```

### `meta 民法`

```json
{
  "law_id": "129AC0000000089",
  "law_num": "明治二十九年法律第八十九号",
  "promulgation_date": "1896-04-27",
  "law_revision_id": "129AC0000000089_20260401_506AC0000000033",
  "law_title": "民法",
  "amendment_law_title": "民法等の一部を改正する法律",
  "amendment_law_num": "令和六年法律第三十三号",
  "amendment_promulgate_date": "2024-05-24",
  "amendment_enforcement_date": "2026-04-01"
}
```

### `search 個人情報 --limit=3`

```json
{
  "keyword": "個人情報",
  "returned": 3,
  "truncated": true,
  "note": "Use `laws-jp fetch <law_title>` to retrieve full text of any of these.",
  "results": [
    {
      "law_title": "個人情報の保護に関する法律",
      "law_id": "415AC0000000057",
      "law_num": "平成十五年法律第五十七号",
      "category": "憲法",
      "promulgation_date": "2003-05-30",
      "last_amendment": "2025-06-01",
      "abbrev": "個人情報保護法"
    },
    …
  ]
}
```

### `check-all` (when an amendment is detected)

```
Detected 1 change(s). Saved alert to ~/.local/share/laws-jp/alerts/2026-04-01.json
- [amendment] 民法 (129AC0000000089)
    amendment_law_title: 民法等の一部を改正する法律 → 民法等の一部を改正する法律（その二）
    enforcement_date:    2025-04-01 → 2026-04-01
```

---

## Subcommand reference

### `fetch <name>`

Print the full Markdown rendering of a statute on stdout. The statute is identified by its title (e.g. `民法`) or its 12+ character `law_id` (e.g. `129AC0000000089`).

```bash
laws-jp fetch 著作権法 | wc -l    # 1,500+ lines of Markdown
laws-jp fetch 129AC0000000089    # Same as `fetch 民法`
```

The first call hits the e-Gov API and caches the result. Subsequent calls return immediately from cache until the statute's `law_revision_id` changes (i.e. it is amended).

### `meta <name>`

Print metadata as JSON: `law_id`, `law_num`, `promulgation_date`, `law_revision_id`, latest amendment information, and category. (See "Sample output" above for the exact fields.)

### `article <name> <article>`

Print one article. Supports Arabic numerals, dashes for sub-articles, and traditional kanji numbering — all of these refer to the same article:

```bash
laws-jp article 民法 166        # Arabic
laws-jp article 民法 166-2      # sub-article (枝番)
laws-jp article 民法 166.2      # alternate sub-article notation
laws-jp article 民法 第百六十六条 # kanji
laws-jp article 民法 第百六十六条の二 # kanji + sub-article
```

The output includes a breadcrumb path through the statute structure (編／章／節) so you can use it for legal citation.

### `search <keyword> [--limit=N] [--type=Act|CabinetOrder|MinisterialOrdinance|Rule]`

Keyword search across all 9,500+ Japanese statutes — useful when you know what the law is *about* but not its exact title.

```bash
laws-jp search 自転車 --limit=5
laws-jp search 反社会的勢力 --type=Act
```

### `seed`

Populate the watchlist with the 44 statutes most relevant to the **6 Japanese licensed professions**: 弁護士 (lawyer), 公認会計士 (CPA), 税理士 (tax advisor), 社会保険労務士 (labor & social-security attorney), 司法書士 (judicial scrivener), 行政書士 (administrative scrivener). Idempotent — running it twice does not duplicate entries.

### `watch-list` / `watch-add` / `watch-remove`

```bash
laws-jp watch-list
laws-jp watch-add 不正アクセス行為の禁止等に関する法律 --tags=security
laws-jp watch-remove 不正アクセス行為の禁止等に関する法律
```

### `check-all [--dry-run]`

Walk the watchlist and check the e-Gov API for amendments. The first run records each statute's current `law_revision_id` as the baseline (`initial`). Subsequent runs compare against that baseline and report any change (`amendment`).

When an amendment is detected:

- The cached body and TOC for that statute are invalidated (so the next `fetch` returns the new text).
- A daily alert JSON is written to `<state-dir>/alerts/<YYYY-MM-DD>.json` containing the diff of metadata fields.

This is designed to be run daily from cron / launchd / systemd timers. See [`examples/daily-cron.sh`](examples/daily-cron.sh) for a Slack-integration example.

### `cache info` / `cache clear [<law_id>]`

```bash
laws-jp cache info
# Body cache: 12 files, 8.34 MB at /home/me/.cache/laws-jp/body
# TOC  cache: 12 files, 14.2 MB at /home/me/.cache/laws-jp/toc

laws-jp cache clear 129AC0000000089   # one statute
laws-jp cache clear                   # everything
```

---

## File layout

`laws-jp` writes only to two locations on disk:

| Path | Contents | Override env |
|------|----------|--------------|
| `~/.local/share/laws-jp/` | `watchlist.json`, `manifest.json`, `alerts/<date>.json` | `LAWS_JP_HOME` |
| `~/.cache/laws-jp/` | `body/<law_id>.md`, `toc/<law_id>.json` | `LAWS_JP_CACHE_DIR`, `LAWS_JP_TOC_DIR` |

Override environment variables to use a different layout (for example, all-in-one for portable use):

```bash
export LAWS_JP_HOME=$HOME/laws-jp/state
export LAWS_JP_CACHE_DIR=$HOME/laws-jp/cache/body
export LAWS_JP_TOC_DIR=$HOME/laws-jp/cache/toc
```

Set `LAWS_JP_USER_AGENT` to identify your application in the User-Agent header sent to the e-Gov API.

---

## Daily cron example

After `laws-jp` is on your `$PATH`, paste this into your terminal to register a daily 06:00 JST amendment check:

```bash
( crontab -l 2>/dev/null; echo "0 6 * * * $(which laws-jp) check-all >> \$HOME/.local/share/laws-jp/cron.log 2>&1" ) | crontab -
```

Verify with `crontab -l`. (To remove later: `crontab -l | grep -v laws-jp | crontab -`.)

A complete Slack-notifying script is at [`examples/daily-cron.sh`](examples/daily-cron.sh):

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/... ./examples/daily-cron.sh
# → Posts:  "📜 1 Japanese statute amended today: 民法"
```

---

## Integrations

### Obsidian

Because `laws-jp fetch` writes Markdown to stdout, syncing into an Obsidian vault is just a redirect. The bundled [`examples/sync-to-obsidian.sh`](examples/sync-to-obsidian.sh) walks your watchlist and writes one `.md` file per statute, with YAML frontmatter so Obsidian's Tag pane and Dataview can index them.

**Setup (paste once):**

```bash
VAULT="$HOME/Documents/MyVault" FOLDER="laws" \
  ~/.local/src/laws-jp/examples/sync-to-obsidian.sh
```

Each run produces files like `MyVault/laws/民法.md`:

```markdown
---
title: 民法
law_id: 129AC0000000089
law_num: 明治二十九年法律第八十九号
law_revision_id: 129AC0000000089_20260401_506AC0000000033
amendment_enforcement_date: 2026-04-01
tags: [laws-jp, "民事", "弁護士", "司法書士"]
source: e-Gov
synced_at: 2026-04-25T01:00:00Z
---

# 民法

> 明治二十九年法律第八十九号
…
```

The script is **idempotent** — files whose `law_revision_id` already matches the current revision are skipped, so you can run it as often as you like. Pair with `laws-jp check-all` in cron and your vault stays current automatically:

```cron
0 6 * * *  laws-jp check-all && VAULT=$HOME/Documents/MyVault FOLDER=laws ~/.local/src/laws-jp/examples/sync-to-obsidian.sh
```

**Quick lookup workflow** — for ad-hoc article inserts during note-taking:

```bash
laws-jp article 民法 415 | pbcopy        # macOS — paste into any Obsidian note
laws-jp article 民法 415 | xclip -sel c  # Linux
```

**Dataview query** to list all amended statutes since a date:

```dataview
TABLE law_num, amendment_enforcement_date AS "Last amended"
FROM "laws"
WHERE date(amendment_enforcement_date) >= date("2026-01-01")
SORT amendment_enforcement_date DESC
```

### Notion

The Notion API takes JSON page payloads, so the bundled [`examples/sync-to-notion.sh`](examples/sync-to-notion.sh) walks your watchlist and creates/updates one **database page** per statute, with the body rendered as paragraph blocks.

**One-time Notion setup:**

1. Visit https://www.notion.so/profile/integrations and create an internal integration. Copy the secret (it begins with `ntn_` or `secret_`).
2. Create a database in Notion with these properties (any name; the script expects these exact property names):

   | Property | Type |
   |----------|------|
   | `Title` | Title |
   | `law_id` | Text |
   | `law_num` | Text |
   | `law_revision_id` | Text (used for idempotent re-runs) |
   | `amendment_enforcement_date` | Date |
   | `tags` | Multi-select |
   | `source` | URL |

3. Open the database, click `…` → **Add connections** → select your integration. Without this step the API returns `object_not_found`.
4. Copy the database ID from the URL: `https://www.notion.so/<workspace>/<32-char-id>?v=...` — the 32 hex chars (with or without hyphens) are the ID.

**Run it:**

```bash
NOTION_TOKEN=ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
NOTION_DB_ID=abcdef0123456789abcdef0123456789 \
  ~/.local/src/laws-jp/examples/sync-to-notion.sh
```

The script:

- Looks up each statute's existing page by `law_id` and **skips it** if `law_revision_id` already matches → safe to run on a cron.
- Creates a new page if one doesn't exist yet.
- Updates properties + replaces page body blocks when a revision changes.

**Daily cron with Notion sync:**

```cron
0 6 * * *  laws-jp check-all && NOTION_TOKEN=ntn_xxx NOTION_DB_ID=abcd... ~/.local/src/laws-jp/examples/sync-to-notion.sh
```

**Notes:**

- The Notion API caps blocks per request at 100 and 2,000 chars per text node. The script splits on blank lines and truncates to 1,990 chars per paragraph; very dense statutes are split into multiple blocks automatically.
- For per-article pages instead of per-statute pages, replace `laws-jp fetch` with `laws-jp article <id> <article>` inside the script — same property layout works.

### Other tools (no example script bundled, just hints)

- **Confluence** — pipe `laws-jp fetch` into [`md-to-confluence`](https://github.com/justmiles/go-markdown2confluence) or POST to the REST API at `/wiki/api/v2/pages`.
- **Slack canvas / GitHub wiki / GitLab wiki** — same idea: `laws-jp fetch <name>` produces standard CommonMark Markdown.
- **Vector / RAG databases** (pgvector, pinecone, weaviate, etc.) — chunk by `extractArticles()` from the library API; each `ArticleEntry.body_md` is a natural retrieval unit, and `article_num_text` + `path` give you a perfect citation breadcrumb.

---

## Library usage

Every CLI subcommand is also exposed as a Node library:

```javascript
// Until v1.0 ships to npm, install from Git:
//   npm install git+https://github.com/naotantan/laws-jp.git

const api = require('laws-jp/lib/egov-api');

const results = await api.searchByTitle('民法', { limit: 1, law_type: 'Act' });
const meta = api.flattenMeta(results[0]);
const data = await api.fetchFullText(meta.law_id);
const markdown = api.toMarkdown(data.law_full_text, meta);
console.log(markdown);
```

A complete library example is at [`examples/library-usage.js`](examples/library-usage.js).

---

## API reference

The library is composed of four modules. All functions are CommonJS exports — `require('laws-jp/lib/<module>')`.

### `lib/egov-api` — e-Gov API client + Markdown renderer

#### `searchByTitle(title, opts) → Promise<SearchEntry[]>`

Title-substring search via the e-Gov API.

| Parameter | Type | Description |
|-----------|------|-------------|
| `title` | `string` | Substring to match against statute titles. |
| `opts.limit` | `number` (default 10) | Max results. The API caps at ~50. |
| `opts.law_type` | `'Act' \| 'CabinetOrder' \| 'MinisterialOrdinance' \| 'Rule'` | Filter by statute kind. Omit to search all. |

Returns an array of full search-result entries (`{ law_info, revision_info, ... }`). Use `flattenMeta(entry)` to flatten.

```javascript
const results = await api.searchByTitle('民法', { limit: 1, law_type: 'Act' });
// → [{ law_info: { law_id: '129AC0000000089', ... }, revision_info: {...} }]
```

#### `searchByLawId(lawId) → Promise<SearchEntry | null>`

Direct lookup by `law_id`. Returns the entry or `null` if not found. Useful for amendment checks (faster than re-searching by title).

```javascript
const entry = await api.searchByLawId('129AC0000000089');
const meta = api.flattenMeta(entry);
console.log(meta.amendment_enforcement_date);  // '2026-04-01'
```

#### `fetchFullText(lawId) → Promise<LawData>`

Fetch the full structured XML-like tree of a statute.

```javascript
const data = await api.fetchFullText('129AC0000000089');
// → { law_full_text: { tag: 'Law', children: [...] }, ... }
```

The result has a `law_full_text` property (the recursive tree). Pass it to `toMarkdown()` to render, or to `extractArticles()` for a flat list.

#### `flattenMeta(entry) → Meta`

Flatten a search-result entry into a stable metadata shape (the same shape `meta <name>` prints).

```typescript
type Meta = {
  law_id: string;                     // e.g. '129AC0000000089'
  law_num: string;                    // e.g. '明治二十九年法律第八十九号'
  law_title: string;                  // e.g. '民法'
  law_title_kana: string;             // e.g. 'みんぽう'
  promulgation_date: string;          // 'YYYY-MM-DD'
  law_revision_id: string;            // unique per amendment
  abbrev: string | null;              // e.g. '個人情報保護法'
  category: string;                   // e.g. '民事'
  updated: string;                    // ISO8601 last-fetch timestamp
  amendment_promulgate_date: string;  // 'YYYY-MM-DD'
  amendment_enforcement_date: string; // 'YYYY-MM-DD'
  amendment_law_id: string;           // law_id of the amending act
  amendment_law_title: string;
  amendment_law_num: string;
  amendment_type: string;             // e-Gov internal code
  repeal_status: 'None' | string;     // 'None' for active statutes
  current_revision_status: string;    // e.g. 'CurrentEnforced'
};
```

#### `detectChange(prev, curr) → ChangeResult`

Compare two `Meta` snapshots and report whether a real change occurred.

```typescript
type ChangeResult = {
  changed: boolean;
  reason: 'new' | 'amendment' | 'unchanged';
  fields: { [key: string]: { prev: any; curr: any } };
};
```

```javascript
const change = api.detectChange(prevMeta, currMeta);
if (change.changed && change.reason === 'amendment') {
  console.log('Fields that changed:', Object.keys(change.fields));
}
```

Watched fields: `updated`, `law_revision_id`, `amendment_enforcement_date`, `amendment_law_id`, `repeal_status`. Pass `null` as `prev` for the first-ever check (returns `{ reason: 'new' }`).

#### `toMarkdown(lawFullText, meta) → string`

Render the statute tree as Markdown. The tree is what `fetchFullText` returns under `data.law_full_text`. The `meta` argument is optional but recommended (it controls the H1 title and the metadata block at the top).

```javascript
const data = await api.fetchFullText(meta.law_id);
const md = api.toMarkdown(data.law_full_text, meta);
// → '# 民法\n\n> 明治二十九年法律第八十九号\n\n## 第一編　総則\n...'
```

The renderer maps e-Gov tags to Markdown:
- `Part` / `Chapter` / `Section` / `Subsection` → `##`–`#####`
- `Article` → bold heading + body
- `Paragraph`, `Item`, `Subitem*` → indented bullets

#### `extractArticles(lawFullText) → ArticleEntry[]`

Flatten the tree to a per-article list — handy for indexing or bulk per-article processing.

```typescript
type ArticleEntry = {
  id: string;                  // synthetic stable ID
  article_num_text: string;    // e.g. '第百六十六条'
  article_num_int: number;     // 166
  article_sub: number;         // 0 for plain article, 2 for 第166条の二, etc.
  article_sub_sub: number;     // 0 normally, used for 第3条の二の三
  caption: string | null;      // e.g. '債権等の消滅時効'
  path: string[];              // breadcrumb e.g. ['第一編　総則', '第七章　時効', ...]
  body_md: string;             // Markdown of the full article body (incl. heading)
  byte_size: number;           // body_md byte length
};
```

#### `parseArticleNum(text) → { num, sub, subSub } | null`

Parse a kanji article-number string.

```javascript
api.parseArticleNum('第百六十六条');         // → { num: 166, sub: 0,  subSub: 0 }
api.parseArticleNum('第百六十六条の二');     // → { num: 166, sub: 2,  subSub: 0 }
api.parseArticleNum('第三条の二の三');       // → { num: 3,   sub: 2,  subSub: 3 }
api.parseArticleNum('166');                 // → null (not kanji form)
```

#### `articleNumToInt(text) → number | null`

Shorthand for `parseArticleNum(text)?.num`.

#### `BASE`

The string `'https://laws.e-gov.go.jp/api/2'`. Exported for tests / mocking.

---

### `lib/cache` — revision-aware body cache

#### `getCached(lawId, expectedRevisionId) → { hit: boolean, md?: string }`

Read the cached Markdown body for `lawId`. If the cached body's `law_revision_id` matches `expectedRevisionId`, returns `{ hit: true, md }`. Otherwise `{ hit: false }`.

```javascript
const cached = cache.getCached(meta.law_id, meta.law_revision_id);
if (cached.hit) return cached.md;
// else fetch & repopulate
```

#### `setCached(lawId, revisionId, md) → void`

Write `md` to the cache atomically (temp-file-rename). Adds a 3-line frontmatter recording `cached_at`, `law_revision_id`, `byte_size`.

#### `invalidate(lawId) → void`

Remove the cached body for `lawId`. Idempotent — silent on `ENOENT`. Throws `unsafe law_id` if `lawId` fails the `/^[A-Za-z0-9_-]+$/` check (path-traversal defense).

#### `list() → { law_id, byte_size }[]`

List all cached bodies with their sizes (for `cache info`).

#### `size() → { count, total_bytes }`

Aggregate `list()`. Used by `cache info`.

#### `CACHE_DIR`

The resolved cache directory (env-overridable via `LAWS_JP_CACHE_DIR`). Useful for tests.

---

### `lib/toc` — article-level TOC index

#### `buildToc(lawData, meta) → Toc`

Build a TOC from a `fetchFullText` result. The TOC contains every article flattened with breadcrumb paths and is what `getArticle` searches against.

```javascript
const data = await api.fetchFullText(meta.law_id);
const t = toc.buildToc(data, meta);
toc.saveToc(meta.law_id, t);
```

#### `saveToc(lawId, toc) → void`

Persist atomically.

#### `loadToc(lawId) → Toc | null`

Read; returns `null` on missing. Auto-quarantines corrupt JSON to `<lawId>.json.broken-<timestamp>` and throws `TOC_BROKEN`.

#### `getArticle(lawId, articleQuery) → { article, path } | null`

Look up one article by Arabic, kanji, or sub-article notation. Returns the `ArticleEntry` (same shape as `extractArticles`) plus its breadcrumb `path`. See "Subcommand reference → `article`" for accepted notations.

```javascript
const found = toc.getArticle('129AC0000000089', '166-2');
// → { article: { article_num_text: '第百六十六条の二', body_md: '...', ... }, path: [...] }
```

#### `invalidate(lawId) / list() / TOC_DIR`

Same shape as the corresponding `cache` exports.

---

### `lib/seed` — built-in 44-statute seed

A frozen array used by the CLI's `seed` command:

```javascript
const SEED = require('laws-jp/lib/seed');
// → [{ title: '民法', tags: ['民事', '弁護士', '司法書士'] }, ...]
```

Each entry has `title: string` and `tags: string[]`. Use it as a starter list, then customize with `watch-add` / `watch-remove`.

---

### `lib/article-diff` — article-level diff helpers (advanced)

Exposed for users who want to build per-article diffing on top of the metadata-level amendment detection. Not used by the CLI yet.

| Function | Purpose |
|----------|---------|
| `tokenize(text) → string[]` | Tokenize Japanese text by char + ASCII word for diff alignment |
| `diffTokens(a, b) → DiffOp[]` | Myers-style diff returning `{ op: 'eq' \| 'ins' \| 'del', text }` ops |
| `renderDiff(ops, format) → string` | Render diff ops as `'unified'` (red/green) or `'side-by-side'` |
| `safeCachePath(p, label) → string` | Validate a cache file path (rejects null-byte / non-file / traversal) |
| `loadCacheJson(p, label) → object` | `safeCachePath` + parse JSON, with a labeled error if the file is bad |

Typical use: load two `<state-dir>/alerts/*.json` snapshots, fetch the corresponding `body/<law_id>.md` files, tokenize both, diff, render.

---

---

## FAQ

**Q. Why not just curl the e-Gov API directly?**

A. You can. `laws-jp` is a thin wrapper that handles three pain points: (1) the API returns nested XML-like JSON that's painful to parse by hand, (2) Japanese statutes use kanji numerals that need conversion to Arabic for lookup, and (3) cache invalidation tied to `law_revision_id` is fiddly to get right. If you're hitting the API once or twice, curl is fine. If you're building anything ongoing, use this.

**Q. Is the data current?**

A. Yes. The e-Gov 法令 API is the official government source — it reflects amendments the day they are enacted. `laws-jp` invalidates its cache automatically when `law_revision_id` changes.

**Q. Does it work for English-translated Japanese law?**

A. No. The e-Gov API serves Japanese-only statute text. The English-translated database is a separate JLT system not yet covered here.

**Q. Can I use this commercially?**

A. Yes — both this tool (MIT) and the e-Gov API itself (the Ministry of Internal Affairs and Communications permits commercial use without fee, as of 2026-04). Set `LAWS_JP_USER_AGENT` to your application name as a courtesy.

**Q. Why these 44 seed statutes?**

A. They are the statutes most commonly cited in the daily work of the 6 Japanese licensed professions (弁護士・公認会計士・税理士・社労士・司法書士・行政書士). Pull `lib/seed.js` to see the exact list, or override entirely with your own `watch-add` calls.

**Q. How does it compare to legal databases like LEX/DB or Westlaw Japan?**

A. Different scope. Those are paid commercial DBs with case law, commentary, and editorial coverage. `laws-jp` only covers **statutory text** (the law itself, no commentary). Free, no subscription, official government data.

**Q. How big is the cache?**

A. Roughly 0.5–2 MB per statute (body + TOC). 44 statutes = ~30 MB. Negligible.

**Q. Does it work offline after caching?**

A. Read operations (`fetch`, `article`, `meta` for cached statutes) work offline once cached. `search` and `check-all` always need network.

---

## Troubleshooting

**`NOT_FOUND: "<title>" matched no statute`**

The exact title isn't in the e-Gov database. Try `laws-jp search <keyword>` to find the actual title (e.g. the formal name of "個人情報保護法" is "個人情報の保護に関する法律").

**`INPUT_NO_ARTICLE: <num> not found in <statute>`**

The article number doesn't exist (or has been deleted/renumbered). Use `laws-jp article <statute> <small-num>` (e.g. `1`) to confirm the article numbering style, then look up neighboring numbers.

**`e-Gov API 403 Forbidden`**

The e-Gov API blocked the request — usually a transient rate-limit issue. Wait a few seconds and retry.

**Slow first run**

First fetch hits the API (1–3 seconds for a large statute like 民法). Subsequent fetches are instant from cache. `seed` makes 44 API calls with 80 ms spacing → ~10 seconds.

**Cache or watchlist seems out of date**

Run `laws-jp cache clear` to drop all body/TOC caches, then `laws-jp check-all` to refresh the manifest baseline.

**More issues?** Open one at https://github.com/naotantan/laws-jp/issues with the failing command and the stderr output.

---

## Limitations

- **Network required for first fetch.** Once a statute is cached, it is offline-readable until the next amendment.
- **Japanese statutes only.** The e-Gov API is the Japanese government's domestic legal database. Statute text is in Japanese (metadata field names are English).
- **Amendment detection is metadata-granularity.** A change in `law_revision_id` invalidates the cache and triggers an alert. Per-article diffing is not yet bundled (`lib/article-diff.js` helpers exist if you want to build it on top).
- **Search is title-substring**, not full-text body search. To find a statute by topic, search title fragments or browse the [e-Gov website](https://laws.e-gov.go.jp/) and pass the exact title to `fetch`.
- **No retries / explicit rate limiting.** The e-Gov API is generally responsive; the built-in 80 ms inter-request sleep in `seed` and `check-all` is enough for normal use.

---

## Contributing

Bug reports, feature requests, and PRs welcome at [github.com/naotantan/laws-jp/issues](https://github.com/naotantan/laws-jp/issues).

Local development:

```bash
git clone https://github.com/naotantan/laws-jp.git
cd laws-jp
node --test 'test/**/*.test.js'   # offline tests, ~1s
node bin/laws-jp.js --help
```

The codebase has zero runtime dependencies and aims to stay that way. For development tooling (linters, test runners) we use what ships with Node 18+.

### Test isolation: how laws-jp prevents cache pollution

`laws-jp` writes to two real locations on disk (`~/.local/share/laws-jp/` for state and `~/.cache/laws-jp/` for caches). To guarantee that **a forgotten env var in a test can never overwrite a real user's watchlist or amendment-detection baseline**, the code uses three layers of defense:

1. **Library-level fail-fast.** When `NODE_ENV === 'test'` and the corresponding env override is missing (`LAWS_JP_CACHE_DIR` / `LAWS_JP_TOC_DIR`), `lib/cache.js` and `lib/toc.js` throw at `require` time. The CLI entrypoint `bin/laws-jp.js` does the same for `LAWS_JP_HOME`.
2. **`test/_env.js` isolation helper.** Every test file should `require('./_env')` first. It refuses any `LAWS_JP_*` env that points at a production path, sets `NODE_ENV=test`, creates a unique `mkdtempSync` directory, points all `LAWS_JP_*` env vars at it, and cleans up on exit (set `LAWS_JP_TEST_KEEP=1` to retain for debugging).
3. **Regression test.** `test/cache-pollution-guard.test.js` exercises every guard path so future contributors can't silently weaken the protections.

Production runs (no `NODE_ENV=test`) remain backward-compatible: the CLI uses the default paths. The protection only engages in test mode.

---

## License

[MIT](LICENSE) © 2026 Naoto Kudo

The e-Gov 法令 API itself is operated by the **総務省 行政管理局 (Ministry of Internal Affairs and Communications)** of Japan. Use of the API is governed by their terms of service, which permit commercial use free of charge as of 2026-04. See [the e-Gov terms](https://laws.e-gov.go.jp/) for the latest.

---

# 日本語

`laws-jp` は、日本政府が提供する [e-Gov 法令 API v2](https://laws.e-gov.go.jp/api/2/swagger-ui) に対する **コマンドラインツールと Node.js ライブラリ** です。**国の正本データ**を直接 Markdown で取得・条文単位で参照・改正検知できます。Zero dependency で、Node.js 18+ があれば動きます。

## 30 秒で試す

```console
$ git clone https://github.com/naotantan/laws-jp.git && cd laws-jp

$ node bin/laws-jp.js article 民法 166
# 民法 第百六十六条
> 第一編　総則 / 第七章　時効 / 第三節　消滅時効

**第百六十六条　（債権等の消滅時効）**
債権は、次に掲げる場合には、時効によって消滅する。
  一 債権者が権利を行使することができることを知った時から五年間行使しないとき。
  二 権利を行使することができる時から十年間行使しないとき。
…
```

API キーも `npm install` も書籍 DB の購読も不要。表示される条文は **総務省が提供する正本** をリアルタイム取得した結果です。

## 何が嬉しいか

- 9,500 本以上の法律・政令・省令・規則の **最新本文を Markdown で取得**
- 「民法第 166 条」のような **条番号でピンポイント取得**（漢数字 `第百六十六条`、枝番 `166-2`、いずれも OK）
- **改正検知**：watchlist に登録した法令を毎日チェックし、改正があった日のうちに alert JSON を吐く
- **キャッシュ**は公式の `law_revision_id` に紐付くので、改正があるまで API を一切叩かない
- **ランタイム依存ゼロ**：Node.js 18+ だけ。API キー不要。商用利用可（e-Gov 利用規約による）

## 想定ユースケース

> **税理士の先生：法人税法の改正を毎年確実にキャッチしたい**
> ```bash
> laws-jp watch-add 法人税法 --tags=tax
> # crontab に追加: 0 6 * * *  laws-jp check-all
> ```
> → 改正があった日の朝、Slack に通知が届く

> **弁護士の先生：契約書ドラフトに民法第415条を一字一句正確に引用したい**
> ```bash
> laws-jp article 民法 415 > clause.md
> ```
> → 公式 Markdown が `clause.md` に保存され、転記ミスのリスクなし

> **AI アプリ開発者：LLM の回答を正本ベースで grounding したい**
> ```javascript
> const data = await api.fetchFullText('129AC0000000089'); // 民法
> const md = api.toMarkdown(data.law_full_text, meta);
> // md を Claude / GPT のコンテキストに渡す。完了。
> ```
> → 出典付き回答。ハルシネーションなし。有料 DB 不要。

## インストール（コピペ即動作）

**前提：** Node.js 18 以上のみ。API キー不要、`npm install` 不要（ランタイム依存ゼロ）。

### A) グローバルインストール（推奨）

```bash
git clone https://github.com/naotantan/laws-jp.git ~/.local/src/laws-jp \
  && cd ~/.local/src/laws-jp \
  && npm install -g . \
  && laws-jp --help
```

これで `laws-jp` コマンドが PATH に通ります。試しに `laws-jp article 民法 166`。

### B) ソースから直接実行（インストール不要）

```bash
git clone https://github.com/naotantan/laws-jp.git \
  && cd laws-jp \
  && node bin/laws-jp.js --help
```

### C) `npx` で一発実行（PC を汚さない）

```bash
npx --yes github:naotantan/laws-jp --help
```

以降：`npx github:naotantan/laws-jp article 民法 166`

### D) Node プロジェクトのライブラリとして使う

```bash
npm install --save git+https://github.com/naotantan/laws-jp.git
```

その後 `const api = require('laws-jp/lib/egov-api');` で利用。詳細は [Library usage](#library-usage) 参照。

### 動作確認

```bash
laws-jp --help                       # A または C の場合
node bin/laws-jp.js --help           # B の場合
laws-jp article 民法 166             # 「民法 第百六十六条」と出れば OK
```

## クイックスタート

```bash
# 全文取得
laws-jp fetch 民法 > minpo.md

# 条文取得（漢数字・アラビア数字・枝番すべて OK）
laws-jp article 民法 166-2
laws-jp article 民法 第百六十六条の二

# 全 9,500 本から検索（タイトルが分からないとき）
laws-jp search 個人情報 --limit=5

# Watchlist + 毎朝の改正チェック
laws-jp seed                       # 6 士業向け 44 法令を一括登録
laws-jp check-all                  # 改正があれば alerts/ に JSON 出力
```

## サブコマンド一覧

| サブコマンド | 用途 |
|------------|------|
| `fetch <名称>` | 全文を Markdown で stdout に出力 |
| `meta <名称>` | メタデータ JSON（法令番号・改正履歴・施行日 等）|
| `article <名称> <条番号>` | 特定条文を抜き出して出力（条構造のパンくず付き）|
| `search <キーワード> [--limit=N] [--type=Act]` | 9,500 本から横断検索 |
| `seed` | 6 士業向け 44 法令で watchlist を初期化 |
| `watch-list` / `watch-add` / `watch-remove` | 監視対象 CRUD |
| `check-all [--dry-run]` | 監視対象を改正検知。改正があれば alert JSON 出力 |
| `cache info` / `cache clear [<law_id>]` | キャッシュ管理 |

## 状態保存先

| パス | 用途 | 上書き環境変数 |
|------|------|--------------|
| `~/.local/share/laws-jp/` | watchlist / manifest / alerts | `LAWS_JP_HOME` |
| `~/.cache/laws-jp/body/` | 法令本文 Markdown キャッシュ | `LAWS_JP_CACHE_DIR` |
| `~/.cache/laws-jp/toc/` | 条文 TOC 索引キャッシュ | `LAWS_JP_TOC_DIR` |

## Obsidian / Notion 連携

### Obsidian

`laws-jp fetch` は Markdown を stdout に出力するだけなので、Obsidian Vault との連携はリダイレクトで完結します。`watch-list` に登録した全法令を 1 ファイルずつ Vault に同期するスクリプト [`examples/sync-to-obsidian.sh`](examples/sync-to-obsidian.sh) を同梱しています。YAML frontmatter で `law_id` / `law_revision_id` / `tags` を吐くので Tag pane や Dataview から横串検索できます。

**コピペ実行：**

```bash
VAULT="$HOME/Documents/MyVault" FOLDER="laws" \
  ~/.local/src/laws-jp/examples/sync-to-obsidian.sh
```

スクリプトは **冪等** — 既に最新 `law_revision_id` のファイルはスキップするので、cron で毎朝回しても OK：

```cron
0 6 * * *  laws-jp check-all && VAULT=$HOME/Documents/MyVault FOLDER=laws ~/.local/src/laws-jp/examples/sync-to-obsidian.sh
```

**ノート執筆中に条文を即挿入：**

```bash
laws-jp article 民法 415 | pbcopy        # macOS
laws-jp article 民法 415 | xclip -sel c  # Linux
```

**Dataview クエリ例**（2026 年に改正された法令一覧）：

```dataview
TABLE law_num, amendment_enforcement_date AS "最終改正"
FROM "laws"
WHERE date(amendment_enforcement_date) >= date("2026-01-01")
SORT amendment_enforcement_date DESC
```

### Notion

Notion は API が JSON ベースなので、[`examples/sync-to-notion.sh`](examples/sync-to-notion.sh) で **データベースの 1 ページ = 1 法令** として作成・更新します。本文はパラグラフブロックに変換して投入します。

**初回セットアップ：**

1. https://www.notion.so/profile/integrations で internal integration を作成し、シークレット（`ntn_` または `secret_` で始まる）をコピー
2. Notion 上にデータベースを作成し、以下のプロパティを用意（名前は固定、型は表のとおり）：

   | プロパティ | 型 |
   |----------|---|
   | `Title` | タイトル |
   | `law_id` | テキスト |
   | `law_num` | テキスト |
   | `law_revision_id` | テキスト（冪等再実行に使う） |
   | `amendment_enforcement_date` | 日付 |
   | `tags` | マルチセレクト |
   | `source` | URL |

3. データベース画面で `…` → **接続を追加** から作成した integration を選択（これを忘れると API が `object_not_found` を返します）
4. データベースの URL から ID を取得：`https://www.notion.so/<workspace>/<32-char-id>?v=...` の 32 桁部分

**実行：**

```bash
NOTION_TOKEN=ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
NOTION_DB_ID=abcdef0123456789abcdef0123456789 \
  ~/.local/src/laws-jp/examples/sync-to-notion.sh
```

挙動：

- 既存ページの `law_revision_id` が一致したらスキップ（cron 用に冪等）
- 該当ページが無ければ新規作成
- リビジョンが変わっていたらプロパティ更新 + ブロック差し替え

**毎朝 cron で Notion 同期：**

```cron
0 6 * * *  laws-jp check-all && NOTION_TOKEN=ntn_xxx NOTION_DB_ID=abcd... ~/.local/src/laws-jp/examples/sync-to-notion.sh
```

**条文単位でページを作りたい場合**は、スクリプト内の `laws-jp fetch` を `laws-jp article <id> <条番号>` に置き換えれば、同じプロパティ構造でそのまま動きます。

### その他のツール（同梱スクリプトなし）

- **Confluence** — `laws-jp fetch` の出力を [md-to-confluence](https://github.com/justmiles/go-markdown2confluence) 等に渡すか、`/wiki/api/v2/pages` に直接 POST
- **Slack canvas / GitHub wiki / GitLab wiki** — どれも標準 Markdown を受け付けるので `laws-jp fetch` の結果をそのまま流し込めます
- **ベクタ DB（pgvector / pinecone / weaviate）** — ライブラリの `extractArticles()` で条文単位に分割。各 `ArticleEntry.body_md` が自然な検索単位になり、`article_num_text` + `path` がそのまま引用パンくずになります

## 毎朝 6 時の cron をコピペで登録

`laws-jp` が PATH に通っている状態で、ターミナルに貼り付けるだけ：

```bash
( crontab -l 2>/dev/null; echo "0 6 * * * $(which laws-jp) check-all >> \$HOME/.local/share/laws-jp/cron.log 2>&1" ) | crontab -
```

確認：`crontab -l`／削除：`crontab -l | grep -v laws-jp | crontab -`

Slack 通知を追加したい場合は [`examples/daily-cron.sh`](examples/daily-cron.sh) 参照。

## よくある質問

**Q. e-Gov API を直接 curl すれば良くない？**

A. それでも OK ですが、(1) JSON が入れ子の XML ライクで読みにくい、(2) 条文番号が漢数字なので変換が必要、(3) `law_revision_id` ベースのキャッシュ無効化が地味に面倒、の 3 点を吸収します。一回限りの取得なら curl で十分。継続運用ならこちらをどうぞ。

**Q. データは最新？**

A. はい。e-Gov 法令 API は政府公式の正本ソースで、改正は施行当日に反映されます。`laws-jp` は `law_revision_id` の変化を検知して自動的にキャッシュを無効化します。

**Q. 商用利用できる？**

A. はい。本ツールは MIT、e-Gov API も総務省が商用利用可・無料を認めています（2026-04 時点）。`LAWS_JP_USER_AGENT` に自社アプリ名を入れていただけると大変ありがたいです。

**Q. なぜこの 44 法令を seed に？**

A. 6 士業（弁護士・公認会計士・税理士・社労士・司法書士・行政書士）の日常業務で頻繁に参照される法令を選定しています。実際のリストは [`lib/seed.js`](lib/seed.js) を参照、もしくは `watch-add` で完全に好きなセットに置き換えられます。

**Q. 有料 DB（LEX/DB・Westlaw Japan 等）との違いは？**

A. スコープが違います。有料 DB は判例・解説・編集記事も含む商用サービス。`laws-jp` は **法令本文だけ** をカバー。無料・購読不要・政府公式データ。

## トラブルシューティング

**`NOT_FOUND: "<title>" matched no statute`**

正式名称が e-Gov DB と一致していません。`laws-jp search <キーワード>` で正式タイトルを検索してください（例：「個人情報保護法」の正式名は「個人情報の保護に関する法律」）。

**`e-Gov API 403 Forbidden`**

e-Gov API が一時的にレート制限したケース。数秒待ってリトライしてください。

**初回が遅い**

初回 fetch は API へアクセスするため大きい法令（民法など）で 1〜3 秒。2 回目以降はキャッシュから即返ります。`seed` は 44 件 API 呼び出しで合計約 10 秒。

**何かおかしい**
[Issue を立ててください](https://github.com/naotantan/laws-jp/issues)（失敗したコマンドと stderr を添えて）。

## ライセンス

[MIT](LICENSE) © 2026 工藤 直人

e-Gov 法令 API そのものは **総務省 行政管理局** が提供しており、利用条件は [e-Gov のサイト](https://laws.e-gov.go.jp/) をご確認ください（2026 年 4 月時点で商用利用可・利用料無料）。
