import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  createMockConfig,
  createMockLogger,
  createMockStorage,
} from "@forwardimpact/libharness";

import { MsBridgeService } from "../index.js";

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

function makeConfig(overrides = {}) {
  return createMockConfig("msbridge", {
    port: 0,
    host: "127.0.0.1",
    github_repo: "owner/repo",
    callback_base_url: "https://tunnel.example",
    msAppId: () => "test-app-id",
    msAppPassword: () => "test-password",
    msAppTenantId: () => "test-tenant",
    ...overrides,
  });
}

function makeAdapter(overrides = {}) {
  const sent = [];
  return {
    sent,
    reactionActivities: [],
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
          sent.push(activity);
        },
      });
    },
    onTurnError: null,
    ...overrides,
  };
}

function makeGhauthClient(impl) {
  const calls = [];
  return {
    calls,
    GetToken: async (req) => {
      calls.push(req);
      return impl(req);
    },
  };
}

function makeActivity(threadId, fromId, text) {
  return {
    type: "message",
    id: "a-1",
    text,
    conversation: { id: threadId },
    channelId: "msteams",
    serviceUrl: "https://example",
    from: { id: fromId },
    recipient: { id: "b" },
  };
}

describe("msbridge dispatch-auth", () => {
  let dispatches;
  let originalFetch;

  beforeEach(() => {
    dispatches = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const target = String(url);
      if (target.startsWith("https://api.github.com/")) {
        dispatches.push({ url: target, init });
        return new Response("{}", { status: 204 });
      }
      return originalFetch(url, init);
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("sender S triggers ghauth query with (msteams, S); sender T triggers (msteams, T)", async () => {
    const client = makeGhauthClient(() => ({
      result: "token",
      token: "ghs_user",
    }));
    const overrides = {
      activity: makeActivity("t-1", "sender-S", "hello from S"),
    };
    const adapter = makeAdapter(overrides);
    const service = new MsBridgeService(makeConfig(), {
      logger: createMockLogger(),
      tracer: makeTracer(),
      storage: createMockStorage(),
      ghauthClient: client,
      adapter,
    });
    await service.start();
    const baseUrl = `http://127.0.0.1:${service.address().port}`;

    await fetch(`${baseUrl}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "message" }),
    });

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].surface).toBe("msteams");
    expect(client.calls[0].surface_user_id).toBe("sender-S");

    overrides.activity = makeActivity("t-2", "sender-T", "hello from T");
    await fetch(`${baseUrl}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "message" }),
    });

    expect(client.calls).toHaveLength(2);
    expect(client.calls[1].surface_user_id).toBe("sender-T");

    await service.stop();
  });

  test("link_required: channel receives authorize URL, no workflow_dispatch", async () => {
    const client = makeGhauthClient(() => ({
      result: "link_required",
      link_required: {
        authorize_url: "https://example.com/authorize?s=msteams",
      },
    }));
    const adapter = makeAdapter({
      activity: makeActivity("t-link", "U_link", "hi"),
    });
    const service = new MsBridgeService(makeConfig(), {
      logger: createMockLogger(),
      tracer: makeTracer(),
      storage: createMockStorage(),
      ghauthClient: client,
      adapter,
    });
    await service.start();
    const baseUrl = `http://127.0.0.1:${service.address().port}`;

    await fetch(`${baseUrl}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "message" }),
    });

    expect(dispatches).toHaveLength(0);
    expect(
      adapter.sent.some((m) =>
        typeof m === "string"
          ? m.includes("https://example.com/authorize")
          : false,
      ),
    ).toBe(true);

    await service.stop();
  });

  test("reauth_required: channel receives re-link prompt, no workflow_dispatch", async () => {
    const client = makeGhauthClient(() => ({
      result: "re_auth_required",
      re_auth_required: {},
    }));
    const adapter = makeAdapter({
      activity: makeActivity("t-reauth", "U_reauth", "hi"),
    });
    const service = new MsBridgeService(makeConfig(), {
      logger: createMockLogger(),
      tracer: makeTracer(),
      storage: createMockStorage(),
      ghauthClient: client,
      adapter,
    });
    await service.start();
    const baseUrl = `http://127.0.0.1:${service.address().port}`;

    await fetch(`${baseUrl}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "message" }),
    });

    expect(dispatches).toHaveLength(0);
    expect(
      adapter.sent.some((m) =>
        typeof m === "string" ? m.includes("re-link") : false,
      ),
    ).toBe(true);

    await service.stop();
  });

  test("transient: channel receives transient error, no workflow_dispatch", async () => {
    const client = makeGhauthClient(() => {
      throw new Error("UNAVAILABLE");
    });
    const adapter = makeAdapter({
      activity: makeActivity("t-transient", "U_transient", "hi"),
    });
    const service = new MsBridgeService(makeConfig(), {
      logger: createMockLogger(),
      tracer: makeTracer(),
      storage: createMockStorage(),
      ghauthClient: client,
      adapter,
    });
    await service.start();
    const baseUrl = `http://127.0.0.1:${service.address().port}`;

    await fetch(`${baseUrl}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "message" }),
    });

    expect(dispatches).toHaveLength(0);
    expect(
      adapter.sent.some((m) =>
        typeof m === "string" ? m.includes("try again later") : false,
      ),
    ).toBe(true);

    await service.stop();
  });

  test("token: workflow_dispatch uses per-user token", async () => {
    const client = makeGhauthClient(() => ({
      result: "token",
      token: "ghs_alice_personal",
    }));
    const adapter = makeAdapter({
      activity: makeActivity("t-token", "U_alice", "deploy"),
    });
    const service = new MsBridgeService(makeConfig(), {
      logger: createMockLogger(),
      tracer: makeTracer(),
      storage: createMockStorage(),
      ghauthClient: client,
      adapter,
    });
    await service.start();
    const baseUrl = `http://127.0.0.1:${service.address().port}`;

    await fetch(`${baseUrl}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "message" }),
    });

    expect(dispatches).toHaveLength(1);
    expect(dispatches[0].init.headers.Authorization).toBe(
      "Bearer ghs_alice_personal",
    );

    await service.stop();
  });
});
