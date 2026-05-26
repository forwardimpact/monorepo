/**
 * Enforces that no newly introduced handler uses the legacy parameter shapes:
 * - ({ data, args, options }) — CLI-side legacy (any superset of all three keys)
 * - (params) — web-side legacy (single identifier named "params")
 *
 * Replaces an earlier ESLint rule (Biome lacks custom AST rules). This test
 * achieves the same enforcement — it runs during `bun run test` which gates
 * every commit.
 *
 * Scope: libraries/libui/, libraries/libcli/. products/pathway/ is added once
 * its migration completes.
 */
import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "acorn";

const SCOPED_DIRS = ["libraries/libui/src", "libraries/libcli/src"];

const ALLOWED_FILES = new Set([
  "libraries/libui/src/invocation-context.js",
  "libraries/libcli/src/invocation-context.js",
]);

const LEGACY_KEYS = new Set(["data", "args", "options"]);

function collectJsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...collectJsFiles(full));
    } else if (entry.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

function getFirstParam(node) {
  let fn = null;
  if (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  ) {
    fn = node;
  }
  if (!fn || fn.params.length === 0) return null;
  return fn.params[0];
}

function isLegacyDestructured(param) {
  if (param.type !== "ObjectPattern") return false;
  const names = new Set(
    param.properties
      .filter((p) => p.type === "Property" && p.key.type === "Identifier")
      .map((p) => p.key.name),
  );
  for (const key of LEGACY_KEYS) {
    if (!names.has(key)) return false;
  }
  return true;
}

function isLegacyParams(param) {
  return param.type === "Identifier" && param.name === "params";
}

function isAstNode(v) {
  return v && typeof v === "object" && typeof v.type === "string";
}

function astChildren(node) {
  const out = [];
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (isAstNode(item)) out.push(item);
      }
    } else if (isAstNode(child)) {
      out.push(child);
    }
  }
  return out;
}

function walkAst(node, visitor) {
  if (!isAstNode(node)) return;
  visitor(node);
  for (const child of astChildren(node)) {
    walkAst(child, visitor);
  }
}

function findViolations(filePath) {
  const source = readFileSync(filePath, "utf-8");
  const ast = parse(source, {
    ecmaVersion: "latest",
    sourceType: "module",
    locations: true,
  });

  const violations = [];
  walkAst(ast, (node) => {
    const param = getFirstParam(node);
    if (!param) return;
    if (isLegacyDestructured(param)) {
      violations.push({
        line: param.loc.start.line,
        kind: "destructured { data, args, options }",
      });
    }
    if (isLegacyParams(param)) {
      violations.push({
        line: param.loc.start.line,
        kind: 'identifier named "params"',
      });
    }
  });
  return violations;
}

describe("no-legacy-handler-shape", () => {
  for (const dir of SCOPED_DIRS) {
    const files = collectJsFiles(dir);
    for (const file of files) {
      const rel = relative(".", file);
      if (ALLOWED_FILES.has(rel)) continue;
      test(`${rel} has no legacy handler shapes`, () => {
        const violations = findViolations(file);
        assert.strictEqual(
          violations.length,
          0,
          `Legacy handler shape(s) found in ${rel}:\n` +
            violations.map((v) => `  line ${v.line}: ${v.kind}`).join("\n"),
        );
      });
    }
  }
});
