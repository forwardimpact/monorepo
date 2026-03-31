#!/usr/bin/env bash
# Guide Product Setup Test
#
# Submits a sequence of prompts to the claude binary simulating a new user
# who discovers the Guide product via www.forwardimpact.team, then attempts
# to install it from npm in a clean project (NOT by cloning the monorepo).
#
# Each step captures full ndjson stream output for analysis.
#
# Usage:
#   ./run.sh              # Run all steps
#   ./run.sh 3            # Run from step 3 onwards
#   ./run.sh 2 2          # Run only step 2
#   ./run.sh --analyze    # Analyze existing ndjson logs without running
#
# Environment:
#   Inherits auth from the parent claude session (OAuth token).
#   Set ANTHROPIC_API_KEY explicitly if running outside a claude session.
#   MODEL defaults to "sonnet" for cost efficiency.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE="$SCRIPT_DIR"
PROMPTS_DIR="$WORKSPACE/prompts"
NOTES_DIR="$WORKSPACE/notes"
LOGS_DIR="$WORKSPACE/logs"

MODEL="${MODEL:-sonnet}"
START_STEP="${1:-1}"
END_STEP="${2:-99}"

# Handle --analyze flag
if [ "${1:-}" = "--analyze" ]; then
  exec node "$SCRIPT_DIR/analyze.mjs" "$LOGS_DIR"
fi

mkdir -p "$NOTES_DIR" "$LOGS_DIR"

# Clean workspace for fresh install (preserve prompts, logs, notes, scripts)
clean_workspace() {
  echo "Cleaning workspace for fresh install test..."
  rm -rf "$WORKSPACE/node_modules" \
         "$WORKSPACE/package.json" \
         "$WORKSPACE/bun.lock" \
         "$WORKSPACE/data" \
         "$WORKSPACE/agents" \
         "$WORKSPACE/tsconfig.json" \
         "$WORKSPACE/index.ts" \
         "$WORKSPACE/monorepo" \
         "$WORKSPACE/fresh-install" \
         "$WORKSPACE/CLAUDE.md" \
         "$WORKSPACE/.gitignore"
}

PROMPTS=(
  "01-discover.md"
  "02-research.md"
  "03-install.md"
  "04-configure.md"
  "05-assess.md"
)

ALLOWED_TOOLS="Bash Read Write Glob Grep WebFetch"

run_step() {
  local step_num="$1"
  local prompt_file="$2"
  local step_name="${prompt_file%.md}"
  local ndjson_file="$LOGS_DIR/${step_name}.ndjson"
  local text_file="$LOGS_DIR/${step_name}.txt"

  echo "=== Step $step_num: $step_name ==="
  echo "  Prompt:  $PROMPTS_DIR/$prompt_file"
  echo "  NDJSON:  $ndjson_file"
  echo "  Text:    $text_file"
  echo ""

  local prompt
  prompt="$(cat "$PROMPTS_DIR/$prompt_file")"

  # Capture ndjson stream and extract text output simultaneously
  claude \
    --print \
    --model "$MODEL" \
    --permission-mode=acceptEdits \
    --allowedTools $ALLOWED_TOOLS \
    --output-format=stream-json \
    --verbose \
    --system-prompt "You are a developer evaluating a new product. Follow the instructions exactly. Save outputs to ./notes/ as requested. You are working in a clean project directory — do NOT clone the monorepo." \
    "$prompt" \
    > "$ndjson_file" 2>&1

  local exit_code=$?

  # Extract text result from ndjson for human-readable log
  node -e "
    const fs = require('fs');
    const lines = fs.readFileSync('$ndjson_file', 'utf8').trim().split('\n');
    const texts = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'assistant') {
          const content = obj.message?.content || [];
          for (const c of content) {
            if (c.type === 'text') texts.push(c.text);
          }
        } else if (obj.type === 'result') {
          if (obj.result) texts.push('\n--- RESULT ---\n' + obj.result);
        }
      } catch {}
    }
    fs.writeFileSync('$text_file', texts.join('\n'));
  " 2>/dev/null || true

  # Show brief summary
  if [ -f "$text_file" ]; then
    local lines
    lines=$(wc -l < "$text_file")
    echo "  Output: $lines lines of text"
  fi

  # Extract quick stats from ndjson
  node -e "
    const fs = require('fs');
    const lines = fs.readFileSync('$ndjson_file', 'utf8').trim().split('\n');
    let toolCalls = 0, errors = 0, cost = 0, duration = 0, turns = 0;
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'assistant') {
          for (const c of (obj.message?.content || [])) {
            if (c.type === 'tool_use') toolCalls++;
          }
        }
        if (obj.type === 'result') {
          cost = obj.total_cost_usd || 0;
          duration = obj.duration_ms || 0;
          turns = obj.num_turns || 0;
          if (obj.is_error) errors++;
        }
      } catch {}
    }
    console.log('  Tools: ' + toolCalls + ' calls | Turns: ' + turns + ' | Cost: $' + cost.toFixed(4) + ' | Time: ' + (duration/1000).toFixed(1) + 's');
    if (errors) console.log('  Errors: ' + errors);
  " 2>/dev/null || true

  echo ""
  if [ $exit_code -eq 0 ]; then
    echo "  [PASS] Step $step_num completed (exit $exit_code)"
  else
    echo "  [FAIL] Step $step_num failed (exit $exit_code)"
  fi
  echo ""

  return $exit_code
}

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Guide Product Setup Test (Clean Install)               ║"
echo "║  Workspace: $WORKSPACE"
echo "║  Model:     $MODEL"
echo "║  Steps:     ${#PROMPTS[@]}"
echo "║  Output:    NDJSON stream + text extraction              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Clean workspace before install step
if [ "$START_STEP" -le 3 ]; then
  clean_workspace
fi

step=1
failures=0
for prompt_file in "${PROMPTS[@]}"; do
  if [ $step -lt "$START_STEP" ] || [ $step -gt "$END_STEP" ]; then
    echo "--- Skipping step $step ---"
    step=$((step + 1))
    continue
  fi

  if ! run_step "$step" "$prompt_file"; then
    failures=$((failures + 1))
    echo "  ⚠ Continuing despite failure..."
  fi

  step=$((step + 1))
done

echo "════════════════════════════════════════════════════════════"
if [ $failures -eq 0 ]; then
  echo "All steps completed successfully."
else
  echo "$failures step(s) had failures."
fi
echo ""
echo "Artifacts:"
echo "  Notes:  $NOTES_DIR/"
echo "  NDJSON: $LOGS_DIR/*.ndjson"
echo "  Text:   $LOGS_DIR/*.txt"
echo ""
echo "Run analysis: ./run.sh --analyze"
