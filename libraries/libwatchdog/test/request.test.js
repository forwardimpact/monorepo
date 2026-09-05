import { test } from "node:test";
import assert from "node:assert/strict";
import { createMockClock } from "@forwardimpact/libmock";

import { createRequest } from "../src/request.js";

const NOW = Date.parse("2026-09-02T16:49:00Z");

/** Build a Response-like stub. */
function response(status, body, headers = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers,
  });
}

test("createRequest retries a rate-limited 403 and then succeeds", async () => {
  const clock = createMockClock({ start: NOW });
  const pages = [
    response(
      403,
      { message: "rate limit exceeded" },
      { "x-ratelimit-remaining": "0" },
    ),
    response(200, [{ id: 1 }]),
  ];
  const request = createRequest({
    token: "t",
    clock,
    fetchImpl: async () => pages.shift(),
  });

  const { body } = await request("/repos/o/r/issues");
  assert.deepEqual(body, [{ id: 1 }]);
  assert.equal(clock.sleeps.length, 1);
});

test("createRequest retries a secondary limit named in the body", async () => {
  const clock = createMockClock({ start: NOW });
  const pages = [
    response(
      403,
      { message: "You have exceeded a secondary rate limit" },
      {
        "x-ratelimit-remaining": "42",
      },
    ),
    response(200, []),
  ];
  const request = createRequest({
    token: "t",
    clock,
    fetchImpl: async () => pages.shift(),
  });

  await request("/repos/o/r/pulls");
  assert.equal(clock.sleeps.length, 1);
});

test("createRequest throws after five 500 responses", async () => {
  const clock = createMockClock({ start: NOW });
  let calls = 0;
  const request = createRequest({
    token: "t",
    clock,
    fetchImpl: async () => {
      calls += 1;
      return response(500, { message: "boom" });
    },
  });

  await assert.rejects(() => request("/repos/o/r/commits"), /GitHub 500/);
  assert.equal(calls, 5);
  assert.equal(clock.sleeps.length, 4);
});

test("createRequest raises a 404 once, so the latch can read it as absent", async () => {
  const clock = createMockClock({ start: NOW });
  let calls = 0;
  const request = createRequest({
    token: "t",
    clock,
    fetchImpl: async () => {
      calls += 1;
      return response(404, { message: "Not Found" });
    },
  });

  await assert.rejects(
    () => request("/repos/o/r/actions/variables/X"),
    (error) => error.status === 404,
  );
  assert.equal(calls, 1);
});

test("createRequest raises a plain 403 without retrying", async () => {
  const clock = createMockClock({ start: NOW });
  let calls = 0;
  const request = createRequest({
    token: "t",
    clock,
    fetchImpl: async () => {
      calls += 1;
      return response(
        403,
        { message: "Resource not accessible" },
        {
          "x-ratelimit-remaining": "4999",
        },
      );
    },
  });

  await assert.rejects(() =>
    request("/repos/o/r/actions/organization-variables"),
  );
  assert.equal(calls, 1);
});

test("createRequest returns null for an empty body", async () => {
  const clock = createMockClock({ start: NOW });
  const request = createRequest({
    token: "t",
    clock,
    fetchImpl: async () => new Response(null, { status: 204 }),
  });

  const { body } = await request("/repos/o/r/actions/variables/X", {
    method: "PATCH",
  });
  assert.equal(body, null);
});

test("createRequest sends the bearer token and the API version", async () => {
  const clock = createMockClock({ start: NOW });
  let seen;
  const request = createRequest({
    token: "secret",
    clock,
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return response(200, {});
    },
  });

  await request("/repos/o/r/issues");
  assert.equal(seen.url, "https://api.github.com/repos/o/r/issues");
  assert.equal(seen.init.headers.Authorization, "Bearer secret");
  assert.equal(seen.init.headers["X-GitHub-Api-Version"], "2022-11-28");
});
