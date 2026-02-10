/**
 * Skill File Viewer Component
 *
 * Vertically stacked collapsible panes for skill files: SKILL.md,
 * scripts/install.sh, and references/REFERENCE.md.
 * Reused across agent builder and skill detail pages.
 *
 * Each file is rendered as a collapsible code-display pane with
 * accordion behaviour (only one open at a time).
 */

import { div } from "../lib/render.js";
import { createCodeDisplay, accordionize } from "./code-display.js";

/**
 * @typedef {Object} SkillFile
 * @property {string} filename - File path for code display header
 * @property {string} content - File content
 * @property {string} [language="markdown"] - Syntax highlighting language
 */

/**
 * Create a stacked skill file viewer component
 *
 * Shows files as vertically stacked collapsible code-display panes.
 * Only one pane is open at a time (accordion).
 *
 * @param {Object} options
 * @param {SkillFile[]} options.files - Array of files to display
 * @param {number} [options.maxHeight=300] - Maximum height for code displays
 * @param {number} [options.openIndex=0] - Initially open pane index (-1 for all closed)
 * @returns {HTMLElement}
 */
export function createSkillFileViewer({
  files,
  maxHeight = 300,
  openIndex = 0,
}) {
  if (files.length === 0) return div();

  const container = div({ className: "sfv" });
  /** @type {HTMLDetailsElement[]} */
  const panes = [];

  for (let i = 0; i < files.length; i++) {
    const pane = createCodeDisplay({
      content: files[i].content,
      filename: files[i].filename,
      language: files[i].language || "markdown",
      maxHeight,
      open: i === openIndex,
    });
    pane.classList.add("sfv-pane");
    panes.push(pane);
    container.appendChild(pane);
  }

  accordionize(panes);

  return container;
}
