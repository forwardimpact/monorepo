import {
  test,
  describe,
  beforeEach,
  afterEach,
  before,
  after,
} from "node:test";
import assert from "node:assert";

import { HmacAuth } from "@forwardimpact/librpc";

import {
  MsTeamsService,
  appendHistory,
  buildPrompt,
  formatReply,
  isValidRunUrl,
  validateCallbackPayload,
} from "../index.js";
import { createMockConfig } from "@forwardimpact/libharness";

const TEST_SECRET =
  "test-secret-that-is-definitely-at-least-32-characters-long-for-hmac";

before(() => {
  process.env.SERVICE_SECRET = TEST_SECRET;
});

after(() => {
  delete process.env.SERVICE_SECRET;
});

function makeConfig(overrides = {}) {
  return createMockConfig("msteams", {
    port: 0,
    github_repo: "owner/repo",
    callback_base_url: "https://tunnel.example",
    msAppId: () => "test-app-id",
    msAppPassword: () => "test-password",
    msAppTenantId: () => "test-tenant",
    ghToken: () => "test-gh-token",
    ...overrides,
  });
}

function makeDeps() {
  const noop = () => {};
  return {
    logger: { debug: noop, info: noop, error: noop },
    tracer: {
      startSpan: () => ({
        addEvent: noop,
        setOk: noop,
        setError: noop,
        end: async () => {},
      }),
    },
  };
}

