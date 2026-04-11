#!/usr/bin/env node
// Prove that every name listed in a `Key Exports` cell of any
// .claude/skills/libs-*/SKILL.md resolves to a public export of the
// corresponding @forwardimpact/<library> package. Strict-positive only —
// the reverse direction (every public export must be advertised) is
// intentionally not checked. See spec 400 Move 4.

import {
  readFileSync,
  existsSync,
  statSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";

const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const SKILLS_DIR = join(REPO_ROOT, ".claude/skills");
const LIBRARIES_DIR = join(REPO_ROOT, "libraries");
const PACKAGE_PREFIX = "@forwardimpact/";
const VERBOSE = process.argv.includes("--verbose");

// ────────────────────────────────────────────────────────────────────────────
// SKILL.md table parsing
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse the `Libraries` markdown table out of a SKILL.md file.
 *
 * Returns an array of `{ library, capabilities, keyExports[] }` rows.
 * Throws if the header row is not the canonical column contract.
 */
function parseLibrariesTable(skillPath) {
  const text = readFileSync(skillPath, "utf8");
  const lines = text.split("\n");

  // Find the H2 "Libraries" heading.
  let i = 0;
  while (i < lines.length && !/^##\s+Libraries\s*$/i.test(lines[i])) i++;
  if (i >= lines.length) {
    throw new Error(`${skillPath}: missing "## Libraries" heading`);
  }

  // Skip blank lines until we hit the table header.
  while (i < lines.length && !lines[i].trimStart().startsWith("|")) i++;
  if (i >= lines.length) {
    throw new Error(`${skillPath}: no table after "## Libraries"`);
  }

  const header = parseTableRow(lines[i]);
  i++;
  const expected = ["Library", "Capabilities", "Key Exports"];
  if (
    header.length !== expected.length ||
    header.some((cell, idx) => cell.trim() !== expected[idx])
  ) {
    throw new Error(
      `${skillPath}: Libraries table headers must be exactly | ${expected.join(
        " | ",
      )} | (got: | ${header.join(" | ")} |)`,
    );
  }

  // Skip the separator row (e.g., | --- | --- | --- |).
  if (i >= lines.length || !lines[i].trimStart().startsWith("|")) {
    throw new Error(`${skillPath}: malformed Libraries table (no separator)`);
  }
  i++;

  const rows = [];
  while (i < lines.length && lines[i].trimStart().startsWith("|")) {
    const cells = parseTableRow(lines[i]);
    if (cells.length === 3) {
      const library = cells[0].trim().replace(/`/g, "");
      const capabilities = cells[1].trim();
      const keyExports = cells[2]
        .split(",")
        .map((s) => s.trim().replace(/`/g, ""))
        .filter(Boolean);
      rows.push({ library, capabilities, keyExports });
    }
    i++;
  }

  return rows;
}

/**
 * Split a single GFM pipe table row into its cells.
 *
 * Handles leading and trailing pipes; trims surrounding whitespace.
 */
function parseTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    return trimmed.split("|");
  }
  return trimmed.slice(1, -1).split("|");
}

// ────────────────────────────────────────────────────────────────────────────
// Library export discovery
// ────────────────────────────────────────────────────────────────────────────

/**
 * Walk the package's `exports` map (and `main`) and return the set of
 * absolute file paths that contain its public export surface. Skips
 * wildcard subpaths and non-JS targets.
 */
function collectExportTargets(pkgRoot) {
  const manifestPath = join(pkgRoot, "package.json");
  if (!existsSync(manifestPath)) return [];
  const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
  const targets = [];

  if (pkg.main) targets.push(pkg.main);

  if (pkg.exports) {
    for (const target of walkExports(pkg.exports)) {
      targets.push(target);
    }
  }

  const seen = new Set();
  const absolute = [];
  for (const target of targets) {
    if (target.includes("*")) continue;
    if (!/\.(mjs|cjs|js)$/.test(target)) continue;
    const abs = resolve(pkgRoot, target);
    if (seen.has(abs)) continue;
    seen.add(abs);
    if (existsSync(abs) && statSync(abs).isFile()) absolute.push(abs);
  }
  return absolute;
}

