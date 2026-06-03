import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createMockFs } from "@forwardimpact/libmock";
import { EXPECTED_HEADER } from "../src/constants.js";
import { runRecordCommand } from "../src/commands/record.js";
import { makeRuntime, ctxFor } from "./helpers.js";

// In-memory paths — record.js does all I/O through the injected runtime.fsSync,
// so `--wiki-root` is an arbitrary mock path. `finder` resolves the project
// root off the real cwd, but its result is unused whenever `--wiki-root` is
// supplied (which every test does), so the assertions touch only the mock fs.
const DIR = "/xmr";
const WIKI_ROOT = join(DIR, "wiki");

describe("fit-xmr record", () => {
  function run(options, { env = {}, seed = {} } = {}) {
    const fs = createMockFs(seed);
    const rt = makeRuntime({ cwd: process.cwd(), env, fs, fsSync: fs });
    const ctx = ctxFor({ runtime: rt.runtime, options });
    const result = runRecordCommand(ctx);
    return { result, stdout: rt.stdout, stderr: rt.stderr, fs };
  }

  test("new file gets header + 1 row (criterion #4)", () => {
    const { result, fs } = run({
      skill: "kata-test",
      metric: "test_count",
      value: "5",
      date: "2026-05-02",
      "wiki-root": WIKI_ROOT,
    });

    assert.ok(result.ok, JSON.stringify(result));

    const csvPath = join(WIKI_ROOT, "metrics", "kata-test", "2026.csv");
    assert.ok(fs.existsSync(csvPath));

    const lines = fs.readFileSync(csvPath, "utf-8").trim().split("\n");
    assert.equal(lines[0], EXPECTED_HEADER);
    assert.equal(lines.length, 2);
    assert.ok(lines[1].startsWith("2026-05-02,test_count,5,count,"));
  });

  test("append-only on existing file", () => {
    const csvPath = join(WIKI_ROOT, "metrics", "kata-test", "2026.csv");
    const { fs } = run(
      {
        skill: "kata-test",
        metric: "test_count",
        value: "7",
        date: "2026-05-02",
        "wiki-root": WIKI_ROOT,
      },
      {
        seed: {
          [csvPath]: EXPECTED_HEADER + "\n2026-05-01,test_count,3,count,,\n",
        },
      },
    );

    const lines = fs.readFileSync(csvPath, "utf-8").trim().split("\n");
    assert.equal(lines.length, 3);
    assert.ok(lines[2].startsWith("2026-05-02,test_count,7,count,"));
  });

  test("one-line output format (criterion #3)", () => {
    const { stdout } = run({
      skill: "kata-test",
      metric: "test_count",
      value: "5",
      date: "2026-05-02",
      "wiki-root": WIKI_ROOT,
    });

    assert.match(stdout, /metric=test_count/);
    assert.match(stdout, /n=1/);
    assert.match(stdout, /status=insufficient_data/);
    assert.match(stdout, /latest=5/);
  });

  test("missing required --metric returns error envelope with code 2", () => {
    const { result } = run({
      skill: "kata-test",
      value: "5",
      "wiki-root": WIKI_ROOT,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
  });

  test("custom --wiki-root honoured", () => {
    const customWiki = join(DIR, "custom-wiki");
    const { fs } = run({
      skill: "kata-test",
      metric: "test_count",
      value: "1",
      date: "2026-05-02",
      "wiki-root": customWiki,
    });

    assert.ok(
      fs.existsSync(join(customWiki, "metrics", "kata-test", "2026.csv")),
    );
  });

  test("LIBEVAL_SKILL fallback when --skill omitted", () => {
    const { fs } = run(
      {
        metric: "test_count",
        value: "1",
        date: "2026-05-02",
        "wiki-root": WIKI_ROOT,
      },
      { env: { LIBEVAL_SKILL: "kata-env-test" } },
    );

    assert.ok(
      fs.existsSync(join(WIKI_ROOT, "metrics", "kata-env-test", "2026.csv")),
    );
  });

  test("returns error envelope when neither --skill nor env var set", () => {
    const { result } = run(
      {
        metric: "test_count",
        value: "1",
        "wiki-root": WIKI_ROOT,
      },
      { env: { LIBEVAL_SKILL: "" } },
    );

    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
  });
});
