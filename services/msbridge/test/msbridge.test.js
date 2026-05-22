import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";

import {
  createMockConfig,
  createMockLogger,
  createMockStorage,
} from "@forwardimpact/libharness";

import {
  MsBridgeService,
  appendHistory,
  buildPrompt,
  formatReply,
  isValidRunUrl,
  validateCallbackPayload,
} from "../index.js";

function makeConfig(overrides = {}) {
  return createMockConfig("msbridge", {
    port: 0,
    host: "127.0.0.1",
    github_repo: "owner/repo",
    callback_base_url: "https://tunnel.example",
    msAppId: () => "test-app-id",
    msAppPassword: () => "test-password",
    msAppTenantId: () => "test-tenant",
    ghToken: () => "test-gh-token",
    ...overrides,
  });
}

function makeTracer() {
  const noop = () => {};
  return {
    startSpan: () => ({
      addEvent: noop,
      setOk: noop,
      setError: noop,
      end: async () => {},
    }),
  };
}

function makeAdapter(overrides = {}) {
  return {
    process: async (_req, res, callback) => {
      const turnContext = {
        activity: overrides.activity ?? { type: "message" },
        sendActivity: async () => {},
      };
      await callback(turnContext);
      if (!res.headersSent) res.status(200).end();
    },
    continueConversationAsync: async (_appId, _ref, callback) => {
      await callback({ sendActivity: async () => {} });
    },
    onTurnError: null,
    ...overrides,
  };
}

function newService({ adapter, config: configOverrides } = {}) {
  return new MsBridgeService(makeConfig(configOverrides), {
    logger: createMockLogger(),
    tracer: makeTracer(),
    storage: createMockStorage(),
    adapter: adapter ?? makeAdapter(),
  });
}

