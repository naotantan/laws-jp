#!/usr/bin/env bash
# Sync every statute on your watchlist into an Obsidian vault folder.
#
# Each statute lands as <vault>/<folder>/<法令名>.md with YAML frontmatter
# (law_id, law_revision_id, last amendment date, tags) so Obsidian's tag
# pane and Dataview can index them.
#
# Usage:
#   VAULT="$HOME/Documents/MyVault" FOLDER="laws" ./sync-to-obsidian.sh
#
# Run daily from cron after `laws-jp check-all` to keep the vault fresh.

set -euo pipefail

LAWS_JP="${LAWS_JP:-laws-jp}"
VAULT="${VAULT:?Set VAULT to your Obsidian vault root.}"
FOLDER="${FOLDER:-laws}"

DEST="$VAULT/$FOLDER"
mkdir -p "$DEST"

STATE_DIR="${LAWS_JP_HOME:-$HOME/.local/share/laws-jp}"
WATCHLIST="$STATE_DIR/watchlist.json"

[ -f "$WATCHLIST" ] || { echo "watchlist not found at $WATCHLIST. Run \`$LAWS_JP seed\` first." >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required (brew install jq / apt install jq)." >&2; exit 1; }

count=0
jq -c '.[]' "$WATCHLIST" | while read -r entry; do
  title=$(echo "$entry" | jq -r '.title')
  law_id=$(echo "$entry" | jq -r '.law_id // empty')
  tags=$(echo "$entry" | jq -r '(.tags // []) | map("\"" + . + "\"") | join(", ")')

  [ -n "$law_id" ] || { echo "skip $title (no law_id)" >&2; continue; }

  meta_json=$("$LAWS_JP" meta "$law_id")
  revision=$(echo "$meta_json" | jq -r '.law_revision_id')
  enforced=$(echo "$meta_json" | jq -r '.amendment_enforcement_date')
  num=$(echo "$meta_json" | jq -r '.law_num')

  out="$DEST/$title.md"

  # Skip if cached file matches current revision (idempotent).
  if [ -f "$out" ] && grep -q "^law_revision_id: $revision$" "$out" 2>/dev/null; then
    continue
  fi

  body=$("$LAWS_JP" fetch "$law_id")
  {
    echo "---"
    echo "title: $title"
    echo "law_id: $law_id"
    echo "law_num: $num"
    echo "law_revision_id: $revision"
    echo "amendment_enforcement_date: $enforced"
    echo "tags: [laws-jp, $tags]"
    echo "source: e-Gov"
    echo "synced_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "---"
    echo
    echo "$body"
  } > "$out"

  echo "synced: $title ($law_id, rev $revision)"
  count=$((count + 1))
done

echo "Done. Updated $count file(s) in $DEST"
