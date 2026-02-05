import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
import Prism from "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/+esm";
import "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-bash.min.js/+esm";
import "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-javascript.min.js/+esm";
import "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-json.min.js/+esm";
import "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-yaml.min.js/+esm";
import "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-markdown.min.js/+esm";

/**
 * Load Prism theme based on color scheme preference.
 */
function loadPrismTheme() {
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const themeUrl = isDark
    ? "https://cdn.jsdelivr.net/npm/prismjs@1/themes/prism-tomorrow.min.css"
    : "https://cdn.jsdelivr.net/npm/prismjs@1/themes/prism.min.css";

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = themeUrl;
  link.id = "prism-theme";
  document.head.appendChild(link);
}

// Listen for color scheme changes
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    const existingLink = document.getElementById("prism-theme");
    if (existingLink) {
      existingLink.remove();
    }
    loadPrismTheme();
    Prism.highlightAll();
  });

// Load initial theme
loadPrismTheme();

// Highlight all code blocks
Prism.highlightAll();

// Initialize Mermaid if diagrams exist
if (document.querySelector(".language-mermaid")) {
  mermaid.initialize({
    startOnLoad: false,
    theme: "neutral",
  });
  mermaid.run({
    nodes: document.querySelectorAll(".language-mermaid code"),
  });
}
