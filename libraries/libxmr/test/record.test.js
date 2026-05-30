import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { EXPECTED_HEADER } from "../src/constants.js";
import { runRecordCommand } from "../src/commands/record.js";
import { makeRuntime, ctxFor, makeTempDir } from "./helpers.js";

describe("fit-xmr record", () => {
  let dir;
  let wikiRoot;

  beforeEach(() => {
    dir = makeTempDir("xmr-record-");
    wikiRoot = join(dir, "wiki");
    mkdirSync(join(wikiRoot, "metrics"), { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"name":"root"}');
  });

  function run(options, env = {}) {
    const rt = makeRuntime({ cwd: dir, env });
    const ctx = ctxFor({ runtime: rt.runtime, options });
    const result = runRecordCommand(ctx);
    return { result, stdout: rt.stdout, stderr: rt.stderr };
  }

  test("new file gets header + 1 row (criterion #4)", () => {
    const { result } = run({
      skill: "kata-test",
      metric: "test_count",
      value: "5",
      date: "2026-05-02",
      "wiki-root": wikiRoot,
    });

    assert.ok(result.ok, JSON.stringify(result));

    const csvPath = join(wikiRoot, "metrics", "kata-test", "2026.csv");
    assert.ok(existsSync(csvPath));

    const lines = readFileSync(csvPath, "utf-8").trim().split("\n");
    assert.equal(lines[0], EXPECTED_HEADER);
    assert.equal(lines.length, 2);
    assert.ok(lines[1].startsWith("2026-05-02,test_count,5,count,"));
  });

  test("append-only on existing file", () => {
    const csvDir = join(wikiRoot, "metrics", "kata-test");
    mkdirSync(csvDir, { recursive: true });
    writeFileSync(
      join(csvDir, "2026.csv"),
      EXPECTED_HEADER + "\n2026-05-01,test_count,3,count,,\n",
    );

    run({
      skill: "kata-test",
      metric: "test_count",
      value: "7",
      date: "2026-05-02",
      "wiki-root": wikiRoot,
    });

    const lines = readFileSync(join(csvDir, "2026.csv"), "utf-8")
      .trim()
      .split("\n");
    assert.equal(lines.length, 3);
    assert.ok(lines[2].startsWith("2026-05-02,test_count,7,count,"));
  });

  test("one-line output format (criterion #3)", () => {
    const { stdout } = run({
      skill: "kata-test",
      metric: "test_count",
      value: "5",
      date: "2026-05-02",
      "wiki-root": wikiRoot,
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
      "wiki-root": wikiRoot,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
  });

  test("custom --wiki-root honoured", () => {
    const customWiki = join(dir, "custom-wiki");
    mkdirSync(join(customWiki, "metrics"), { recursive: true });

    run({
      skill: "kata-test",
      metric: "test_count",
      value: "1",
      date: "2026-05-02",
      "wiki-root": customWiki,
    });

    assert.ok(existsSync(join(customWiki, "metrics", "kata-test", "2026.csv")));
  });

  test("LIBEVAL_SKILL fallback when --skill omitted", () => {
    run(
      {
        metric: "test_count",
        value: "1",
        date: "2026-05-02",
        "wiki-root": wikiRoot,
      },
      { LIBEVAL_SKILL: "kata-env-test" },
    );

    assert.ok(
      existsSync(join(wikiRoot, "metrics", "kata-env-test", "2026.csv")),
    );
  });

  test("returns error envelope when neither --skill nor env var set", () => {
    const rt = makeRuntime({ cwd: dir, env: { LIBEVAL_SKILL: "" } });
    const ctx = ctxFor({
      runtime: rt.runtime,
      options: {
        metric: "test_count",
        value: "1",
        "wiki-root": wikiRoot,
      },
    });
    const result = runRecordCommand(ctx);

    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
  });
});
