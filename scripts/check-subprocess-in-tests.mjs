#!/usr/bin/env node
// Invariant: test files must not spawn `node` or a project bin to
// exercise behavior that can run in-process against injected fakes. The one
// legitimate smoke test per binary lives in a `*.integration.test.js` file
// (exempt whole-file) or is named in check-subprocess-in-tests.allow.json.
//
// Two lists govern the check:
//   - check-subprocess-in-tests.allow.json — [{ test, bin }] one smoke test
//     per binary.
//   - check-subprocess-in-tests.deny.json — a MONOTONE list of grandfathered
//     spawning tests, shrinking as each migration PR converts them.
//
// Usage:
//   node scripts/check-subprocess-in-tests.mjs           # check
//   node scripts/check-subprocess-in-tests.mjs --seed     # print the deny-list

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "acorn";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCOPE_GLOBS = ["libraries", "products", "services"];
const SKIP_DIRS = new Set(["node_modules", "dist", "generated", "tmp"]);
const SPAWN_FNS = new Set([
  "execFileSync",
  "spawnSync",
  "spawn",
  "execFile",
  "exec",
]);

const ALLOW = loadJson("check-subprocess-in-tests.allow.json", []);
const DENY = new Set(loadJson("check-subprocess-in-tests.deny.json", []));
const ALLOW_TESTS = new Set(ALLOW.map((e) => e.test));

function loadJson(name, fallback) {
  const p = join(ROOT, "scripts", name);
  if (!existsSync(p)) return fallback;
  const text = readFileSync(p, "utf8").trim();
  return text === "" ? fallback : JSON.parse(text);
}

function collectTestFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectTestFiles(full));
    else if (entry.endsWith(".test.js")) out.push(full);
  }
  return out;
}

function testFiles() {
  const out = [];
  for (const scope of SCOPE_GLOBS) {
    const scopeDir = join(ROOT, scope);
    if (!existsSync(scopeDir)) continue;
    for (const pkg of readdirSync(scopeDir)) {
      out.push(...collectTestFiles(join(scopeDir, pkg, "test")));
    }
  }
  return out;
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

function calleeName(callee) {
  if (callee?.type === "Identifier") return callee.name;
  if (
    callee?.type === "MemberExpression" &&
    callee.property?.type === "Identifier"
  ) {
    return callee.property.name;
  }
  return null;
}

function targetsNodeOrBin(arg) {
  if (!arg) return false;
  if (arg.type === "Literal" && typeof arg.value === "string") {
    const v = arg.value;
    return v === "node" || v === "bun" || /\/bin\//.test(v) || /\bfit-/.test(v);
  }
  // Template literal containing a bin path fragment.
  if (arg.type === "TemplateLiteral") {
    return arg.quasis.some((q) => /\/bin\/|fit-/.test(q.value.raw));
  }
  return false;
}

function spawnsProjectBin(source, filePath) {
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
  let hit = false;
  walk(ast, (node) => {
    if (node.type !== "CallExpression") return;
    const name = calleeName(node.callee);
    if (!name || !SPAWN_FNS.has(name)) return;
    if (targetsNodeOrBin(node.arguments?.[0])) hit = true;
  });
  return hit;
}

function main() {
  const seedMode = process.argv.includes("--seed");
  const violators = [];

  for (const file of testFiles()) {
    const rel = relative(ROOT, file);
    if (rel.endsWith(".integration.test.js")) continue;
    if (ALLOW_TESTS.has(rel)) continue;
    let hit;
    try {
      hit = spawnsProjectBin(readFileSync(file, "utf8"), rel);
    } catch (err) {
      console.error(`error: ${err.message}`);
      process.exitCode = 1;
      continue;
    }
    if (hit) violators.push(rel);
  }

  if (seedMode) {
    process.stdout.write(`${JSON.stringify(violators.sort(), null, 2)}\n`);
    return;
  }

  const offenders = violators.filter((v) => !DENY.has(v));
  if (offenders.length === 0) return;
  for (const v of offenders) {
    console.error(
      `error: ${v} spawns node/a project bin — run in-process against injected fakes, or rename to *.integration.test.js for the one smoke test per binary`,
    );
  }
  process.exitCode = 1;
}

export { spawnsProjectBin };

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main();
}
