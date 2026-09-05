import { test } from "node:test";
import assert from "node:assert/strict";

import { decodeReason, encodeReason } from "../src/reason.js";

const AT = "2026-09-02T16:49:00.000Z";

test("encodeReason names the writer, each breach, and the time", () => {
  const value = encodeReason({
    name: "watchdog",
    breaches: [
      { id: "issues", kind: "threshold", count: 47, threshold: 32 },
      { id: "comments", kind: "threshold", count: 38, threshold: 32 },
    ],
    at: AT,
  });
  assert.equal(value, `watchdog|issues=47/32|comments=38/32|${AT}`);
});

test("encodeReason leads with unreadable and uncovered breaches", () => {
  const value = encodeReason({
    name: "watchdog",
    breaches: [
      { id: "commits", kind: "threshold", count: 40, threshold: 32 },
      { id: "issues", kind: "unreadable", count: null, threshold: 32 },
      { id: "comments", kind: "uncovered", count: 4, threshold: 32 },
    ],
    at: AT,
  });
  assert.equal(
    value,
    `watchdog|issues=unreadable|comments=uncovered|commits=40/32|${AT}`,
  );
});

test("decodeReason round-trips a two-breach reason", () => {
  const breaches = [
    { id: "issues", kind: "threshold", count: 47, threshold: 32 },
    { id: "pulls", kind: "threshold", count: 33, threshold: 32 },
  ];
  const decoded = decodeReason(
    encodeReason({ name: "watchdog", breaches, at: AT }),
  );
  assert.equal(decoded.name, "watchdog");
  assert.equal(decoded.at, AT);
  assert.deepEqual(decoded.breaches, breaches);
});

test("decodeReason returns null for a value another writer wrote", () => {
  assert.equal(decodeReason("stopped by hand"), null);
  assert.equal(decodeReason("1"), null);
  assert.equal(decodeReason(null), null);
});
