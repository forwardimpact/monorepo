import assert from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { createBuildKit, RULE_KIT } from "../src/index.js";

// A real temp repo + the production runtime: the kit routes fs through
// runtime.fsSync and ripgrep through runtime.subprocess, so exercising it
// against an on-disk fixture tests the wiring end to end.
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "invkit-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}

function kitFor(root) {
  return createBuildKit({
    root,
    dir: join(root, "rules", "invariants"),
    runtime: createDefaultRuntime(),
  });
}

describe("build kit — pure helpers", () => {
  const kit = kitFor(mkdtempSync(join(tmpdir(), "invkit-")));

  test("lineAt maps an offset to a 1-based line", () => {
    const text = "a\nbb\nccc";
    assert.equal(kit.lineAt(text, 0), 1);
    assert.equal(kit.lineAt(text, 2), 2);
    assert.equal(kit.lineAt(text, 5), 3);
  });

  test("glob compiles ** and * to an anchored RegExp", () => {
    assert.ok(kit.glob("libraries/*/bin/*.js").test("libraries/x/bin/y.js"));
    assert.ok(!kit.glob("libraries/*/bin/*.js").test("libraries/x/src/y.js"));
    assert.ok(kit.glob("libraries/**").test("libraries/a/b/c.js"));
  });

  test("parse + walk visit every typed node", () => {
    const ast = kit.parse("export const a = 1;", "a.js");
    const types = new Set();
    kit.walk(ast, (n) => types.add(n.type));
    assert.ok(types.has("VariableDeclaration"));
    assert.ok(types.has("Literal"));
  });
});

describe("build kit — filesystem", () => {
  test("scan collects matching files with rel + text; under restricts to a subdir", () => {
    const root = fixture({
      "libraries/a/src/x.js": "export const x = 1;\n",
      "libraries/a/src/nested/y.js": "export const y = 2;\n",
      "libraries/a/bin/z.js": "// bin, excluded by under:src\n",
      "libraries/a/src/note.md": "not js\n",
    });
    const got = kitFor(root)
      .scan({
        dirs: ["libraries"],
        under: "src",
        match: (n) => n.endsWith(".js"),
      })
      .map((s) => s.rel)
      .sort();
    assert.deepEqual(got, [
      "libraries/a/src/nested/y.js",
      "libraries/a/src/x.js",
    ]);
  });

  test("scanAst merges extract(ast); a parse failure becomes parseError", () => {
    const root = fixture({
      "libraries/a/src/ok.js": "import 'node:fs';\n",
      "libraries/a/src/bad.js": "this is ) not js(",
    });
    const byRel = Object.fromEntries(
      kitFor(root)
        .scanAst({
          dirs: ["libraries"],
          under: "src",
          match: (n) => n.endsWith(".js"),
          extract: (ast) => {
            let imports = 0;
            // count import declarations
            for (const node of ast.body) {
              if (node.type === "ImportDeclaration") imports++;
            }
            return { imports };
          },
        })
        .map((s) => [s.rel, s]),
    );
    assert.equal(byRel["libraries/a/src/ok.js"].imports, 1);
    assert.match(byRel["libraries/a/src/bad.js"].parseError, /failed to parse/);
  });

  test("readJson, config (json + yaml), readText, listDir", () => {
    const root = fixture({
      "pkg/package.json": '{ "name": "p", "version": "1.0.0" }',
      "rules/invariants/deny.json": '["a", "b"]',
      "rules/invariants/allow.yml": "globs:\n  - libraries/*/bin/*.js\n",
      "docs/a.md": "hello",
      "docs/b.md": "world",
    });
    const kit = kitFor(root);
    assert.equal(kit.readJson("pkg/package.json").name, "p");
    assert.equal(kit.readJson("pkg/missing.json"), null);
    assert.deepEqual(kit.config("deny.json", []), ["a", "b"]);
    assert.deepEqual(kit.config("allow.yml").globs, ["libraries/*/bin/*.js"]);
    assert.equal(kit.config("absent.yml", "fallback"), "fallback");
    assert.equal(kit.readText("docs/a.md"), "hello");
    assert.deepEqual(kit.listDir("docs").sort(), ["a.md", "b.md"]);
    assert.deepEqual(kit.listDir("nope"), []);
  });
});

