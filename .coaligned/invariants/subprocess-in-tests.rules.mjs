// Invariant: test files must not spawn `node` or a project bin to
// exercise behavior that can run in-process against injected fakes. The one
// legitimate smoke test per binary lives in a `*.integration.test.js` file
// (exempt whole-file) or is named in subprocess-in-tests.allow.json.
//
// Two lists govern the check:
//   - subprocess-in-tests.allow.json — [{ test, bin }] one smoke test
//     per binary.
//   - subprocess-in-tests.deny.json — a MONOTONE list of grandfathered
//     spawning tests, shrinking as each migration PR converts them.
//
// Refresh the deny-list for current violators:
//   bunx coaligned invariants --seed subprocess-in-tests

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { parseModule, walkAst } from "./lib/ast.mjs";
import { collectFiles, readJsonOrNull } from "./lib/walk.mjs";

const SCOPE_DIRS = ["libraries", "products", "services"];
const SKIP_DIRS = new Set(["node_modules", "dist", "generated", "tmp"]);
const SPAWN_FNS = new Set([
  "execFileSync",
  "spawnSync",
  "spawn",
  "execFile",
  "exec",
]);

function loadJson(name, fallback) {
  return readJsonOrNull(join(import.meta.dirname, name)) ?? fallback;
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
  let hit = false;
  walkAst(parseModule(source, filePath), (node) => {
    if (node.type !== "CallExpression") return;
    const name = calleeName(node.callee);
    if (!name || !SPAWN_FNS.has(name)) return;
    if (targetsNodeOrBin(node.arguments?.[0])) hit = true;
  });
  return hit;
}

function testFiles(root) {
  const out = [];
  for (const scope of SCOPE_DIRS) {
    const scopeDir = join(root, scope);
    if (!existsSync(scopeDir)) continue;
    for (const pkg of readdirSync(scopeDir)) {
      out.push(
        ...collectFiles(join(scopeDir, pkg, "test"), {
          skip: SKIP_DIRS,
          match: (name) => name.endsWith(".test.js"),
        }),
      );
    }
  }
  return out;
}

function buildSubjects(root) {
  const allowTests = new Set(
    loadJson("subprocess-in-tests.allow.json", []).map((e) => e.test),
  );
  const subjects = [];
  for (const file of testFiles(root)) {
    const rel = relative(root, file);
    if (rel.endsWith(".integration.test.js")) continue;
    if (allowTests.has(rel)) continue;
    const subject = { path: file, rel };
    try {
      subject.spawns = spawnsProjectBin(readFileSync(file, "utf8"), rel);
    } catch (err) {
      subject.parseError = err.message;
    }
    subjects.push(subject);
  }
  return subjects;
}

export default {
  name: "subprocess-in-tests",

  build({ root }) {
    return {
      subjects: { "test-file": buildSubjects(root) },
      ctx: { deny: new Set(loadJson("subprocess-in-tests.deny.json", [])) },
    };
  },

  // Print a deny-list of the current violators, for seeding/refreshing
  // subprocess-in-tests.deny.json.
  seed({ root }) {
    const violators = buildSubjects(root)
      .filter((s) => s.spawns)
      .map((s) => s.rel)
      .sort();
    return `${JSON.stringify(violators, null, 2)}\n`;
  },

  rules: [
    {
      id: "subprocess.parse-error",
      scope: "test-file",
      severity: "fail",
      check: (s) => (s.parseError ? { msg: s.parseError } : null),
      message: (s, r) => r.msg,
      hint: "fix the syntax error so the spawn scan can parse the test",
    },
    {
      id: "subprocess.spawns-bin",
      scope: "test-file",
      severity: "fail",
      when: (s) => !s.parseError,
      check: (s, c) => (s.spawns && !c.deny.has(s.rel) ? {} : null),
      message: () => "spawns node/a project bin",
      hint: "run in-process against injected fakes, or rename to *.integration.test.js for the one smoke test per binary",
    },
  ],
};
