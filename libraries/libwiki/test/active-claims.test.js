import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  parseClaims,
  appendClaim,
  removeClaim,
  filterExpired,
} from "../src/active-claims.js";
import {
  ACTIVE_CLAIMS_HEADING,
  ACTIVE_CLAIMS_TABLE_HEADER,
  ACTIVE_CLAIMS_TABLE_SEPARATOR,
} from "../src/constants.js";

const EMPTY_MEMORY =
  "# Memory Index\n\n## Cross-Cutting Priorities\n\n| Item | Agents | Owner | Status | Added |\n| --- | --- | --- | --- | --- |\n| *None* | — | — | — | — |\n";

const MEMORY_WITH_EMPTY_CLAIMS = `${EMPTY_MEMORY}\n${ACTIVE_CLAIMS_HEADING}\n\n${ACTIVE_CLAIMS_TABLE_HEADER}\n${ACTIVE_CLAIMS_TABLE_SEPARATOR}\n| *None* | — | — | — | — | — |\n`;

const MEMORY_WITH_CLAIM = `${EMPTY_MEMORY}\n${ACTIVE_CLAIMS_HEADING}\n\n${ACTIVE_CLAIMS_TABLE_HEADER}\n${ACTIVE_CLAIMS_TABLE_SEPARATOR}\n| staff-engineer | spec-NNNN | feat/x | — | 2026-05-19 | 2026-05-26 |\n`;

describe("parseClaims", () => {
  test("returns [] when section missing", () => {
    assert.deepEqual(parseClaims(EMPTY_MEMORY), []);
  });
  test("returns [] for empty-state row", () => {
    assert.deepEqual(parseClaims(MEMORY_WITH_EMPTY_CLAIMS), []);
  });
  test("parses a real row", () => {
    const claims = parseClaims(MEMORY_WITH_CLAIM);
    assert.equal(claims.length, 1);
    assert.equal(claims[0].agent, "staff-engineer");
    assert.equal(claims[0].target, "spec-NNNN");
    assert.equal(claims[0].expires_at, "2026-05-26");
    assert.equal(claims[0].pr, null);
  });
});

describe("appendClaim", () => {
  test("inserts a new row into an empty-state table", () => {
    const result = appendClaim(MEMORY_WITH_EMPTY_CLAIMS, {
      agent: "staff-engineer",
      target: "spec-NNNN",
      branch: "feat/x",
      pr: null,
      claimed_at: "2026-05-19",
      expires_at: "2026-05-26",
    });
    assert.equal(result.inserted, true);
    assert.match(result.text, /staff-engineer \| spec-NNNN/);
    assert.doesNotMatch(result.text, /\| \*None\* \| — \| — \| — \| — \| — \|/);
  });
  test("refuses (agent, target) duplicates", () => {
    const result = appendClaim(MEMORY_WITH_CLAIM, {
      agent: "staff-engineer",
      target: "spec-NNNN",
      branch: "feat/y",
      pr: null,
      claimed_at: "2026-05-20",
      expires_at: "2026-05-27",
    });
    assert.equal(result.inserted, false);
    assert.equal(result.reason, "duplicate");
  });
  test("appends second row alongside first", () => {
    const result = appendClaim(MEMORY_WITH_CLAIM, {
      agent: "release-engineer",
      target: "PR-#NNNN",
      branch: "feat/z",
      pr: "NNNN",
      claimed_at: "2026-05-19",
      expires_at: "2026-05-26",
    });
    assert.equal(result.inserted, true);
    assert.match(result.text, /release-engineer \| PR-#NNNN/);
    assert.match(result.text, /staff-engineer \| spec-NNNN/);
  });
});

describe("removeClaim", () => {
  test("removes a matching row", () => {
    const result = removeClaim(MEMORY_WITH_CLAIM, {
      agent: "staff-engineer",
      target: "spec-NNNN",
    });
    assert.equal(result.removed, true);
    assert.doesNotMatch(result.text, /staff-engineer \| spec-NNNN/);
  });
  test("returns removed:false for unknown rows (idempotent)", () => {
    const result = removeClaim(MEMORY_WITH_CLAIM, {
      agent: "nobody",
      target: "nothing",
    });
    assert.equal(result.removed, false);
    assert.equal(result.text, MEMORY_WITH_CLAIM);
  });
});

describe("filterExpired", () => {
  test("splits on ISO date comparison", () => {
    const claims = [
      { agent: "a", target: "t1", expires_at: "2026-05-10" },
      { agent: "a", target: "t2", expires_at: "2026-05-26" },
    ];
    const { active, expired } = filterExpired(claims, "2026-05-19");
    assert.equal(active.length, 1);
    assert.equal(active[0].target, "t2");
    assert.equal(expired.length, 1);
    assert.equal(expired[0].target, "t1");
  });
});
