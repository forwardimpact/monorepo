/**
 * File Card Component
 *
 * Unified card component for displaying one or more files with collapsible
 * code panes. Replaces separate agent-card and skill-card patterns with a
 * single bordered surface containing a header and accordion file panes.
 *
 * One component, one DOM pattern, one set of styles.
 */

/* global Prism */
import { div, span } from "../lib/render.js";
import { createCopyButton } from "./code-display.js";

/**
 * @typedef {Object} FileDescriptor
 * @property {string} filename - Display filename for the pane summary
 * @property {string} content - File content to display
 * @property {string} [language="markdown"] - Syntax highlighting language
 */

/**
 * Create a file card with header and collapsible file panes.
 *
 * Agent card = createFileCard with 1 file (1 pane, open).
 * Skill card = createFileCard with 1–3 files (accordion).
 *
 * @param {Object} options
 * @param {Array<HTMLElement|string>} options.header - Elements for the card header
 * @param {FileDescriptor[]} options.files - Files to display as collapsible panes
 * @param {number} [options.maxHeight=300] - Max code block height in px
 * @param {number} [options.openIndex=0] - Initially open pane (-1 = all closed)
 * @returns {HTMLElement}
 */
export function createFileCard({
  header,
  files,
  maxHeight = 300,
  openIndex = 0,
}) {
  const card = div(
    { className: "file-card" },
    div({ className: "file-card-header" }, ...header),
  );

  /** @type {HTMLDetailsElement[]} */
  const panes = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    const details = document.createElement("details");
    details.className = "file-card-pane";
    if (i === openIndex) details.open = true;

    const summary = document.createElement("summary");
    summary.appendChild(
      span({ className: "file-card-filename" }, file.filename),
    );
    summary.appendChild(
      div({ className: "button-group" }, createCopyButton(file.content)),
    );
    details.appendChild(summary);

    // Lazy-render code block on first open
    let rendered = false;
    const renderCode = () => {
      if (rendered) return;
      rendered = true;
      const pre = document.createElement("pre");
      pre.className = "code-display";
      if (maxHeight) {
        pre.style.maxHeight = `${maxHeight}px`;
        pre.style.overflowY = "auto";
      }
      const code = document.createElement("code");
      code.className = `language-${file.language || "markdown"}`;
      code.textContent = file.content;
      pre.appendChild(code);
      if (typeof Prism !== "undefined") Prism.highlightElement(code);
      details.appendChild(pre);
    };

    if (i === openIndex) renderCode();
    else
      details.addEventListener("toggle", () => {
        if (details.open) renderCode();
      });

    panes.push(details);
    card.appendChild(details);
  }

  // Accordion: opening one pane closes others
  for (const pane of panes) {
    pane.addEventListener("toggle", () => {
      if (pane.open) {
        for (const other of panes) {
          if (other !== pane) other.open = false;
        }
      }
    });
  }

  return card;
}
