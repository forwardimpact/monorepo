/**
 * Formatter registry.
 *
 * Each command has a corresponding formatter module with toText, toJson,
 * toMarkdown exports. This module dispatches to the correct formatter
 * based on the command name and format.
 */

import * as orgFormatter from "./org.js";
import * as snapshotFormatter from "./snapshot.js";
import * as markerFormatter from "./marker.js";
import * as evidenceFormatter from "./evidence.js";
import * as readinessFormatter from "./readiness.js";
import * as timelineFormatter from "./timeline.js";
import * as coverageFormatter from "./coverage.js";
import * as practiceFormatter from "./practice.js";
import * as practicedFormatter from "./practiced.js";
import * as healthFormatter from "./health.js";
import * as voiceFormatter from "./voice.js";
import * as initiativeFormatter from "./initiative.js";

const formatters = {
  org: orgFormatter,
  snapshot: snapshotFormatter,
  marker: markerFormatter,
  evidence: evidenceFormatter,
  readiness: readinessFormatter,
  timeline: timelineFormatter,
  coverage: coverageFormatter,
  practice: practiceFormatter,
  practiced: practicedFormatter,
  health: healthFormatter,
  voice: voiceFormatter,
  initiative: initiativeFormatter,
};

/**
 * Format a command result into a string for output.
 *
 * @param {string} command - Command name.
 * @param {{view: object|null, meta: object}} result - Command result.
 * @returns {string}
 */
export function formatResult(command, result) {
  const { view, meta } = result;

  // Empty-state handling: all formats render only the message.
  if (meta.emptyState) {
    if (meta.format === "json") {
      return (
        JSON.stringify({ emptyState: meta.emptyState, view: null }, null, 2) +
        "\n"
      );
    }
    return `  ${meta.emptyState}\n`;
  }

  const fmt = formatters[command];
  if (!fmt) {
    // Fallback: JSON dump.
    return JSON.stringify(result, null, 2) + "\n";
  }

  switch (meta.format) {
    case "json":
      return fmt.toJson(view, meta) + "\n";
    case "markdown":
      return fmt.toMarkdown(view, meta);
    default:
      return fmt.toText(view, meta);
  }
}
