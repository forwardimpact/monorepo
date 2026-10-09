import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  AUDIT_WIKI,
  auditWiki,
  cleanSeed,
  findingIds,
  storyboardSkeleton,
} from "./helpers.js";

// Split from audit-engine.test.js (test-file-shape): this file owns the
// storyboard XmR marker-balance family of the audit.
const board = (...lines) =>
  [storyboardSkeleton("2026", "05"), ...lines].join("\n");

const seedWith = (...lines) =>
  cleanSeed("2026-05-24", {
    [`${AUDIT_WIKI}/storyboard-2026-M05.md`]: board(...lines),
  });

const balanceFindings = (seed) =>
  auditWiki(seed).filter((f) => f.id === "storyboard.markers-balanced.xmr");

describe("storyboard XmR markers", () => {
  test("the audit detects dangling-open", () => {
    const [finding] = balanceFindings(
      seedWith("<!-- xmr:metric:path.csv -->", "content with no close"),
    );
    assert.ok(finding);
    assert.match(finding.message, /dangling-open/);
  });

  test("a balanced pair whose open carries tokens is clean", () => {
    const seed = seedWith(
      "<!-- xmr:metric:path.csv event_type=x prior=2026-01-01 Do not edit. -->",
      "content",
      "<!-- /xmr -->",
    );
    assert.ok(
      !findingIds(auditWiki(seed)).includes("storyboard.markers-balanced.xmr"),
    );
  });

  // A `>` inside a token value ends the comment early, so the line is not an
  // open marker. The scanner then sees only the close, and the balance rule
  // reports it as unpaired.
  test("a > inside a token value leaves an unpaired close", () => {
    const [finding] = balanceFindings(
      seedWith("<!-- xmr:m:a.csv event_type=a>b -->", "body", "<!-- /xmr -->"),
    );
    assert.ok(finding);
    assert.match(finding.message, /unpaired-close/);
  });
});
