// Invariant: enforce the bun:test universal-subset allowlist.
//
// In *.test.js files, only the named symbols on the allowlist may be imported
// from "bun:test"; default/namespace/side-effect imports and every re-export
// shape are rejected. In every other file under the scope set (non-test
// source), all bun:test imports and re-exports are rejected — this keeps
// libmock/libpack source decoupled from the runner. Policy:
// CONTRIBUTING.md § Invariants.
//
// Detection is AST-based via acorn so the verdict can distinguish the imported
// name from a local alias and tell apart the six import/export shapes the
// allowlist policy enumerates. The pure verdict function `bunTestFindings` is
// exported so a regression test can exercise it directly.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseModule } from "./lib/ast.mjs";
import { collectFiles } from "./lib/walk.mjs";

// The bun test invocation roots (verified against package.json scripts.test)
// plus websites/ as preemptive coverage. See CONTRIBUTING.md § Invariants.
const SCAN_DIRS = [
  "libraries",
  "services",
  "products",
  "tests",
  "websites",
  ".github/workflows/test",
  ".claude/skills/kata-interview/test",
];
const SKIP_DIRS = new Set(["node_modules", "dist", "generated", "tmp"]);
// JS source/module extensions acorn parses as ES modules. The source-file ban
// covers every non-test file under scope; .ts/.mts/.cts are TypeScript that
// acorn cannot parse and are out of this guard's surface (a TypeScript test
// extension is the named follow-up in CONTRIBUTING.md § Invariants). Only
// .test.js counts as a test file; every other extension here is non-test source.
const SOURCE_EXTS = [".js", ".mjs", ".cjs"];

// The universal-subset allowlist: the cross-runner test symbols (describe,
// test, expect, lifecycle hooks) plus two forward-compat aliases (`it`,
// `beforeAll`). Permitted as named imports from "bun:test" in *.test.js files
// only.
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
 * @param {string} [filePath] - Path used in parse-error messages.
 * @returns {Array<{line: number, kind: "symbol"|"shape", name: string, pointer: string}>}
 *   One record per rejection; empty when clean.
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

  build({ root }) {
    const subjects = [];
    for (const dir of SCAN_DIRS) {
      const files = collectFiles(join(root, dir), {
        skip: SKIP_DIRS,
        match: (name) => SOURCE_EXTS.some((e) => name.endsWith(e)),
      });
      for (const path of files) {
        subjects.push({ path, text: readFileSync(path, "utf8") });
      }
    }
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
      hint: "import only the allowlisted named symbols from bun:test in *.test.js files; non-test source must not import bun:test at all",
    },
  ],
};
