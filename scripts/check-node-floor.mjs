#!/usr/bin/env node
// Triangulate the Node.js floor across three surface families:
//   (a) every package.json#engines.node lower bound parses to a major ≥ 22
//   (b) every file referenced by a published package.json#bin includes
//       `import "@forwardimpact/libpreflight/nodeNN"` as its first import,
//       with NN equal to the owning manifest's engines.node lower-bound major
//   (c) every getting-started/{leaders,engineers}/**/index.md that names
//       "Node.js" names "Node.js 22+" and no other major
//   (d) the floor literal at one doc page, one manifest, and the libpreflight
//       check.js / node22.js bodies all agree on the same integer
//
// Discovery-based: future bins, packages, and pages land under the check
// without amending this script.

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCOPE_DIRS = ["products", "libraries", "services"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "generated",
  "tmp",
  "dist",
  "worktrees",
]);
const REQUIRED_FLOOR = 22;
const DOC_ROOT = join(ROOT, "websites/fit/docs/getting-started");
const DOC_AUDIENCES = ["leaders", "engineers"];

let status = 0;
const fail = (msg) => {
  console.error(`error: ${msg}`);
  status = 1;
};

function parseLowerBoundMajor(range) {
  // Accept `>=22`, `>=22.0.0`, `^22`, `22.x`, etc. Reject the rest.
  const match = /^(?:[>~^]=?|=)?\s*(\d+)/.exec(range);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function collectPackageJsons(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectPackageJsons(full, out);
    } else if (entry.isFile() && entry.name === "package.json") {
      out.push(full);
    }
  }
  return out;
}

function collectDocIndexes(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectDocIndexes(full, out);
    } else if (entry.isFile() && entry.name === "index.md") {
      out.push(full);
    }
  }
  return out;
}

// ─── Assertion (a) ────────────────────────────────────────────────────────────
const allManifests = collectPackageJsons(ROOT);
const manifestsByName = new Map();
for (const file of allManifests) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    fail(`(a) failed to parse ${relative(ROOT, file)}: ${err.message}`);
    continue;
  }
  manifestsByName.set(pkg.name, { file, pkg });
  const range = pkg.engines?.node;
  if (!range) continue;
  const major = parseLowerBoundMajor(range);
  if (major === null) {
    fail(
      `(a) ${relative(ROOT, file)} engines.node "${range}" — cannot parse lower bound`,
    );
    continue;
  }
  if (major < REQUIRED_FLOOR) {
    fail(
      `(a) ${relative(ROOT, file)} engines.node "${range}" — lower bound ${major} < ${REQUIRED_FLOOR}`,
    );
  }
}

