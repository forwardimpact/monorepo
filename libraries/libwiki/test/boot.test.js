import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildDigest } from "../src/boot.js";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "boot-"));
  return { root };
}

describe("buildDigest", () => {
  let root;
  beforeEach(() => ({ root } = setup()));
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test("returns empty digest when wiki is empty", () => {
    const digest = buildDigest({
      wikiRoot: root,
      agent: "staff-engineer",
      today: "2026-05-19",
    });
    assert.equal(digest.summary, "");
    assert.deepEqual(digest.owned_priorities, []);
    assert.deepEqual(digest.cross_cutting, []);
    assert.deepEqual(digest.claims, []);
    assert.equal(digest.inbox_count, 0);
  });

  test("parses summary, priorities, claims, inbox count", () => {
    writeFileSync(
      join(root, "staff-engineer.md"),
      "# Staff Engineer — Summary\n\nOne-line summary of the agent.\n\n## Message Inbox\n\n<!-- memo:inbox -->\n- 2026-05-18 from **release-engineer**: ping\n",
    );
    writeFileSync(
      join(root, "MEMORY.md"),
      "## Cross-Cutting Priorities\n\n| Item | Agents | Owner | Status | Added |\n| --- | --- | --- | --- | --- |\n| big migration | All | staff-engineer | active | 2026-05-01 |\n| someone-else thing | All | release-engineer | active | 2026-05-01 |\n\n## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| staff-engineer | spec-NNNN | feat/x | — | 2026-05-19 | 2026-05-26 |\n",
    );

    const digest = buildDigest({
      wikiRoot: root,
      agent: "staff-engineer",
      today: "2026-05-19",
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
    writeFileSync(
      join(root, "MEMORY.md"),
      "## Cross-Cutting Priorities\n\n| Item | Agents | Owner | Status | Added |\n| --- | --- | --- | --- | --- |\n| *None* | — | — | — | — |\n",
    );
    const digest = buildDigest({
      wikiRoot: root,
      agent: "staff-engineer",
      today: "2026-05-19",
    });
    assert.deepEqual(digest.claims, []);
  });

  test("filters out expired claims from digest", () => {
    writeFileSync(
      join(root, "MEMORY.md"),
      "## Active Claims\n\n| agent | target | branch | pr | claimed_at | expires_at |\n| --- | --- | --- | --- | --- | --- |\n| staff-engineer | old | feat/x | — | 2026-05-01 | 2026-05-10 |\n| staff-engineer | new | feat/y | — | 2026-05-19 | 2026-05-26 |\n",
    );
    const digest = buildDigest({
      wikiRoot: root,
      agent: "staff-engineer",
      today: "2026-05-19",
    });
    assert.equal(digest.claims.length, 1);
    assert.equal(digest.claims[0].target, "new");
  });
});
