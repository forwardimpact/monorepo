import { NodeFilter } from "linkedom";

/**
 * Pattern definitions for text-node sanitation.
 */
export const SANITIZE_PATTERNS = [
  {
    name: "angle-number-encode",
    test: /[<>]\d/,
    replace: [
      [/<(\d)/g, "&lt;$1"],
      [/>((?:\d))/g, "&gt;$1"],
    ],
  },
  {
    name: "standalone-less-than-percent",
    test: /<\d+%/,
    replace: [[/<(\d+%)/g, "&lt;$1"]],
  },
  {
    name: "double-space-normalize",
    test: / {2,}/,
    replace: [[/ {2,}/g, " "]],
  },
  {
    name: "stray-ampersand-encode",
    test: /&(?![a-zA-Z0-9#]+;)/,
    replace: [[/&(?![a-zA-Z0-9#]+;)/g, "&amp;"]],
  },
  {
    name: "smart-quotes-normalize",
    test: /[“”‘’]/,
    replace: [
      [/“/g, '"'],
      [/”/g, '"'],
      [/‘/g, "'"],
      [/’/g, "'"],
    ],
  },
  {
    name: "nbsp-normalize",
    test: /\u00A0/,
    replace: [[/\u00A0/g, " "]],
  },
];

/**
 * Apply all matching patterns to a text value, returning the transformed value.
 * @param {string} value - The text value to sanitize
 * @param {Array} patterns - Pattern definitions
 * @returns {string} The sanitized text value
 */
function applyPatterns(value, patterns) {
  let result = value;
  for (const pattern of patterns) {
    if (!pattern.test.test(result)) continue;
    for (const [rx, replacement] of pattern.replace) {
      result = result.replace(rx, replacement);
    }
  }
  return result;
}

/**
 * Sanitize a parsed document in-place.
 * @param {import('linkedom').Document} document - Document to mutate
 * @param {Array} patterns - Pattern definitions (defaults to SANITIZE_PATTERNS)
 * @returns {import('linkedom').Document} The mutated document
 */
export function sanitizeDom(document, patterns = SANITIZE_PATTERNS) {
  try {
    const root = document.body || document;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const original = node.nodeValue;
      if (!original) continue;
      const value = applyPatterns(original, patterns);
      if (value !== original) node.nodeValue = value;
    }
  } catch {
    // Ignore sanitizer errors to avoid disrupting processing
  }
  return document;
}
