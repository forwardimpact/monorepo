#!/usr/bin/env node
// Contributor-side guard. Fails when a source file inside a workspace
// package imports a workspace package (`@forwardimpact/*`) that is not
// declared in the importing package's `package.json` (any of
// `dependencies`, `devDependencies`, `peerDependencies`,
// `optionalDependencies`).
//
// The disease: a static `import { … } from "@forwardimpact/<pkg>"` inside
// a published package. The workspace hoist masks the missing declaration
// in `bun install`; `npm install <published>` doesn't, so a fresh adopter
// hits `Cannot find package …` before any package code runs.
//
// Scope: `products/*`, `libraries/*`, `services/*` — every tree listed in
// the workspace globs of the root `package.json`.
//
// Usage: `bun scripts/check-workspace-imports.mjs`

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCOPE_DIRS = ["products", "libraries", "services"];
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

function findPackageDir(filePath, root) {
  // <scope>/<pkg>/... → return absolute path to <scope>/<pkg>.
  const rel = relative(root, filePath);
  const parts = rel.split("/");
  if (!SCOPE_DIRS.includes(parts[0]) || parts.length < 2) return null;
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

function findingsForFile(file, manifest, workspacePackages) {
  let imports;
  try {
    imports = extractWorkspaceImports(file.source, file.path);
  } catch (err) {
    return [
      {
        file: file.path,
        line: 0,
        packageName: `<parse error: ${err.message}>`,
        packageDir: file.packageDir,
      },
    ];
  }
  const declared = declaredDeps(manifest);
  const selfName = manifest.name;
  const out = [];
  for (const imp of imports) {
    const pkg = packageName(imp.spec);
    if (shouldSkip(pkg, selfName, declared, workspacePackages)) continue;
    out.push({
      file: file.path,
      line: imp.line,
      packageName: pkg,
      packageDir: file.packageDir,
    });
  }
  return out;
}

function shouldSkip(pkg, selfName, declared, workspacePackages) {
  // Self-import: Node resolves this via the package's own `exports` field.
  if (pkg === selfName) return true;
  // Non-workspace import: Node's resolver catches it at runtime.
  if (workspacePackages && !workspacePackages.has(pkg)) return true;
  // Declared in some dependency field: nothing to flag.
  return declared.has(pkg);
}

/**
 * Pure check used by both the CLI and the unit test. Inputs are
 * in-memory: no disk access. Returns an array of findings.
 *
 * @param {object} opts
 * @param {{ path: string, source: string, packageDir: string }[]} opts.files
 * @param {Record<string, object>} opts.manifests — keyed by absolute path
 *   to package directory; value is the parsed `package.json`.
 * @param {Set<string>} [opts.workspacePackages] — names of packages that
 *   exist in the workspace. When provided, imports whose package name is
 *   not in this set are ignored (they reference something outside the
 *   workspace and are a different failure mode — Node's resolver catches
 *   them at runtime).
 * @returns {{ file: string, line: number, packageName: string, packageDir: string }[]}
 */
export function findUndeclaredImports({ files, manifests, workspacePackages }) {
  const findings = [];
  for (const file of files) {
    const manifest = manifests[file.packageDir];
    if (!manifest) continue;
    findings.push(...findingsForFile(file, manifest, workspacePackages));
  }
  return findings;
}

function loadManifest(packageDir, manifests) {
  if (manifests[packageDir]) return;
  const pkgPath = join(packageDir, "package.json");
  try {
    manifests[packageDir] = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch (err) {
    console.error(
      `error: cannot read ${relative(ROOT, pkgPath)}: ${err.message}`,
    );
    process.exit(1);
  }
}

function collectInputs() {
  const manifests = {};
  const files = [];
  for (const scope of SCOPE_DIRS) {
    for (const path of collectJsFiles(join(ROOT, scope))) {
      const packageDir = findPackageDir(path, ROOT);
      if (!packageDir) continue;
      loadManifest(packageDir, manifests);
      files.push({ path, source: readFileSync(path, "utf8"), packageDir });
    }
  }
  const workspacePackages = new Set();
  for (const m of Object.values(manifests)) {
    if (typeof m.name === "string") workspacePackages.add(m.name);
  }
  return { manifests, files, workspacePackages };
}

function main() {
  const { manifests, files, workspacePackages } = collectInputs();
  const findings = findUndeclaredImports({
    files,
    manifests,
    workspacePackages,
  });
  if (findings.length === 0) {
    console.log(
      `check-workspace-imports: ok (${files.length} file(s) scanned under ${SCOPE_DIRS.map((s) => `${s}/`).join(", ")})`,
    );
    return;
  }
  for (const f of findings) {
    const file = relative(ROOT, f.file);
    const pkg = relative(ROOT, f.packageDir);
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
