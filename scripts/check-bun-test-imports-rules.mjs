// Pure detection rules for the bun:test universal-subset allowlist guard,
// extracted so a regression test can exercise them without running the
// file-walking script. AST-based via acorn so the verdict can distinguish the
// imported name from a local alias and tell apart the six import/export shapes
// the allowlist policy enumerates. Policy: CONTRIBUTING.md § Invariants.

import { parse } from "acorn";

// The universal-subset allowlist: the cross-runner test symbols (describe,
// test, expect, lifecycle hooks) plus two forward-compat aliases (`it`,
// `beforeAll`). Permitted as named imports from "bun:test" in *.test.js files
// only. See CONTRIBUTING.md § Invariants.
export const ALLOWLIST = new Set([
  "describe",
  "test",
  "it",
  "expect",
  "beforeAll",
  "beforeEach",
  "afterEach",
  "afterAll",
]);

// Reference carried on every rejection that has no more specific pointer.
const ALLOWLIST_REF =
  "not on the bun:test allowlist — see CONTRIBUTING.md § Invariants";

// Per-symbol replacement pointers for banned symbols. Any off-allowlist
// symbol not listed here falls back to ALLOWLIST_REF.
export const SYMBOL_POINTER = new Map([
  ["mock", "use libmock spy() instead of bun:test mock"],
  ["spyOn", "use libmock spy() instead of bun:test spyOn"],
  ["setSystemTime", "bun timer manipulation is banned — use real time"],
  ["useFakeTimers", "bun timer manipulation is banned — use real time"],
]);

const shape = (line, name) => ({
  line,
  kind: "shape",
  name,
  pointer: ALLOWLIST_REF,
});

// Verdict for one `import ... from "bun:test"` declaration.
function importFindings(node, line, isTestFile) {
  if (node.specifiers.length === 0) return [shape(line, "side-effect")];
  const out = [];
  for (const spec of node.specifiers) {
    if (spec.type === "ImportDefaultSpecifier") {
      out.push(shape(line, "default"));
    } else if (spec.type === "ImportNamespaceSpecifier") {
      out.push(shape(line, "namespace"));
    } else {
      // ImportSpecifier — verdict on the imported name, not the local alias.
      const imported = spec.imported.name;
      if (isTestFile && ALLOWLIST.has(imported)) continue;
      out.push({
        line,
        kind: "symbol",
        name: imported,
        pointer: SYMBOL_POINTER.get(imported) ?? ALLOWLIST_REF,
      });
    }
  }
  return out;
}

// Verdict for one `export ... from "bun:test"` declaration (banned in every
// file regardless of isTestFile).
function reExportFindings(node, line) {
  if (node.type === "ExportAllDeclaration") {
    return [shape(line, "re-export-namespace")];
  }
  const isDefaultAs = node.specifiers.some((s) => s.local.name === "default");
  return [
    shape(line, isDefaultAs ? "re-export-default-as" : "re-export-named"),
  ];
}

/**
 * Detect bun:test import/export violations in a single file's source text.
 * @param {string} text - The file contents.
 * @param {boolean} isTestFile - True when the path matches `**\/*.test.js`.
 * @returns {Array<{line: number, kind: "symbol"|"shape", name: string, pointer: string}>}
 *   One record per rejection; empty when clean.
 */
export function bunTestFindings(text, isTestFile) {
  let ast;
  try {
    ast = parse(text, {
      sourceType: "module",
      ecmaVersion: "latest",
      locations: true,
    });
  } catch {
    return [
      {
        line: 1,
        kind: "shape",
        name: "parse-error",
        pointer: "file is not a parseable ES module",
      },
    ];
  }

  const findings = [];
  for (const node of ast.body) {
    if (node.source?.value !== "bun:test") continue;
    const line = node.loc.start.line;
    if (node.type === "ImportDeclaration") {
      findings.push(...importFindings(node, line, isTestFile));
    } else if (
      node.type === "ExportNamedDeclaration" ||
      node.type === "ExportAllDeclaration"
    ) {
      findings.push(...reExportFindings(node, line));
    }
  }

  return findings;
}
