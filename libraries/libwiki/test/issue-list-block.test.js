import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  renderIssueList,
  GENERATED_NOTICE,
} from "../src/issue-list-renderer.js";

function mockGh(stdout, status = 0) {
  return () => ({ status, stdout, stderr: "" });
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
