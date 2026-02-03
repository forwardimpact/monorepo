/**
 * DOM rendering utilities
 */

import {
  SKILL_LEVEL_ORDER,
  BEHAVIOUR_MATURITY_ORDER,
} from "../model/levels.js";

/**
 * Get the main content container
 * @returns {HTMLElement}
 */
export function getContainer() {
  return document.getElementById("app-content");
}

/**
 * Clear and render content to the main container
 * @param {HTMLElement|string} content
 */
export function render(content) {
  const container = getContainer();
  container.innerHTML = "";

  if (typeof content === "string") {
    container.innerHTML = content;
  } else if (content instanceof HTMLElement) {
    container.appendChild(content);
  }
}

/**
 * Create an element with attributes and children
 * @param {string} tag - HTML tag name
 * @param {Object} [attrs] - Attributes and properties
 * @param {...(HTMLElement|string)} children - Child elements or text
 * @returns {HTMLElement}
 */
export function createElement(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (key === "className") {
      element.className = value;
    } else if (key === "style" && typeof value === "object") {
      Object.assign(element.style, value);
    } else if (key.startsWith("on") && typeof value === "function") {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "dataset" && typeof value === "object") {
      Object.assign(element.dataset, value);
    } else if (typeof value === "boolean") {
      // Handle boolean attributes - only set if true, skip if false
      if (value) {
        element.setAttribute(key, "");
      }
    } else {
      element.setAttribute(key, value);
    }
  }

  for (const child of children) {
    if (child == null || child === false) continue;
    if (typeof child === "string" || typeof child === "number") {
      element.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof HTMLElement) {
      element.appendChild(child);
    } else if (Array.isArray(child)) {
      child.forEach((c) => {
        if (c == null || c === false) return;
        if (c instanceof HTMLElement) {
          element.appendChild(c);
        } else if (typeof c === "string" || typeof c === "number") {
          element.appendChild(document.createTextNode(String(c)));
        }
      });
    }
  }

  return element;
}

// Shorthand element creators
export const div = (attrs, ...children) =>
  createElement("div", attrs, ...children);
export const span = (attrs, ...children) =>
  createElement("span", attrs, ...children);
export const h1 = (attrs, ...children) =>
  createElement("h1", attrs, ...children);
export const h2 = (attrs, ...children) =>
  createElement("h2", attrs, ...children);
export const h3 = (attrs, ...children) =>
  createElement("h3", attrs, ...children);
export const h4 = (attrs, ...children) =>
  createElement("h4", attrs, ...children);
export const p = (attrs, ...children) => createElement("p", attrs, ...children);
export const a = (attrs, ...children) => createElement("a", attrs, ...children);
export const ul = (attrs, ...children) =>
  createElement("ul", attrs, ...children);
export const li = (attrs, ...children) =>
  createElement("li", attrs, ...children);
export const table = (attrs, ...children) =>
  createElement("table", attrs, ...children);
export const thead = (attrs, ...children) =>
  createElement("thead", attrs, ...children);
export const tbody = (attrs, ...children) =>
  createElement("tbody", attrs, ...children);
export const tr = (attrs, ...children) =>
  createElement("tr", attrs, ...children);
export const th = (attrs, ...children) =>
  createElement("th", attrs, ...children);
export const td = (attrs, ...children) =>
  createElement("td", attrs, ...children);
export const pre = (attrs, ...children) =>
  createElement("pre", attrs, ...children);
export const code = (attrs, ...children) =>
  createElement("code", attrs, ...children);
export const button = (attrs, ...children) =>
  createElement("button", attrs, ...children);
export const input = (attrs) => createElement("input", attrs);
export const select = (attrs, ...children) =>
  createElement("select", attrs, ...children);
export const option = (attrs, ...children) =>
  createElement("option", attrs, ...children);
export const optgroup = (attrs, ...children) =>
  createElement("optgroup", attrs, ...children);
export const label = (attrs, ...children) =>
  createElement("label", attrs, ...children);
export const form = (attrs, ...children) =>
  createElement("form", attrs, ...children);
export const section = (attrs, ...children) =>
  createElement("section", attrs, ...children);
export const article = (attrs, ...children) =>
  createElement("article", attrs, ...children);
export const header = (attrs, ...children) =>
  createElement("header", attrs, ...children);
export const footer = (attrs, ...children) =>
  createElement("footer", attrs, ...children);
export const nav = (attrs, ...children) =>
  createElement("nav", attrs, ...children);
export const main = (attrs, ...children) =>
  createElement("main", attrs, ...children);
export const details = (attrs, ...children) =>
  createElement("details", attrs, ...children);
export const summary = (attrs, ...children) =>
  createElement("summary", attrs, ...children);

/**
 * Semantic heading aliases that match heading levels
 * Use these instead of h1/h2/h3 for clarity in slides and formatters
 */
export const heading1 = h1;
export const heading2 = h2;
export const heading3 = h3;

/**
 * Create a fragment from multiple elements
 * @param {...HTMLElement} children
 * @returns {DocumentFragment}
 */
export function fragment(...children) {
  const frag = document.createDocumentFragment();
  children.forEach((child) => {
    if (child instanceof HTMLElement) {
      frag.appendChild(child);
    }
  });
  return frag;
}

/**
 * Show a loading state
 */
export function showLoading() {
  render(
    div(
      { className: "loading" },
      div({ className: "loading-spinner" }),
      p({}, "Loading..."),
    ),
  );
}

/**
 * Show an error message
 * @param {string} message
 */
export function showError(message) {
  render(div({ className: "error-message" }, h2({}, "Error"), p({}, message)));
}

/**
 * Format a skill level or behaviour maturity for display
 * Handles both snake_case and camelCase
 * @param {string} value - The level/maturity value
 * @returns {string}
 */
export function formatLevel(value) {
  if (!value) return "";
  // Insert space before uppercase letters (for camelCase), then handle snake_case
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Get the index for a skill level (1-5)
 * @param {string} level
 * @returns {number}
 */
export function getSkillLevelIndex(level) {
  return SKILL_LEVEL_ORDER.indexOf(level) + 1;
}

/**
 * Get the index for a behaviour maturity (1-5)
 * @param {string} maturity
 * @returns {number}
 */
export function getBehaviourMaturityIndex(maturity) {
  return BEHAVIOUR_MATURITY_ORDER.indexOf(maturity) + 1;
}
