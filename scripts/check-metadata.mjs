#!/usr/bin/env node
// Enforce a canonical key order, author, and license across every package.json
// in the monorepo (skipping node_modules, generated, and tmp). Default mode
// reports out-of-date files; --fix rewrites them in place.
//
// Usage: check-metadata.mjs [--fix]

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, join, relative, dirname } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "generated",
  "tmp",
  "dist",
  "worktrees",
]);

const AUTHOR = "D. Olsson <hi@senzilla.io>";
const LICENSE = "Apache-2.0";
const HOMEPAGE = "https://www.forwardimpact.team";
const REPOSITORY_URL = "git+https://github.com/forwardimpact/monorepo.git";
const ENGINES = { bun: ">=1.2.0", node: ">=22.0.0" };
const PUBLISH_CONFIG = { access: "public" };

// Well-known keys in canonical order, grouped by concern. Anything outside
// this list is sorted alphabetically and appended at the end.
const KEY_ORDER = [
  // Identity
  "name",
  "version",
  "private",
  "description",
  "keywords",
  // Provenance
  "homepage",
  "repository",
  "license",
  "author",
  // Jobs-To-Be-Done
  "jobs",
  // Module shape
  "type",
  "main",
  "exports",
  "bin",
  "files",
  "workspaces",
  // Behavior
  "scripts",
  // Dependencies
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "overrides",
  // Runtime requirements
  "engines",
  "os",
  // Publishing
  "publishConfig",
];

function findPackageJsons(dir, out = []) {
  // withFileTypes returns a Dirent whose isDirectory()/isSymbolicLink() do not
  // dereference the symlink, so we naturally skip broken symlinks like
  // .claude/memory → ../wiki when wiki is not checked out (e.g. on CI).
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      findPackageJsons(full, out);
    } else if (entry.isFile() && entry.name === "package.json") {
      out.push(full);
    }
  }
  return out;
}

function reorder(pkg) {
  const known = new Set(KEY_ORDER);
  const next = {};
  for (const key of KEY_ORDER) {
    if (key in pkg) next[key] = pkg[key];
  }
  const extras = Object.keys(pkg)
    .filter((k) => !known.has(k))
    .sort();
  for (const key of extras) {
    next[key] = pkg[key];
  }
  return next;
}

function buildRepository(file) {
  const dir = relative(ROOT, dirname(file));
  const repo = { type: "git", url: REPOSITORY_URL };
  if (dir) repo.directory = dir;
  return repo;
}

function canonicalize(pkg, file) {
  const next = {
    ...pkg,
    homepage: HOMEPAGE,
    repository: buildRepository(file),
    license: LICENSE,
    author: AUTHOR,
    engines: ENGINES,
  };
  if (!pkg.private) next.publishConfig = PUBLISH_CONFIG;
  return reorder(next);
}

const args = process.argv.slice(2);
const fix = args.includes("--fix");

const files = findPackageJsons(ROOT).sort();
let stale = false;

for (const file of files) {
  const original = readFileSync(file, "utf8");
  const pkg = JSON.parse(original);
  const canonical = canonicalize(pkg, file);
  const formatted = JSON.stringify(canonical, null, 2) + "\n";

  if (formatted === original) continue;

  const rel = relative(ROOT, file);
  if (fix) {
    writeFileSync(file, formatted);
    console.log(`Rewrote ${rel}`);
  } else {
    console.error(
      `error: ${rel} metadata out of date. Run \`node scripts/check-metadata.mjs --fix\`.`,
    );
    stale = true;
  }
}

if (!stale)
  console.log(`✓ package.json metadata current (${files.length} files)`);

process.exit(stale ? 1 : 0);
