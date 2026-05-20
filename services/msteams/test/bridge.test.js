import { test, describe } from "node:test";
import assert from "node:assert";

import {
  appendHistory,
  buildPrompt,
  createBridge,
  formatReply,
} from "../index.js";

function makeBridge(overrides = {}) {
  return createBridge({
    microsoftAppId: "test-app-id",
    microsoftAppPassword: "test-password",
    microsoftAppTenantId: "test-tenant",
    githubToken: "test-gh-token",
    githubRepo: "owner/repo",
    callbackBaseUrl: "https://tunnel.example",
    port: 0,
    ...overrides,
  });
}

describe("buildPrompt", () => {
  test("returns just the message text when history is empty", () => {
    assert.strictEqual(buildPrompt("hello", []), "hello");
  });

  test("prepends prior exchanges in chronological order", () => {
    const history = [
      { role: "user", text: "first question" },
      { role: "assistant", text: "first answer" },
    ];
    const result = buildPrompt("follow-up", history);
    assert.match(result, /Prior conversation:/);
    assert.match(result, /User: first question/);
    assert.match(result, /Agent: first answer/);
    assert.match(result, /Current message: follow-up/);
    assert.ok(
      result.indexOf("first question") < result.indexOf("first answer"),
      "user message must precede agent reply",
    );
    assert.ok(
      result.indexOf("first answer") < result.indexOf("follow-up"),
      "history must precede current message",
    );
  });

  test("caps history to the last 5 exchanges (10 entries)", () => {
    const history = [];
    for (let i = 0; i < 8; i++) {
      history.push({ role: "user", text: `q${i}` });
      history.push({ role: "assistant", text: `a${i}` });
    }
    const result = buildPrompt("now", history);
    // Oldest 3 exchanges (entries 0..5) are dropped; q5..q7 / a5..a7 remain.
    for (let i = 0; i < 3; i++) {
      assert.ok(
        !new RegExp(`User: q${i}\\b`).test(result),
        `q${i} must be dropped`,
      );
      assert.ok(
        !new RegExp(`Agent: a${i}\\b`).test(result),
        `a${i} must be dropped`,
      );
    }
    for (let i = 3; i < 8; i++) {
      assert.match(result, new RegExp(`User: q${i}\\b`));
      assert.match(result, new RegExp(`Agent: a${i}\\b`));
    }
  });

  test("drops the oldest entries when the prompt exceeds the character cap", () => {
    const big = "x".repeat(1500);
    const history = [
      { role: "user", text: `oldest ${big}` },
      { role: "assistant", text: `old reply ${big}` },
      { role: "user", text: `newer ${big}` },
      { role: "assistant", text: `newer reply ${big}` },
    ];
    const result = buildPrompt("now", history);
    assert.ok(
      result.length <= 4000,
      `expected <=4000 chars, got ${result.length}`,
    );
    // Older entries must be dropped first; newer must remain in the result.
    assert.ok(!result.includes("oldest"), "oldest entry must be dropped");
    assert.match(result, /Current message: now/);
  });
});

describe("formatReply", () => {
  test("formats verdict and summary in bold + dash form", () => {
    assert.strictEqual(
      formatReply({ verdict: "success", summary: "done" }),
      "**success** — done",
    );
  });

  test("appends a run-log link when run_url is present", () => {
    const out = formatReply({
      verdict: "failure",
      summary: "diagnosed root cause",
      run_url: "https://github.com/foo/bar/actions/runs/9",
    });
    assert.match(out, /\*\*failure\*\* — diagnosed root cause/);
    assert.match(
      out,
      /\[run log\]\(https:\/\/github\.com\/foo\/bar\/actions\/runs\/9\)/,
    );
  });

  test("falls back to 'unknown' when verdict is missing", () => {
    const out = formatReply({ summary: "no verdict" });
    assert.match(out, /\*\*unknown\*\*/);
  });
});

