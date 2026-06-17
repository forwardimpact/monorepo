import { test, describe } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import mod, {
  bareSlug,
  checkContainment,
  deriveId,
  extractCount,
  extractCounts,
  extractList,
  loadRegistry,
  parseConsumer,
  parseTableRow,
  probeFsGlob,
  probeMdTable,
  probeSource,
  segmentToRegExp,
} from "../../../.coaligned/invariants/enumeration-drift.rules.mjs";

// A scratch repo whose layout the fs-glob probe walks; torn down per test.
function withRepo(layout) {
  const root = mkdtempSync(join(tmpdir(), "enum-drift-"));
  for (const [rel, content] of Object.entries(layout)) {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

describe("checkContainment (Security C1)", () => {
  const cases = [
    ["services/*/package.json", null],
    [".github/CLAUDE.md", null],
    ["/etc/passwd", /absolute/],
    ["../../etc/passwd", /escapes/],
    ["a/../../b", /escapes/],
    ["", /missing or empty/],
  ];
  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)}`, () => {
      const result = checkContainment(input);
      if (expected === null) assert.equal(result, null);
      else assert.match(result, expected);
    });
  }
});

describe("segmentToRegExp", () => {
  test("`*` matches a non-empty non-slash run", () => {
    const re = segmentToRegExp("*");
    assert.ok(re.test("bridge"));
    assert.ok(!re.test(""));
    assert.ok(!re.test("a/b"));
  });
  test("`kata-*` is anchored and literal-prefixed", () => {
    const re = segmentToRegExp("kata-*");
    assert.ok(re.test("kata-design"));
    assert.ok(!re.test("fit-design"));
    assert.ok(!re.test("xkata-design"));
  });
  test("a literal segment matches only itself", () => {
    const re = segmentToRegExp("package.json");
    assert.ok(re.test("package.json"));
    assert.ok(!re.test("packageXjson"));
  });
});

describe("deriveId", () => {
  test("dirname takes the parent directory name", () => {
    assert.equal(deriveId("services/bridge/package.json", "dirname"), "bridge");
  });
  test("basename takes the final segment", () => {
    assert.equal(deriveId("products/gear", "basename"), "gear");
  });
  test("basename-noext drops the extension", () => {
    assert.equal(
      deriveId(".github/workflows/kata-shift.yml", "basename-noext"),
      "kata-shift",
    );
  });
});

describe("probeFsGlob", () => {
  test("dirname derivation + nested glob", () => {
    const root = withRepo({
      "services/bridge/package.json": "{}",
      "services/vector/package.json": "{}",
      "services/empty/README.md": "x", // no package.json → excluded by tail
    });
    const set = probeFsGlob(
      { pattern: "services/*/package.json", id: "dirname" },
      root,
    );
    assert.deepEqual([...set].sort(), ["bridge", "vector"]);
    rmSync(root, { recursive: true, force: true });
  });

  test("basename derivation + exclude", () => {
    const root = withRepo({
      "products/gear/x": "1",
      "products/kata/x": "1",
      "products/README.md": "1",
      "products/CLAUDE.md": "1",
    });
    const set = probeFsGlob(
      {
        pattern: "products/*",
        id: "basename",
        exclude: ["README.md", "CLAUDE.md"],
      },
      root,
    );
    assert.deepEqual([...set].sort(), ["gear", "kata"]);
    rmSync(root, { recursive: true, force: true });
  });

  test("basename-noext derivation + exclude", () => {
    const root = withRepo({
      ".github/workflows/kata-shift.yml": "x",
      ".github/workflows/kata-coaching.yml": "x",
      ".github/workflows/kata-interview.yml": "x",
    });
    const set = probeFsGlob(
      {
        pattern: ".github/workflows/kata-*.yml",
        id: "basename-noext",
        exclude: ["kata-interview.yml"],
      },
      root,
    );
    assert.deepEqual([...set].sort(), ["kata-coaching", "kata-shift"]);
    rmSync(root, { recursive: true, force: true });
  });

  test("missing base dir yields the empty set", () => {
    const root = withRepo({ "keep.txt": "x" });
    const set = probeFsGlob({ pattern: "nope/*", id: "basename" }, root);
    assert.equal(set.size, 0);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("bareSlug + probeMdTable", () => {
  test("bareSlug strips prefix, backticks, and version", () => {
    assert.equal(bareSlug("`forwardimpact/fit-wiki@v1.0.2`"), "fit-wiki");
    assert.equal(bareSlug("forwardimpact/kata-agent"), "kata-agent");
  });

  test("md-table filter + identifier normalization", () => {
    const root = withRepo({
      ".github/CLAUDE.md": [
        "# Doc",
        "",
        "## Third-party actions",
        "",
        "| Action | Purpose |",
        "| --- | --- |",
        "| `actions/checkout@v4` | upstream |",
        "| `forwardimpact/fit-wiki@v1.0.2` | memory |",
        "| `forwardimpact/kata-agent@v1.0.9` | full run |",
        "",
        "## Next",
      ].join("\n"),
    });
    const set = probeMdTable(
      {
        file: ".github/CLAUDE.md",
        section: "Third-party actions",
        column: "Action",
        filter: "^forwardimpact/",
      },
      root,
    );
    assert.deepEqual([...set].sort(), ["fit-wiki", "kata-agent"]);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("parseTableRow", () => {
  test("splits a GFM row", () => {
    assert.deepEqual(parseTableRow("| a | b | c |"), ["a", "b", "c"]);
  });
  test("returns null for a non-row", () => {
    assert.equal(parseTableRow("not a row"), null);
  });
});

describe("extractCount / extractCounts", () => {
  test("first integer wins", () => {
    assert.equal(extractCount("there are 15 services and 39 libs"), 15);
  });
  test("word-number recognized", () => {
    assert.equal(extractCount("Sixteen skills"), 16);
  });
  test("no number → null", () => {
    assert.equal(extractCount("no count here"), null);
  });
  test("extractCounts returns all in document order", () => {
    assert.deepEqual(extractCounts("five then 4"), [5, 4]);
  });
});

describe("extractList grammar", () => {
  test("brace expansion (highest precedence)", () => {
    const set = extractList(
      "`forwardimpact/{fit-benchmark,fit-eval,kata-agent}`",
    );
    assert.deepEqual([...set].sort(), [
      "fit-benchmark",
      "fit-eval",
      "kata-agent",
    ]);
  });

  test("bullets win over a parenthetical aside in the bullet text", () => {
    const span = [
      "- `forwardimpact/fit-wiki` — memory commands (token, push)",
      "- `forwardimpact/kata-agent` — full run (auth, checkout, eval)",
    ].join("\n");
    const set = extractList(span);
    assert.deepEqual([...set].sort(), ["fit-wiki", "kata-agent"]);
  });

  test("GFM table column drops the header row", () => {
    const span = [
      "| Workflow | Trigger |",
      "| --- | --- |",
      "| `kata-shift` | cron |",
      "| `kata-dispatch` | events |",
    ].join("\n");
    const set = extractList(span);
    assert.deepEqual([...set].sort(), ["kata-dispatch", "kata-shift"]);
  });

  test("paren comma-list is the last-resort reading for prose", () => {
    const set = extractList("Eight products (gear, guide, kata).");
    assert.deepEqual([...set].sort(), ["gear", "guide", "kata"]);
  });
});

describe("parseConsumer", () => {
  test("block fence: list", () => {
    const recs = parseConsumer(
      [
        "<!-- enum:products-tree:list -->",
        "- gear",
        "- kata",
        "<!-- /enum -->",
      ].join("\n"),
    );
    assert.equal(recs.length, 1);
    assert.equal(recs[0].topic, "products-tree");
    assert.deepEqual([...recs[0].observed].sort(), ["gear", "kata"]);
  });

  test("inline single-line fence: count embedded in prose", () => {
    const recs = parseConsumer(
      "<!-- enum:libraries-list:count -->39<!-- /enum --> libraries and <!-- enum:services-tree:count -->15<!-- /enum --> services",
    );
    assert.equal(recs.length, 2);
    assert.equal(recs[0].observed, 39);
    assert.equal(recs[1].observed, 15);
  });

  test("multi-claim open fence asserts once per claim", () => {
    const recs = parseConsumer(
      [
        "<!-- enum:sibling-composite-actions:count enum:sibling-composite-actions:list -->",
        "`forwardimpact/{fit-wiki,kata-agent}` — Two of them.",
        "<!-- /enum -->",
      ].join("\n"),
    );
    assert.equal(recs.length, 2);
    const count = recs.find((r) => r.property === "count");
    const list = recs.find((r) => r.property === "list");
    assert.equal(count.observed, 2);
    assert.deepEqual([...list.observed].sort(), ["fit-wiki", "kata-agent"]);
  });

  test("word-number count in a fenced span", () => {
    const recs = parseConsumer(
      [
        "<!-- enum:published-skills:count -->",
        "Sixteen skills.",
        "<!-- /enum -->",
      ].join("\n"),
    );
    assert.equal(recs[0].observed, 16);
  });

  test("markers inside fenced code do not self-trigger", () => {
    const recs = parseConsumer(
      [
        "```",
        "<!-- enum:services-tree:list -->",
        "- not-a-real-fence",
        "<!-- /enum -->",
        "```",
      ].join("\n"),
    );
    assert.equal(recs.length, 0);
  });

  test("a span may enclose a fenced-code block", () => {
    const recs = parseConsumer(
      [
        "<!-- enum:services-tree:list -->",
        "```",
        "- bridge",
        "- vector",
        "```",
        "<!-- /enum -->",
      ].join("\n"),
    );
    assert.equal(recs.length, 1);
    assert.deepEqual([...recs[0].observed].sort(), ["bridge", "vector"]);
  });

  test("unclosed span → malformed for each claim", () => {
    const recs = parseConsumer(
      ["<!-- enum:services-tree:count -->", "15"].join("\n"),
    );
    assert.equal(recs.length, 1);
    assert.match(recs[0].malformed, /unclosed/);
  });

  test("unknown property token → malformed", () => {
    const recs = parseConsumer(
      ["<!-- enum:services-tree:bogus -->", "x", "<!-- /enum -->"].join("\n"),
    );
    assert.equal(recs.length, 1);
    assert.match(recs[0].malformed, /unknown property/);
  });

  test("count span with no number → malformed", () => {
    const recs = parseConsumer(
      [
        "<!-- enum:services-tree:count -->",
        "no number here",
        "<!-- /enum -->",
      ].join("\n"),
    );
    assert.match(recs[0].malformed, /no number/);
  });
});

