/**
 * Formatters for the `timeline` command.
 */

import { isBelowFloor, floorPercentText } from "../lib/confidence-floor.js";
import { padRight, renderHeader } from "./shared.js";

const LIFT_HINT =
  "Add artifact-interpreted evidence, run Guide's evaluate-evidence skill, or hand-attest markers via WriteEvidence to lift the floor.";

function belowFloorBanner(coverage) {
  const pct = (coverage.ratio * 100).toFixed(1);
  return `Coverage below floor (${pct}% < ${floorPercentText()}) — timeline reflects measurement floor, not absence of growth.`;
}

/** Render the growth timeline as plain text with quarter, skill, and highest-level columns. */
export function toText(view) {
  const lines = [renderHeader(`Growth timeline for ${view.email}`), ""];

  if (
    view.coverage &&
    view.coverage.total > 0 &&
    isBelowFloor(view.coverage.ratio)
  ) {
    lines.push(`    ${belowFloorBanner(view.coverage)}`);
    lines.push(`    ${LIFT_HINT}`);
    lines.push("");
  }

  const skillWidth = Math.max(
    15,
    ...view.timeline.map((t) => t.skillId.length),
  );

  for (const entry of view.timeline) {
    lines.push(
      `    ${padRight(entry.quarter, 10)}  ${padRight(entry.skillId, skillWidth)}  ${entry.highestLevel}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

/** Serialize the timeline view and metadata as formatted JSON. */
export function toJson(view, meta) {
  return JSON.stringify({ ...view, meta }, null, 2);
}

/** Render the growth timeline as a markdown table with quarter, skill, and highest-level columns. */
export function toMarkdown(view) {
  const lines = [`# Growth timeline for ${view.email}`, ""];

  if (
    view.coverage &&
    view.coverage.total > 0 &&
    isBelowFloor(view.coverage.ratio)
  ) {
    lines.push(`**${belowFloorBanner(view.coverage)}**`);
    lines.push(LIFT_HINT);
    lines.push("");
  }

  lines.push("| Quarter | Skill | Highest Level |", "| --- | --- | --- |");

  for (const entry of view.timeline) {
    lines.push(
      `| ${entry.quarter} | ${entry.skillId} | ${entry.highestLevel} |`,
    );
  }

  return lines.join("\n");
}