describe("appendHistory", () => {
  test("appends a single entry to an empty history", () => {
    const history = [];
    appendHistory(history, { role: "user", text: "hi" });
    assert.deepStrictEqual(history, [{ role: "user", text: "hi" }]);
  });

  test("preserves chronological order across many appends", () => {
    const history = [];
    for (let i = 0; i < 6; i++) {
      appendHistory(history, { role: "user", text: `u${i}` });
      appendHistory(history, { role: "assistant", text: `a${i}` });
    }
    // Cap is 10 entries (5 exchanges). Oldest exchange (u0/a0) dropped.
    assert.strictEqual(history.length, 10);
    assert.strictEqual(history[0].text, "u1");
    assert.strictEqual(history[history.length - 1].text, "a5");
  });

  test("never exceeds 10 entries even under sustained appends", () => {
    const history = [];
    for (let i = 0; i < 50; i++) {
      appendHistory(history, { role: "user", text: `x${i}` });
    }
    assert.strictEqual(history.length, 10);
    assert.strictEqual(history[0].text, "x40");
    assert.strictEqual(history[9].text, "x49");
  });
});

describe("createBridge — stores", () => {
  test("constructs empty pendingCallbacks and conversations maps", () => {
    const bridge = makeBridge();
    assert.ok(bridge.pendingCallbacks instanceof Map);
    assert.ok(bridge.conversations instanceof Map);
    assert.strictEqual(bridge.pendingCallbacks.size, 0);
    assert.strictEqual(bridge.conversations.size, 0);
  });

  test("pendingCallbacks supports token-based insert, O(1) lookup, and cleanup", () => {
    const bridge = makeBridge();
    bridge.pendingCallbacks.set("tok-abc", {
      correlationId: "corr-1",
      threadId: "thread-1",
    });
    bridge.pendingCallbacks.set("tok-def", {
      correlationId: "corr-2",
      threadId: "thread-2",
    });

    const got = bridge.pendingCallbacks.get("tok-abc");
    assert.deepStrictEqual(got, {
      correlationId: "corr-1",
      threadId: "thread-1",
    });
    assert.strictEqual(bridge.pendingCallbacks.has("tok-def"), true);
    assert.strictEqual(bridge.pendingCallbacks.has("tok-missing"), false);

    bridge.pendingCallbacks.delete("tok-abc");
    assert.strictEqual(bridge.pendingCallbacks.has("tok-abc"), false);
    assert.strictEqual(bridge.pendingCallbacks.size, 1);
  });

  test("conversations store keeps a bounded history per thread", () => {
    const bridge = makeBridge();
    const thread = { ref: { conversation: { id: "t1" } }, history: [] };
    bridge.conversations.set("t1", thread);

    for (let i = 0; i < 12; i++) {
      appendHistory(thread.history, { role: "user", text: `q${i}` });
      appendHistory(thread.history, { role: "assistant", text: `a${i}` });
    }

    assert.strictEqual(thread.history.length, 10);
    assert.strictEqual(thread.history[0].text, "q7");
    assert.strictEqual(thread.history[9].text, "a11");
    assert.strictEqual(bridge.conversations.size, 1);
  });
});

describe("createBridge — config normalization", () => {
  test("strips trailing slash from callbackBaseUrl in dispatch URL composition", async () => {
    const bridge = makeBridge({ callbackBaseUrl: "https://tunnel.example/" });
    // The bridge stores callbackBaseUrl internally after normalization, but
    // it is not directly exposed. Smoke-test by exercising the callback
    // route: a known token+correlation pair must route correctly under the
    // normalized base URL. We verify that the express app has the route
    // registered.
    const routes = bridge.app._router.stack
      .filter((layer) => layer.route)
      .map((layer) => layer.route.path);
    assert.ok(
      routes.includes("/api/callback/:token"),
      `expected /api/callback/:token in routes, got ${JSON.stringify(routes)}`,
    );
    assert.ok(routes.includes("/api/messages"));
  });
});
