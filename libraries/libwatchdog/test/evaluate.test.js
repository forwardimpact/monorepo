import { test } from "node:test";
import assert from "node:assert/strict";
import { createMockClock } from "@forwardimpact/libmock";

import { evaluate } from "../src/evaluate.js";
import { activityRules } from "../src/rule.js";
import { commits, created, NOW, stubRequest, WINDOW_MS } from "./helpers.js";

const THRESHOLD = 32;

/** Build the four routes, each quiet unless the caller overrides it. */
function routes(overrides = {}) {
  return {
    "/repos/o/r/commits": commits(1),
    "/repos/o/r/pulls": created(1),
    "/repos/o/r/issues/comments": created(1),
    "/repos/o/r/issues": created(1),
    ...overrides,
  };
}

/** Run the engine against one route map. */
function run(routeMap) {
  return evaluate(activityRules(THRESHOLD), {
    request: stubRequest(routeMap),
    repo: "o/r",
    defaultBranch: "main",
    clock: createMockClock({ start: NOW }),
    windowMs: WINDOW_MS,
  });
}

test("every count under the threshold is a quiet verdict", async () => {
  const verdict = await run(routes());
  assert.equal(verdict.engage, false);
  assert.deepEqual(verdict.breaches, []);
  assert.deepEqual(
    verdict.counts.map((count) => count.id),
    ["commits", "pulls", "issues", "comments"],
  );
  assert.equal(verdict.cutoff, new Date(NOW - WINDOW_MS).toISOString());
});

const OVER = {
  commits: { "/repos/o/r/commits": commits(THRESHOLD) },
  pulls: { "/repos/o/r/pulls": created(THRESHOLD) },
  issues: { "/repos/o/r/issues": created(THRESHOLD) },
  comments: { "/repos/o/r/issues/comments": created(THRESHOLD) },
};

for (const [id, override] of Object.entries(OVER)) {
  test(`${id} at the threshold engages and names ${id}`, async () => {
    const verdict = await run(routes(override));
    assert.equal(verdict.engage, true);
    assert.deepEqual(verdict.breaches, [
      { id, kind: "threshold", count: THRESHOLD, threshold: THRESHOLD },
    ]);
  });
}

test("a count one below the threshold stays quiet", async () => {
  const verdict = await run(
    routes({ "/repos/o/r/issues": created(THRESHOLD - 1) }),
  );
  assert.equal(verdict.engage, false);
});

test("a probe that throws engages with reason unreadable", async () => {
  const verdict = await run(
    routes({ "/repos/o/r/pulls": new Error("GitHub 500 on /repos/o/r/pulls") }),
  );
  assert.equal(verdict.engage, true);
  assert.equal(verdict.breaches[0].kind, "unreadable");
  assert.equal(verdict.breaches[0].id, "pulls");
  assert.equal(verdict.breaches[0].count, null);
  const reading = verdict.counts.find((count) => count.id === "pulls");
  assert.equal(reading.count, null);
  assert.match(reading.error, /GitHub 500/);
});

test("a response that cannot cover the window engages with reason uncovered", async () => {
  const verdict = await run({
    ...routes(),
    "/repos/o/r/issues/comments": created(100, 30),
  });
  assert.equal(verdict.engage, true);
  assert.deepEqual(verdict.breaches, [
    { id: "comments", kind: "uncovered", count: 100, threshold: THRESHOLD },
  ]);
});

test("one probe raises at most one breach, and uncovered outranks threshold", async () => {
  const verdict = await run({
    ...routes(),
    "/repos/o/r/pulls": created(100, 30),
  });
  assert.equal(verdict.breaches.length, 1);
  assert.equal(verdict.breaches[0].kind, "uncovered");
});

test("two counters breach and the verdict names both in rule order", async () => {
  const verdict = await run(routes({ ...OVER.issues, ...OVER.commits }));
  assert.deepEqual(
    verdict.breaches.map((breach) => breach.id),
    ["commits", "issues"],
  );
});
