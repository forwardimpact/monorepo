#!/usr/bin/env bash
# Guide Product Setup Test
#
# Submits a sequence of prompts to the claude binary simulating a new user
# who discovers the Guide product via www.forwardimpact.team, then installs
# and configures it.
#
# Usage:
#   ./run.sh              # Run all steps
#   ./run.sh 3            # Run from step 3 onwards
#   ./run.sh 2 2          # Run only step 2
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

mkdir -p "$NOTES_DIR" "$LOGS_DIR"

PROMPTS=(
  "01-discover.md"
  "02-deep-dive.md"
  "03-install.md"
  "04-configure.md"
  "05-verify.md"
)

ALLOWED_TOOLS="Bash Read Write Glob Grep WebFetch"

run_step() {
  local step_num="$1"
  local prompt_file="$2"
  local step_name="${prompt_file%.md}"
  local log_file="$LOGS_DIR/${step_name}.log"

  echo "=== Step $step_num: $step_name ==="
  echo "  Prompt: $PROMPTS_DIR/$prompt_file"
  echo "  Log:    $log_file"
  echo ""

  local prompt
  prompt="$(cat "$PROMPTS_DIR/$prompt_file")"

  claude \
    --print \
    --model "$MODEL" \
    --permission-mode=acceptEdits \
    --allowedTools $ALLOWED_TOOLS \
    --system-prompt "You are a developer evaluating a new product. Follow the instructions exactly. Save outputs to ./notes/ as requested." \
    --verbose \
    "$prompt" \
    2>&1 | tee "$log_file"

  local exit_code=${PIPESTATUS[0]}

  echo ""
  if [ $exit_code -eq 0 ]; then
    echo "  ✓ Step $step_num completed (exit $exit_code)"
  else
    echo "  ✗ Step $step_num failed (exit $exit_code)"
  fi
  echo ""

  return $exit_code
}

echo "╔══════════════════════════════════════════════════════╗"
echo "║  Guide Product Setup Test                           ║"
echo "║  Workspace: $WORKSPACE"
echo "║  Model:     $MODEL"
echo "║  Steps:     ${#PROMPTS[@]}"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

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

echo "════════════════════════════════════════════════════════"
if [ $failures -eq 0 ]; then
  echo "All steps completed successfully."
else
  echo "$failures step(s) had failures."
fi
echo "Notes: $NOTES_DIR/"
echo "Logs:  $LOGS_DIR/"
