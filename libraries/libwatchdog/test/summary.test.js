import { test } from "node:test";
import assert from "node:assert/strict";

import { renderSummary } from "../src/summary.js";
import { ago } from "./helpers.js";

const VERDICT = {
  cutoff: "2026-09-02T14:49:00.000Z",
  windowMs: 7200000,
  counts: [
    { id: "commits", count: 3, covered: true, error: null },
    { id: "pulls", count: 1, covered: true, error: null },
    { id: "issues", count: 47, covered: true, error: null },
    { id: "comments", count: null, covered: false, error: "GitHub 500" },
  ],
  breaches: [
    { id: "issues", kind: "threshold", count: 47, threshold: 32 },
    { id: "comments", kind: "unreadable", count: null, threshold: 32 },
  ],
  engage: true,
};

test("an assess summary names all four counters, the value, and the verdict", () => {
  const block = renderSummary({ verdict: VERDICT, killswitchValue: "" });
  for (const id of ["commits", "pulls", "issues", "comments"]) {
    assert.match(block, new RegExp(`\\| ${id} \\|`));
  }
  assert.match(block, /### Watchdog/);
  assert.match(block, /Verdict: \*\*engage\*\*/);
  assert.match(block, /Killswitch value/);
  assert.match(block, /unreadable/);
});

test("a quiet verdict renders no breach line", () => {
  const quiet = { ...VERDICT, breaches: [], engage: false };
  const block = renderSummary({ verdict: quiet, killswitchValue: "0" });
  assert.match(block, /Verdict: \*\*quiet\*\*/);
  assert.doesNotMatch(block, /Breached:/);
});

test("an engage summary renders both scopes and the decision", () => {
  const block = renderSummary({
    state: {
      repository: { value: "", updatedAt: ago(200) },
      organization: { value: "0", updatedAt: ago(500) },
      scope: "repository",
      value: "",
      updatedAt: ago(200),
    },
    decision: "engage",
  });
  assert.match(block, /Killswitch scope: `repository`/);
  assert.match(block, /Organization record/);
  assert.match(block, /Decision: \*\*engage\*\*/);
});

test("a dry run says the latch was read and not written", () => {
  const block = renderSummary({
    state: { repository: null, organization: null, scope: null, value: null },
    dryRun: true,
  });
  assert.match(block, /Dry run/);
});

test("a latch value carrying a backtick cannot break the block", () => {
  const block = renderSummary({ killswitchValue: "stop `now`" });
  assert.match(block, /Killswitch value: `stop 'now'`/);
  assert.equal(block.match(/`/g).length, 2);
});
