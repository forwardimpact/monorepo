import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  renderIssueList,
  GENERATED_NOTICE,
} from "../src/issue-list-renderer.js";

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
    assert.equal(lines.length, 2);
    assert.equal(lines[0], GENERATED_NOTICE);
    assert.match(lines[1], /Obs #100 — obstacle one/);
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
    assert.equal(lines.length, 2);
    assert.equal(lines[0], GENERATED_NOTICE);
    assert.match(lines[1], /recent/);
  });

  test("returns [] on gh failure", () => {
    const lines = renderIssueList({
      topic: "obstacles",
      state: "open",
      window: null,
      gh: mockGh("", 1),
    });
    assert.deepEqual(lines, [GENERATED_NOTICE]);
  });

  test("forwards cwd and token to gh when provided", () => {
    const gh = spyGh(JSON.stringify([]));
    renderIssueList({
      topic: "obstacles",
      state: "open",
      window: null,
      cwd: "/some/project-root",
      token: "ghp_test",
      gh,
    });
    const call = gh.calls[0];
    assert.equal(call.options.cwd, "/some/project-root");
    assert.equal(call.options.token, "ghp_test");
  });

  test("does not pass cwd or token when not provided", () => {
    const gh = spyGh(JSON.stringify([]));
    renderIssueList({
      topic: "obstacles",
      state: "open",
      window: null,
      gh,
    });
    const call = gh.calls[0];
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
    assert.equal(lines.length, 2);
    assert.equal(lines[0], GENERATED_NOTICE);
    assert.match(lines[1], /in-window/);
  });
});
