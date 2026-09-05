import { test } from "node:test";
import assert from "node:assert/strict";

import { decide } from "../src/latch.js";
import { createActionsVariableLatch } from "../src/latches/actions-variable.js";
import { ago, NOW, stubRequest, WINDOW_MS } from "./helpers.js";

const OPTIONS = { windowMs: WINDOW_MS, now: NOW };

test("decide skips when the effective value is truthy", () => {
  const state = {
    repository: { value: "watchdog|issues=47/32|x", updatedAt: ago(5) },
    organization: null,
    scope: "repository",
    value: "watchdog|issues=47/32|x",
    updatedAt: ago(5),
  };
  assert.equal(decide(state, OPTIONS), "skip");
});

test("decide skips for one window after a human clears the repository value", () => {
  const state = {
    repository: { value: "false", updatedAt: ago(30) },
    organization: null,
    scope: "repository",
    value: "false",
    updatedAt: ago(30),
  };
  assert.equal(decide(state, OPTIONS), "skip");
});

test("decide engages once the clear falls outside the window", () => {
  const state = {
    repository: { value: "false", updatedAt: ago(200) },
    organization: null,
    scope: "repository",
    value: "false",
    updatedAt: ago(200),
  };
  assert.equal(decide(state, OPTIONS), "engage");
});

test("decide engages for a truthy organization value under a stale falsy repository value", () => {
  const state = {
    repository: { value: "", updatedAt: ago(200) },
    organization: { value: "1", updatedAt: ago(500) },
    scope: "repository",
    value: "",
    updatedAt: ago(200),
  };
  assert.equal(decide(state, OPTIONS), "engage");
});

test("the resume rule outranks the scope inside the window", () => {
  const state = {
    repository: { value: "", updatedAt: ago(10) },
    organization: { value: "1", updatedAt: ago(500) },
    scope: "repository",
    value: "",
    updatedAt: ago(10),
  };
  assert.equal(decide(state, OPTIONS), "skip");
});

test("decide engages when no record exists at either scope", () => {
  const state = {
    repository: null,
    organization: null,
    scope: null,
    value: null,
    updatedAt: null,
  };
  assert.equal(decide(state, OPTIONS), "engage");
});

test("decide skips when only the organization value is truthy", () => {
  const state = {
    repository: null,
    organization: { value: "1", updatedAt: ago(500) },
    scope: "organization",
    value: "1",
    updatedAt: ago(500),
  };
  assert.equal(decide(state, OPTIONS), "skip");
});

/** Build a stub that answers the two latch reads. */
function latchRequest({ repository, organization = [], repoStatus }) {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    if (path.includes("/actions/variables/")) {
      if (repoStatus) {
        const error = new Error(`GitHub ${repoStatus} on ${path}`);
        error.status = repoStatus;
        throw error;
      }
      return { body: repository, headers: new Headers() };
    }
    if (path.includes("/actions/organization-variables")) {
      return { body: { variables: organization }, headers: new Headers() };
    }
    return { body: null, headers: new Headers() };
  };
  request.calls = calls;
  return request;
}

test("read resolves the repository record first", async () => {
  const request = latchRequest({
    repository: { name: "K", value: "1", updated_at: ago(5) },
    organization: [{ name: "K", value: "0", updated_at: ago(500) }],
  });
  const latch = createActionsVariableLatch({ request, repo: "o/r", name: "K" });
  const state = await latch.read();
  assert.equal(state.scope, "repository");
  assert.equal(state.value, "1");
  assert.equal(state.organization.value, "0");
});

test("read treats a 404 as an absent repository record", async () => {
  const request = latchRequest({
    repoStatus: 404,
    organization: [{ name: "K", value: "1", updated_at: ago(500) }],
  });
  const latch = createActionsVariableLatch({ request, repo: "o/r", name: "K" });
  const state = await latch.read();
  assert.equal(state.repository, null);
  assert.equal(state.scope, "organization");
  assert.equal(state.value, "1");
});

test("read raises any other repository-read failure", async () => {
  const request = latchRequest({ repoStatus: 403 });
  const latch = createActionsVariableLatch({ request, repo: "o/r", name: "K" });
  await assert.rejects(() => latch.read(), /GitHub 403/);
});

test("read pages the organization listing to the end", async () => {
  const pages = [
    {
      body: { variables: [{ name: "OTHER", value: "x", updated_at: ago(1) }] },
      headers: new Headers({
        link: '<https://api.github.com/repos/o/r/actions/organization-variables?per_page=30&page=2>; rel="next"',
      }),
    },
    {
      body: { variables: [{ name: "K", value: "1", updated_at: ago(2) }] },
      headers: new Headers(),
    },
  ];
  const paths = [];
  const request = async (path) => {
    paths.push(path);
    if (path.includes("/actions/variables/")) {
      const error = new Error("GitHub 404");
      error.status = 404;
      throw error;
    }
    return pages.shift();
  };
  const latch = createActionsVariableLatch({ request, repo: "o/r", name: "K" });
  const state = await latch.read();
  assert.equal(state.value, "1");
  assert.equal(
    paths.filter((p) => p.includes("organization-variables")).length,
    2,
  );
});

test("write patches the repository variable", async () => {
  const request = latchRequest({ repository: null });
  const latch = createActionsVariableLatch({ request, repo: "o/r", name: "K" });
  await latch.write("watchdog|issues=47/32|x");
  const call = request.calls.at(-1);
  assert.equal(call.init.method, "PATCH");
  assert.deepEqual(JSON.parse(call.init.body), {
    name: "K",
    value: "watchdog|issues=47/32|x",
  });
});

test("write creates the variable when the repository record is absent", async () => {
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    if (init?.method === "PATCH") {
      const error = new Error("GitHub 404");
      error.status = 404;
      throw error;
    }
    return { body: null, headers: new Headers() };
  };
  const latch = createActionsVariableLatch({ request, repo: "o/r", name: "K" });
  await latch.write("watchdog|x");
  assert.equal(calls.at(-1).init.method, "POST");
  assert.equal(calls.at(-1).path, "/repos/o/r/actions/variables");
});
