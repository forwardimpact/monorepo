// Shared acorn helpers for the AST-based invariant rule modules.

import { parse } from "acorn";

/**
 * Parse an ES module, wrapping acorn's error with the offending path.
 *
 * @param {string} source - Module source text.
 * @param {string} filePath - Path used in parse-error messages.
 * @param {{ locations?: boolean }} [options]
 * @returns {object} The acorn AST.
 */
export function parseModule(source, filePath, { locations = false } = {}) {
  try {
    return parse(source, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations,
      allowAwaitOutsideFunction: true,
    });
  } catch (err) {
    throw new Error(`failed to parse ${filePath}: ${err.message}`);
  }
}

/**
 * Depth-first visit of every typed node in an acorn AST.
 *
 * @param {object|object[]} node - AST node (or array of nodes).
 * @param {(node: object) => void} visit - Called once per typed node.
 */
export function walkAst(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walkAst(child, visit);
    return;
  }
  if (typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end") continue;
    walkAst(node[key], visit);
  }
}
