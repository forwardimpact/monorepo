// Invariant: shared-checkout commit paths must stage their own artifacts by
// explicit path, never by a whole-tree sweep. The one whole-tree staging method
// on the shared GitClient is `commitAll` (`git add -A`); `commitPaths` is the
// scoped path. This rule flags every *caller* of `commitAll` in non-test
// commit-path source, deny-by-default: a caller not in
// shared-workspace-staging.allow.json fails, so a newly-added or overlooked
// sweep surfaces as a violation rather than silently escaping the closed set.
//
// Scope is JS/MJS source only — the AST scan cannot parse shell or YAML, so
// shell commit paths (e.g. a `fit-wiki push` shell wrapper) are governed by the
// same allow-listed deferral their JS twin carries, not by this rule. CI sweeps
// that run in a separate checkout (not the shared session checkout) are out of
// scope by construction.
//
// The `commitAll` *definition* (the GitClient itself) and its mock are excluded:
// they define/mock the primitive, they are not commit paths.
//
// Completeness boundary: the rule keys on the `commitAll` callee. A future
// commit path that sweeps via a raw subprocess argv (e.g.
// `run("git", ["add", "-A"])`) built from fragments is a different shape and
// would escape this rule. The corpus has no such caller today; if one appears,
// extend SWEEP_METHOD coverage with a JS-scoped argv-literal scan rather than
// loosening the allowlist.
//
// Refresh the violator list:
//   bunx coaligned invariants --seed shared-workspace-staging

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseModule, walkAst } from "./lib/ast.mjs";
import { collectFiles, readJsonOrNull } from "./lib/walk.mjs";

const SCOPE_DIRS = ["libraries", "products", "services"];
const SKIP_DIRS = new Set(["node_modules", "dist", "generated", "tmp", "test"]);
const SWEEP_METHOD = "commitAll";

// Files that define or mock the primitive — not commit paths.
const EXCLUDE_RELS = new Set(["libraries/libutil/src/git-client.js"]);
const EXCLUDE_PREFIXES = ["libraries/libmock/"];

function loadAllow() {
  const entries =
    readJsonOrNull(
      join(import.meta.dirname, "shared-workspace-staging.allow.json"),
    ) ?? [];
  return new Set(entries.map((e) => e.file));
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

function sourceFiles(root) {
  const out = [];
  for (const scope of SCOPE_DIRS) {
    const scopeDir = join(root, scope);
    if (!existsSync(scopeDir)) continue;
    for (const pkg of readdirSync(scopeDir)) {
      const pkgDir = join(scopeDir, pkg);
      if (!statSync(pkgDir).isDirectory()) continue;
      out.push(
        ...collectFiles(pkgDir, {
          skip: SKIP_DIRS,
          match: (name) =>
            (name.endsWith(".js") || name.endsWith(".mjs")) &&
            !name.endsWith(".test.js") &&
            !name.endsWith(".test.mjs"),
        }),
      );
    }
  }
  return out;
}

function isExcluded(rel) {
  return (
    EXCLUDE_RELS.has(rel) || EXCLUDE_PREFIXES.some((p) => rel.startsWith(p))
  );
}

function sweepsWholeTree(source, filePath) {
  let hit = false;
  walkAst(parseModule(source, filePath), (node) => {
    if (node.type !== "CallExpression") return;
    if (calleeName(node.callee) === SWEEP_METHOD) hit = true;
  });
  return hit;
}

function buildSubjects(root) {
  const subjects = [];
  for (const file of sourceFiles(root)) {
    const rel = relative(root, file);
    if (isExcluded(rel)) continue;
    const subject = { path: file, rel };
    try {
      subject.sweeps = sweepsWholeTree(readFileSync(file, "utf8"), rel);
    } catch (err) {
      subject.parseError = err.message;
    }
    subjects.push(subject);
  }
  return subjects;
}

export default {
  name: "shared-workspace-staging",

  build({ root }) {
    return {
      subjects: { "commit-path": buildSubjects(root) },
      ctx: { allow: loadAllow() },
    };
  },

  // Print the current violators, for seeding shared-workspace-staging.allow.json.
  seed({ root }) {
    const violators = buildSubjects(root)
      .filter((s) => s.sweeps)
      .map((s) => s.rel)
      .sort();
    return `${JSON.stringify(violators, null, 2)}\n`;
  },

  rules: [
    {
      id: "staging.parse-error",
      scope: "commit-path",
      severity: "fail",
      check: (s) => (s.parseError ? { msg: s.parseError } : null),
      message: (s, r) => r.msg,
      hint: "fix the syntax error so the staging scan can parse the file",
    },
    {
      id: "staging.whole-tree-sweep",
      scope: "commit-path",
      severity: "fail",
      when: (s) => !s.parseError,
      check: (s, c) => (s.sweeps && !c.allow.has(s.rel) ? {} : null),
      message: (s) =>
        `shared-checkout commit path stages by whole-tree sweep (${SWEEP_METHOD}): ${s.rel}`,
      hint: "stage own artifacts by explicit path (commitPaths), or add the path to shared-workspace-staging.allow.json with a reason",
    },
  ],
};
