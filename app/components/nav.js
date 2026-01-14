/**
 * Navigation component helpers
 */

import { div, a } from "../lib/render.js";

/**
 * Update the active navigation link
 * @param {string} path - Current path
 */
export function updateActiveNav(path) {
  const links = document.querySelectorAll("#nav-links a");
  links.forEach((link) => {
    const href = link.getAttribute("href").slice(1); // Remove #
    const isActive = path === href || (href !== "/" && path.startsWith(href));
    link.classList.toggle("active", isActive);
  });
}

/**
 * Create a back link
 * @param {string} href - Link destination
 * @param {string} [text='Back'] - Link text
 * @returns {HTMLElement}
 */
export function createBackLink(href, text = "← Back") {
  return a({ href: `#${href}`, className: "back-link" }, text);
}

/**
 * Create breadcrumbs
 * @param {Array<{label: string, href?: string}>} items
 * @returns {HTMLElement}
 */
export function createBreadcrumbs(items) {
  const crumbs = items.map((item, index) => {
    const isLast = index === items.length - 1;
    if (isLast || !item.href) {
      return span({ className: "breadcrumb-item" }, item.label);
    }
    return a(
      { href: `#${item.href}`, className: "breadcrumb-item" },
      item.label,
    );
  });

  const separator = " / ";
  const children = [];
  crumbs.forEach((crumb, i) => {
    children.push(crumb);
    if (i < crumbs.length - 1) {
      children.push(document.createTextNode(separator));
    }
  });

  return div({ className: "breadcrumbs" }, ...children);
}

function span(attrs, text) {
  const el = document.createElement("span");
  if (attrs.className) el.className = attrs.className;
  if (text) el.textContent = text;
  return el;
}
