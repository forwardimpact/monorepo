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
//   bunx jidoka invariants --seed subprocess-in-tests

const SCOPE_DIRS = ["libraries", "products", "services"];
const SKIP_DIRS = ["node_modules", "dist", "generated", "tmp"];
const SPAWN_FNS = new Set([
  "execFileSync",
  "spawnSync",
  "spawn",
  "execFile",
  "exec",
]);

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

function spawnsProjectBin(ast, walk) {
  let hit = false;
  walk(ast, (node) => {
    if (node.type !== "CallExpression") return;
    const name = calleeName(node.callee);
    if (!name || !SPAWN_FNS.has(name)) return;
    if (targetsNodeOrBin(node.arguments?.[0])) hit = true;
  });
  return hit;
}

function buildSubjects({ scan, parse, walk, config }) {
  const allowTests = new Set(
    config("subprocess-in-tests.allow.json", []).map((e) => e.test),
  );
  const subjects = [];
  for (const { path, rel, text } of scan({
    dirs: SCOPE_DIRS,
    under: "test",
    skip: SKIP_DIRS,
    match: (name) => name.endsWith(".test.js"),
  })) {
    if (rel.endsWith(".integration.test.js")) continue;
    if (allowTests.has(rel)) continue;
    const subject = { path, rel };
    try {
      subject.spawns = spawnsProjectBin(parse(text, rel), walk);
    } catch (err) {
      subject.parseError = err.message;
    }
    subjects.push(subject);
  }
  return subjects;
}

export default {
  name: "subprocess-in-tests",

  build(kit) {
    return {
      subjects: { "test-file": buildSubjects(kit) },
      ctx: { deny: new Set(kit.config("subprocess-in-tests.deny.json", [])) },
    };
  },

  // Print a deny-list of the current violators, for seeding/refreshing
  // subprocess-in-tests.deny.json.
  seed(kit) {
    const violators = buildSubjects(kit)
      .filter((s) => s.spawns)
      .map((s) => s.rel)
      .sort();
    return `${JSON.stringify(violators, null, 2)}\n`;
  },

  rules: ({ parseError }) => [
    parseError("test-file", {
      id: "subprocess.parse-error",
      hint: "fix the syntax error so the spawn scan can parse the test",
    }),
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
