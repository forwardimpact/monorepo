/**
 * Command Prompt Component
 *
 * Reusable terminal-style command display with copy button.
 * Shows a `$` prompt, monospace command text, and a copy-to-clipboard button.
 */

import { div, span, button } from "../lib/render.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Create the copy icon SVG (two overlapping rectangles)
 * @returns {SVGSVGElement}
 */
function createCopyIcon() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");

  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", "9");
  rect.setAttribute("y", "9");
  rect.setAttribute("width", "13");
  rect.setAttribute("height", "13");
  rect.setAttribute("rx", "2");

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute(
    "d",
    "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  );

  svg.appendChild(rect);
  svg.appendChild(path);
  return svg;
}

/**
 * Copy text to clipboard with fallback for older browsers
 * @param {string} text
 * @param {HTMLButtonElement} btn
 */
async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  btn.classList.add("copied");
  btn.setAttribute("aria-label", "Copied!");
  setTimeout(() => {
    btn.classList.remove("copied");
    btn.setAttribute("aria-label", "Copy command");
  }, 2000);
}

/**
 * Create a command prompt element with copy button
 * @param {string} command - The command text to display
 * @returns {HTMLElement}
 */
export function createCommandPrompt(command) {
  const copyBtn = button({
    className: "command-prompt__copy",
    "aria-label": "Copy command",
    type: "button",
  });
  copyBtn.appendChild(createCopyIcon());
  copyBtn.addEventListener("click", () => copyToClipboard(command, copyBtn));

  return div(
    { className: "command-prompt" },
    span({ className: "command-prompt__prompt" }, "$"),
    span({ className: "command-prompt__text" }, command),
    copyBtn,
  );
}
