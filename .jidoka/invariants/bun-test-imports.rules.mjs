// Invariant: enforce the bun:test universal-subset allowlist.
//
// In *.test.js files, you may import only the named symbols on the
// allowlist from "bun:test". This check rejects default, namespace, and
// side-effect imports, and every re-export shape. In every other file under
// the scope set (non-test source), this check rejects all bun:test imports
// and re-exports. That keeps libmock/libpack source decoupled from the
// runner. The full allowlist policy is the canonical bun:test allowlist
// specification under specs/.
//
// acorn parses each file into an AST. The verdict can then distinguish the
// imported name from a local alias. It can also tell apart the six
// import/export shapes the allowlist policy enumerates. This module exports
// the pure verdict function `bunTestFindings` so a regression test can
// exercise it directly.

import { parse as acornParse } from "acorn";

// The roots that `bun test` runs from (verified against package.json
// scripts.test), plus websites/ as preemptive coverage.
const SCAN_DIRS = [
  "libraries",
  "services",
  "products",
  "tests",
  "websites",
  ".github/workflows/test",
  ".claude/skills/kata-interview/test",
];
const SKIP_DIRS = ["node_modules", "dist", "generated", "tmp"];

// Minimal acorn parse. A regression test drives the exported pure function
// `bunTestFindings` directly, outside the invariant engine. So this module
// carries its own parser rather than the injected kit's.
function parseModule(source, filePath, { locations = false } = {}) {
  try {
    return acornParse(source, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations,
      allowAwaitOutsideFunction: true,
    });
  } catch (err) {
    throw new Error(`failed to parse ${filePath}: ${err.message}`);
  }
}
// JS source/module extensions acorn parses as ES modules. The source-file
// ban covers every non-test file under scope. acorn cannot parse
// .ts/.mts/.cts TypeScript files, so they sit outside this guard's surface
// (a TypeScript test extension is a named follow-up in the allowlist
// specification). Only .test.js counts as a test file. Every other
// extension here is non-test source.
const SOURCE_EXTS = [".js", ".mjs", ".cjs"];

// The universal-subset allowlist: the cross-runner test symbols (describe,
// test, expect, lifecycle hooks) plus two forward-compat aliases (`it`,
// `beforeAll`). Import them as named imports from "bun:test" in *.test.js
// files only.
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
  "not on the bun:test allowlist — see the bun:test allowlist policy";

// Per-symbol replacement pointers for banned symbols. Any off-allowlist
// symbol not listed here falls back to ALLOWLIST_REF.
export const SYMBOL_POINTER = new Map([
  ["mock", "use libmock spy() instead of bun:test mock"],
  ["spyOn", "use libmock spy() instead of bun:test spyOn"],
  ["setSystemTime", "do not manipulate bun timers. Use real time"],
  ["useFakeTimers", "do not manipulate bun timers. Use real time"],
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
      // ImportSpecifier — the verdict uses the imported name. It ignores
      // the local alias.
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

// Verdict for one `export ... from "bun:test"` declaration. This check
// bans it in every file, whatever isTestFile holds.
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
 * @param {string} [filePath] - The path that parse-error messages name.
 * @returns {Array<{line: number, kind: "symbol"|"shape", name: string, pointer: string}>}
 *   One record per rejection. Empty when clean.
 */
export function bunTestFindings(text, isTestFile, filePath = "<source>") {
  let ast;
  try {
    ast = parseModule(text, filePath, { locations: true });
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

export default {
  name: "bun-test-imports",

  build({ scan }) {
    const subjects = scan({
      dirs: SCAN_DIRS,
      skip: SKIP_DIRS,
      match: (name) => SOURCE_EXTS.some((e) => name.endsWith(e)),
    }).map(({ path, text }) => ({ path, text }));
    return { subjects: { "scoped-file": subjects } };
  },

  rules: [
    {
      id: "bun-test.import-allowlist",
      scope: "scoped-file",
      severity: "fail",
      check: (s) => {
        const isTestFile = s.path.endsWith(".test.js");
        const findings = bunTestFindings(s.text, isTestFile, s.path);
        return findings.length === 0
          ? null
          : findings.map((f) => ({ ...f, lineNo: f.line }));
      },
      message: (_s, f) =>
        `bun:test ${f.kind} "${f.name}" is not permitted here — ${f.pointer}`,
      hint: "import only the allowlisted named symbols from bun:test in *.test.js files. Non-test source must not import bun:test at all",
    },
  ],
};
