#!/usr/bin/env node
// Invariant: no module under libraries/products/services constructs a leaf
// collaborator itself — `new Finder(...)`, `createDefaultProc(...)`,
// `createDefaultClock(...)`, or `createDefaultSubprocess(...)`. Every consumer
// receives those off the injected `runtime` bag; only `libutil` constructs
// them. `createDefaultRuntime(...)` is the sanctioned composition-root factory
// and is NOT flagged.
//
// This generalises the Finder-lives-only-in-libutil rule to the whole DI
// pattern. It is deliberately SEPARATE from
// check-ambient-deps.mjs: that checker scans `src/` only and skips `bin/`,
// `test/`, and package-root entry files (they are allowed ambient deps),
// whereas every collaborator-construction violation lives in exactly those
// locations — and this is a hard no-grandfathering rule, not the ambient-deps
// monotone deny-list model.
//
// Prod-strict / test-lenient: a file under a `test/` directory is flagged only
// for `new Finder(` (Finder must be gone everywhere); a test may wire a real
// `createDefaultProc/Clock/Subprocess` deliberately. Every other file (`src/`,
// `bin/`, package roots) is flagged for all four.
//
// Usage:
//   node scripts/check-collaborator-construction.mjs   # non-zero on a violation

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCOPE_DIRS = ["libraries", "products", "services"];
const SKIP_DIRS = new Set(["node_modules", "dist", "generated", "tmp"]);
// Construction inside libutil is the one sanctioned place.
const LIBUTIL_PREFIX = "libraries/libutil/";
// The three leaf default-collaborator factories. createDefaultRuntime is the
// sanctioned composition-root factory and is intentionally absent.
const LEAF_FACTORIES = new Set([
  "createDefaultProc",
  "createDefaultClock",
  "createDefaultSubprocess",
]);

/** Normalise a path to forward slashes for stable segment checks. */
function norm(p) {
  return p.split("\\").join("/");
}

/** True for a file under a `test/` directory or named `*.test.{js,mjs}`. */
function isTestPath(relPath) {
  const p = norm(relPath);
  return p.split("/").includes("test") || /\.test\.m?js$/.test(p);
}

/** True for a file inside libutil (the sole sanctioned construction site). */
function isLibutil(relPath) {
  return norm(relPath).startsWith(LIBUTIL_PREFIX);
}

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end") continue;
    walk(node[key], visit);
  }
}

/**
 * Parse `source` and return the set of leaf-collaborator construction tags it
 * carries: "Finder" for `new Finder(...)`, and the factory name for each of
 * `createDefaultProc/Clock/Subprocess(...)`.
 * @param {string} source - The module source text.
 * @param {string} filePath - Path used in parse-error messages.
 * @returns {Set<string>} Construction tags.
 */
function findConstructions(source, filePath) {
  const tags = new Set();
  let ast;
  try {
    ast = parse(source, {
      ecmaVersion: "latest",
      sourceType: "module",
      allowAwaitOutsideFunction: true,
    });
  } catch (err) {
    throw new Error(`failed to parse ${filePath}: ${err.message}`);
  }
  walk(ast, (node) => {
    if (
      node.type === "NewExpression" &&
      node.callee?.type === "Identifier" &&
      node.callee.name === "Finder"
    ) {
      tags.add("Finder");
    }
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "Identifier" &&
      LEAF_FACTORIES.has(node.callee.name)
    ) {
      tags.add(node.callee.name);
    }
  });
  return tags;
}

/**
 * Apply the prod-strict / test-lenient policy to one file's source and return
 * the construction tags that should fail the check (empty for libutil).
 * @param {string} relPath - Repo-relative path (forward or back slashes).
 * @param {string} source - The module source text.
 * @returns {string[]} Sorted flagged tags.
 */
function violationsFor(relPath, source) {
  if (isLibutil(relPath)) return [];
  const tags = findConstructions(source, relPath);
  const test = isTestPath(relPath);
  const flagged = [];
  for (const tag of tags) {
    // In test files only `new Finder(` is flagged; the leaf factories may be
    // wired deliberately by a test.
    if (test && tag !== "Finder") continue;
    flagged.push(tag);
  }
  return flagged.sort();
}

function collectJsFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectJsFiles(full));
    else if (entry.endsWith(".js")) out.push(full);
  }
  return out;
}

function scopeFiles() {
  const out = [];
  for (const scope of SCOPE_DIRS) {
    out.push(...collectJsFiles(join(ROOT, scope)));
  }
  return out;
}

function main() {
  const offenders = [];
  for (const file of scopeFiles()) {
    const rel = relative(ROOT, file);
    let flagged;
    try {
      flagged = violationsFor(rel, readFileSync(file, "utf8"));
    } catch (err) {
      console.error(`error: ${err.message}`);
      process.exitCode = 1;
      continue;
    }
    if (flagged.length > 0) offenders.push({ file: rel, tags: flagged });
  }
  if (offenders.length === 0) return;
  for (const o of offenders) {
    const constructs = o.tags
      .map((t) => (t === "Finder" ? "new Finder()" : `${t}()`))
      .join(", ");
    console.error(
      `error: ${o.file} constructs a leaf collaborator [${constructs}] — receive it from the injected runtime bag instead (only libutil constructs collaborators)`,
    );
  }
  process.exitCode = 1;
}

export { findConstructions, violationsFor };

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main();
}
