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

const SCOPE_DIRS = ["libraries", "products", "services"];
const SKIP_DIRS = ["node_modules", "dist", "generated", "tmp", "test"];
const SWEEP_METHOD = "commitAll";

// Files that define or mock the primitive — not commit paths.
const EXCLUDE_RELS = new Set(["libraries/libutil/src/git-client.js"]);
const EXCLUDE_PREFIXES = ["libraries/libmock/"];

function loadAllow(config) {
  const entries = config("shared-workspace-staging.allow.json", []);
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

function isExcluded(rel) {
  return (
    EXCLUDE_RELS.has(rel) || EXCLUDE_PREFIXES.some((p) => rel.startsWith(p))
  );
}

function sweepsWholeTree(ast, walk) {
  let hit = false;
  walk(ast, (node) => {
    if (node.type !== "CallExpression") return;
    if (calleeName(node.callee) === SWEEP_METHOD) hit = true;
  });
  return hit;
}

function buildSubjects({ scanAst, walk }) {
  return scanAst({
    dirs: SCOPE_DIRS,
    skip: SKIP_DIRS,
    match: (name) =>
      (name.endsWith(".js") || name.endsWith(".mjs")) &&
      !name.endsWith(".test.js") &&
      !name.endsWith(".test.mjs"),
    extract: (ast) => ({ sweeps: sweepsWholeTree(ast, walk) }),
  }).filter((s) => !isExcluded(s.rel));
}

export default {
  name: "shared-workspace-staging",

  build(kit) {
    return {
      subjects: { "commit-path": buildSubjects(kit) },
      ctx: { allow: loadAllow(kit.config) },
    };
  },

  // Print the current violators, for seeding shared-workspace-staging.allow.json.
  seed(kit) {
    const violators = buildSubjects(kit)
      .filter((s) => s.sweeps)
      .map((s) => s.rel)
      .sort();
    return `${JSON.stringify(violators, null, 2)}\n`;
  },

  rules: ({ parseError }) => [
    parseError("commit-path", {
      id: "staging.parse-error",
      hint: "fix the syntax error so the staging scan can parse the file",
    }),
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
