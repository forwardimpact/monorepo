import { test, describe } from "node:test";
import assert from "node:assert";
import { rmSync } from "node:fs";

import {
  bareSlug,
  checkContainment,
  deriveId,
  extractCount,
  extractCounts,
  extractList,
  parseConsumer,
  parseTableRow,
  probeFsGlob,
  probeMdTable,
  probeSource,
  segmentToRegExp,
} from "../src/enum-drift.js";
import { fsSync, withRepo } from "./helpers.js";

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
      fsSync,
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
      fsSync,
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
      fsSync,
    );
    assert.deepEqual([...set].sort(), ["kata-coaching", "kata-shift"]);
    rmSync(root, { recursive: true, force: true });
  });

  test("missing base dir yields the empty set", () => {
    const root = withRepo({ "keep.txt": "x" });
    const set = probeFsGlob(
      { pattern: "nope/*", id: "basename" },
      root,
      fsSync,
    );
    assert.equal(set.size, 0);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("bareSlug + probeMdTable", () => {
  test("bareSlug strips prefix, backticks, and version", () => {
    assert.equal(bareSlug("`forwardimpact/fit-wiki@v1.0.2`"), "fit-wiki");
    assert.equal(bareSlug("forwardimpact/kata-agent"), "kata-agent");
  });

  test("bareSlug unwraps a markdown-link cell to its link text", () => {
    assert.equal(
      bareSlug(
        "[fit-bootstrap](https://github.com/forwardimpact/fit-bootstrap)",
      ),
      "fit-bootstrap",
    );
    assert.equal(
      bareSlug("[kata-agent](https://github.com/forwardimpact/kata-agent)"),
      "kata-agent",
    );
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
      fsSync,
    );
    assert.deepEqual([...set].sort(), ["fit-wiki", "kata-agent"]);
    rmSync(root, { recursive: true, force: true });
  });

  // The real `.github/CLAUDE.md` table: a `Action (`@v1`)` header and
  // markdown-link cells whose URL carries the `forwardimpact/` org. The
  // selector must match this shape, not the bare-token form above.
  test("md-table matches the real sibling-action table shape", () => {
    const root = withRepo({
      ".github/CLAUDE.md": [
        "# Doc",
        "",
        "## Third-party actions",
        "",
        "| Action (`@v1`) | Purpose |",
        "|---|---|",
        "| [fit-bootstrap](https://github.com/forwardimpact/fit-bootstrap) | env |",
        "| [kata-agent](https://github.com/forwardimpact/kata-agent) | full run |",
        "",
        "## Next",
      ].join("\n"),
    });
    const set = probeMdTable(
      {
        file: ".github/CLAUDE.md",
        section: "Third-party actions",
        column: "Action (`@v1`)",
        filter: "forwardimpact/",
      },
      root,
      fsSync,
    );
    assert.deepEqual([...set].sort(), ["fit-bootstrap", "kata-agent"]);
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
      "`forwardimpact/{fit-benchmark,fit-harness,kata-agent}`",
    );
    assert.deepEqual([...set].sort(), [
      "fit-benchmark",
      "fit-harness",
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

  test("bare comma-separated code spans are a list", () => {
    const set = extractList("`benchmark`, `bootstrap`, `harness`, `wiki`");
    assert.deepEqual([...set].sort(), [
      "benchmark",
      "bootstrap",
      "harness",
      "wiki",
    ]);
  });

  test("code spans mixed with prose are NOT a bare list", () => {
    // A leftover word means the span is ambiguous; the code-span shape declines
    // so the reading falls through (here: no other shape matches → empty).
    const set = extractList("uses `harness` and `wiki` internally");
    assert.equal(set.size, 0);
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
      fsSync,
    );
    assert.match(res.error, /escapes/);
  });
  test("unknown type is an error", () => {
    const res = probeSource({ type: "cli-help" }, "/repo", fsSync);
    assert.match(res.error, /unknown source type/);
  });
});
