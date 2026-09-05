// The run-summary renderer. Every run reports what it read, what the latch
// holds now, and what it decided, so an operator reads the whole story off
// the run without opening the settings page.

/**
 * Render the counter table and the verdict line.
 * @param {object} verdict - The engine verdict.
 * @returns {Array<string>} The block's lines.
 */
function verdictLines(verdict) {
  const lines = [
    `Counting since \`${verdict.cutoff}\`.`,
    "",
    "| Counter | Count | Covered | Threshold |",
    "| ------- | ----- | ------- | --------- |",
  ];
  for (const count of verdict.counts) {
    const reading = count.count === null ? "unreadable" : count.count;
    const covered = count.covered ? "yes" : "no";
    lines.push(
      `| ${count.id} | ${reading} | ${covered} | ${count.threshold} |`,
    );
  }
  lines.push("", `Verdict: **${verdict.engage ? "engage" : "quiet"}**`);
  if (verdict.breaches.length > 0) {
    const named = verdict.breaches
      .map((breach) => `${breach.id} (${breach.kind})`)
      .join(", ");
    lines.push("", `Breached: ${named}`);
  }
  return lines;
}

/**
 * Render a latch value inside a markdown code span. A value carrying a
 * backtick would otherwise break the block an operator reads to triage a stop.
 * @param {*} value - The raw value, or a nullish value when absent.
 * @returns {string} The code span.
 */
function span(value) {
  return `\`${String(value ?? "").replaceAll("`", "'")}\``;
}

/**
 * Render the latch's two records and the effective reading.
 * @param {object} state - The latch state.
 * @returns {Array<string>} The block's lines.
 */
function stateLines(state) {
  return [
    "",
    `Killswitch scope: ${span(state.scope ?? "absent")}`,
    `Killswitch value: ${span(state.value)}`,
    `Repository record: ${span(state.repository?.value ?? "absent")}`,
    `Organization record: ${span(state.organization?.value ?? "absent")}`,
  ];
}

/**
 * Render a run summary as one markdown block.
 *
 * An assess run passes `verdict` and `killswitchValue`. An engage run passes
 * `state` and `decision`. Each renders the part it has.
 * @param {object} input
 * @param {object} [input.verdict] - The engine verdict.
 * @param {object} [input.state] - The latch state.
 * @param {*} [input.killswitchValue] - The caller's own reading of the latch.
 * @param {string} [input.decision] - `engage` or `skip`.
 * @param {boolean} [input.dryRun] - Whether the run wrote nothing by request.
 * @returns {string} The markdown block.
 */
export function renderSummary({
  verdict,
  state,
  killswitchValue,
  decision,
  dryRun,
} = {}) {
  const lines = ["### Watchdog", ""];

  if (verdict) lines.push(...verdictLines(verdict));

  if (state) {
    lines.push(...stateLines(state));
  } else if (killswitchValue !== undefined) {
    lines.push("", `Killswitch value: ${span(killswitchValue)}`);
  }

  if (decision) lines.push("", `Decision: **${decision}**`);
  if (dryRun) lines.push("", "Dry run: the latch was read and not written.");

  return `${lines.join("\n")}\n`;
}
