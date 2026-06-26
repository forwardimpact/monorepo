/**
 * Turn renderer — maps a structured turn into formatted text lines.
 *
 * Shared by `TeeWriter.flushTurns()` (live stream) and
 * `TraceCollector.toText()` (offline replay) so both emit identical output.
 */

import {
  renderTextLine,
  renderToolCallLine,
  renderToolResultLine,
} from "./line-renderer.js";
import {
  hintForCall,
  previewForResult,
  simplifyToolName,
} from "./tool-hints.js";

/**
 * Render a single turn to formatted text lines.
 *
 * @param {object} turn - Structured turn object
 * @param {boolean} withPrefix - Whether to include source labels
 * @returns {string[]} Array of rendered line strings
 */
export function renderTurnLines(turn, withPrefix) {
  return TURN_RENDERERS[turn.role]?.(turn, withPrefix) ?? [];
}

/** @param {object} turn @param {boolean} withPrefix @returns {string[]} */
function renderAssistantTurn(turn, withPrefix) {
  const lines = [];
  for (const block of turn.content) {
    if (block.type === "text") {
      lines.push(
        renderTextLine({ source: turn.source, text: block.text, withPrefix }),
      );
    } else if (block.type === "tool_use") {
      lines.push(
        renderToolCallLine({
          source: turn.source,
          toolName: simplifyToolName(block.name),
          hint: hintForCall(block.name, block.input),
          withPrefix,
        }),
      );
    }
  }
  return lines;
}

/** @param {object} turn @param {boolean} withPrefix @returns {string[]} */
function renderToolResultTurn(turn, withPrefix) {
  // Successful tool results emit no preview line — the trace document keeps
  // the structured turn, but readers of the streamed log only see errors.
  if (!turn.isError) return [];
  return [
    renderToolResultLine({
      source: turn.source,
      preview: previewForResult(turn.content, true),
      withPrefix,
    }),
  ];
}

/** @param {object} turn @param {boolean} withPrefix @returns {string[]} */
function renderSystemTurn(turn, withPrefix) {
  const label = turn.subtype ?? "system";
  return [
    renderTextLine({ source: turn.source, text: `[${label}]`, withPrefix }),
  ];
}

/** @param {object} turn @param {boolean} withPrefix @returns {string[]} */
function renderUserTurn(turn, withPrefix) {
  const lines = [];
  for (const block of turn.content) {
    if (block.type === "text") {
      lines.push(
        renderTextLine({
          source: turn.source,
          text: `[user] ${block.text}`,
          withPrefix,
        }),
      );
    }
  }
  return lines;
}

const TURN_RENDERERS = {
  assistant: renderAssistantTurn,
  tool_result: renderToolResultTurn,
  system: renderSystemTurn,
  user: renderUserTurn,
};
