// Invariant: shared-checkout commit paths must stage their own artifacts by
// explicit path, never by a whole-tree sweep. On the shared GitClient,
// `commitAll` (`git add -A`) is the one method that stages the whole tree.
// `commitPaths` is the scoped path. This rule flags every *caller* of
// `commitAll` in non-test commit-path source. It denies by default. A caller
// that shared-workspace-staging.allow.json omits fails the rule. So a new or
// overlooked sweep surfaces as a violation. It never escapes the closed set
// in silence.
//
// The scope is JS/MJS source only. The AST scan cannot parse shell or YAML.
// So this rule does not govern shell commit paths (e.g. a `gemba-wiki push`
// shell wrapper). The same allow-listed deferral their JS twin carries governs
// them. CI sweeps that run in a separate checkout are out of scope by
// construction. That checkout is not the shared session checkout.
//
// This rule excludes the `commitAll` *definition* (the GitClient itself) and
// its mock. They define and mock the primitive. They are not commit paths.
//
// Completeness boundary: the rule keys on the `commitAll` callee. A future
// commit path could sweep with a raw subprocess argv built from fragments
// (e.g. `run("git", ["add", "-A"])`). That is a different shape. It would
// escape this rule. The corpus has no such caller today. If one appears,
// extend SWEEP_METHOD coverage with a JS-scoped argv-literal scan. Do not
// loosen the allowlist.
//
// Refresh the violator list:
//   bunx jidoka invariants --seed shared-workspace-staging

const SCOPE_DIRS = ["libraries", "products", "services"];
const SKIP_DIRS = ["node_modules", "dist", "generated", "tmp", "test"];
const SWEEP_METHOD = "commitAll";

// Files that define or mock the primitive. They are not commit paths.
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

  // Print the current violators, to seed shared-workspace-staging.allow.json.
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
      hint: "stage your own artifacts by explicit path (commitPaths), or add the path to shared-workspace-staging.allow.json with a reason",
    },
  ],
};