describe("build kit — grep", () => {
  // Scans are over directories: ripgrep omits the filename for a single explicit
  // file, which is why the line-restating modules avoid grep for one file.
  test("matches carry an absolute path, lineNo, and text", () => {
    const root = fixture({ "src/a.txt": "TODO one\nkeep two\nTODO three\n" });
    const hits = kitFor(root).grep({ pattern: "TODO", paths: ["src"] });
    assert.equal(hits.length, 2);
    assert.ok(hits.every((h) => h.path.endsWith("src/a.txt")));
    assert.deepEqual(
      hits.map((h) => h.lineNo),
      [1, 3],
    );
  });

  test("per-entry reason and exclude filter", () => {
    const root = fixture({ "src/a.txt": "TODO one\nSKIP TODO two\n" });
    const got = kitFor(root).grep({
      patterns: [{ pattern: "TODO", reason: "todo", exclude: /SKIP/ }],
      paths: ["src"],
    });
    assert.equal(got.length, 1);
    assert.equal(got[0].reason, "todo");
  });

  test("dedupe collapses one line matched by multiple patterns", () => {
    const root = fixture({ "src/c.txt": "alpha beta\n" });
    const kit = kitFor(root);
    assert.equal(
      kit.grep({ patterns: ["alpha", "beta"], paths: ["src"] }).length,
      2,
    );
    assert.equal(
      kit.grep({ patterns: ["alpha", "beta"], paths: ["src"], dedupe: true })
        .length,
      1,
    );
  });
});

describe("build kit — restatementDrift", () => {
  test("emits one subject per consumer match with an ok verdict", () => {
    const root = fixture({
      ".env.example": "PORT=3001\n",
      "stale.env": "PORT=9999\n",
    });
    const subjects = kitFor(root).restatementDrift({
      equal: (restated, expected) => restated === expected,
      entries: [
        {
          key: "demo",
          expected: "3001",
          consumers: [
            { path: ".env.example", pattern: /PORT=(\d+)/ },
            { path: "stale.env", pattern: /PORT=(\d+)/ },
            { path: "missing.env", pattern: /PORT=(\d+)/ },
          ],
        },
      ],
    });
    assert.equal(subjects.length, 2); // missing file is skipped
    const ok = subjects.find((s) => s.path === ".env.example");
    const bad = subjects.find((s) => s.path === "stale.env");
    assert.deepEqual(
      { restated: ok.restated, ok: ok.ok, key: ok.key, lineNo: ok.lineNo },
      { restated: "3001", ok: true, key: "demo", lineNo: 1 },
    );
    assert.equal(bad.ok, false);
    assert.equal(bad.expected, "3001");
  });
});

describe("rule kit", () => {
  test("parseError fires only on subjects carrying parseError", () => {
    const rule = RULE_KIT.parseError("thing");
    assert.equal(rule.id, "thing.parse-error");
    assert.deepEqual(rule.check({ parseError: "boom" }), { msg: "boom" });
    assert.equal(rule.check({ ok: true }), null);
  });

  test("parseError takes a custom id and hint", () => {
    const rule = RULE_KIT.parseError("thing", { id: "x.pe", hint: "fix it" });
    assert.equal(rule.id, "x.pe");
    assert.equal(rule.hint, "fix it");
  });

  test("failAll fires on every subject, gated by an optional when", () => {
    const rule = RULE_KIT.failAll("s", {
      id: "s.bad",
      message: (subject) => `bad: ${subject.name}`,
      hint: "h",
      when: (subject) => !subject.ok,
    });
    assert.deepEqual(rule.check({}), {});
    assert.equal(rule.when({ ok: true }), false);
    assert.equal(rule.when({ ok: false }), true);
    assert.equal(rule.message({ name: "z" }), "bad: z");
  });
});
