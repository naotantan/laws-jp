#!/usr/bin/env bash
# Sync every statute on your watchlist into a Notion database as pages.
#
# Each statute becomes one page in the target database, with these properties:
#   - Title (text)              法令名
#   - law_id (text)             129AC0000000089
#   - law_num (text)            明治二十九年法律第八十九号
#   - law_revision_id (text)    used for idempotent re-runs
#   - amendment_enforcement_date (date)
#   - tags (multi-select)
#   - source (URL)              link back to e-Gov
#
# The full Markdown body is appended as page content (paragraph blocks).
# Re-running the script updates pages whose law_revision_id changed.
#
# One-time setup:
#   1) https://www.notion.so/profile/integrations → create internal integration
#      → copy the secret (NOTION_TOKEN, starts with `secret_` or `ntn_`).
#   2) Create a Notion database with the properties listed above (any types
#      compatible — text or rich_text is fine for the strings).
#   3) In the database, click "..." → "Add connections" → select your
#      integration so it can read/write the DB.
#   4) Copy the database ID from the database URL:
#        https://www.notion.so/<workspace>/<DB_ID>?v=...
#                                          ^^^^^^^ 32-char hyphenless ID.
#
# Usage:
#   NOTION_TOKEN=ntn_xxx NOTION_DB_ID=abcd... ./sync-to-notion.sh

set -euo pipefail

LAWS_JP="${LAWS_JP:-laws-jp}"
NOTION_TOKEN="${NOTION_TOKEN:?Set NOTION_TOKEN to your Notion integration secret.}"
NOTION_DB_ID="${NOTION_DB_ID:?Set NOTION_DB_ID to your target database ID.}"
NOTION_VERSION="${NOTION_VERSION:-2022-06-28}"

STATE_DIR="${LAWS_JP_HOME:-$HOME/.local/share/laws-jp}"
WATCHLIST="$STATE_DIR/watchlist.json"

[ -f "$WATCHLIST" ] || { echo "watchlist not found at $WATCHLIST. Run \`$LAWS_JP seed\` first." >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required (brew install jq / apt install jq)." >&2; exit 1; }

# --- helpers -----------------------------------------------------------------
notion() {
  local method=$1 path=$2 body=${3:-}
  if [ -n "$body" ]; then
    curl -fsS -X "$method" "https://api.notion.com/v1$path" \
      -H "Authorization: Bearer $NOTION_TOKEN" \
      -H "Notion-Version: $NOTION_VERSION" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -fsS -X "$method" "https://api.notion.com/v1$path" \
      -H "Authorization: Bearer $NOTION_TOKEN" \
      -H "Notion-Version: $NOTION_VERSION"
  fi
}

# Find an existing page by law_id; returns page_id or empty.
find_page() {
  local law_id=$1
  notion POST "/databases/$NOTION_DB_ID/query" \
    "$(jq -nc --arg id "$law_id" \
        '{filter: {property: "law_id", rich_text: {equals: $id}}, page_size: 1}')" \
    | jq -r '.results[0].id // empty'
}

# Convert Markdown text to Notion paragraph blocks (max 100 blocks per request,
# each block max 2000 chars). Splits long bodies on blank lines.
md_to_blocks() {
  local md=$1
  echo "$md" | awk -v RS='\n\n' 'NF { print }' | jq -Rsc '
    split("\n\n")
    | map(select(length > 0))
    | map({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{
            type: "text",
            text: { content: (.[0:1990]) }
          }]
        }
      })
  '
}

# --- sync loop ---------------------------------------------------------------
count=0
jq -c '.[]' "$WATCHLIST" | while read -r entry; do
  title=$(echo "$entry" | jq -r '.title')
  law_id=$(echo "$entry" | jq -r '.law_id // empty')
  tags_json=$(echo "$entry" | jq -c '.tags // []')

  [ -n "$law_id" ] || { echo "skip $title (no law_id)" >&2; continue; }

  meta_json=$("$LAWS_JP" meta "$law_id")
  revision=$(echo "$meta_json" | jq -r '.law_revision_id')
  enforced=$(echo "$meta_json" | jq -r '.amendment_enforcement_date')
  num=$(echo "$meta_json" | jq -r '.law_num')
  source_url="https://laws.e-gov.go.jp/law/$law_id"

  page_id=$(find_page "$law_id")

  # Skip when an existing page already has this revision recorded.
  if [ -n "$page_id" ]; then
    existing_rev=$(notion GET "/pages/$page_id" \
      | jq -r '.properties.law_revision_id.rich_text[0].plain_text // empty')
    if [ "$existing_rev" = "$revision" ]; then
      continue
    fi
  fi

  body=$("$LAWS_JP" fetch "$law_id")
  blocks=$(md_to_blocks "$body")

  # Build the properties payload.
  multi_tags=$(echo "$tags_json" | jq -c 'map({name: .})')
  props=$(jq -nc \
    --arg title "$title" --arg law_id "$law_id" --arg num "$num" \
    --arg rev "$revision" --arg date "$enforced" --arg url "$source_url" \
    --argjson tags "$multi_tags" '
    {
      "Title": { "title": [{ "text": { "content": $title } }] },
      "law_id": { "rich_text": [{ "text": { "content": $law_id } }] },
      "law_num": { "rich_text": [{ "text": { "content": $num } }] },
      "law_revision_id": { "rich_text": [{ "text": { "content": $rev } }] },
      "amendment_enforcement_date": (
        if $date == "" or $date == "null" then null
        else { "date": { "start": $date } } end
      ),
      "tags": { "multi_select": $tags },
      "source": { "url": $url }
    }
  ')

  if [ -z "$page_id" ]; then
    payload=$(jq -nc \
      --arg db "$NOTION_DB_ID" --argjson props "$props" --argjson blocks "$blocks" \
      '{ parent: { database_id: $db }, properties: $props, children: $blocks }')
    notion POST "/pages" "$payload" >/dev/null
    echo "created: $title ($law_id)"
  else
    # Update properties; replace block children separately.
    notion PATCH "/pages/$page_id" \
      "$(jq -nc --argjson props "$props" '{properties: $props}')" >/dev/null
    # Append new blocks. (Notion has no "replace all blocks" in one call;
    # for a clean rewrite, delete existing children first via /blocks/<id>/children.)
    notion PATCH "/blocks/$page_id/children" \
      "$(jq -nc --argjson blocks "$blocks" '{children: $blocks}')" >/dev/null
    echo "updated: $title ($law_id, rev $revision)"
  fi

  count=$((count + 1))
done

echo "Done. Synced $count change(s) to Notion DB $NOTION_DB_ID"