describe("msteams service", () => {
  describe("MsTeamsService", () => {
    test("exports MsTeamsService class", () => {
      assert.strictEqual(typeof MsTeamsService, "function");
      assert.ok(MsTeamsService.prototype);
    });

    test("MsTeamsService has start method", () => {
      assert.strictEqual(typeof MsTeamsService.prototype.start, "function");
    });

    test("MsTeamsService has stop method", () => {
      assert.strictEqual(typeof MsTeamsService.prototype.stop, "function");
    });

    test("MsTeamsService has proper method signatures", () => {
      const methods = Object.getOwnPropertyNames(MsTeamsService.prototype);
      assert(methods.includes("start"));
      assert(methods.includes("stop"));
      assert(methods.includes("constructor"));
    });
  });

  describe("MsTeamsService instance", () => {
    let config;
    let deps;

    beforeEach(() => {
      config = makeConfig();
      deps = makeDeps();
    });

    test("creates service instance with config", () => {
      const service = new MsTeamsService(config, deps);
      assert.ok(service);
      assert.strictEqual(service.config, config);
    });

    test("throws if logger is missing", () => {
      assert.throws(() => new MsTeamsService(config, { tracer: deps.tracer }), {
        message: "logger is required",
      });
    });

    test("throws if tracer is missing", () => {
      assert.throws(() => new MsTeamsService(config, { logger: deps.logger }), {
        message: "tracer is required",
      });
    });

    test("constructs empty conversations and pendingCallbacks maps", () => {
      const service = new MsTeamsService(config, deps);
      assert.ok(service.conversations instanceof Map);
      assert.ok(service.pendingCallbacks instanceof Map);
      assert.strictEqual(service.conversations.size, 0);
      assert.strictEqual(service.pendingCallbacks.size, 0);
    });

    test("pendingCallbacks supports token-based insert, lookup, and cleanup", () => {
      const service = new MsTeamsService(config, deps);
      service.pendingCallbacks.set("tok-abc", {
        correlationId: "corr-1",
        threadId: "thread-1",
        createdAt: Date.now(),
      });
      service.pendingCallbacks.set("tok-def", {
        correlationId: "corr-2",
        threadId: "thread-2",
        createdAt: Date.now(),
      });

      const got = service.pendingCallbacks.get("tok-abc");
      assert.strictEqual(got.correlationId, "corr-1");
      assert.strictEqual(got.threadId, "thread-1");
      assert.strictEqual(service.pendingCallbacks.has("tok-def"), true);
      assert.strictEqual(service.pendingCallbacks.has("tok-missing"), false);

      service.pendingCallbacks.delete("tok-abc");
      assert.strictEqual(service.pendingCallbacks.has("tok-abc"), false);
      assert.strictEqual(service.pendingCallbacks.size, 1);
    });

    test("conversations store keeps a bounded history per thread", () => {
      const service = new MsTeamsService(config, deps);
      const thread = {
        ref: { conversation: { id: "t1" } },
        history: [],
        lastActiveAt: Date.now(),
        dispatches: [],
      };
      service.conversations.set("t1", thread);

      for (let i = 0; i < 12; i++) {
        appendHistory(thread.history, { role: "user", text: `q${i}` });
        appendHistory(thread.history, { role: "assistant", text: `a${i}` });
      }

      assert.strictEqual(thread.history.length, 10);
      assert.strictEqual(thread.history[0].text, "q7");
      assert.strictEqual(thread.history[9].text, "a11");
      assert.strictEqual(service.conversations.size, 1);
    });

    test("registers expected routes on express app", () => {
      const service = new MsTeamsService(config, deps);
      const routes = service.app._router.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route.path);
      assert.ok(routes.includes("/api/callback/:token"));
      assert.ok(routes.includes("/api/messages"));
    });

    test("normalizes trailing slash from callbackBaseUrl", () => {
      const service = new MsTeamsService(
        makeConfig({ callback_base_url: "https://tunnel.example/" }),
        deps,
      );
      const routes = service.app._router.stack
        .filter((layer) => layer.route)
        .map((layer) => layer.route.path);
      assert.ok(routes.includes("/api/callback/:token"));
      assert.ok(routes.includes("/api/messages"));
    });
  });

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
      assert.ok(!result.includes("oldest"), "oldest entry must be dropped");
      assert.match(result, /Current message: now/);
    });
  });

  describe("isValidRunUrl", () => {
    test("accepts valid GitHub actions run URL", () => {
      assert.strictEqual(
        isValidRunUrl("https://github.com/owner/repo/actions/runs/123"),
        true,
      );
    });

    test("accepts GitHub URL with nested path", () => {
      assert.strictEqual(
        isValidRunUrl("https://github.com/owner/repo/actions/runs/123/job/456"),
        true,
      );
    });

    test("rejects HTTP (non-HTTPS) URL", () => {
      assert.strictEqual(
        isValidRunUrl("http://github.com/owner/repo/actions/runs/123"),
        false,
      );
    });

    test("rejects non-GitHub hostname", () => {
      assert.strictEqual(
        isValidRunUrl("https://evil.com/owner/repo/actions/runs/123"),
        false,
      );
    });

    test("rejects spoofed hostname like github.com.evil.com", () => {
      assert.strictEqual(
        isValidRunUrl("https://github.com.evil.com/path"),
        false,
      );
    });

    test("rejects javascript: URL", () => {
      assert.strictEqual(isValidRunUrl("javascript:alert(1)"), false);
    });

    test("rejects non-string input", () => {
      assert.strictEqual(isValidRunUrl(null), false);
      assert.strictEqual(isValidRunUrl(undefined), false);
      assert.strictEqual(isValidRunUrl(42), false);
      assert.strictEqual(isValidRunUrl({}), false);
    });

    test("rejects empty string", () => {
      assert.strictEqual(isValidRunUrl(""), false);
    });
  });

  describe("validateCallbackPayload", () => {
    test("returns validated payload for valid input", () => {
      const result = validateCallbackPayload({
        correlation_id: "cid-1",
        verdict: "success",
        summary: "done",
        run_url: "https://github.com/o/r/actions/runs/1",
      });
      assert.deepStrictEqual(result, {
        correlation_id: "cid-1",
        verdict: "success",
        summary: "done",
        run_url: "https://github.com/o/r/actions/runs/1",
      });
    });

    test("returns null for null body", () => {
      assert.strictEqual(validateCallbackPayload(null), null);
    });

    test("returns null for non-object body", () => {
      assert.strictEqual(validateCallbackPayload("string"), null);
    });

    test("returns null when correlation_id is missing", () => {
      assert.strictEqual(validateCallbackPayload({ verdict: "success" }), null);
    });

    test("returns null when correlation_id is not a string", () => {
      assert.strictEqual(
        validateCallbackPayload({ correlation_id: 123 }),
        null,
      );
    });

    test("defaults verdict to 'unknown' when missing", () => {
      const result = validateCallbackPayload({ correlation_id: "cid" });
      assert.strictEqual(result.verdict, "unknown");
    });

    test("defaults summary to empty string when missing", () => {
      const result = validateCallbackPayload({ correlation_id: "cid" });
      assert.strictEqual(result.summary, "");
    });

    test("truncates verdict exceeding max length", () => {
      const result = validateCallbackPayload({
        correlation_id: "cid",
        verdict: "x".repeat(3000),
      });
      assert.strictEqual(result.verdict.length, 2000);
    });

    test("truncates summary exceeding max length", () => {
      const result = validateCallbackPayload({
        correlation_id: "cid",
        summary: "x".repeat(3000),
      });
      assert.strictEqual(result.summary.length, 2000);
    });

    test("drops invalid run_url", () => {
      const result = validateCallbackPayload({
        correlation_id: "cid",
        run_url: "http://evil.com/attack",
      });
      assert.strictEqual(result.run_url, undefined);
    });

    test("drops non-string run_url", () => {
      const result = validateCallbackPayload({
        correlation_id: "cid",
        run_url: 12345,
      });
      assert.strictEqual(result.run_url, undefined);
    });

    test("keeps valid run_url", () => {
      const result = validateCallbackPayload({
        correlation_id: "cid",
        run_url: "https://github.com/o/r/actions/runs/9",
      });
      assert.strictEqual(
        result.run_url,
        "https://github.com/o/r/actions/runs/9",
      );
    });
  });

  describe("formatReply", () => {
    test("formats verdict and summary in bold + dash form", () => {
      assert.strictEqual(
        formatReply({ verdict: "success", summary: "done" }),
        "**success** — done",
      );
    });

    test("appends a run-log link when run_url is a valid GitHub URL", () => {
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

    test("omits run_url link when URL is not a valid GitHub URL", () => {
      const out = formatReply({
        verdict: "success",
        summary: "done",
        run_url: "https://evil.com/phish",
      });
      assert.strictEqual(out, "**success** — done");
    });

    test("omits run_url link when URL is javascript:", () => {
      const out = formatReply({
        verdict: "success",
        summary: "done",
        run_url: "javascript:alert(1)",
      });
      assert.strictEqual(out, "**success** — done");
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

  describe("callback endpoint", () => {
    let service;
    let server;
    let port;
    let hmacAuth;

    beforeEach(async () => {
      service = new MsTeamsService(makeConfig(), makeDeps());
      hmacAuth = new HmacAuth(TEST_SECRET);
      await new Promise((resolve) => {
        server = service.app.listen(0, () => {
          port = server.address().port;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise((resolve) => server.close(resolve));
    });

    test("returns 404 for unknown callback token", async () => {
      const token = hmacAuth.generateToken("agent-react");
      const res = await fetch(
        `http://localhost:${port}/api/callback/unknown-token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ correlation_id: "cid" }),
        },
      );
      assert.strictEqual(res.status, 404);
    });

    test("returns 400 for invalid payload", async () => {
      service.pendingCallbacks.set("tok-1", {
        correlationId: "cid-1",
        threadId: "thread-1",
        createdAt: Date.now(),
      });

      const token = hmacAuth.generateToken("agent-react");
      const res = await fetch(`http://localhost:${port}/api/callback/tok-1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error, "Invalid payload");
    });

    test("returns 400 for correlation ID mismatch", async () => {
      service.pendingCallbacks.set("tok-2", {
        correlationId: "expected-cid",
        threadId: "thread-1",
        createdAt: Date.now(),
      });

      const token = hmacAuth.generateToken("agent-react");
      const res = await fetch(`http://localhost:${port}/api/callback/tok-2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ correlation_id: "wrong-cid" }),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error, "Correlation ID mismatch");
    });
  });
});