describe("msbridge service", () => {
  describe("module exports", () => {
    test("exports MsBridgeService class", () => {
      assert.strictEqual(typeof MsBridgeService, "function");
      assert.ok(MsBridgeService.prototype.start);
      assert.ok(MsBridgeService.prototype.stop);
    });

    test("re-exports buildPrompt and appendHistory from libbridge", () => {
      assert.strictEqual(typeof buildPrompt, "function");
      assert.strictEqual(typeof appendHistory, "function");
    });
  });

  describe("validateCallbackPayload", () => {
    test("requires a correlation_id", () => {
      assert.strictEqual(validateCallbackPayload(null), null);
      assert.strictEqual(validateCallbackPayload({}), null);
      assert.strictEqual(validateCallbackPayload({ correlation_id: 42 }), null);
    });

    test("normalises required keys", () => {
      const payload = validateCallbackPayload({
        correlation_id: "c1",
        verdict: "success",
        summary: "all good",
        run_url: "https://github.com/owner/repo/actions/runs/1",
      });
      assert.deepStrictEqual(payload, {
        correlation_id: "c1",
        verdict: "success",
        summary: "all good",
        run_url: "https://github.com/owner/repo/actions/runs/1",
      });
    });

    test("accepts optional channel-agnostic fields without surfacing them", () => {
      const payload = validateCallbackPayload({
        correlation_id: "c1",
        verdict: "adjourned",
        summary: "done",
        replies: [{ body: "hi" }],
        trigger: { kind: "responses", responses: 2 },
        discussion_id: "GD_abc",
      });
      assert.ok(payload);
      assert.strictEqual(payload.replies, undefined);
      assert.strictEqual(payload.trigger, undefined);
      assert.strictEqual(payload.discussion_id, undefined);
    });

    test("rejects untrusted run_url hosts", () => {
      const payload = validateCallbackPayload({
        correlation_id: "c1",
        verdict: "success",
        summary: "",
        run_url: "https://evil.example/x",
      });
      assert.strictEqual(payload.run_url, undefined);
    });
  });

  describe("isValidRunUrl", () => {
    test("accepts https github.com URLs", () => {
      assert.strictEqual(
        isValidRunUrl("https://github.com/owner/repo/actions/runs/1"),
        true,
      );
    });

    test("rejects non-github hosts and non-https", () => {
      assert.strictEqual(isValidRunUrl("https://evil.example/x"), false);
      assert.strictEqual(isValidRunUrl("http://github.com/x"), false);
      assert.strictEqual(isValidRunUrl(null), false);
      assert.strictEqual(isValidRunUrl(42), false);
    });
  });

  describe("formatReply", () => {
    test("returns the summary verbatim", () => {
      assert.strictEqual(
        formatReply({ verdict: "success", summary: "hello" }),
        "hello",
      );
    });

    test("returns empty string when summary missing", () => {
      assert.strictEqual(formatReply({}), "");
    });
  });

  describe("MsBridgeService construction", () => {
    test("creates instance with config", () => {
      const service = newService();
      assert.ok(service);
      assert.ok(service.store);
      assert.ok(service.callbacks);
    });

    test("throws if logger is missing", () => {
      assert.throws(
        () =>
          new MsBridgeService(makeConfig(), {
            tracer: makeTracer(),
            storage: createMockStorage(),
            adapter: makeAdapter(),
          }),
        { message: "logger is required" },
      );
    });

    test("throws if tracer is missing", () => {
      assert.throws(
        () =>
          new MsBridgeService(makeConfig(), {
            logger: createMockLogger(),
            storage: createMockStorage(),
            adapter: makeAdapter(),
          }),
        { message: "tracer is required" },
      );
    });

    test("throws if storage is missing", () => {
      assert.throws(
        () =>
          new MsBridgeService(makeConfig(), {
            logger: createMockLogger(),
            tracer: makeTracer(),
            adapter: makeAdapter(),
          }),
        { message: "storage is required" },
      );
    });
  });

  describe("callback handler", () => {
    let service;
    let baseUrl;

    beforeEach(async () => {
      service = newService();
      await service.start();
      baseUrl = `http://127.0.0.1:${service.address().port}`;
    });

    afterEach(async () => {
      await service.stop();
    });

    test("unknown token returns 404", async () => {
      const res = await fetch(`${baseUrl}/api/callback/no-such-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correlation_id: "x",
          verdict: "success",
          summary: "",
        }),
      });
      assert.strictEqual(res.status, 404);
    });

    test("accepts payloads carrying optional replies/trigger/discussion_id", async () => {
      const token = service.callbacks.register("c-1", { threadId: "t-1" });
      const ref = {
        bot: { id: "b" },
        channelId: "msteams",
        conversation: { id: "t-1" },
        serviceUrl: "https://example",
        user: { id: "u" },
        activityId: "a",
      };
      await service.store.add({
        id: "msteams:t-1",
        channel: "msteams",
        discussion_id: "t-1",
        history: [],
        participants: [{ name: "teams-user", kind: "human", metadata: ref }],
        open_rfcs: {},
        lead: "release-engineer",
        pending_callbacks: { [token]: "c-1" },
        dispatches: [],
        last_active_at: Date.now(),
      });
      await service.store.flush();

      const res = await fetch(`${baseUrl}/api/callback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correlation_id: "c-1",
          verdict: "adjourned",
          summary: "ok",
          run_url: "https://github.com/owner/repo/actions/runs/1",
          replies: [{ body: "ignored on teams" }],
          trigger: { kind: "responses", responses: 2 },
          discussion_id: "GD_x",
        }),
      });
      assert.strictEqual(res.status, 200);
    });
  });

  describe("ConversationReference round-trip", () => {
    test("nested object survives storage flush + reload", async () => {
      const service = newService();
      const ref = {
        bot: { id: "bot-id", name: "Bot" },
        channelId: "msteams",
        conversation: { id: "thread-1", tenantId: "tenant-x" },
        serviceUrl: "https://smba.trafficmanager.net/",
        user: { id: "user-1", name: "Alice" },
        activityId: "1234567890",
        locale: "en-US",
      };
      const record = {
        id: "msteams:thread-1",
        channel: "msteams",
        discussion_id: "thread-1",
        history: [],
        participants: [{ name: "teams-user", kind: "human", metadata: ref }],
        open_rfcs: {},
        lead: "release-engineer",
        pending_callbacks: {},
        dispatches: [],
        last_active_at: Date.now(),
      };
      await service.store.add(record);
      await service.store.flush();
      const reloaded = await service.store.loadByChannel("msteams", "thread-1");
      assert.deepStrictEqual(reloaded.participants[0].metadata, ref);
    });
  });
});
