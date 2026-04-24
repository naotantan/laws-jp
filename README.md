# laws-jp

Command-line tool and zero-dependency Node.js library for the Japanese government **e-Gov 法令 API v2**. Fetch full statute text, look up specific articles, search across all 9,500+ Japanese statutes, and watch for amendments — all from the canonical government source, with no third-party paid databases involved.

[日本語の README はこちら](#日本語) — see below.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](https://nodejs.org)

---

## Why this exists

The Japanese government publishes the canonical text of every law and ordinance via the [e-Gov 法令 API](https://laws.e-gov.go.jp/api/2/swagger-ui). The API itself is free, but the JSON responses are not directly readable: they are nested XML-like trees with kanji-numbered articles, traditional government structures (編／章／節／款／目), and metadata in fields no human wants to parse by hand.

`laws-jp` does the parsing for you and gives you:

- **Markdown output** suitable for prompt context, knowledge-base ingestion, or just reading
- **Article-level lookup** by Arabic numerals (`166-2`) or kanji (`第百六十六条の二`)
- **Watchlist + amendment detection** so you can run a daily cron and get notified when any of your tracked statutes change
- **Local caching** keyed on the official `law_revision_id`, so a statute fetched once never hits the API again until it is actually amended
- **Zero runtime dependencies** — only Node 18+, no native modules, no API keys

This is useful for:

- **Lawyers / accountants / tax advisors / labor & social-security attorneys / judicial scriveners / administrative scriveners** — who need verbatim, citation-grade access to current law
- **AI / LLM applications** — that need to ground answers in the exact official text, not hallucinated paraphrases
- **Developers** building legal-tech or compliance tooling that needs structured access to Japanese statutes

---

## Install

```bash
git clone https://github.com/naotantan/laws-jp.git
cd laws-jp
node bin/laws-jp.js --help
```

Or install globally as a CLI:

```bash
npm install -g .
laws-jp --help
```

Requires **Node.js 18 or newer**. No `npm install` is needed — the package has zero runtime dependencies.

---

## Quick start

```bash
# Search across all 9,500+ Japanese statutes
laws-jp search 個人情報 --limit=5

# Fetch the full text of a statute as Markdown
laws-jp fetch 民法 > minpo.md

# Look up a specific article (Arabic or kanji)
laws-jp article 民法 166-2
laws-jp article 民法 第百六十六条の二

# Print metadata only (law_id, revision, last amendment, etc.)
laws-jp meta 著作権法

# Add to the watchlist + check for amendments tomorrow
laws-jp watch-add 民法 --tags=civil
laws-jp check-all
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

Print metadata as JSON: `law_id`, `law_num`, `promulgation_date`, `law_revision_id`, latest amendment information, and category.

```bash
laws-jp meta 民法
```

```json
{
  "law_id": "129AC0000000089",
  "law_num": "明治二十九年法律第八十九号",
  "promulgation_date": "1896-04-27",
  "law_revision_id": "129AC0000000089_20260401_506AC0000000033",
  "law_title": "民法",
  "amendment_law_title": "民法等の一部を改正する法律",
  "amendment_enforcement_date": "2026-04-01"
}
```

### `article <name> <article>`

Print one article. Supports Arabic numerals, dashes for sub-articles, and traditional kanji numbering.

```bash
laws-jp article 民法 166        # 第百六十六条
laws-jp article 民法 166-2      # 第百六十六条の二
laws-jp article 民法 第百六十六条 # same as `166`
```

The output includes the breadcrumb path through the statute structure (編／章／節) for legal-citation purposes.

### `search <keyword> [--limit=N] [--type=Act]`

Keyword search across all 9,500+ statutes — useful when you know what the law is *about* but not its title.

```bash
laws-jp search 自転車 --limit=5
laws-jp search 反社会的勢力 --type=Act
```

`--type` accepts the e-Gov values: `Act`, `CabinetOrder`, `MinisterialOrdinance`, `Rule`. Omit to search across all types.

### `seed`

Populate the watchlist with the 44 statutes most relevant to the 6 Japanese licensed professions (lawyer, CPA, tax advisor, labor & social-security attorney, judicial scrivener, administrative scrivener). Idempotent — running it twice does not duplicate entries.

```bash
laws-jp seed
```

### `watch-list` / `watch-add` / `watch-remove`

```bash
laws-jp watch-list
laws-jp watch-add 不正アクセス行為の禁止等に関する法律 --tags=security
laws-jp watch-remove 不正アクセス行為の禁止等に関する法律
```

### `check-all [--dry-run]`

Walk the watchlist and check the e-Gov API for amendments. The first run records each statute's current `law_revision_id` as the baseline (`initial`). Subsequent runs compare against that baseline and report any change (`amendment`).

```bash
laws-jp check-all              # Updates manifest, writes alert JSON
laws-jp check-all --dry-run    # Reports what would change without writing
```

When an amendment is detected:

- The cached body and TOC for that statute are invalidated (so the next `fetch` returns the new text).
- A daily alert JSON is written to `<state-dir>/alerts/<YYYY-MM-DD>.json` containing the diff of metadata fields.

This is designed to be run daily from cron / launchd / systemd timers.

### `cache info` / `cache clear [<law_id>]`

```bash
laws-jp cache info
# Body cache: 12 files, 8.34 MB at /home/me/.cache/laws-jp/body
# TOC  cache: 12 files, 14.2 MB at /home/me/.cache/laws-jp/toc

laws-jp cache clear 129AC0000000089   # specific statute
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

Run amendment detection every morning at 06:00 JST:

```cron
0 6 * * *  cd $HOME && /usr/local/bin/laws-jp check-all >> $HOME/.local/share/laws-jp/cron.log 2>&1
```

To pipe alerts into Slack / email, parse the JSON alert produced for the day:

```bash
ALERT=$HOME/.local/share/laws-jp/alerts/$(date +%Y-%m-%d).json
[ -f "$ALERT" ] && curl -X POST -H 'Content-Type: application/json' \
  -d "{\"text\": $(jq -c '.changes | length' "$ALERT") amendments today}" \
  "$SLACK_WEBHOOK_URL"
```

---

## Library usage

Every CLI subcommand is also exposed as a library:

```javascript
const api = require('laws-jp/lib/egov-api');

const results = await api.searchByTitle('民法', { limit: 1, law_type: 'Act' });
const meta = api.flattenMeta(results[0]);
const data = await api.fetchFullText(meta.law_id);
const markdown = api.toMarkdown(data.law_full_text, meta);
```

See [`lib/egov-api.js`](lib/egov-api.js) for the full API surface (`searchByTitle`, `searchByLawId`, `fetchFullText`, `flattenMeta`, `detectChange`, `toMarkdown`, `extractArticles`, `parseArticleNum`, `articleNumToInt`).

---

## Limitations

- **Network required for first fetch.** `laws-jp` is a thin client around the e-Gov API; it does not bundle statute text. Once a statute is cached, it is offline-readable until the next amendment.
- **Japanese statutes only.** The e-Gov API is the Japanese government's domestic legal database. There is no English translation of statute text in this tool (the metadata field names are English, but `law_title` and bodies are Japanese).
- **The amendment detection works at metadata granularity.** A change in `law_revision_id` invalidates the cache and triggers an alert; per-article diffing is not yet bundled (the `lib/article-diff.js` helpers exist if you want to build it on top).
- **Search is title-substring**, not full-text. To find a statute by topic, use the title-search or browse the [e-Gov website](https://laws.e-gov.go.jp/) and pass the exact title to `fetch`.
- **No retries / rate limiting.** The e-Gov API is generally responsive; if you call `seed` and `check-all` from a script, the built-in 80 ms inter-request sleep is enough for normal use.

---

## Contributing

Bug reports, feature requests, and PRs welcome at [github.com/naotantan/laws-jp/issues](https://github.com/naotantan/laws-jp/issues).

Local development:

```bash
git clone https://github.com/naotantan/laws-jp.git
cd laws-jp
node --test test/         # if tests present
node bin/laws-jp.js --help
```

The codebase has zero runtime dependencies and aims to stay that way. For development tooling (linters, test runners) we use what ships with Node 18+.

---

## License

[MIT](LICENSE) © 2026 Naoto Kudo

The e-Gov 法令 API itself is operated by the **総務省 行政管理局 (Ministry of Internal Affairs and Communications)** of Japan. Use of the API is governed by their terms of service, which permit commercial use free of charge as of 2026-04. See [the e-Gov terms](https://laws.e-gov.go.jp/) for the latest.

---

# 日本語

`laws-jp` は、日本政府が提供する [e-Gov 法令 API v2](https://laws.e-gov.go.jp/api/2/swagger-ui) に対する CLI とライブラリです。**国の正本データ**を直接 Markdown で取得・条文単位で参照・改正検知できます。Zero dependency で、Node.js 18+ があれば動きます。

## 何が嬉しいか

- 9,500 本以上の法律・政令・省令・規則の **最新本文を Markdown で取得**
- 「民法第 166 条」のような **条番号でピンポイント取得**（漢数字 `第百六十六条`、枝番 `166-2`、いずれも OK）
- **改正検知**：watchlist に登録した法令を毎日チェックし、改正があった日のうちに alert JSON を吐く
- **キャッシュ**は公式の `law_revision_id` に紐付くので、改正があるまで API を一切叩かない
- **ランタイム依存ゼロ**：Node.js 18+ だけ。API キー不要

## 想定ユーザ

- **弁護士・公認会計士・税理士・社労士・司法書士・行政書士** の先生方が、書籍 DB や有料サービスに依存せず、訴訟資料・契約書・意見書に**一字一句正確な条文**を引用したいとき
- LLM（Claude / GPT 等）に **正本ベースで条文を渡したい** AI アプリケーション開発者
- 法務 / コンプライアンス系の業務システムを構造化された API として国の法令データに繋ぎたい開発者

## クイックスタート

```bash
git clone https://github.com/naotantan/laws-jp.git
cd laws-jp
node bin/laws-jp.js --help

# 全文取得
node bin/laws-jp.js fetch 民法 > minpo.md

# 条文取得（漢数字・アラビア数字・枝番すべて OK）
node bin/laws-jp.js article 民法 166-2
node bin/laws-jp.js article 民法 第百六十六条の二

# 全 9,500 本から検索
node bin/laws-jp.js search 個人情報 --limit=5

# Watchlist + 毎朝の改正チェック
node bin/laws-jp.js seed                       # 6 士業向け 44 法令を一括登録
node bin/laws-jp.js check-all                  # 改正があれば alerts/ に JSON 出力
```

## サブコマンド

| サブコマンド | 用途 |
|------------|------|
| `fetch <名称>` | 全文を Markdown で stdout に出力 |
| `meta <名称>` | メタデータ JSON（法令番号・改正履歴・施行日 等）|
| `article <名称> <条番号>` | 特定条文を抜き出して出力（条構造のパンくず付き）|
| `search <キーワード>` | 9,500 本から横断検索 |
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

## 毎朝 6 時の cron 例

```cron
0 6 * * *  cd $HOME && /usr/local/bin/laws-jp check-all >> $HOME/.local/share/laws-jp/cron.log 2>&1
```

## ライセンス

[MIT](LICENSE) © 2026 工藤 直人

e-Gov 法令 API そのものは **総務省 行政管理局** が提供しており、利用条件は [e-Gov のサイト](https://laws.e-gov.go.jp/) をご確認ください（2026 年 4 月時点で商用利用可・利用料無料）。
