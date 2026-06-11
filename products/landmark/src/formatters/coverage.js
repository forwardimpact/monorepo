/**
 * Formatters for the `coverage` command.
 */

import { PROVENANCE_CLASSES } from "@forwardimpact/map/activity/provenance";

import { isBelowFloor, floorPercentText } from "../lib/confidence-floor.js";
import { padRight, renderHeader } from "./shared.js";

function belowFloorBanner(coverage) {
  const pct = (coverage.ratio * 100).toFixed(1);
  return `Coverage below floor (${pct}% < ${floorPercentText()}) — interpret the breakdown as a producer-skew diagnostic, not a confidence statement.`;
}

/** Render coverage metrics as indented plain text with per-type breakdowns. */
export function toText(view) {
  const lines = [
    renderHeader(`Evidence coverage for ${view.name} (${view.email})`),
    "",
  ];

  if (view.coverage.total > 0 && isBelowFloor(view.coverage.ratio)) {
    lines.push(`    ${belowFloorBanner(view.coverage)}`);
    lines.push("");
  }

  const pct = (view.coverage.ratio * 100).toFixed(1);
  lines.push(
    `    ${view.coverage.scored}/${view.coverage.total} artifacts interpreted (${pct}%)`,
  );
  lines.push("");

  lines.push("    By provenance (evidence rows):");
  for (const cls of PROVENANCE_CLASSES) {
    lines.push(`      ${padRight(cls, 24)}  ${view.byProvenance?.[cls] ?? 0}`);
  }
  if (view.byProvenance?.unknown > 0) {
    lines.push(
      `      ${padRight("unknown", 24)}  ${view.byProvenance.unknown}`,
    );
  }
  lines.push("");

  const types = Object.keys(view.byType).sort();
  if (types.length > 0) {
    lines.push("    By type:");
    for (const type of types) {
      const total = view.byType[type];
      const uncovered = view.uncoveredByType[type] ?? 0;
      const covered = total - uncovered;
      lines.push(
        `      ${padRight(type, 20)}  ${covered}/${total} interpreted`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Serialize the coverage view and metadata as formatted JSON. */
export function toJson(view, meta) {
  return JSON.stringify({ ...view, meta }, null, 2);
}

/** Render coverage metrics as a markdown table with per-type rows. */
export function toMarkdown(view) {
  const pct = (view.coverage.ratio * 100).toFixed(1);
  const lines = [`# Evidence coverage for ${view.name} (${view.email})`, ""];

  if (view.coverage.total > 0 && isBelowFloor(view.coverage.ratio)) {
    lines.push(`**${belowFloorBanner(view.coverage)}**`);
    lines.push("");
  }

  lines.push(
    `**${view.coverage.scored}/${view.coverage.total}** artifacts interpreted (${pct}%)`,
    "",
    "| Provenance | Rows |",
    "| --- | --- |",
  );

  for (const cls of PROVENANCE_CLASSES) {
    lines.push(`| ${cls} | ${view.byProvenance?.[cls] ?? 0} |`);
  }
  if (view.byProvenance?.unknown > 0) {
    lines.push(`| unknown | ${view.byProvenance.unknown} |`);
  }

  lines.push("", "| Type | Covered | Total |", "| --- | --- | --- |");

  for (const type of Object.keys(view.byType).sort()) {
    const total = view.byType[type];
    const uncovered = view.uncoveredByType[type] ?? 0;
    const covered = total - uncovered;
    lines.push(`| ${type} | ${covered} | ${total} |`);
  }

  return lines.join("\n");
}
