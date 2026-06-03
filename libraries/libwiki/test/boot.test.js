import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";
import { buildDigest } from "../src/boot.js";

const ROOT = "/wiki";

// Run buildDigest against an in-memory wiki seeded with `files`; it reads
// `${wikiRoot}/<name>.md` through the injected sync surface and tolerates
// absent files.
function digestOf(files = {}) {
  return buildDigest({
    wikiRoot: ROOT,
    agent: "staff-engineer",
    today: "2026-05-19",
    fs: createMockFs(files),
  });
}

describe("buildDigest", () => {
  test("returns empty digest when wiki is empty", () => {
    const digest = digestOf();
    assert.equal(digest.summary, "");
    assert.deepEqual(digest.owned_priorities, []);
    assert.deepEqual(digest.cross_cutting, []);
    assert.deepEqual(digest.claims, []);
    assert.equal(digest.inbox_count, 0);
  });

  test("parses summary, priorities, claims, inbox count", () => {
    const digest = digestOf({
      [`${ROOT}/staff-engineer.md`]:
        "# Staff Engineer — Summary\n\nOne-line summary of the agent.\n\n## Message Inbox\n\n<!-- memo:inbox -->\n- 2026-05-18 from **release-engineer**: ping\n",
      [`${ROOT}/MEMORY.md`]:
        "## Cross-Cutting Priorities\n\n| Item | Agents | Owner | Status | Added |\n| --- | --- | --- | --- | --- |\n| big migration | All | staff-engineer | active | 2026-05-01 |\n| someone-else thing | All | release-engineer | active | 2026-05-01 |\n\n## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| staff-engineer | spec-NNNN | feat/x | — | 2026-05-19 | 2026-05-26 |\n",
    });
    assert.equal(digest.summary, "One-line summary of the agent.");
    assert.equal(digest.owned_priorities.length, 1);
    assert.equal(digest.owned_priorities[0].item, "big migration");
    assert.equal(digest.cross_cutting.length, 1);
    assert.equal(digest.claims.length, 1);
    assert.equal(digest.claims[0].target, "spec-NNNN");
    assert.equal(digest.inbox_count, 1);
  });

  test("missing Active Claims section yields empty claims (silent tolerance)", () => {
    const digest = digestOf({
      [`${ROOT}/MEMORY.md`]:
        "## Cross-Cutting Priorities\n\n| Item | Agents | Owner | Status | Added |\n| --- | --- | --- | --- | --- |\n| *None* | — | — | — | — |\n",
    });
    assert.deepEqual(digest.claims, []);
  });

  test("filters out expired claims from digest", () => {
    const digest = digestOf({
      [`${ROOT}/MEMORY.md`]:
        "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| staff-engineer | old | feat/x | — | 2026-05-01 | 2026-05-10 |\n| staff-engineer | new | feat/y | — | 2026-05-19 | 2026-05-26 |\n",
    });
    assert.equal(digest.claims.length, 1);
    assert.equal(digest.claims[0].target, "new");
  });
});
