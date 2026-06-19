// Flag test files that inline a mock/fixture helper already available in
// libmock. Each detection entry keys on the inline shape AND the absence of
// the canonical libmock import/factory, so legitimate uses never trip.

const SCAN_DIRS = ["libraries", "products", "services", "tests"];
const SKIP_DIRS = ["node_modules", "dist", "generated", "tmp"];

const LIBMOCK_IMPORT_RE = /from\s+["']@forwardimpact\/libmock["']/;

// Each detection: { test(text, ctx) -> boolean, message }. `ctx.imports` is
// true when the file imports from libmock at all.
const DETECTIONS = [
  {
    test: (t) =>
      /function\s+(concludeMsg|redirectMsg|tellMsg|shareMsg)\s*\(/.test(t) &&
      !t.includes("createToolUseMsg"),
    message:
      "inline concludeMsg/redirectMsg/tellMsg/shareMsg — use createToolUseMsg",
  },
  {
    test: (t, c) =>
      /function\s+stripAnsi\s*\(/.test(t) &&
      !t.includes("stripAnsi }") &&
      !c.imports,
    message: "inline stripAnsi — use libmock stripAnsi",
  },
  {
    test: (t) =>
      /const\s+mockLogger\s*=\s*\{\s*(info|debug|warn|error)/.test(t) &&
      !t.includes("createMockLogger") &&
      !t.includes("createSilentLogger"),
    message: "inline mockLogger object — use createSilentLogger",
  },
  {
    test: (t, c) => /class\s+MockStorage\b/.test(t) && !c.imports,
    message: "inline class MockStorage — use createMockStorage",
  },
  {
    test: (t) => /\bmock\.fn\s*\(/.test(t),
    message:
      "mock.fn from node:test is not bun-compatible — use spy from libmock",
  },
  {
    test: (t) => /\btest\s*\([^,)]*,\s*\([^)]*,\s*done\s*\)/.test(t),
    message:
      "test(..., (_, done) => …) is not bun-compatible — rewrite as async",
  },
  // Inline subprocess object literal: { run, spawn, calls } reinvents the fake.
  {
    test: (t, c) =>
      /\b(run|exec)\s*[:(][\s\S]{0,200}?\bspawn\s*[:(][\s\S]{0,200}?\bcalls\b/.test(
        t,
      ) &&
      !t.includes("createMockSubprocess") &&
      !c.imports,
    message:
      "inline { run, spawn, calls } subprocess fake — use createMockSubprocess",
  },
  // Inline GraphIndex mock triple: createMockStorage + `new GraphIndex(...)`
  // co-occurring without the fixture import. Keyed on the *mock* triple, not a
  // bare `new GraphIndex` — products/map/test/pipeline.test.js builds a real
  // GraphIndex over LocalStorage (integration) and must not trip.
  {
    test: (t) =>
      /createMockStorage\s*\(/.test(t) &&
      /new\s+GraphIndex\s*\(/.test(t) &&
      !t.includes("createGraphIndexFixture"),
    message: "inline GraphIndex mock triple — use createGraphIndexFixture",
  },
  // Inline mock gRPC health definition `{ Check: { … requestStream: …
  // responseStream: … } }`. Keyed on the requestStream/responseStream literal
  // keys inside a Check object literal, NOT a bare `check.path` assertion —
  // librpc/health.test.js asserts on the real definition's serialization
  // surface (no `Check: {` mock literal) and must not trip.
  {
    test: (t) =>
      /Check\s*:\s*\{[\s\S]{0,160}?requestStream\s*:[\s\S]{0,80}?responseStream\s*:/.test(
        t,
      ) && !t.includes("createMockGrpcHealthDefinition"),
    message:
      "inline gRPC health definition — use createMockGrpcHealthDefinition",
  },
  // Inline readline.createInterface bundle paired with a mock process exit
  // flag (`_exitCalled`). Keyed on both halves so a plain
  // `readline.createInterface(...)` call doesn't trip.
  {
    test: (t) =>
      /createInterface\s*:/.test(t) &&
      /_exitCalled/.test(t) &&
      !t.includes("createReplEnvironment"),
    message: "inline repl environment bundle — use createReplEnvironment",
  },
];

// Runtime collaborator surfaces: an inline `function createMock<Surface>` in a
// file that doesn't import from libmock reinvents a canonical fake.
const SURFACE_FACTORIES = [
  "createMockSubprocess",
  "createMockFinder",
  "createMockGitClient",
  "createMockGhClient",
];
for (const factory of SURFACE_FACTORIES) {
  DETECTIONS.push({
    test: (t, c) =>
      new RegExp(`function\\s+${factory}\\s*\\(`).test(t) && !c.imports,
    message: `inline ${factory} — use libmock ${factory}`,
  });
}

export default {
  name: "libmock",

  build({ scan }) {
    const subjects = scan({
      dirs: SCAN_DIRS,
      skip: SKIP_DIRS,
      match: (name) => name.endsWith(".test.js"),
    })
      // libmock's own self-tests are expected to redefine some helpers.
      .filter((s) => !s.path.includes("/libraries/libmock/"))
      .map(({ path, text }) => ({
        path,
        text,
        imports: LIBMOCK_IMPORT_RE.test(text),
      }));
    return { subjects: { "test-file": subjects } };
  },

  rules: [
    {
      id: "libmock.inline-fake",
      scope: "test-file",
      severity: "fail",
      check: (s) => {
        const hits = DETECTIONS.filter((d) => d.test(s.text, s));
        return hits.length === 0 ? null : hits.map((d) => ({ msg: d.message }));
      },
      message: (s, r) => r.msg,
      hint: "reuse the canonical fake from @forwardimpact/libmock instead of redefining it inline",
    },
  ],
};