describe("probeSource dispatch", () => {
  test("glob-escape surfaces as a registry error", () => {
    const res = probeSource(
      { type: "fs-glob", pattern: "../escape/*", id: "basename" },
      "/repo",
    );
    assert.match(res.error, /escapes/);
  });
  test("unknown type is an error", () => {
    const res = probeSource({ type: "cli-help" }, "/repo");
    assert.match(res.error, /unknown source type/);
  });
});

describe("loadRegistry", () => {
  test("real registry loads the six topics", () => {
    const reg = loadRegistry(
      join(import.meta.dirname, "../../../.coaligned/invariants"),
    );
    assert.ok(Array.isArray(reg.topics));
    assert.equal(reg.topics.length, 6);
  });
  test("missing registry → error, not throw", () => {
    const reg = loadRegistry("/no/such/dir");
    assert.match(reg.error, /cannot read registry/);
  });
});

// --- Rule firing over crafted subjects --------------------------------------

function ruleById(id) {
  return mod.rules.find((r) => r.id === id);
}

function fires(rule, subject, ctx = {}) {
  if (rule.when && !rule.when(subject, ctx)) return null;
  return rule.check(subject, ctx);
}

describe("rules fire on drift and stay silent on clean", () => {
  test("enum.registry-invalid", () => {
    const rule = ruleById("enum.registry-invalid");
    assert.ok(fires(rule, { error: "boom" }));
    assert.equal(fires(rule, {}), null);
  });

  test("enum.fence-missing", () => {
    const rule = ruleById("enum.fence-missing");
    assert.ok(fires(rule, { fenceAbsent: true, topic: "t", property: "list" }));
    assert.equal(fires(rule, { fenceAbsent: false }), null);
  });

  test("enum.unknown-topic", () => {
    const rule = ruleById("enum.unknown-topic");
    assert.ok(fires(rule, { topic: "typo", known: false }));
    assert.equal(fires(rule, { topic: "services-tree", known: true }), null);
    assert.equal(
      fires(rule, { topic: "x", known: false, malformed: "bad" }),
      null,
    );
  });

  test("enum.malformed-fence", () => {
    const rule = ruleById("enum.malformed-fence");
    assert.ok(fires(rule, { malformed: "unclosed fence" }));
    assert.equal(fires(rule, { malformed: undefined }), null);
  });

  test("enum.list-drift symmetric difference", () => {
    const rule = ruleById("enum.list-drift");
    const expected = new Set(["a", "b"]);
    const clean = fires(rule, {
      property: "list",
      fenceAbsent: false,
      observed: new Set(["a", "b"]),
      expected,
    });
    assert.equal(clean, null);
    const drift = fires(rule, {
      property: "list",
      fenceAbsent: false,
      observed: new Set(["a", "c"]),
      expected,
    });
    assert.deepEqual(drift.missing, ["b"]);
    assert.deepEqual(drift.extra, ["c"]);
  });

  test("enum.count-drift integer delta", () => {
    const rule = ruleById("enum.count-drift");
    const expected = new Set(["a", "b", "c"]);
    assert.equal(
      fires(rule, {
        property: "count",
        fenceAbsent: false,
        observed: 3,
        expected,
      }),
      null,
    );
    const drift = fires(rule, {
      property: "count",
      fenceAbsent: false,
      observed: 2,
      expected,
    });
    assert.equal(drift.actual, 2);
    assert.equal(drift.expected, 3);
  });
});

