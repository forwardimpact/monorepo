#!/usr/bin/env node
// Invariant: src modules under libraries/products/services must not
// reach for ambient node-runtime dependencies (node:fs, node:child_process,
// Date.now/new Date/setTimeout, or process.*) outside the allow-listed
// default-collaborator factories, bin shims, and libcli internals. They
// destructure the injected `runtime` bag instead.
//
// Two YAML lists govern the check (YAML so each entry can carry an inline
// comment explaining why it is exempt):
//   - check-ambient-deps.allow.yml — path globs that are permitted to use
//     ambient deps forever (factories, bins, libcli internals, scripts, and
//     domain files whose flagged construct is a deterministic false positive).
//   - check-ambient-deps.deny.yml — a MONOTONE list of grandfathered files
//     that still carry pre-1370 smells. Each migration PR removes its files
//     from this list; entries are removed only, never added.
//
// Usage:
//   node scripts/check-ambient-deps.mjs           # check; non-zero on a new violation
//   node scripts/check-ambient-deps.mjs --seed     # print the deny-list for current violators

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCOPE_GLOBS = ["libraries", "products", "services"];
const SKIP_DIRS = new Set(["node_modules", "dist", "generated", "tmp", "test"]);

const FS_MODULES = new Set([
  "fs",
  "node:fs",
  "fs/promises",
  "node:fs/promises",
]);
const CHILD_PROCESS_MODULES = new Set(["child_process", "node:child_process"]);

const ALLOW = loadConfig("check-ambient-deps.allow.yml", { globs: [] });
// DENY maps a grandfathered path to the exact smells it is allowed to carry.
// A deny-listed file that accrues a NEW smell (one not in its list) still
// fails — this preserves the per-smell granularity of design Decision 9.
const DENY = loadConfig("check-ambient-deps.deny.yml", {});

function loadConfig(name, fallback) {
  const p = join(ROOT, "scripts", name);
  if (!existsSync(p)) return fallback;
  const text = readFileSync(p, "utf8").trim();
  if (text === "") return fallback;
  return parseYaml(text) ?? fallback;
}

/**
 * Given the detected violators and the deny map, return the smells that should
 * fail the check per file: every smell of a non-grandfathered file, plus any
 * smell a grandfathered file accrued beyond its allowed set. `fs-and-fssync`
 * is a new-code rule that fails even for grandfathered files.
 * @param {Array<{file: string, smells: string[]}>} violators
 * @param {Record<string, string[]>} deny - path → allowed smells.
 * @returns {Array<{file: string, smells: string[], grandfathered: boolean}>}
 */
function offendersAgainstDeny(violators, deny) {
  const out = [];
  for (const v of violators) {
    const allowed = deny[v.file];
    const grandfathered = Array.isArray(allowed);
    const flagged = new Set(
      grandfathered ? v.smells.filter((s) => !allowed.includes(s)) : v.smells,
    );
    if (v.smells.includes("fs-and-fssync")) flagged.add("fs-and-fssync");
    if (flagged.size > 0) {
      out.push({ file: v.file, smells: [...flagged].sort(), grandfathered });
    }
  }
  return out;
}

function collectSrcFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectSrcFiles(full));
    else if (entry.endsWith(".js")) out.push(full);
  }
  return out;
}

function srcFiles() {
  const out = [];
  for (const scope of SCOPE_GLOBS) {
    const scopeDir = join(ROOT, scope);
    if (!existsSync(scopeDir)) continue;
    for (const pkg of readdirSync(scopeDir)) {
      const srcDir = join(scopeDir, pkg, "src");
      out.push(...collectSrcFiles(srcDir));
    }
  }
  return out;
}

