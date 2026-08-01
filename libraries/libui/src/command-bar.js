/**
 * Command bar component — subscribes to a bound router's activeRoute.
 * The bar displays the CLI equivalent of the current route.
 */

/**
 * @param {import('./bound-router.js').BoundRouter} router
 * @param {{ mountInto: HTMLElement }} options
 * @returns {{ destroy: () => void }}
 */
export function createCommandBar(router, { mountInto }) {
  const root = document.createElement("div");
  root.className = "command-bar";

  const commandEl = document.createElement("span");
  commandEl.className = "command-bar__command";

  const copyButton = document.createElement("button");
  copyButton.className = "command-bar__copy";
  copyButton.setAttribute("aria-label", "Copy command");
  copyButton.disabled = true;

  root.appendChild(commandEl);
  root.appendChild(copyButton);
  mountInto.appendChild(root);

  function applyEntry(entry) {
    const text = entry?.descriptor.cli ? entry.descriptor.cli(entry.ctx) : "";
    commandEl.textContent = text;
    copyButton.disabled = text === "";
  }

  applyEntry(router.activeRoute.get());
  const unsubscribe = router.activeRoute.subscribe(applyEntry);

  async function handleCopy() {
    const text = commandEl.textContent;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      copyButton.classList.add("copied");
      copyButton.setAttribute("aria-label", "Copied!");
      setTimeout(() => {
        copyButton.classList.remove("copied");
        copyButton.setAttribute("aria-label", "Copy command");
      }, 2000);
    } catch {
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

  copyButton.addEventListener("click", handleCopy);

  return {
    destroy() {
      unsubscribe();
      copyButton.removeEventListener("click", handleCopy);
      mountInto.removeChild(root);
    },
  };
}
