// Invariant: no module under libraries/products/services constructs a leaf
// collaborator itself — `new Finder(...)`, `createDefaultProc(...)`,
// `createDefaultClock(...)`, or `createDefaultSubprocess(...)`. Every consumer
// receives those off the injected `runtime` bag; only `libutil` constructs
// them. `createDefaultRuntime(...)` is the sanctioned composition-root factory
// and is NOT flagged.
//
// This generalises the Finder-lives-only-in-libutil rule to the whole DI
// pattern. It is deliberately SEPARATE from the ambient-deps module: that
// checker scans `src/` only and skips `bin/`, `test/`, and package-root entry
// files (they are allowed ambient deps), whereas every
// collaborator-construction violation lives in exactly those locations — and
// this is a hard no-grandfathering rule, not the ambient-deps monotone
// deny-list model.
//
// Prod-strict / test-lenient: a file under a `test/` directory is flagged only
// for `new Finder(` (Finder must be gone everywhere); a test may wire a real
// `createDefaultProc/Clock/Subprocess` deliberately. Every other file (`src/`,
// `bin/`, package roots) is flagged for all four.

const SCOPE_DIRS = ["libraries", "products", "services"];
const SKIP_DIRS = ["node_modules", "dist", "generated", "tmp"];
// Construction inside libutil is the one sanctioned place.
const LIBUTIL_PREFIX = "libraries/libutil/";
// The three leaf default-collaborator factories. createDefaultRuntime is the
// sanctioned composition-root factory and is intentionally absent.
const LEAF_FACTORIES = new Set([
  "createDefaultProc",
  "createDefaultClock",
  "createDefaultSubprocess",
]);

// True for a file under a `test/` directory or named `*.test.{js,mjs}`.
function isTestPath(relPath) {
  return relPath.split("/").includes("test") || /\.test\.m?js$/.test(relPath);
}

function findConstructions(ast, walk) {
  const tags = new Set();
  walk(ast, (node) => {
    if (
      node.type === "NewExpression" &&
      node.callee?.type === "Identifier" &&
      node.callee.name === "Finder"
    ) {
      tags.add("Finder");
    }
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "Identifier" &&
      LEAF_FACTORIES.has(node.callee.name)
    ) {
      tags.add(node.callee.name);
    }
  });
  return tags;
}

export default {
  name: "collaborator-construction",

  build({ scanAst, walk }) {
    const subjects = scanAst({
      dirs: SCOPE_DIRS,
      skip: SKIP_DIRS,
      match: (name) => name.endsWith(".js"),
      extract: (ast) => ({ tags: findConstructions(ast, walk) }),
    })
      .filter((s) => !s.rel.startsWith(LIBUTIL_PREFIX))
      .map((s) => ({ ...s, isTest: isTestPath(s.rel) }));
    return { subjects: { "js-file": subjects } };
  },

  rules: ({ parseError }) => [
    parseError("js-file", {
      id: "collaborator.parse-error",
      hint: "fix the syntax error so the construction scan can parse the module",
    }),
    {
      id: "collaborator.construction",
      scope: "js-file",
      severity: "fail",
      when: (s) => !s.parseError,
      check: (s) => {
        // In test files only `new Finder(` is flagged; the leaf factories
        // may be wired deliberately by a test.
        const flagged = [...s.tags]
          .filter((tag) => !s.isTest || tag === "Finder")
          .sort();
        return flagged.length === 0 ? null : { flagged };
      },
      message: (s, r) =>
        `constructs a leaf collaborator [${r.flagged
          .map((t) => (t === "Finder" ? "new Finder()" : `${t}()`))
          .join(", ")}]`,
      hint: "receive it from the injected runtime bag instead (only libutil constructs collaborators)",
    },
  ],
};
