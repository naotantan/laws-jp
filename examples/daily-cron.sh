#!/usr/bin/env bash
# Example: run amendment detection daily and post a Slack notification when
# any watched statute changes. Drop this in a cron / launchd / systemd timer:
#
#   0 6 * * *  /path/to/daily-cron.sh
#
# Required env (set these before invocation):
#   SLACK_WEBHOOK_URL  Incoming webhook URL (optional — script just prints if unset)
#   LAWS_JP            Path to the laws-jp executable (defaults to `laws-jp` in PATH)

set -euo pipefail

LAWS_JP="${LAWS_JP:-laws-jp}"
STATE_DIR="${LAWS_JP_HOME:-$HOME/.local/share/laws-jp}"
TODAY=$(TZ=Asia/Tokyo date +%Y-%m-%d)
ALERT="$STATE_DIR/alerts/$TODAY.json"

# Run amendment detection (creates today's alert file if anything changed).
"$LAWS_JP" check-all

# If no alert was produced, exit silently.
[ -f "$ALERT" ] || { echo "No amendments today."; exit 0; }

COUNT=$(jq -r '.changes | length' "$ALERT")
echo "Detected $COUNT amendment(s) today:"
jq -r '.changes[] | "  - [\(.kind)] \(.title) (\(.law_id))"' "$ALERT"

# Post to Slack if a webhook is configured.
if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
  TITLES=$(jq -r '.changes | map("• " + .title) | join("\n")' "$ALERT")
  PAYLOAD=$(jq -n \
    --arg text ":scroll: *${COUNT} Japanese statutes amended today (${TODAY}):*\n${TITLES}" \
    '{text: $text}')
  curl -fsS -X POST -H 'Content-Type: application/json' -d "$PAYLOAD" "$SLACK_WEBHOOK_URL" >/dev/null
  echo "Posted to Slack."
fi