function globToRegExp(glob) {
  // Minimal glob: ** matches any path segments, * matches a non-slash run.
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^${escaped
      .replace(/\*\*/g, "DOUBLESTAR")
      .replace(/\*/g, "[^/]*")
      .replace(/DOUBLESTAR/g, ".*")}$`,
  );
}

const ALLOW_RES = (ALLOW.globs ?? []).map(globToRegExp);

function isAllowed(relPath) {
  return ALLOW_RES.some((re) => re.test(relPath));
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

function isMember(node, objName, propName) {
  return (
    node.type === "MemberExpression" &&
    node.object?.type === "Identifier" &&
    node.object.name === objName &&
    node.property?.type === "Identifier" &&
    node.property.name === propName
  );
}

const IMPORT_TYPES = new Set([
  "ImportDeclaration",
  "ExportNamedDeclaration",
  "ExportAllDeclaration",
]);

function detectImport(node, smells) {
  let spec;
  if (IMPORT_TYPES.has(node.type) && typeof node.source?.value === "string") {
    spec = node.source.value;
  } else if (
    node.type === "ImportExpression" &&
    node.source?.type === "Literal" &&
    typeof node.source.value === "string"
  ) {
    spec = node.source.value;
  }
  if (spec === undefined) return;
  if (FS_MODULES.has(spec)) smells.add("import:fs");
  if (CHILD_PROCESS_MODULES.has(spec)) smells.add("import:child_process");
}

function detectClock(node, smells) {
  if (
    node.type === "NewExpression" &&
    node.callee?.type === "Identifier" &&
    node.callee.name === "Date"
  ) {
    smells.add("new-date");
  }
  if (node.type !== "CallExpression") return;
  const c = node.callee;
  if (isMember(c, "Date", "now")) smells.add("date-now");
  if (c?.type === "Identifier" && c.name === "setTimeout") {
    smells.add("set-timeout");
  }
  if (isMember(c, "process", "exit")) smells.add("process-exit");
  if (isMember(c, "process", "cwd")) smells.add("process-cwd");
}

function detectProcess(node, smells) {
  if (isMember(node, "process", "env") || isMember(node, "process", "argv")) {
    smells.add("process-global");
  }
  const isWrite =
    node.type === "MemberExpression" &&
    node.property?.type === "Identifier" &&
    (node.property.name === "write" || node.property.name === "isTTY");
  if (
    isWrite &&
    (isMember(node.object, "process", "stdout") ||
      isMember(node.object, "process", "stderr"))
  ) {
    smells.add("process-io");
  }
}

function detectFsBoth(node, smells) {
  if (node.type !== "ObjectPattern") return;
  const keys = node.properties
    .filter((p) => p.type === "Property" && p.key?.type === "Identifier")
    .map((p) => p.key.name);
  if (keys.includes("fs") && keys.includes("fsSync")) {
    smells.add("fs-and-fssync");
  }
}

/**
 * Parse `source` and return the set of ambient-dependency smell tags it carries.
 * @param {string} source - The module source text.
 * @param {string} filePath - Path used in parse-error messages.
 * @returns {Set<string>} Smell tags (e.g. "import:fs", "date-now").
 */
function smellsInSource(source, filePath) {
  const smells = new Set();
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
    detectImport(node, smells);
    detectClock(node, smells);
    detectProcess(node, smells);
    detectFsBoth(node, smells);
  });
  return smells;
}

function main() {
  const seedMode = process.argv.includes("--seed");
  const violators = [];

  for (const file of srcFiles()) {
    const rel = relative(ROOT, file);
    if (isAllowed(rel)) continue;
    let smells;
    try {
      smells = smellsInSource(readFileSync(file, "utf8"), rel);
    } catch (err) {
      console.error(`error: ${err.message}`);
      process.exitCode = 1;
      continue;
    }
    if (smells.size === 0) continue;
    violators.push({ file: rel, smells: [...smells].sort() });
  }

  if (seedMode) {
    const map = {};
    for (const v of violators) map[v.file] = v.smells;
    process.stdout.write(stringifyYaml(map));
    return;
  }

  const offenders = offendersAgainstDeny(violators, DENY);
  if (offenders.length === 0) return;
  for (const v of offenders) {
    const where = v.grandfathered
      ? "grandfathered file accrued a new ambient smell"
      : "uses ambient deps";
    console.error(
      `error: ${v.file} ${where} [${v.smells.join(", ")}] — destructure the runtime bag, or grandfather it in check-ambient-deps.deny.yml during migration`,
    );
  }
  process.exitCode = 1;
}

export { smellsInSource, offendersAgainstDeny };

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main();
}