// ─── Assertion (b) ────────────────────────────────────────────────────────────
const PREFLIGHT_IMPORT_RE =
  /^import\s+["']@forwardimpact\/libpreflight\/node(\d+)["']/m;
const FIRST_IMPORT_RE = /^import\b/m;

function readJsonOrNull(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function listDirOrEmpty(path) {
  try {
    return readdirSync(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

function binTargetsForPackage(scopeDir, pkgDirName) {
  const pkgJson = join(scopeDir, pkgDirName, "package.json");
  const pkg = readJsonOrNull(pkgJson);
  if (!pkg?.bin) return [];
  const bins = typeof pkg.bin === "string" ? { [pkg.name]: pkg.bin } : pkg.bin;
  return Object.values(bins).map((path) => ({
    pkgJson,
    pkg,
    file: join(scopeDir, pkgDirName, path.replace(/^\.\//, "")),
  }));
}

function collectBinTargets() {
  const targets = [];
  for (const scope of SCOPE_DIRS) {
    const scopeDir = join(ROOT, scope);
    for (const entry of listDirOrEmpty(scopeDir)) {
      if (!entry.isDirectory()) continue;
      targets.push(...binTargetsForPackage(scopeDir, entry.name));
    }
  }
  return targets;
}

for (const { pkgJson, pkg, file } of collectBinTargets()) {
  const floor = parseLowerBoundMajor(pkg.engines?.node ?? "");
  if (floor === null) {
    fail(
      `(b) ${relative(ROOT, pkgJson)} ships a bin but has no parseable engines.node`,
    );
    continue;
  }
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch (err) {
    fail(`(b) ${relative(ROOT, file)} — ${err.message}`);
    continue;
  }
  // Locate the first import statement; assert it's the preflight import for the manifest's floor.
  const firstImportIdx = src.search(FIRST_IMPORT_RE);
  if (firstImportIdx === -1) {
    fail(
      `(b) ${relative(ROOT, file)} — no import statement; missing libpreflight/node${floor}`,
    );
    continue;
  }
  const preMatch = PREFLIGHT_IMPORT_RE.exec(src.slice(firstImportIdx));
  if (!preMatch || preMatch.index !== 0) {
    fail(
      `(b) ${relative(ROOT, file)} — first import is not "@forwardimpact/libpreflight/node${floor}"`,
    );
    continue;
  }
  const importedMajor = Number.parseInt(preMatch[1], 10);
  if (importedMajor !== floor) {
    fail(
      `(b) ${relative(ROOT, file)} imports libpreflight/node${importedMajor} but engines.node lower bound is ${floor}`,
    );
  }
}

// ─── Assertion (c) ────────────────────────────────────────────────────────────
const NODEJS_VERSION_RE = /Node\.js\s+(\d+)\+/g;
const docPages = [];
for (const audience of DOC_AUDIENCES) {
  collectDocIndexes(join(DOC_ROOT, audience), docPages);
}
for (const file of docPages) {
  const text = readFileSync(file, "utf8");
  const matches = [...text.matchAll(NODEJS_VERSION_RE)];
  if (matches.length === 0) continue;
  for (const m of matches) {
    const major = Number.parseInt(m[1], 10);
    if (major !== REQUIRED_FLOOR) {
      fail(
        `(c) ${relative(ROOT, file)} names "Node.js ${m[1]}+" — expected "Node.js ${REQUIRED_FLOOR}+"`,
      );
    }
  }
}

// ─── Assertion (d) ────────────────────────────────────────────────────────────
function extractFromManifest() {
  const root = manifestsByName.get("forwardimpact-monorepo");
  if (!root) {
    fail("(d) workspace root package.json not located");
    return null;
  }
  const major = parseLowerBoundMajor(root.pkg.engines?.node ?? "");
  if (major === null) {
    fail("(d) workspace root has no parseable engines.node");
    return null;
  }
  return major;
}
function extractFromDoc() {
  const page = join(DOC_ROOT, "leaders/landmark/index.md");
  let text;
  try {
    text = readFileSync(page, "utf8");
  } catch {
    fail(`(d) canonical doc page missing: ${relative(ROOT, page)}`);
    return null;
  }
  const m = /Node\.js\s+(\d+)\+/.exec(text);
  if (!m) {
    fail(
      `(d) canonical doc page does not name "Node.js N+": ${relative(ROOT, page)}`,
    );
    return null;
  }
  return Number.parseInt(m[1], 10);
}
function extractFromCheckJs() {
  const file = join(ROOT, "libraries/libpreflight/src/node22.js");
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    fail(`(d) libpreflight node entry missing: ${relative(ROOT, file)}`);
    return null;
  }
  const m = /check\(\s*(\d+)\s*\)/.exec(text);
  if (!m) {
    fail(
      `(d) libpreflight node22.js does not call check(N): ${relative(ROOT, file)}`,
    );
    return null;
  }
  return Number.parseInt(m[1], 10);
}
const manifestMajor = extractFromManifest();
const docMajor = extractFromDoc();
const checkMajor = extractFromCheckJs();
if (manifestMajor !== null && docMajor !== null && checkMajor !== null) {
  if (
    !(
      manifestMajor === docMajor &&
      docMajor === checkMajor &&
      manifestMajor === REQUIRED_FLOOR
    )
  ) {
    fail(
      `(d) floor disagreement — workspace manifest=${manifestMajor}, doc page=${docMajor}, libpreflight check=${checkMajor}, required=${REQUIRED_FLOOR}`,
    );
  }
}

process.exit(status);
