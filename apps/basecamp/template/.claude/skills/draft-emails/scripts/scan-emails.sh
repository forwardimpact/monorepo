#!/bin/bash
# Scan for unprocessed emails and output their IDs and subjects.
#
# Usage: bash scripts/scan-emails.sh
#
# Checks ~/.cache/fit/basecamp/apple_mail/ for email files not yet
# listed in drafts/drafted or drafts/ignored.
# Outputs tab-separated: email_id<TAB>subject

set -euo pipefail

MAIL_DIRS=(
  "$HOME/.cache/fit/basecamp/apple_mail"
  "$HOME/.cache/fit/basecamp/gmail"
)

for dir in "${MAIL_DIRS[@]}"; do
  [ -d "$dir" ] || continue
  for file in "$dir"/*.md; do
    [ -f "$file" ] || continue

    # Extract ID from filename (without extension)
    EMAIL_ID="$(basename "$file" .md)"

    # Skip if already drafted or ignored
    rg -qxF "$EMAIL_ID" drafts/drafted 2>/dev/null && continue
    rg -qxF "$EMAIL_ID" drafts/ignored 2>/dev/null && continue

    # Extract subject from first H1 heading
    SUBJECT="$(rg -m1 '^# ' "$file" 2>/dev/null | sed 's/^# //')"

    printf '%s\t%s\n' "$EMAIL_ID" "$SUBJECT"
  done
done
