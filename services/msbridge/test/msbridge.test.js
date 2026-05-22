import { afterEach, beforeEach, describe, expect, test } from "bun:test";

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
      expect(typeof MsBridgeService).toBe("function");
      expect(MsBridgeService.prototype.start).toBeTruthy();
      expect(MsBridgeService.prototype.stop).toBeTruthy();
    });

    test("re-exports buildPrompt and appendHistory from libbridge", () => {
      expect(typeof buildPrompt).toBe("function");
      expect(typeof appendHistory).toBe("function");
    });
  });

  describe("validateCallbackPayload", () => {
    test("rejects bodies missing required keys", () => {
      const validRunUrl = "https://github.com/owner/repo/actions/runs/1";
      expect(validateCallbackPayload(null)).toBeNull();
      expect(validateCallbackPayload({})).toBeNull();
      expect(validateCallbackPayload({ correlation_id: 42 })).toBeNull();
      expect(
        validateCallbackPayload({
          correlation_id: "c1",
          summary: "ok",
          run_url: validRunUrl,
        }),
      ).toBeNull();
      expect(
        validateCallbackPayload({
          correlation_id: "c1",
          verdict: "success",
          run_url: validRunUrl,
        }),
      ).toBeNull();
      expect(
        validateCallbackPayload({
          correlation_id: "c1",
          verdict: "success",
          summary: "ok",
        }),
      ).toBeNull();
    });

    test("normalises required keys", () => {
      const payload = validateCallbackPayload({
        correlation_id: "c1",
        verdict: "success",
        summary: "all good",
        run_url: "https://github.com/owner/repo/actions/runs/1",
      });
      expect(payload).toEqual({
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
        run_url: "https://github.com/owner/repo/actions/runs/1",
        replies: [{ body: "hi" }],
        trigger: { kind: "responses", responses: 2 },
        discussion_id: "GD_abc",
      });
      expect(payload).toBeTruthy();
      expect(payload.replies).toBeUndefined();
      expect(payload.trigger).toBeUndefined();
      expect(payload.discussion_id).toBeUndefined();
    });

    test("rejects untrusted run_url hosts", () => {
      const payload = validateCallbackPayload({
        correlation_id: "c1",
        verdict: "success",
        summary: "",
        run_url: "https://evil.example/x",
      });
      expect(payload).toBeNull();
    });
  });

  describe("isValidRunUrl", () => {
    test("accepts https github.com URLs", () => {
      expect(
        isValidRunUrl("https://github.com/owner/repo/actions/runs/1"),
      ).toBe(true);
    });

    test("rejects non-github hosts and non-https", () => {
      expect(isValidRunUrl("https://evil.example/x")).toBe(false);
      expect(isValidRunUrl("http://github.com/x")).toBe(false);
      expect(isValidRunUrl(null)).toBe(false);
      expect(isValidRunUrl(42)).toBe(false);
    });
  });

  describe("formatReply", () => {
    test("returns the summary verbatim", () => {
      expect(formatReply({ verdict: "success", summary: "hello" })).toBe(
        "hello",
      );
    });

    test("returns empty string when summary missing", () => {
      expect(formatReply({})).toBe("");
    });
  });

  describe("MsBridgeService construction", () => {
    test("creates instance with config", () => {
      const service = newService();
      expect(service).toBeTruthy();
      expect(service.store).toBeTruthy();
      expect(service.callbacks).toBeTruthy();
    });

    test("throws if logger is missing", () => {
      expect(
        () =>
          new MsBridgeService(makeConfig(), {
            tracer: makeTracer(),
            storage: createMockStorage(),
            adapter: makeAdapter(),
          }),
      ).toThrow("logger is required");
    });

    test("throws if tracer is missing", () => {
      expect(
        () =>
          new MsBridgeService(makeConfig(), {
            logger: createMockLogger(),
            storage: createMockStorage(),
            adapter: makeAdapter(),
          }),
      ).toThrow("tracer is required");
    });

    test("throws if storage is missing", () => {
      expect(
        () =>
          new MsBridgeService(makeConfig(), {
            logger: createMockLogger(),
            tracer: makeTracer(),
            adapter: makeAdapter(),
          }),
      ).toThrow("storage is required");
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
      expect(res.status).toBe(404);
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
      expect(res.status).toBe(200);
    });

    test("correlation_id mismatch returns 400", async () => {
      const token = service.callbacks.register("real-corr", {
        threadId: "t-2",
      });
      await service.store.add({
        id: "msteams:t-2",
        channel: "msteams",
        discussion_id: "t-2",
        history: [],
        participants: [
          {
            name: "teams-user",
            kind: "human",
            metadata: { conversation: { id: "t-2" } },
          },
        ],
        open_rfcs: {},
        lead: "release-engineer",
        pending_callbacks: { [token]: "real-corr" },
        dispatches: [],
        last_active_at: Date.now(),
      });
      await service.store.flush();
      const res = await fetch(`${baseUrl}/api/callback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correlation_id: "wrong-corr",
          verdict: "success",
          summary: "ok",
          run_url: "https://github.com/owner/repo/actions/runs/1",
        }),
      });
      expect(res.status).toBe(400);
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
      expect(reloaded.participants[0].metadata).toEqual(ref);
    });
  });
});
