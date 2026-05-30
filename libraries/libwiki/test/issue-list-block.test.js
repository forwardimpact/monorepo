import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  createTestRuntime,
  createMockSubprocess,
} from "@forwardimpact/libmock";
import { renderIssueList, parseRepoSlug } from "../src/issue-list-renderer.js";

function runtimeWithGh(stdout, exitCode = 0) {
  const subprocess = createMockSubprocess({
    responses: { gh: { stdout, exitCode } },
  });
  return { runtime: createTestRuntime({ subprocess }), subprocess };
}

describe("renderIssueList", () => {
  test("renders open obstacles as bullets", async () => {
    const { runtime } = runtimeWithGh(
      JSON.stringify([
        {
          number: 1,
          title: "obstacle one",
          labels: [{ name: "obstacle" }],
          closedAt: null,
        },
      ]),
    );
    const lines = await renderIssueList({
      topic: "obstacles",
      state: "open",
      window: null,
      today: "2026-05-19",
      runtime,
    });
    assert.deepEqual(lines, ["- #1 obstacle one"]);
  });

  test("passes the --repo slug to gh when provided", async () => {
    const { runtime, subprocess } = runtimeWithGh("[]");
    await renderIssueList({
      topic: "obstacles",
      state: "open",
      window: null,
      repo: "forwardimpact/monorepo",
      cwd: "/repo",
      today: "2026-05-19",
      runtime,
    });
    const call = subprocess.calls.find((c) => c.cmd === "gh");
    assert.ok(call.args.includes("--repo"));
    assert.ok(call.args.includes("forwardimpact/monorepo"));
    assert.equal(call.opts.cwd, "/repo");
  });

  test("filters closed issues to the window", async () => {
    const { runtime } = runtimeWithGh(
      JSON.stringify([
        {
          number: 2,
          title: "recent",
          labels: [],
          closedAt: "2026-05-18T00:00:00Z",
        },
        {
          number: 3,
          title: "stale",
          labels: [],
          closedAt: "2026-01-01T00:00:00Z",
        },
      ]),
    );
    const lines = await renderIssueList({
      topic: "experiments",
      state: "closed",
      window: "30d",
      today: "2026-05-19",
      runtime,
    });
    assert.deepEqual(lines, ["- #2 recent"]);
  });

  test("gh failure yields an empty block and a stderr warning", async () => {
    const { runtime } = runtimeWithGh("", 1);
    const lines = await renderIssueList({
      topic: "obstacles",
      state: "open",
      window: null,
      today: "2026-05-19",
      runtime,
    });
    assert.deepEqual(lines, []);
    assert.match(runtime.proc.stderr.chunks.join(""), /gh issue list failed/);
  });

  test("malformed JSON yields an empty block and a stderr warning", async () => {
    const { runtime } = runtimeWithGh("not json");
    const lines = await renderIssueList({
      topic: "obstacles",
      state: "open",
      window: null,
      today: "2026-05-19",
      runtime,
    });
    assert.deepEqual(lines, []);
    assert.match(runtime.proc.stderr.chunks.join(""), /JSON parse failed/);
  });
});

describe("parseRepoSlug", () => {
  test("parses https origin", () => {
    assert.equal(parseRepoSlug("https://github.com/foo/bar.git"), "foo/bar");
  });
  test("parses proxy-rewritten origin", () => {
    assert.equal(
      parseRepoSlug("http://host/git/forwardimpact/monorepo"),
      "forwardimpact/monorepo",
    );
  });
  test("returns null for unparseable input", () => {
    assert.equal(parseRepoSlug(""), null);
  });
});