function* walkExports(node) {
  if (typeof node === "string") {
    yield node;
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) yield* walkExports(item);
    return;
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node)) yield* walkExports(value);
  }
}

/**
 * Recursively collect every name exported from any of the entry files
 * (and any files they re-export from), starting at the union of every
 * subpath in the package's `exports` map.
 */
function collectPublicExports(libName) {
  const pkgRoot = join(LIBRARIES_DIR, libName);
  if (!existsSync(pkgRoot)) {
    throw new Error(`library directory not found: ${pkgRoot}`);
  }
  const entryFiles = collectExportTargets(pkgRoot);
  const visited = new Set();
  const names = new Set();
  for (const entry of entryFiles) {
    scanFile(entry, names, visited);
  }
  return names;
}

/* eslint-disable security/detect-unsafe-regex -- regexes scan trusted internal
   library source files (not user input); the optional groups are bounded by
   their delimiters and run once per match */
const FUNCTION_RE = /export\s+(?:async\s+)?function\s+(\w+)/g;
const CLASS_RE = /export\s+class\s+(\w+)/g;
const VAR_RE = /export\s+(?:const|let|var)\s+(\w+)/g;
const NAMED_BLOCK_RE =
  /export\s+\{([\s\S]*?)\}(?:\s*from\s+["']([^"']+)["'])?/g;
const STAR_RE = /export\s+\*\s+from\s+["']([^"']+)["']/g;
const DEFAULT_RE = /export\s+default\b/;
/* eslint-enable security/detect-unsafe-regex */

function scanFile(absPath, names, visited) {
  const canonical = canonicalizeFile(absPath);
  if (!canonical || visited.has(canonical)) return;
  visited.add(canonical);
  if (!existsSync(canonical) || !statSync(canonical).isFile()) return;

  const source = readFileSync(canonical, "utf8");
  collectDirectExports(source, names);
  scanNamedBlocks(source, names, visited, canonical);
  scanWildcardReexports(source, names, visited, canonical);
}

function canonicalizeFile(absPath) {
  if (!absPath) return null;
  try {
    return realpathSync(absPath);
  } catch {
    return null;
  }
}

function collectDirectExports(source, names) {
  let match;
  FUNCTION_RE.lastIndex = 0;
  while ((match = FUNCTION_RE.exec(source))) names.add(match[1]);

  CLASS_RE.lastIndex = 0;
  while ((match = CLASS_RE.exec(source))) names.add(match[1]);

  VAR_RE.lastIndex = 0;
  while ((match = VAR_RE.exec(source))) names.add(match[1]);

  if (DEFAULT_RE.test(source)) names.add("default");
}

function scanNamedBlocks(source, names, visited, canonical) {
  let match;
  NAMED_BLOCK_RE.lastIndex = 0;
  while ((match = NAMED_BLOCK_RE.exec(source))) {
    addNamedBlockEntries(match[1], names);
    if (match[2]) {
      const target = resolveSpecifier(match[2], canonical);
      if (target) scanFile(target, names, visited);
    }
  }
}

function addNamedBlockEntries(body, names) {
  for (const entry of body.split(",")) {
    const cleaned = entry.replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    // Handle `X as Y` — the public name is the alias `Y`.
    const parts = cleaned.split(/\s+as\s+/);
    const exposed = (parts[1] || parts[0]).trim();
    if (exposed) names.add(exposed);
  }
}

function scanWildcardReexports(source, names, visited, canonical) {
  let match;
  STAR_RE.lastIndex = 0;
  while ((match = STAR_RE.exec(source))) {
    const target = resolveSpecifier(match[1], canonical);
    if (target) scanFile(target, names, visited);
  }
}

