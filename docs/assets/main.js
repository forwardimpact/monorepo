import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
import Prism from "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/+esm";
import "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-bash.min.js/+esm";
import "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-javascript.min.js/+esm";
import "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-json.min.js/+esm";
import "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-yaml.min.js/+esm";
import "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-markdown.min.js/+esm";

/* ── Theme Management ──────────────────────────────────────────── */

const STORAGE_KEY = "fi-theme";

/** Resolve the effective theme (light or dark). */
function resolveTheme() {
  const setting = document.documentElement.getAttribute("data-theme");
  if (setting === "dark" || setting === "light") return setting;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Apply resolved theme to data attribute. */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-resolved", theme);
}

/** Toggle between light and dark. */
function toggleTheme() {
  const next = resolveTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(STORAGE_KEY, next);
}

// Restore saved theme, or use system preference
const savedTheme = localStorage.getItem(STORAGE_KEY);
applyTheme(
  savedTheme ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"),
);

// Wire up theme toggle button
const toggleBtn = document.querySelector(".theme-toggle");
if (toggleBtn) {
  toggleBtn.addEventListener("click", toggleTheme);
}

// Follow system changes only if no saved preference
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", (e) => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      applyTheme(e.matches ? "dark" : "light");
      reloadPrismTheme();
    }
  });

/* ── Prism Theme ───────────────────────────────────────────────── */

function loadPrismTheme() {
  const resolved = resolveTheme();
  const themeUrl =
    resolved === "dark"
      ? "https://cdn.jsdelivr.net/npm/prismjs@1/themes/prism-tomorrow.min.css"
      : "https://cdn.jsdelivr.net/npm/prismjs@1/themes/prism.min.css";

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = themeUrl;
  link.id = "prism-theme";
  document.head.appendChild(link);
}

function reloadPrismTheme() {
  const existing = document.getElementById("prism-theme");
  if (existing) existing.remove();
  loadPrismTheme();
  Prism.highlightAll();
}

// Initial theme load
loadPrismTheme();
Prism.highlightAll();

// Re-load Prism theme when theme toggles
if (toggleBtn) {
  toggleBtn.addEventListener("click", () => {
    setTimeout(reloadPrismTheme, 50);
  });
}

/* ── Mermaid ───────────────────────────────────────────────────── */

if (document.querySelector(".language-mermaid")) {
  mermaid.initialize({
    startOnLoad: false,
    theme: "neutral",
  });
  mermaid.run({
    nodes: document.querySelectorAll(".language-mermaid code"),
  });
}

/* ── Scene: Hide on non-home pages ─────────────────────────────── */

const scene = document.querySelector(".scene");
if (scene) {
  const isHome =
    window.location.pathname === "/" ||
    window.location.pathname === "/index.html";
  if (!isHome) {
    scene.style.height = "180px";
  }
}

/* ── Header scroll effect ──────────────────────────────────────── */

let ticking = false;
window.addEventListener("scroll", () => {
  if (!ticking) {
    requestAnimationFrame(() => {
      const header = document.querySelector("header");
      if (header) {
        header.classList.toggle("scrolled", window.scrollY > 20);
      }
      ticking = false;
    });
    ticking = true;
  }
});
