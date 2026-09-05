import { test } from "node:test";
import assert from "node:assert/strict";

import {
  commentsProbe,
  commitsProbe,
  issuesProbe,
  pullsProbe,
} from "../src/sources/github-activity.js";
import { ago, commits, created, NOW, stubRequest } from "./helpers.js";

const CUTOFF = new Date(NOW - 2 * 3600000).toISOString();
const BASE = { repo: "o/r", defaultBranch: "main", cutoff: CUTOFF };

test("commitsProbe counts a filtered page and reports coverage", async () => {
  const request = stubRequest({ "/repos/o/r/commits": commits(6) });
  const reading = await commitsProbe({ request, ...BASE });
  assert.deepEqual(reading, { count: 6, covered: true });
  assert.match(request.calls[0].path, /sha=main/);
  assert.match(request.calls[0].path, /since=/);
});

test("commitsProbe reports a full page as uncovered", async () => {
  const request = stubRequest({ "/repos/o/r/commits": commits(100) });
  const reading = await commitsProbe({ request, ...BASE });
  assert.deepEqual(reading, { count: 100, covered: false });
});

test("pullsProbe counts only items at or after the cutoff", async () => {
  const request = stubRequest({
    "/repos/o/r/pulls": [...created(4, 30), ...created(3, 300)],
  });
  const reading = await pullsProbe({ request, ...BASE });
  assert.deepEqual(reading, { count: 4, covered: true });
});

test("pullsProbe reads a full page reaching past the cutoff as covered", async () => {
  const request = stubRequest({
    "/repos/o/r/pulls": [...created(90, 30), ...created(10, 300)],
  });
  const reading = await pullsProbe({ request, ...BASE });
  assert.deepEqual(reading, { count: 90, covered: true });
});

test("pullsProbe reads a full page held inside the window as uncovered", async () => {
  const request = stubRequest({ "/repos/o/r/pulls": created(100, 30) });
  const reading = await pullsProbe({ request, ...BASE });
  assert.deepEqual(reading, { count: 100, covered: false });
});

test("issuesProbe discards pull requests without changing coverage", async () => {
  const page = [
    ...created(90, 30, { pull_request: { url: "u" } }),
    ...created(10, 300),
  ];
  const request = stubRequest({ "/repos/o/r/issues": page });
  const reading = await issuesProbe({ request, ...BASE });
  // 100 raw items, so coverage reads the raw page; the escape fires because
  // the oldest item predates the cutoff.
  assert.deepEqual(reading, { count: 0, covered: true });
});

test("issuesProbe counts issues only", async () => {
  const page = [...created(5, 30), ...created(2, 30, { pull_request: {} })];
  const request = stubRequest({ "/repos/o/r/issues": page });
  const reading = await issuesProbe({ request, ...BASE });
  assert.deepEqual(reading, { count: 5, covered: true });
});

test("commentsProbe drops the timestamp escape on a full page", async () => {
  // An old comment edited inside the window sorts last and would satisfy the
  // escape. This probe reads a full page as uncovered regardless.
  const page = [...created(99, 30), { created_at: ago(600) }];
  const request = stubRequest({ "/repos/o/r/issues/comments": page });
  const reading = await commentsProbe({ request, ...BASE });
  assert.deepEqual(reading, { count: 99, covered: false });
});

test("commentsProbe counts a short page and reports coverage", async () => {
  const request = stubRequest({
    "/repos/o/r/issues/comments": created(12, 45),
  });
  const reading = await commentsProbe({ request, ...BASE });
  assert.deepEqual(reading, { count: 12, covered: true });
});

test("a probe raises the transport's failure", async () => {
  const request = stubRequest({
    "/repos/o/r/commits": new Error("GitHub 500 on /repos/o/r/commits"),
  });
  await assert.rejects(() => commitsProbe({ request, ...BASE }), /GitHub 500/);
});
