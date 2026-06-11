/**
 * Formatters for the `readiness` command.
 */

import { isBelowFloor, floorPercentText } from "../lib/confidence-floor.js";
import { renderHeader } from "./shared.js";

const LIFT_HINT =
  "Add artifact-interpreted evidence, run Guide's evaluate-evidence skill, or hand-attest markers via WriteEvidence to lift the floor.";

/** A persona with zero artifacts is "no signal", not "below floor". */
function isBelowFloorWithSignal(coverage) {
  return coverage && coverage.total > 0 && isBelowFloor(coverage.ratio);
}

function coverageLine(coverage) {
  const pct = (coverage.ratio * 100).toFixed(1);
  return `Evidence coverage: ${coverage.scored}/${coverage.total} artifacts interpreted (${pct}%).`;
}

/** Marker line for one checklist item: checkbox, marker text, artifact id. */
function itemLine(item) {
  const check = item.evidenced ? "[x]" : "[ ]";
  const artifact = item.artifactId ? ` (${item.artifactId})` : "";
  return `${check} ${item.marker}${artifact}`;
}

/** Suppression copy shared by text and markdown below-floor branches. */
function suppressionLines(coverage) {
  const pct = (coverage.ratio * 100).toFixed(1);
  return [
    `Coverage below floor (${pct}% < ${floorPercentText()}) — verdict suppressed.`,
    coverageLine(coverage),
    LIFT_HINT,
  ];
}

/** Render the readiness checklist as plain text with checkbox-style markers and a summary line. */
export function toText(view) {
  const lines = [
    renderHeader(
      `Readiness: ${view.email} (${view.currentLevel} → ${view.targetLevel})`,
    ),
    "",
  ];

  if (isBelowFloorWithSignal(view.coverage)) {
    lines.push(...suppressionLines(view.coverage).map((l) => `    ${l}`));
    lines.push("");
    return lines.join("\n");
  }

  for (const section of view.checklist) {
    lines.push(`    ${section.skillName} (${section.proficiency}):`);
    for (const item of section.items) {
      lines.push(`      ${itemLine(item)}`);
    }
    lines.push("");
  }

  lines.push(
    `    ${view.summary.evidenced}/${view.summary.total} markers evidenced.`,
  );

  if (view.coverage && view.coverage.total > 0) {
    lines.push(`    ${coverageLine(view.coverage)}`);
  }

  if (view.summary.missing.length > 0) {
    lines.push(`    Missing: ${view.summary.missing.join("; ")}`);
  }

  if (view.skippedSkills.length > 0) {
    lines.push("");
    lines.push("    Skipped skills (no markers at required proficiency):");
    for (const s of view.skippedSkills) {
      lines.push(`      - ${s.skillId}: ${s.reason}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

/** Serialize the readiness view and metadata as formatted JSON. */
export function toJson(view, meta) {
  return JSON.stringify({ ...view, meta }, null, 2);
}

/** Render the readiness checklist as markdown with skill sections and a summary of evidenced markers. */
export function toMarkdown(view) {
  const lines = [
    `# Readiness: ${view.email} (${view.currentLevel} → ${view.targetLevel})`,
    "",
  ];

  if (isBelowFloorWithSignal(view.coverage)) {
    const [banner, ...rest] = suppressionLines(view.coverage);
    lines.push(`**${banner}**`, ...rest);
    return lines.join("\n");
  }

  for (const section of view.checklist) {
    lines.push(`## ${section.skillName} (${section.proficiency})`);
    lines.push("");
    for (const item of section.items) {
      lines.push(`- ${itemLine(item)}`);
    }
    lines.push("");
  }

  lines.push(
    `**${view.summary.evidenced}/${view.summary.total} markers evidenced.**`,
  );

  if (view.coverage && view.coverage.total > 0) {
    lines.push(coverageLine(view.coverage));
  }

  if (view.summary.missing.length > 0) {
    lines.push("");
    lines.push("Missing:");
    for (const m of view.summary.missing) {
      lines.push(`- ${m}`);
    }
  }

  return lines.join("\n");
}