describe("module shape + build over the live repo", () => {
  test("default export satisfies the host contract", () => {
    assert.equal(mod.name, "enumeration-drift");
    assert.equal(typeof mod.build, "function");
    assert.equal(typeof mod.seed, "function");
    assert.ok(Array.isArray(mod.rules));
  });

  test("build over the repo root produces no drift findings", () => {
    const root = join(import.meta.dirname, "../../..");
    const { subjects } = mod.build({ root });
    // Every assertion subject must have a present, matching fence.
    for (const s of subjects.assertion) {
      assert.equal(
        s.fenceAbsent,
        false,
        `missing fence: ${s.path} ${s.topic}:${s.property}`,
      );
      if (s.property === "count") {
        assert.equal(s.observed, s.expected.size, `${s.path} ${s.topic} count`);
      } else {
        assert.deepEqual(
          [...s.observed].sort(),
          [...s.expected].sort(),
          `${s.path} ${s.topic} list`,
        );
      }
    }
    // No malformed / unknown-topic fences in registered consumers.
    for (const f of subjects.fence) {
      assert.equal(f.malformed, undefined, `malformed fence: ${f.path}`);
      assert.equal(f.known, true, `unknown topic: ${f.path} ${f.topic}`);
    }
    assert.equal(subjects.registry.length, 0);
  });
});
