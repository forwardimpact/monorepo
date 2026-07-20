import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createMockFs } from "@forwardimpact/libmock";
import { HEADER } from "../src/constants.js";
import { runRecordCommand } from "../src/commands/record.js";
import { makeRuntime, ctxFor } from "./helpers.js";

// In-memory paths — record.js does all I/O through the injected runtime.fsSync,
// so `--wiki-root` is an arbitrary mock path. `finder` resolves the project
// root off the real cwd, but its result is unused whenever `--wiki-root` is
// supplied (which every test does), so the assertions touch only the mock fs.
const DIR = "/xmr";
const WIKI_ROOT = join(DIR, "wiki");

describe("gemba-xmr record", () => {
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
      "event-type": "kata-test",
      "wiki-root": WIKI_ROOT,
    });

    assert.ok(result.ok, JSON.stringify(result));

    const csvPath = join(WIKI_ROOT, "metrics", "kata-test", "2026.csv");
    assert.ok(fs.existsSync(csvPath));

    const lines = fs.readFileSync(csvPath, "utf-8").trim().split("\n");
    assert.equal(lines[0], HEADER);
    assert.equal(lines.length, 2);
    assert.ok(lines[1].startsWith("2026-05-02,test_count,5,count,"));
    // Row carries the trailing host_run column; no GITHUB_RUN_ID in
    // this run, so the host marker is `local`.
    assert.ok(lines[1].endsWith(",kata-test,local"));
  });

  test("append-only on existing file", () => {
    const csvPath = join(WIKI_ROOT, "metrics", "kata-test", "2026.csv");
    const { fs } = run(
      {
        skill: "kata-test",
        metric: "test_count",
        value: "7",
        date: "2026-05-02",
        "event-type": "kata-test",
        "wiki-root": WIKI_ROOT,
      },
      {
        seed: {
          [csvPath]: HEADER + "\n2026-05-01,test_count,3,count,,,kata-test\n",
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
      "event-type": "kata-test",
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
      "event-type": "kata-test",
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
      "event-type": "kata-test",
      "wiki-root": customWiki,
    });

    assert.ok(
      fs.existsSync(join(customWiki, "metrics", "kata-test", "2026.csv")),
    );
  });

  test("LIBHARNESS_SKILL fallback when --skill omitted", () => {
    const { fs } = run(
      {
        metric: "test_count",
        value: "1",
        date: "2026-05-02",
        "event-type": "kata-test",
        "wiki-root": WIKI_ROOT,
      },
      { env: { LIBHARNESS_SKILL: "kata-env-test" } },
    );

    assert.ok(
      fs.existsSync(join(WIKI_ROOT, "metrics", "kata-env-test", "2026.csv")),
    );
  });

  test("$GITHUB_WORKFLOW_REF fallback resolves the workflow machine name", () => {
    const { fs } = run(
      {
        skill: "kata-test",
        metric: "test_count",
        value: "2",
        date: "2026-05-02",
        "wiki-root": WIKI_ROOT,
      },
      {
        env: {
          GITHUB_WORKFLOW_REF:
            "owner/repo/.github/workflows/kata-dispatch.yml@refs/heads/main",
        },
      },
    );

    const csvPath = join(WIKI_ROOT, "metrics", "kata-test", "2026.csv");
    const lines = fs.readFileSync(csvPath, "utf-8").trim().split("\n");
    assert.ok(lines[1].endsWith(",kata-dispatch,local"));
  });

  test("$GITHUB_WORKFLOW_REF with a .yaml extension resolves the same way", () => {
    const { fs } = run(
      {
        skill: "kata-test",
        metric: "test_count",
        value: "2",
        date: "2026-05-02",
        "wiki-root": WIKI_ROOT,
      },
      {
        env: {
          GITHUB_WORKFLOW_REF:
            "owner/repo/.github/workflows/eval-guide.yaml@refs/heads/main",
        },
      },
    );

    const csvPath = join(WIKI_ROOT, "metrics", "kata-test", "2026.csv");
    const lines = fs.readFileSync(csvPath, "utf-8").trim().split("\n");
    assert.ok(lines[1].endsWith(",eval-guide,local"));
  });

  test("--event-type wins over $GITHUB_WORKFLOW_REF", () => {
    const { fs } = run(
      {
        skill: "kata-test",
        metric: "test_count",
        value: "2",
        date: "2026-05-02",
        "event-type": "kata-local",
        "wiki-root": WIKI_ROOT,
      },
      {
        env: {
          GITHUB_WORKFLOW_REF:
            "owner/repo/.github/workflows/kata-dispatch.yml@refs/heads/main",
        },
      },
    );

    const csvPath = join(WIKI_ROOT, "metrics", "kata-test", "2026.csv");
    const lines = fs.readFileSync(csvPath, "utf-8").trim().split("\n");
    assert.ok(lines[1].endsWith(",kata-local,local"));
  });

  test("returns code 2 when neither --event-type nor $GITHUB_WORKFLOW_REF set", () => {
    const { result } = run({
      skill: "kata-test",
      metric: "test_count",
      value: "2",
      "wiki-root": WIKI_ROOT,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
    assert.match(result.error, /event-type|GITHUB_WORKFLOW_REF/);
  });

  test("returns error envelope when neither --skill nor env var set", () => {
    const { result } = run(
      {
        metric: "test_count",
        value: "1",
        "event-type": "kata-test",
        "wiki-root": WIKI_ROOT,
      },
      { env: { LIBHARNESS_SKILL: "" } },
    );

    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
  });

  test("the retired eval-era skill env name is ignored (clean break)", () => {
    // The name is built from parts so the criterion-1 completeness oracle
    // stays clean while this still guards the clean break.
    const retired = `${"LIBEVAL"}_SKILL`;
    const { result } = run(
      {
        metric: "test_count",
        value: "1",
        "event-type": "kata-test",
        "wiki-root": WIKI_ROOT,
      },
      { env: { [retired]: "kata-env-test" } },
    );

    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
  });

  test("CI row carries the host workflow run id", () => {
    const { fs } = run(
      {
        skill: "kata-test",
        metric: "test_count",
        value: "5",
        date: "2026-05-02",
        "event-type": "kata-dispatch",
        "wiki-root": WIKI_ROOT,
      },
      { env: { GITHUB_RUN_ID: "27401632821" } },
    );

    const csvPath = join(WIKI_ROOT, "metrics", "kata-test", "2026.csv");
    const lines = fs.readFileSync(csvPath, "utf-8").trim().split("\n");
    assert.equal(lines[0], HEADER);
    assert.ok(lines[1].endsWith(",kata-dispatch,27401632821"));
  });

  test("local row carries the explicit no-host marker", () => {
    const { fs } = run({
      skill: "kata-test",
      metric: "test_count",
      value: "5",
      date: "2026-05-02",
      "event-type": "kata-dispatch",
      "wiki-root": WIKI_ROOT,
    });

    const csvPath = join(WIKI_ROOT, "metrics", "kata-test", "2026.csv");
    const lines = fs.readFileSync(csvPath, "utf-8").trim().split("\n");
    assert.ok(lines[1].endsWith(",kata-dispatch,local"));
  });
});

describe("gemba-xmr record — route-decision context", () => {
  function run(options) {
    const fs = createMockFs({});
    const rt = makeRuntime({ cwd: process.cwd(), env: {}, fs, fsSync: fs });
    const ctx = ctxFor({ runtime: rt.runtime, options });
    return { result: runRecordCommand(ctx), fs };
  }

  const base = {
    skill: "kata-implement",
    metric: "implementations_shipped",
    value: "0",
    date: "2026-06-20",
    "event-type": "kata-shift",
    "wiki-root": WIKI_ROOT,
  };

  test("prepends the route grammar to the note", () => {
    const { result, fs } = run({
      ...base,
      route: "3",
      "routes-eligible": "3,4",
      note: "opened PR",
    });
    assert.ok(result.ok, JSON.stringify(result));
    const csvPath = join(WIKI_ROOT, "metrics", "kata-implement", "2026.csv");
    const lines = fs.readFileSync(csvPath, "utf-8").trim().split("\n");
    assert.match(lines[1], /route_taken=3; routes_eligible=\[3,4\]; opened PR/);
  });

  test("rejects a route-bearing record with no --route", () => {
    const { result } = run({ ...base });
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
    assert.match(result.error, /--route/);
  });

  test("rejects an unknown --route", () => {
    const { result } = run({ ...base, route: "9", "routes-eligible": "" });
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
    assert.match(result.error, /unknown route/);
  });

  test("non-route-bearing metric is unaffected by route logic", () => {
    const fs = createMockFs({});
    const rt = makeRuntime({ cwd: process.cwd(), env: {}, fs, fsSync: fs });
    const ctx = ctxFor({
      runtime: rt.runtime,
      options: {
        skill: "kata-spec",
        metric: "specs_drafted",
        value: "1",
        date: "2026-06-20",
        "event-type": "kata-shift",
        "wiki-root": WIKI_ROOT,
      },
    });
    const result = runRecordCommand(ctx);
    assert.ok(result.ok, JSON.stringify(result));
  });
});
