import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
import Prism from "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/+esm";
import "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-bash.min.js/+esm";
import "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-javascript.min.js/+esm";
import "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-json.min.js/+esm";
import "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-yaml.min.js/+esm";
import "https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-markdown.min.js/+esm";

/* ── Prism Theme ───────────────────────────────────────────────── */

function loadPrismTheme() {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://cdn.jsdelivr.net/npm/prismjs@1/themes/prism-tomorrow.min.css";
  link.id = "prism-theme";
  document.head.appendChild(link);
}

loadPrismTheme();
Prism.highlightAll();

/* ── Mermaid ───────────────────────────────────────────────────── */

if (document.querySelector(".language-mermaid")) {
  mermaid.initialize({
    startOnLoad: false,
    theme: "neutral",
    themeVariables: {
      fontFamily: '"DM Sans", sans-serif',
      fontSize: "14px",
    },
  });
  mermaid.run({
    nodes: document.querySelectorAll(".language-mermaid code"),
  });
}

/* ── Header Scroll Effect ──────────────────────────────────────── */

let ticking = false;
window.addEventListener("scroll", () => {
  if (!ticking) {
    requestAnimationFrame(() => {
      const header = document.querySelector(".site-header");
      if (header) {
        header.classList.toggle("scrolled", window.scrollY > 20);
      }
      ticking = false;
    });
    ticking = true;
  }
});

/* ── Mobile Navigation Toggle ──────────────────────────────────── */

const navToggle = document.querySelector(".nav-toggle");
if (navToggle) {
  navToggle.addEventListener("click", () => {
    const header = document.querySelector(".site-header");
    const isOpen = header.classList.toggle("menu-open");
    document.body.classList.toggle("menu-open", isOpen);
  });
}

/* ── Active Nav Highlighting ───────────────────────────────────── */

const path = window.location.pathname;
document.querySelectorAll(".nav-products a").forEach((link) => {
  const href = link.getAttribute("href");
  if (path.startsWith(href)) {
    link.classList.add("active");
  }
});

/* ── Scroll Reveal ─────────────────────────────────────────────── */

const reveals = document.querySelectorAll(".reveal");
if (reveals.length > 0) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 },
  );

  reveals.forEach((el) => observer.observe(el));
}
