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
  const sent = [];
  const reactionActivities = [];
  return {
    sent,
    reactionActivities,
    process: async (_req, res, callback) => {
      const turnContext = {
        activity: overrides.activity ?? { type: "message" },
        sendActivity: async (activity) => {
          sent.push(activity);
        },
      };
      await callback(turnContext);
      if (!res.headersSent) res.status(200).end();
    },
    continueConversationAsync: async (_appId, _ref, callback) => {
      await callback({
        sendActivity: async (activity) => {
          if (
            activity &&
            typeof activity === "object" &&
            activity.type === "messageReaction"
          ) {
            reactionActivities.push(activity);
          } else {
            sent.push(activity);
          }
        },
      });
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

    test("re-exports buildPrompt, appendHistory, validateCallbackPayload from libbridge", () => {
      expect(typeof buildPrompt).toBe("function");
      expect(typeof appendHistory).toBe("function");
      expect(typeof validateCallbackPayload).toBe("function");
    });
  });

  describe("validateCallbackPayload (lenient libbridge contract)", () => {
    test("requires only correlation_id", () => {
      expect(validateCallbackPayload(null)).toBeNull();
      expect(validateCallbackPayload({})).toBeNull();
      const minimal = validateCallbackPayload({ correlation_id: "c-1" });
      expect(minimal).toEqual({
        correlation_id: "c-1",
        verdict: "unknown",
        summary: "",
        replies: [],
      });
    });

    test("passes through optional channel-agnostic fields", () => {
      const payload = validateCallbackPayload({
        correlation_id: "c-1",
        verdict: "adjourned",
        summary: "done",
        replies: [{ body: "hi" }],
        trigger: { kind: "responses", responses: 2 },
        discussion_id: "GD_x",
      });
      expect(payload.replies).toEqual([{ body: "hi" }]);
      expect(payload.trigger).toEqual({ kind: "responses", responses: 2 });
      expect(payload.discussion_id).toBe("GD_x");
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
    let adapter;
    let baseUrl;

    async function seedCtx(token, threadId, correlationId) {
      const ref = {
        bot: { id: "b" },
        channelId: "msteams",
        conversation: { id: threadId },
        serviceUrl: "https://example",
        user: { id: "u" },
        activityId: "a-1",
      };
      await service.store.add({
        id: `msteams:${threadId}`,
        channel: "msteams",
        discussion_id: threadId,
        history: [],
        participants: [{ name: "teams-user", kind: "human", metadata: ref }],
        open_rfcs: {},
        lead: "release-engineer",
        pending_callbacks: { [token]: correlationId },
        dispatches: [],
        last_active_at: Date.now(),
      });
      await service.store.flush();
      return ref;
    }

    beforeEach(async () => {
      adapter = makeAdapter();
      service = newService({ adapter });
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
          verdict: "adjourned",
          summary: "",
        }),
      });
      expect(res.status).toBe(404);
    });

    test("correlation_id mismatch returns 400", async () => {
      const token = service.callbacks.register("real-corr", {
        threadId: "t-mm",
      });
      await seedCtx(token, "t-mm", "real-corr");
      const res = await fetch(`${baseUrl}/api/callback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correlation_id: "wrong-corr",
          verdict: "adjourned",
          summary: "ok",
        }),
      });
      expect(res.status).toBe(400);
    });

    test("adjourned verdict posts each reply as a separate sendActivity", async () => {
      const token = service.callbacks.register("c-adj", { threadId: "t-adj" });
      await seedCtx(token, "t-adj", "c-adj");
      const res = await fetch(`${baseUrl}/api/callback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correlation_id: "c-adj",
          verdict: "adjourned",
          summary: "ignored summary",
          replies: [{ body: "first" }, { body: "follow up" }],
        }),
      });
      expect(res.status).toBe(200);
      expect(adapter.sent).toContain("first");
      expect(adapter.sent).toContain("follow up");
      expect(adapter.sent).not.toContain("ignored summary");
      const stored = await service.store.loadByChannel("msteams", "t-adj");
      expect(stored.history.map((h) => h.text)).toEqual(["first", "follow up"]);
    });

    test("failed verdict additionally posts the summary", async () => {
      const token = service.callbacks.register("c-fail", {
        threadId: "t-fail",
      });
      await seedCtx(token, "t-fail", "c-fail");
      const res = await fetch(`${baseUrl}/api/callback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correlation_id: "c-fail",
          verdict: "failed",
          summary: "facilitator failed; see run",
          replies: [{ body: "what we had so far" }],
        }),
      });
      expect(res.status).toBe(200);
      expect(adapter.sent).toContain("what we had so far");
      expect(adapter.sent).toContain("facilitator failed; see run");
    });

    test("recessed verdict logs and posts only the replies (no resume yet)", async () => {
      const token = service.callbacks.register("c-rec", { threadId: "t-rec" });
      await seedCtx(token, "t-rec", "c-rec");
      const res = await fetch(`${baseUrl}/api/callback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correlation_id: "c-rec",
          verdict: "recessed",
          summary: "awaiting humans",
          replies: [{ body: "what do you think?" }],
          trigger: { kind: "responses", responses: 2 },
        }),
      });
      expect(res.status).toBe(200);
      expect(adapter.sent).toContain("what do you think?");
      expect(adapter.sent).not.toContain("awaiting humans");
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

  describe("acknowledgement lifecycle", () => {
    let service;
    let adapter;
    let baseUrl;

    beforeEach(async () => {
      adapter = makeAdapter({
        activity: {
          type: "message",
          id: "act-1",
          text: "hello",
          conversation: { id: "thread-ack" },
          channelId: "msteams",
          serviceUrl: "https://example",
          from: { id: "u" },
          recipient: { id: "b" },
        },
      });
      service = newService({ adapter });
      // Stub the workflow dispatch fetch.
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        const target = String(url);
        if (target.startsWith("https://api.github.com/")) {
          return new Response("{}", { status: 204 });
        }
        return originalFetch(url, init);
      };
      service._restoreFetch = () => {
        globalThis.fetch = originalFetch;
      };
      await service.start();
      baseUrl = `http://127.0.0.1:${service.address().port}`;
    });

    afterEach(async () => {
      await service.stop();
      service._restoreFetch();
    });

    test("dispatch sends a 'like' reactionsAdded activity and callback sends reactionsRemoved", async () => {
      // Drive an inbound message through the bot adapter.
      const res = await fetch(`${baseUrl}/api/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "message", text: "hi" }),
      });
      expect(res.status).toBe(200);
      const added = adapter.reactionActivities.filter(
        (a) => a.reactionsAdded?.[0]?.type === "like",
      );
      expect(added.length).toBe(1);
      expect(added[0].replyToId).toBe("act-1");

      // Now invoke the callback for the token that was just registered.
      const stored = await service.store.loadByChannel("msteams", "thread-ack");
      const [token] = Object.keys(stored.pending_callbacks);
      const correlationId = stored.pending_callbacks[token];
      const cb = await fetch(`${baseUrl}/api/callback/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correlation_id: correlationId,
          verdict: "adjourned",
          summary: "",
          replies: [{ body: "ok" }],
        }),
      });
      expect(cb.status).toBe(200);
      const removed = adapter.reactionActivities.filter(
        (a) => a.reactionsRemoved?.[0]?.type === "like",
      );
      expect(removed.length).toBe(1);
      expect(removed[0].replyToId).toBe("act-1");
    });
  });
});
