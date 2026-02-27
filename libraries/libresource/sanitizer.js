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
    test: /  +/,
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
 * Sanitize an existing JSDOM instance in-place.
 * @param {import('jsdom').JSDOM} dom - DOM to mutate
 * @param {Array} patterns - Pattern definitions (defaults to SANITIZE_PATTERNS)
 * @returns {import('jsdom').JSDOM} The mutated DOM instance
 */
export function sanitizeDom(dom, patterns = SANITIZE_PATTERNS) {
  try {
    const { document } = dom.window;
    const root = document.body || document;
    const walker = document.createTreeWalker(
      root,
      dom.window.NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const original = node.nodeValue;
      if (!original) continue;
      let value = original;
      let changed = false;
      for (const pattern of patterns) {
        if (!pattern.test.test(value)) continue;
        for (const [rx, replacement] of pattern.replace) {
          const next = value.replace(rx, replacement);
          if (next !== value) {
            value = next;
            changed = true;
          }
        }
      }
      if (changed && value !== original) node.nodeValue = value;
    }
  } catch {
    // Ignore sanitizer errors to avoid disrupting processing
  }
  return dom;
}
