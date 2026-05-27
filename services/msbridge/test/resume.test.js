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

function makeConfig(configOverrides = {}) {
  return createMockConfig("msbridge", {
    port: 0,
    host: "127.0.0.1",
    github_repo: "owner/repo",
    callback_base_url: "https://tunnel.example",
    msAppId: () => "test-app-id",
    msAppPassword: () => "test-password",
    msAppTenantId: () => "test-tenant",
    ...configOverrides,
  });
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

function makeActivity(threadId, id, text) {
  return {
    type: "message",
    id,
    text,
    conversation: { id: threadId },
    channelId: "msteams",
    serviceUrl: "https://example",
    from: { id: "u" },
    recipient: { id: "b" },
  };
}

async function postCallback(baseUrl, token, body) {
  return fetch(`${baseUrl}/api/callback/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function postMessage(baseUrl) {
  return fetch(`${baseUrl}/api/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "message" }),
  });
}

let storage;

describe("msbridge resume", () => {
  let baseUrl;
  let overrides;
  let adapter;
  let service;
  let dispatches;
  let originalFetch;

  function makeGhauthClient(token = "ghs_per_user") {
    return { GetToken: async () => ({ result: "token", token }) };
  }

  function buildService() {
    return new MsBridgeService(makeConfig(), {
      logger: createMockLogger(),
      tracer: makeTracer(),
      storage,
      ghauthClient: makeGhauthClient(),
      adapter,
    });
  }

  beforeEach(async () => {
    storage = createMockStorage();
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
    overrides = {};
    adapter = makeAdapter(overrides);
    service = buildService();
    await service.start();
    baseUrl = `http://127.0.0.1:${service.address().port}`;
  });

  afterEach(async () => {
    try {
      await service.stop();
    } catch {}
    globalThis.fetch = originalFetch;
  });

  test("responses trigger fires after expected comments; re-dispatch carries resume_context", async () => {
    overrides.activity = makeActivity("t-r", "a-1", "open the floor");
    await postMessage(baseUrl);
    const stored1 = await service.store.loadByChannel("msteams", "t-r");
    const token = Object.keys(stored1.pending_callbacks)[0];
    const meta = service.callbacks.peek(token);
    expect(dispatches).toHaveLength(1);

    await postCallback(baseUrl, token, {
      correlation_id: meta.correlationId,
      verdict: "recessed",
      summary: "awaiting 2 replies",
      run_url: "https://github.com/owner/repo/actions/runs/1",
      replies: [],
      trigger: { kind: "missing_input", replies: 2 },
    });
    const stored2 = await service.store.loadByChannel("msteams", "t-r");
    expect(Object.keys(stored2.open_rfcs)).toHaveLength(1);

    overrides.activity = makeActivity("t-r", "a-2", "I think yes");
    await postMessage(baseUrl);
    let stored3 = await service.store.loadByChannel("msteams", "t-r");
    expect(Object.keys(stored3.open_rfcs)).toHaveLength(1);

    overrides.activity = makeActivity("t-r", "a-3", "agreed");
    await postMessage(baseUrl);
    stored3 = await service.store.loadByChannel("msteams", "t-r");
    expect(Object.keys(stored3.open_rfcs)).toHaveLength(0);

    expect(dispatches).toHaveLength(2);
    const initialInputs = JSON.parse(dispatches[0].init.body).inputs;
    expect(initialInputs.resume_context).toBeUndefined();
    const resumeInputs = JSON.parse(dispatches[1].init.body).inputs;
    expect(resumeInputs.discussion_id).toBeUndefined();
    const resumeCtx = JSON.parse(resumeInputs.resume_context);
    expect(resumeCtx.correlation_id).toBe(meta.correlationId);
    expect(resumeCtx.history_since).toEqual([
      { role: "user", text: "I think yes" },
      { role: "user", text: "agreed" },
    ]);
  });

  test("elapsed trigger records due_at for whole-second durations", async () => {
    overrides.activity = makeActivity("t-e", "a-1", "rfc");
    await postMessage(baseUrl);
    const stored1 = await service.store.loadByChannel("msteams", "t-e");
    const token = Object.keys(stored1.pending_callbacks)[0];
    const meta = service.callbacks.peek(token);

    await postCallback(baseUrl, token, {
      correlation_id: meta.correlationId,
      verdict: "recessed",
      summary: "deadline set",
      run_url: "https://github.com/owner/repo/actions/runs/1",
      replies: [],
      trigger: { kind: "elapsed", elapsed: "PT5S" },
    });

    const stored2 = await service.store.loadByChannel("msteams", "t-e");
    const rfc = Object.values(stored2.open_rfcs)[0];
    expect(rfc.trigger).toEqual({ kind: "elapsed", elapsed: "PT5S" });
    expect(typeof rfc.due_at).toBe("number");
    expect(rfc.due_at).toBe(rfc.opened_at + 5000);
  });

  test("comments during an open RFC accumulate history but do not spawn parallel dispatches", async () => {
    overrides.activity = makeActivity("t-a", "a-1", "open");
    await postMessage(baseUrl);
    const stored1 = await service.store.loadByChannel("msteams", "t-a");
    const token = Object.keys(stored1.pending_callbacks)[0];
    const meta = service.callbacks.peek(token);

    await postCallback(baseUrl, token, {
      correlation_id: meta.correlationId,
      verdict: "recessed",
      summary: "wait for 3 replies",
      run_url: "https://github.com/owner/repo/actions/runs/1",
      replies: [],
      trigger: { kind: "missing_input", replies: 3 },
    });
    expect(dispatches).toHaveLength(1);

    overrides.activity = makeActivity("t-a", "a-2", "one");
    await postMessage(baseUrl);

    expect(dispatches).toHaveLength(1);
    const stored = await service.store.loadByChannel("msteams", "t-a");
    expect(Object.keys(stored.open_rfcs)).toHaveLength(1);
    expect(stored.history.some((h) => h.text === "one")).toBe(true);
  });

  test("service shutdown clears timers and a fresh service rearms from storage", async () => {
    overrides.activity = makeActivity("t-rs", "a-1", "deadline");
    await postMessage(baseUrl);
    const stored1 = await service.store.loadByChannel("msteams", "t-rs");
    const token = Object.keys(stored1.pending_callbacks)[0];
    const meta = service.callbacks.peek(token);

    await postCallback(baseUrl, token, {
      correlation_id: meta.correlationId,
      verdict: "recessed",
      summary: "deadline set",
      run_url: "https://github.com/owner/repo/actions/runs/1",
      replies: [],
      trigger: { kind: "elapsed", elapsed: "PT5S" },
    });
    expect(service.resume.size).toBe(1);

    await service.stop();
    expect(service.resume.size).toBe(0);

    service = buildService();
    await service.start();
    expect(service.resume.size).toBe(1);
  });
});
