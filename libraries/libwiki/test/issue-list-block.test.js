import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { renderIssueList, parseRepoSlug } from "../src/issue-list-renderer.js";

function mockGh(stdout, status = 0) {
  return () => ({ status, stdout, stderr: "" });
}

function spyGh(stdout, status = 0) {
  const calls = [];
  const fn = (args, options) => {
    calls.push({ args, options });
    return { status, stdout, stderr: "" };
  };
  fn.calls = calls;
  return fn;
}

describe("renderIssueList", () => {
  test("renders open obstacles as bullets", () => {
    const lines = renderIssueList({
      topic: "obstacles",
      state: "open",
      window: null,
      today: new Date("2026-05-19T00:00:00Z"),
      gh: mockGh(
        JSON.stringify([
          {
            number: 100,
            title: "obstacle one",
            labels: [{ name: "obstacle" }],
            closedAt: null,
          },
        ]),
      ),
    });
    assert.equal(lines.length, 1);
    assert.equal(lines[0], "- #100 obstacle one");
  });

  test("filters closed experiments by 7-day window", () => {
    const lines = renderIssueList({
      topic: "experiments",
      state: "closed",
      window: null,
      today: new Date("2026-05-19T00:00:00Z"),
      gh: mockGh(
        JSON.stringify([
          { number: 1, title: "old", closedAt: "2026-04-01T00:00:00Z" },
          { number: 2, title: "recent", closedAt: "2026-05-15T00:00:00Z" },
        ]),
      ),
    });
    assert.equal(lines.length, 1);
    assert.equal(lines[0], "- #2 recent");
  });

  test("returns [] on gh failure", () => {
    const lines = renderIssueList({
      topic: "obstacles",
      state: "open",
      window: null,
      gh: mockGh("", 1),
    });
    assert.deepEqual(lines, []);
  });

  test("forwards cwd, repo, and token to gh when provided", () => {
    const gh = spyGh(JSON.stringify([]));
    renderIssueList({
      topic: "obstacles",
      state: "open",
      window: null,
      cwd: "/some/project-root",
      repo: "forwardimpact/monorepo",
      token: "ghp_test",
      gh,
    });
    const call = gh.calls[0];
    const repoIdx = call.args.indexOf("--repo");
    assert.notEqual(repoIdx, -1);
    assert.equal(call.args[repoIdx + 1], "forwardimpact/monorepo");
    assert.equal(call.options.cwd, "/some/project-root");
    assert.equal(call.options.token, "ghp_test");
  });

  test("omits --repo and options when none provided", () => {
    const gh = spyGh(JSON.stringify([]));
    renderIssueList({
      topic: "obstacles",
      state: "open",
      window: null,
      gh,
    });
    const call = gh.calls[0];
    assert.equal(call.args.includes("--repo"), false);
    assert.equal(call.options.cwd, undefined);
    assert.equal(call.options.token, undefined);
  });

  test("honours window suffix (30d)", () => {
    const lines = renderIssueList({
      topic: "experiments",
      state: "closed",
      window: "30d",
      today: new Date("2026-05-19T00:00:00Z"),
      gh: mockGh(
        JSON.stringify([
          { number: 1, title: "old", closedAt: "2026-03-01T00:00:00Z" },
          { number: 2, title: "in-window", closedAt: "2026-04-30T00:00:00Z" },
        ]),
      ),
    });
    assert.equal(lines.length, 1);
    assert.equal(lines[0], "- #2 in-window");
  });
});

describe("parseRepoSlug", () => {
  test("parses https github URL", () => {
    assert.equal(
      parseRepoSlug("https://github.com/forwardimpact/monorepo.git"),
      "forwardimpact/monorepo",
    );
  });

  test("parses ssh github URL", () => {
    assert.equal(
      parseRepoSlug("git@github.com:forwardimpact/monorepo.git"),
      "forwardimpact/monorepo",
    );
  });

  test("parses proxy-rewritten URL with extra path prefix", () => {
    assert.equal(
      parseRepoSlug("http://127.0.0.1:1234/git/forwardimpact/monorepo"),
      "forwardimpact/monorepo",
    );
  });

  test("returns null for empty input", () => {
    assert.equal(parseRepoSlug(null), null);
    assert.equal(parseRepoSlug(""), null);
  });
});
