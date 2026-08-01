#!/usr/bin/env node
// Assert the Dependabot ↔ .github/actions/ coverage invariant.
//
// The script computes the filesystem set. That set holds every
// .github/actions/<D>/ directory with an action.yml or an action.yaml. The
// script also computes the scan set. That set holds the directories: list in
// the github-actions ecosystem block of .github/dependabot.yml, and it expands
// each <prefix>/* glob against the tree. The script then asserts three
// conditions. Dependabot scans every action directory. No scan-set entry under
// .github/actions/ points at a directory that does not exist. The workflow
// root literal `/` is preserved.
//
// Exits 0 when the invariant holds. Exits 1 and prints a diff when it breaks.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import yaml from "yaml";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const dependabotPath = join(repoRoot, ".github/dependabot.yml");
const actionsRoot = join(repoRoot, ".github/actions");

function fail(message) {
  console.error(`check-dependabot: ${message}`);
  process.exit(1);
}

const raw = readFileSync(dependabotPath, "utf8");
const config = yaml.parse(raw);

const updates = config?.updates;
if (!Array.isArray(updates)) {
  fail("`.github/dependabot.yml` has no `updates:` array");
}

const ecosystem = updates.find(
  (u) => u?.["package-ecosystem"] === "github-actions",
);
if (!ecosystem) {
  fail("`.github/dependabot.yml` has no `github-actions` ecosystem block");
}

const directories = ecosystem.directories;
if (!Array.isArray(directories) || directories.length === 0) {
  fail("`github-actions` ecosystem block has no `directories:` entries");
}

// Step 3 — classify each entry.
const literals = [];
const globs = [];
const unsupportedPatterns = [];

for (const entry of directories) {
  if (typeof entry !== "string") {
    unsupportedPatterns.push(String(entry));
    continue;
  }
  if (!entry.includes("*")) {
    literals.push(entry);
    continue;
  }
  // Single trailing /* with no other glob chars.
  const trailingStar = /^([^*]+)\/\*$/;
  const match = entry.match(trailingStar);
  if (match) {
    globs.push({ raw: entry, prefix: match[1] });
    continue;
  }
  unsupportedPatterns.push(entry);
}

// Helpers that convert YAML-form paths (e.g., "/.github/actions") to real
// filesystem paths under repoRoot.
function toRealPath(yamlPath) {
  return join(repoRoot, yamlPath.replace(/^\//, ""));
}

function hasActionManifest(dirRealPath) {
  return (
    existsSync(join(dirRealPath, "action.yml")) ||
    existsSync(join(dirRealPath, "action.yaml"))
  );
}

// Step 4 — compute the scan set in canonical full-path form.
const scanSet = new Set();
for (const literal of literals) {
  scanSet.add(literal);
}
for (const { prefix } of globs) {
  const realPrefix = toRealPath(prefix);
  let entries;
  try {
    entries = readdirSync(realPrefix, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") {
      // The expansion is empty. Check A surfaces the coverage gap.
      continue;
    }
    throw err;
  }
  for (const dirent of entries) {
    if (!dirent.isDirectory()) continue;
    const child = join(realPrefix, dirent.name);
    if (!hasActionManifest(child)) continue;
    scanSet.add(`${prefix}/${dirent.name}`);
  }
}

// Step 5 — compute the filesystem set in canonical full-path form.
const filesystemSet = new Set();
if (existsSync(actionsRoot)) {
  const entries = readdirSync(actionsRoot, { withFileTypes: true });
  for (const dirent of entries) {
    if (!dirent.isDirectory()) continue;
    const child = join(actionsRoot, dirent.name);
    if (!hasActionManifest(child)) continue;
    filesystemSet.add(`/.github/actions/${dirent.name}`);
  }
}

// Step 6 — invariant checks.
const violations = [];

// A. coverage — filesystem set ⊆ scan set.
const uncovered = [...filesystemSet].filter((p) => !scanSet.has(p)).sort();
if (uncovered.length > 0) {
  violations.push({
    title: "uncovered action directories",
    lines: uncovered,
  });
}

// B. literal-entries-not-stale — every literal under /.github/actions/ must
// reference an action directory that exists.
const dangling = [];
for (const literal of literals) {
  if (!literal.startsWith("/.github/actions/")) continue;
  const realPath = toRealPath(literal);
  if (!existsSync(realPath) || !statSync(realPath).isDirectory()) {
    dangling.push(literal);
  }
}
if (dangling.length > 0) {
  violations.push({
    title: "dangling literal scan entries",
    lines: dangling,
  });
}

// C. workflow root preserved — `/` appears literally in the raw directories array.
if (!directories.includes("/")) {
  violations.push({
    title: "missing workflow root literal",
    lines: ["expected `/` in `directories:`"],
  });
}

// D. no unsupported patterns.
if (unsupportedPatterns.length > 0) {
  violations.push({
    title: "unsupported pattern(s)",
    lines: unsupportedPatterns.map((p) => `unsupported pattern: ${p}`),
  });
}

if (violations.length > 0) {
  console.error("check-dependabot: coverage invariant broken\n");
  for (const v of violations) {
    console.error(`  ${v.title}:`);
    for (const line of v.lines) {
      console.error(`    - ${line}`);
    }
    console.error("");
  }
  process.exit(1);
}

console.log("✓ dependabot coverage intact");
process.exit(0);
