// Invariant: src modules under libraries/products/services must not
// reach for ambient node-runtime dependencies (node:fs, node:child_process,
// Date.now/new Date/setTimeout, or process.*) outside the allow-listed
// default-collaborator factories, bin shims, and libcli internals. They
// destructure the injected `runtime` bag instead.
//
// Two YAML lists govern the check (YAML so each entry can carry an inline
// comment explaining why it is exempt):
//   - ambient-deps.allow.yml — path globs that are permitted to use ambient
//     deps forever (factories, bins, libcli internals, scripts, and domain
//     files whose flagged construct is a deterministic false positive).
//   - ambient-deps.deny.yml — a MONOTONE list of grandfathered files that
//     still carry legacy smells. Each migration PR removes its files from
//     this list; entries are removed only, never added.
//
// Refresh the deny-list for current violators:
//   bunx coaligned invariants --seed ambient-deps

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { parseModule, walkAst } from "./lib/ast.mjs";
import { collectFiles } from "./lib/walk.mjs";

const SCOPE_DIRS = ["libraries", "products", "services"];
const SKIP_DIRS = new Set(["node_modules", "dist", "generated", "tmp", "test"]);

const FS_MODULES = new Set([
  "fs",
  "node:fs",
  "fs/promises",
  "node:fs/promises",
]);
const CHILD_PROCESS_MODULES = new Set(["child_process", "node:child_process"]);

function loadConfig(name, fallback) {
  const p = join(import.meta.dirname, name);
  if (!existsSync(p)) return fallback;
  const text = readFileSync(p, "utf8").trim();
  if (text === "") return fallback;
  return parseYaml(text) ?? fallback;
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

function smellsInSource(source, filePath) {
  const smells = new Set();
  walkAst(parseModule(source, filePath), (node) => {
    detectImport(node, smells);
    detectClock(node, smells);
    detectProcess(node, smells);
    detectFsBoth(node, smells);
  });
  return smells;
}

// The smells that should fail for one file: every smell of a
// non-grandfathered file, plus any smell a grandfathered file accrued
// beyond its allowed set. `fs-and-fssync` is a new-code rule that fails
// even for grandfathered files, preserving per-smell granularity.
function flaggedSmells(smells, allowed) {
  const grandfathered = Array.isArray(allowed);
  const flagged = new Set(
    grandfathered ? smells.filter((s) => !allowed.includes(s)) : smells,
  );
  if (smells.includes("fs-and-fssync")) flagged.add("fs-and-fssync");
  return { flagged: [...flagged].sort(), grandfathered };
}

function srcFiles(root) {
  const out = [];
  for (const scope of SCOPE_DIRS) {
    const scopeDir = join(root, scope);
    if (!existsSync(scopeDir)) continue;
    for (const pkg of readdirSync(scopeDir)) {
      out.push(
        ...collectFiles(join(scopeDir, pkg, "src"), {
          skip: SKIP_DIRS,
          match: (name) => name.endsWith(".js"),
        }),
      );
    }
  }
  return out;
}

function buildSubjects(root) {
  const allowRes = (
    loadConfig("ambient-deps.allow.yml", { globs: [] }).globs ?? []
  ).map(globToRegExp);
  const subjects = [];
  for (const file of srcFiles(root)) {
    const rel = relative(root, file);
    if (allowRes.some((re) => re.test(rel))) continue;
    const subject = { path: file, rel };
    try {
      subject.smells = [
        ...smellsInSource(readFileSync(file, "utf8"), rel),
      ].sort();
    } catch (err) {
      subject.parseError = err.message;
    }
    subjects.push(subject);
  }
  return subjects;
}

export default {
  name: "ambient-deps",

  build({ root }) {
    return {
      subjects: { "src-file": buildSubjects(root) },
      ctx: { deny: loadConfig("ambient-deps.deny.yml", {}) },
    };
  },

  // Print a deny-list for the current violators, for seeding/refreshing
  // ambient-deps.deny.yml.
  seed({ root }) {
    const map = {};
    for (const s of buildSubjects(root)) {
      if (s.smells?.length > 0) map[s.rel] = s.smells;
    }
    return stringifyYaml(map);
  },

  rules: [
    {
      id: "ambient.parse-error",
      scope: "src-file",
      severity: "fail",
      check: (s) => (s.parseError ? { msg: s.parseError } : null),
      message: (s, r) => r.msg,
      hint: "fix the syntax error so the smell scan can parse the module",
    },
    {
      id: "ambient.runtime-deps",
      scope: "src-file",
      severity: "fail",
      when: (s) => !s.parseError,
      check: (s, c) => {
        const { flagged, grandfathered } = flaggedSmells(
          s.smells,
          c.deny[s.rel],
        );
        return flagged.length === 0 ? null : { flagged, grandfathered };
      },
      message: (s, r) =>
        `${
          r.grandfathered
            ? "grandfathered file accrued a new ambient smell"
            : "uses ambient deps"
        } [${r.flagged.join(", ")}]`,
      hint: "destructure the injected runtime bag, or grandfather the file in .coaligned/invariants/ambient-deps.deny.yml during migration",
    },
  ],
};
