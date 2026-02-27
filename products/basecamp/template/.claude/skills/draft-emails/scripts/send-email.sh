#!/bin/bash
# Send an email via Apple Mail using AppleScript.
#
# Usage: bash scripts/send-email.sh --to "a@x.com,b@x.com" --cc "c@x.com" --subject "Re: ..." --body "Hi ..."
#
# Options:
#   --to       Comma-separated To recipients (required)
#   --cc       Comma-separated CC recipients (optional)
#   --bcc      Comma-separated BCC recipients (optional)
#   --subject  Email subject line (required)
#   --body     Plain-text email body (required)
#
# Notes:
#   - Do NOT include an email signature — Apple Mail appends the configured
#     signature automatically.
#   - The body should be plain text. No HTML.
#   - Sends immediately (visible:false). Mail.app must be running.

set -euo pipefail

TO=""
CC=""
BCC=""
SUBJECT=""
BODY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --to)      TO="$2";      shift 2 ;;
    --cc)      CC="$2";      shift 2 ;;
    --bcc)     BCC="$2";     shift 2 ;;
    --subject) SUBJECT="$2"; shift 2 ;;
    --body)    BODY="$2";    shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$TO" || -z "$SUBJECT" || -z "$BODY" ]]; then
  echo "Error: --to, --subject, and --body are required." >&2
  exit 1
fi

# Write AppleScript to a temp file to avoid heredoc escaping issues
TMPFILE="$(mktemp /tmp/send-email.XXXXXX.scpt)"
trap 'rm -f "$TMPFILE"' EXIT

# Escape a string for use inside AppleScript double-quoted strings
escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '%s' "$s"
}

# Start building the AppleScript
cat > "$TMPFILE" <<'HEADER'
tell application "Mail"
    set newMessage to make new outgoing message with properties {subject:"PLACEHOLDER_SUBJECT", content:"PLACEHOLDER_BODY", visible:false}
    tell newMessage
HEADER

# Replace placeholders with escaped values using perl (handles special chars)
perl -i -pe "
  s/PLACEHOLDER_SUBJECT/$(escape "$SUBJECT" | sed 's/[&/]/\\&/g')/;
  s/PLACEHOLDER_BODY/$(escape "$BODY" | sed 's/[&/]/\\&/g')/;
" "$TMPFILE"

# Add recipients
add_recipients() {
  local type="$1"  # "to recipient" | "cc recipient" | "bcc recipient"
  local addrs="$2"
  IFS=',' read -ra ADDR_LIST <<< "$addrs"
  for addr in "${ADDR_LIST[@]}"; do
    addr="$(echo "$addr" | xargs)"  # trim whitespace
    [[ -z "$addr" ]] && continue
    echo "        make new ${type} at end of ${type}s with properties {address:\"${addr}\"}" >> "$TMPFILE"
  done
}

add_recipients "to recipient" "$TO"
[[ -n "$CC" ]]  && add_recipients "cc recipient" "$CC"
[[ -n "$BCC" ]] && add_recipients "bcc recipient" "$BCC"

# Close the AppleScript
cat >> "$TMPFILE" <<'FOOTER'
    end tell
    send newMessage
end tell
FOOTER

# Execute
osascript "$TMPFILE"
echo "Sent: ${SUBJECT}"