/**
 * Resolve an `import`/`export … from` specifier to an absolute file path.
 *
 * - Relative paths (`./foo.js`) resolve relative to the importing file.
 * - `@forwardimpact/<lib>` resolves to that library's main entry point
 *   (and any subpath under it).
 * - Anything else is unsupported and returns null (the caller silently
 *   skips third-party re-exports).
 */
function resolveSpecifier(spec, fromFile) {
  if (spec.startsWith(".") || spec.startsWith("/")) {
    return resolve(dirname(fromFile), spec);
  }
  if (spec.startsWith(PACKAGE_PREFIX)) {
    return resolveForwardimpactSpecifier(spec.slice(PACKAGE_PREFIX.length));
  }
  return null;
}

function resolveForwardimpactSpecifier(rest) {
  const [pkgName, ...subParts] = rest.split("/");
  const pkgRoot = join(LIBRARIES_DIR, pkgName);
  if (!existsSync(pkgRoot)) return null;
  const manifestPath = join(pkgRoot, "package.json");
  if (!existsSync(manifestPath)) return null;
  const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (subParts.length === 0) return resolveBareEntry(pkg, pkgRoot);
  return resolveSubpathEntry(pkg, pkgRoot, "./" + subParts.join("/"));
}

function resolveBareEntry(pkg, pkgRoot) {
  const main =
    (pkg.exports && pkg.exports["."]) || pkg.main || "./src/index.js";
  const target = typeof main === "string" ? main : main?.default;
  if (typeof target !== "string") return null;
  return resolve(pkgRoot, target);
}

function resolveSubpathEntry(pkg, pkgRoot, subKey) {
  const target = pkg.exports?.[subKey];
  if (typeof target !== "string") return null;
  return resolve(pkgRoot, target);
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

function main() {
  const skillFiles = readdirSync(SKILLS_DIR)
    .filter((name) => name.startsWith("libs-"))
    .map((name) => join(SKILLS_DIR, name, "SKILL.md"))
    .filter((path) => existsSync(path))
    .sort();

  let failures = 0;
  let totalRows = 0;
  let totalNames = 0;

  for (const skillFile of skillFiles) {
    let rows;
    try {
      rows = parseLibrariesTable(skillFile);
    } catch (err) {
      console.error(err.message);
      failures += 1;
      continue;
    }

    for (const row of rows) {
      totalRows += 1;
      if (row.keyExports.length === 0) {
        console.error(
          `${relPath(skillFile)}: ${row.library} has empty Key Exports cell`,
        );
        failures += 1;
        continue;
      }

      let publicExports;
      try {
        publicExports = collectPublicExports(row.library);
      } catch (err) {
        console.error(`${relPath(skillFile)}: ${row.library} — ${err.message}`);
        failures += 1;
        continue;
      }

      if (VERBOSE) {
        console.log(`${row.library}: ${[...publicExports].sort().join(", ")}`);
      }

      for (const name of row.keyExports) {
        totalNames += 1;
        if (!publicExports.has(name)) {
          console.error(
            `${relPath(skillFile)}: ${row.library}.${name} is not a public export`,
          );
          console.error(
            `  available: ${[...publicExports].sort().join(", ") || "(none)"}`,
          );
          failures += 1;
        }
      }
    }
  }

  console.log(
    `Checked ${skillFiles.length} libs-* skill files, ${totalRows} library rows, ${totalNames} key exports.`,
  );
  if (failures) {
    console.error(`${failures} failure(s).`);
    console.error(
      "Update the Key Exports cell in the offending SKILL.md to match the library's actual public exports, or restore the export in the library.",
    );
    process.exit(1);
  }
  console.log("All libs-* Key Exports resolve.");
}

function relPath(absPath) {
  return absPath.startsWith(REPO_ROOT + "/")
    ? absPath.slice(REPO_ROOT.length + 1)
    : absPath;
}

main();
