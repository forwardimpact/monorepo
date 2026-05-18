#!/usr/bin/env node
// Spec 1070 — contributor-side guard. Fails when a file under `products/*`
// imports a workspace package (`@forwardimpact/*`) that is not declared in
// the importing product's `package.json` (any of `dependencies`,
// `devDependencies`, `peerDependencies`, `optionalDependencies`).
//
// The disease: a static `import { … } from "@forwardimpact/<pkg>"` inside
// a published product. The workspace hoist masks the missing declaration
// in `bun install`; `npm install <published>` doesn't, so a fresh adopter
// hits `Cannot find package …` before any product code runs.
//
// Scope: `products/*` only. Libraries and services carry the same disease
// today and are deferred to a follow-up spec (see spec 1070).
//
// Usage: `bun scripts/check-workspace-imports.mjs`

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCOPE_DIR = "products";
const SKIP_DIRS = new Set(["node_modules", "dist", "generated", "tmp"]);
const WORKSPACE_PREFIX = "@forwardimpact/";

function collectJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectJsFiles(full));
    } else if (entry.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

function findProductDir(filePath, root) {
  // products/<pkg>/... → return absolute path to products/<pkg>.
  const rel = relative(root, filePath);
  const parts = rel.split("/");
  if (parts[0] !== SCOPE_DIR || parts.length < 2) return null;
  return join(root, parts[0], parts[1]);
}

function extractWorkspaceImports(source, filePath) {
  // Returns [{ spec, line }] for every static/dynamic import of an
  // `@forwardimpact/*` package. The package name is the first two
  // path segments (`@scope/pkg`) — subpath imports collapse to the
  // top-level package name.
  let ast;
  try {
    ast = parse(source, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
      allowAwaitOutsideFunction: true,
    });
  } catch (err) {
    throw new Error(`failed to parse ${filePath}: ${err.message}`);
  }
  const found = [];
  walkAst(ast, (node) => {
    const finding = extractImportFromNode(node);
    if (finding) found.push(finding);
  });
  return found;
}

const STATIC_IMPORT_TYPES = new Set([
  "ImportDeclaration",
  "ExportNamedDeclaration",
  "ExportAllDeclaration",
]);

function extractImportFromNode(node) {
  // Static `import … from "X"` and `export … from "X"`.
  if (
    STATIC_IMPORT_TYPES.has(node.type) &&
    node.source &&
    typeof node.source.value === "string" &&
    node.source.value.startsWith(WORKSPACE_PREFIX)
  ) {
    return { spec: node.source.value, line: node.source.loc.start.line };
  }
  // Dynamic `import("X")`.
  if (
    node.type === "ImportExpression" &&
    node.source &&
    node.source.type === "Literal" &&
    typeof node.source.value === "string" &&
    node.source.value.startsWith(WORKSPACE_PREFIX)
  ) {
    return { spec: node.source.value, line: node.source.loc.start.line };
  }
  return null;
}

function walkAst(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walkAst(child, visit);
    return;
  }
  if (typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    walkAst(node[key], visit);
  }
}

function packageName(spec) {
  // "@forwardimpact/libconfig/sub" → "@forwardimpact/libconfig"
  const parts = spec.split("/");
  return parts.slice(0, 2).join("/");
}

function declaredDeps(manifest) {
  const out = new Set();
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    const block = manifest[field];
    if (!block) continue;
    for (const key of Object.keys(block)) out.add(key);
  }
  return out;
}

/**
 * Pure check used by both the CLI and the unit test. Inputs are
 * in-memory: no disk access. Returns an array of findings.
 *
 * @param {object} opts
 * @param {{ path: string, source: string, productDir: string }[]} opts.files
 * @param {Record<string, object>} opts.manifests — keyed by absolute path
 *   to product directory; value is the parsed `package.json`.
 * @returns {{ file: string, line: number, packageName: string, productDir: string }[]}
 */
export function findUndeclaredImports({ files, manifests }) {
  const findings = [];
  for (const file of files) {
    const manifest = manifests[file.productDir];
    if (!manifest) continue;
    const declared = declaredDeps(manifest);
    const selfName = manifest.name;
    let imports;
    try {
      imports = extractWorkspaceImports(file.source, file.path);
    } catch (err) {
      findings.push({
        file: file.path,
        line: 0,
        packageName: `<parse error: ${err.message}>`,
        productDir: file.productDir,
      });
      continue;
    }
    for (const imp of imports) {
      const pkg = packageName(imp.spec);
      // Self-import: Node resolves this via the package's own `exports`
      // field. It is not a missing-dependency.
      if (pkg === selfName) continue;
      if (!declared.has(pkg)) {
        findings.push({
          file: file.path,
          line: imp.line,
          packageName: pkg,
          productDir: file.productDir,
        });
      }
    }
  }
  return findings;
}

function main() {
  const scopeRoot = join(ROOT, SCOPE_DIR);
  const allFiles = collectJsFiles(scopeRoot);
  const manifests = {};
  const files = [];
  for (const path of allFiles) {
    const productDir = findProductDir(path, ROOT);
    if (!productDir) continue;
    if (!manifests[productDir]) {
      const pkgPath = join(productDir, "package.json");
      try {
        manifests[productDir] = JSON.parse(readFileSync(pkgPath, "utf8"));
      } catch (err) {
        console.error(
          `error: cannot read ${relative(ROOT, pkgPath)}: ${err.message}`,
        );
        process.exit(1);
      }
    }
    files.push({ path, source: readFileSync(path, "utf8"), productDir });
  }

  const findings = findUndeclaredImports({ files, manifests });
  if (findings.length === 0) {
    console.log(
      `check-workspace-imports: ok (${files.length} file(s) scanned under ${SCOPE_DIR}/)`,
    );
    return;
  }
  for (const f of findings) {
    const file = relative(ROOT, f.file);
    const pkg = relative(ROOT, f.productDir);
    console.error(
      `${file}:${f.line}: imports "${f.packageName}" but it is not declared in ${pkg}/package.json`,
    );
  }
  console.error(
    `check-workspace-imports: ${findings.length} undeclared workspace import(s)`,
  );
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
