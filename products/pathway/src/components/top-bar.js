/**
 * Top Bar Component
 *
 * A fixed bar sits across the top of the app. It holds:
 * - Sidebar toggle button (left)
 * - CLI command display with copy button (center)
 *
 * It is similar to Safari's URL bar with a sidebar toggle.
 */

import { getCliCommand } from "../lib/cli-command.js";

/** @type {HTMLElement|null} */
let commandDisplay = null;

/** @type {HTMLButtonElement|null} */
let copyButton = null;

/**
 * Set up the top bar. Wire the toggle and the initial command display.
 * Call this after the DOM is ready.
 */
export function setupTopBar() {
  const app = document.getElementById("app");
  const toggle = document.getElementById("sidebar-toggle");
  const commandEl = document.getElementById("cli-command");
  const copyBtn = document.getElementById("cli-copy");

  commandDisplay = commandEl;
  copyButton = copyBtn;

  if (toggle) {
    toggle.addEventListener("click", () => {
      app.classList.toggle("drawer-open");
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener("click", handleCopy);
  }

  // Intercept history.replaceState so the CLI command updates when a page
  // changes the hash and does not fire hashchange (e.g. agent builder)
  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = (...args) => {
    originalReplaceState(...args);
    updateCommand();
  };

  // Set initial command
  updateCommand();
}

/**
 * Update the CLI command display for the current route.
 * Call on every route change.
 */
export function updateCommand() {
  if (!commandDisplay) return;
  const path = window.location.hash.slice(1) || "/";
  commandDisplay.textContent = getCliCommand(path);
  // Reset copy button state
  if (copyButton) {
    copyButton.setAttribute("aria-label", "Copy command");
    copyButton.classList.remove("copied");
  }
}

/**
 * Copy the current CLI command to the clipboard
 */
async function handleCopy() {
  if (!commandDisplay || !copyButton) return;
  const text = commandDisplay.textContent;

  try {
    await navigator.clipboard.writeText(text);
    copyButton.classList.add("copied");
    copyButton.setAttribute("aria-label", "Copied!");
    setTimeout(() => {
      copyButton.classList.remove("copied");
      copyButton.setAttribute("aria-label", "Copy command");
    }, 2000);
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    copyButton.classList.add("copied");
    setTimeout(() => copyButton.classList.remove("copied"), 2000);
  }
}
