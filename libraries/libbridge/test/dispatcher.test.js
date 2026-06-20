import { describe, test, beforeEach, afterEach } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { createDefaultClock } from "@forwardimpact/libutil/runtime";

import { Acknowledgement } from "../src/acknowledgement.js";
import { CallbackRegistry } from "../src/callback-registry.js";
import { Dispatcher } from "../src/dispatcher.js";
import {
  DefaultTenantResolver,
  RegistryTenantResolver,
} from "../src/tenant-resolver.js";

function createFakeAdapter() {
  const records = new Map();
  return {
    loadByChannel: async (channel, id) =>
      records.get(`${channel}:${id}`) ?? null,
    loadByCorrelation: async (correlationId) => {
      for (const rec of records.values()) {
        if (
          Object.values(rec.pending_callbacks ?? {}).includes(correlationId) ||
          rec.open_rfcs?.[correlationId]
        )
          return rec;
      }
      return null;
    },
    listOpenRecesses: async () => {
      const refs = [];
      for (const rec of records.values())
        for (const [cid, rfc] of Object.entries(rec.open_rfcs ?? {}))
          if (typeof rfc.due_at === "number")
            refs.push({ correlationId: cid, dueAt: rfc.due_at });
      return refs;
    },
    add: async (ctx) => records.set(ctx.id, ctx),
    flush: async () => {},
    shutdown: async () => {},
  };
}

function makeReactionAdapter() {
  const adds = [];
  const removes = [];
  return {
    adds,
    removes,
    add: async (target) => {
      adds.push(target);
      return "rid";
    },
    remove: async (rid, target) => {
      removes.push({ rid, target });
    },
  };
}

function makeCtx(channel = "test-channel", id = "T_1") {
  return {
    id: `${channel}:${id}`,
    channel,
    discussion_id: id,
    history: [],
    participants: [],
    open_rfcs: {},
    lead: "release-engineer",
    pending_callbacks: {},
    dispatches: [],
    last_active_at: 0,
  };
}

function stubFetch({ onWorkflowDispatch } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.startsWith("https://api.github.com/")) {
      calls.push({ url: target, init });
      if (onWorkflowDispatch) return onWorkflowDispatch(url, init);
      return new Response(null, { status: 204 });
    }
    return original(url, init);
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function makeTokenResolver(token = "ghs_test") {
  return { resolve: async () => ({ kind: "token", token }) };
}

function makeDefaultTenantResolver(channel = "test-channel") {
  return new DefaultTenantResolver({ channel });
}

const clock = createDefaultClock();

describe("Dispatcher", () => {
  let store;
  let callbacks;
  let reactions;
  let ack;
  let dispatcher;
  let fetchStub;

  beforeEach(() => {
    store = createFakeAdapter();
    callbacks = new CallbackRegistry({ clock });
    reactions = makeReactionAdapter();
    ack = new Acknowledgement({ reactionAdapter: reactions });
    fetchStub = stubFetch();
    dispatcher = new Dispatcher({
      clock,
      callbacks,
      ack,
      store,
      callbackBaseUrl: "https://bridge.example",
      workflowFile: "kata-dispatch.yml",
      githubRepo: "owner/repo",
      tokenResolver: makeTokenResolver(),
      tenantResolver: makeDefaultTenantResolver(),
    });
  });

  afterEach(() => {
    fetchStub.restore();
  });

  test("rejects construction when required options are missing", () => {
    expect(() => new Dispatcher({ clock })).toThrow();
    expect(
      () =>
        new Dispatcher({
          clock,
          callbacks,
          ack,
          store,
          callbackBaseUrl: "x",
          workflowFile: "w",
          githubRepo: "r",
        }),
    ).toThrow("tokenResolver is required");
    expect(
      () =>
        new Dispatcher({
          clock,
          callbacks,
          ack,
          store,
          callbackBaseUrl: "x",
          workflowFile: "w",
          githubRepo: "r",
          tokenResolver: makeTokenResolver(),
        }),
    ).toThrow("tenantResolver is required");
  });

  test("happy path: registers callback, starts ack, dispatches, appends history, flushes store", async () => {
    const ctx = makeCtx();
    const result = await dispatcher.dispatch({
      ctx,
      prompt: "hello",
      requester: "U_1",
      ackTarget: { subjectId: "S_1" },
      callbackMeta: { discussionId: "T_1" },
      workflowInputs: { discussionId: "T_1" },
    });
    expect(result.kind).toBe("dispatched");
    expect(typeof result.token).toBe("string");
    expect(typeof result.correlationId).toBe("string");
    expect(ctx.pending_callbacks[result.token]).toBe(result.correlationId);
    expect(ctx.history).toEqual([]);
    expect(ctx.dispatches).toHaveLength(1);
    expect(reactions.adds).toEqual([{ subjectId: "S_1" }]);
    expect(fetchStub.calls).toHaveLength(1);
    const body = JSON.parse(fetchStub.calls[0].init.body);
    expect(body.inputs.callback_url).toBe(
      `https://bridge.example/api/callback/default/${result.token}`,
    );
    expect(body.inputs.correlation_id).toBe(result.correlationId);
    expect(body.inputs.discussion_id).toBe("T_1");
    const inboxUrl = new URL(body.inputs.inbox_url);
    expect(inboxUrl.pathname).toBe(
      `/api/inbox/default/${result.correlationId}`,
    );
    expect(inboxUrl.search).toBe("");
    const reloaded = await store.loadByChannel("test-channel", "T_1");
    expect(reloaded).not.toBeNull();
  });

  test("ackTarget omitted: no reaction is added", async () => {
    const ctx = makeCtx();
    await dispatcher.dispatch({
      ctx,
      prompt: "resume",
      requester: "U_1",
      callbackMeta: { discussionId: "T_1" },
      workflowInputs: { discussionId: "T_1", resumeContext: "{}" },
    });
    expect(reactions.adds).toHaveLength(0);
  });

  test("workflowInputs flow through to the dispatch payload", async () => {
    const ctx = makeCtx();
    await dispatcher.dispatch({
      ctx,
      prompt: "p",
      requester: "U_1",
      callbackMeta: {},
      workflowInputs: { discussionId: "D_1", resumeContext: '{"r":1}' },
    });
    const body = JSON.parse(fetchStub.calls[0].init.body);
    expect(body.inputs.discussion_id).toBe("D_1");
    expect(body.inputs.resume_context).toBe('{"r":1}');
  });

  test("on workflow_dispatch failure: ack is finished, callback consumed, pending_callbacks cleaned, error rethrown", async () => {
    fetchStub.restore();
    fetchStub = stubFetch({
      onWorkflowDispatch: () =>
        new Response("nope", { status: 422, statusText: "Unprocessable" }),
    });
    const ctx = makeCtx();
    await expect(
      dispatcher.dispatch({
        ctx,
        prompt: "p",
        requester: "U_1",
        callbackMeta: {},
        ackTarget: { subjectId: "S_2" },
      }),
    ).rejects.toThrow(/workflow_dispatch failed/);
    expect(Object.keys(ctx.pending_callbacks)).toHaveLength(0);
    expect(callbacks.size).toBe(0);
    expect(reactions.adds).toHaveLength(1);
    expect(reactions.removes).toHaveLength(1);
    expect(ctx.history).toEqual([]);
    expect(ctx.dispatches).toEqual([]);
  });

  test("rollback without ackTarget: skips ack.finish but still rolls back the callback", async () => {
    fetchStub.restore();
    fetchStub = stubFetch({
      onWorkflowDispatch: () => new Response("", { status: 500 }),
    });
    const ctx = makeCtx();
    await expect(
      dispatcher.dispatch({
        ctx,
        prompt: "p",
        requester: "U_1",
        callbackMeta: {},
      }),
    ).rejects.toThrow();
    expect(reactions.removes).toHaveLength(0);
    expect(callbacks.size).toBe(0);
    expect(Object.keys(ctx.pending_callbacks)).toHaveLength(0);
  });

  test("token resolver result is used as the dispatch token", async () => {
    dispatcher = new Dispatcher({
      clock,
      callbacks,
      ack,
      store,
      callbackBaseUrl: "https://bridge.example",
      workflowFile: "kata-dispatch.yml",
      githubRepo: "owner/repo",
      tokenResolver: makeTokenResolver("ghs_per_user"),
      tenantResolver: makeDefaultTenantResolver(),
    });
    const ctx = makeCtx();
    await dispatcher.dispatch({
      ctx,
      prompt: "p",
      requester: "U_1",
      callbackMeta: {},
    });
    expect(fetchStub.calls[0].init.headers.Authorization).toBe(
      "Bearer ghs_per_user",
    );
  });

  test("requester is required", () => {
    const ctx = makeCtx();
    expect(
      dispatcher.dispatch({ ctx, prompt: "p", callbackMeta: {} }),
    ).rejects.toThrow("requester is required");
  });

  test("link_required: no ack, no workflow, no callback registered", async () => {
    dispatcher = new Dispatcher({
      clock,
      callbacks,
      ack,
      store,
      callbackBaseUrl: "https://bridge.example",
      workflowFile: "kata-dispatch.yml",
      githubRepo: "owner/repo",
      tokenResolver: {
        resolve: async () => ({
          kind: "link_required",
          authorizeUrl: "https://example.com/authorize",
        }),
      },
      tenantResolver: makeDefaultTenantResolver(),
    });
    const ctx = makeCtx();
    const result = await dispatcher.dispatch({
      ctx,
      prompt: "p",
      requester: "U_1",
      callbackMeta: {},
      ackTarget: { subjectId: "S_1" },
    });
    expect(result.kind).toBe("link_required");
    expect(result.authorizeUrl).toBe("https://example.com/authorize");
    expect(result.tenant_id).toBe("default");
    expect(reactions.adds).toHaveLength(0);
    expect(fetchStub.calls).toHaveLength(0);
    expect(callbacks.size).toBe(0);
    expect(ctx.history).toEqual([]);
    expect(ctx.dispatches).toEqual([]);
  });

  test("reauth_required: no ack, no workflow, no callback registered", async () => {
    dispatcher = new Dispatcher({
      clock,
      callbacks,
      ack,
      store,
      callbackBaseUrl: "https://bridge.example",
      workflowFile: "kata-dispatch.yml",
      githubRepo: "owner/repo",
      tokenResolver: {
        resolve: async () => ({ kind: "reauth_required" }),
      },
      tenantResolver: makeDefaultTenantResolver(),
    });
    const ctx = makeCtx();
    const result = await dispatcher.dispatch({
      ctx,
      prompt: "p",
      requester: "U_1",
      callbackMeta: {},
      ackTarget: { subjectId: "S_1" },
    });
    expect(result.kind).toBe("reauth_required");
    expect(result.tenant_id).toBe("default");
    expect(reactions.adds).toHaveLength(0);
    expect(fetchStub.calls).toHaveLength(0);
    expect(callbacks.size).toBe(0);
    expect(ctx.history).toEqual([]);
    expect(ctx.dispatches).toEqual([]);
  });

  test("transient: no ack, no workflow, no callback registered", async () => {
    dispatcher = new Dispatcher({
      clock,
      callbacks,
      ack,
      store,
      callbackBaseUrl: "https://bridge.example",
      workflowFile: "kata-dispatch.yml",
      githubRepo: "owner/repo",
      tokenResolver: {
        resolve: async () => ({
          kind: "transient",
          error: new Error("UNAVAILABLE"),
        }),
      },
      tenantResolver: makeDefaultTenantResolver(),
    });
    const ctx = makeCtx();
    const result = await dispatcher.dispatch({
      ctx,
      prompt: "p",
      requester: "U_1",
      callbackMeta: {},
      ackTarget: { subjectId: "S_1" },
    });
    expect(result.kind).toBe("transient");
    expect(reactions.adds).toHaveLength(0);
    expect(fetchStub.calls).toHaveLength(0);
    expect(callbacks.size).toBe(0);
    expect(ctx.history).toEqual([]);
    expect(ctx.dispatches).toEqual([]);
  });

  test("requester round-trips in callbackMeta", async () => {
    const ctx = makeCtx();
    const result = await dispatcher.dispatch({
      ctx,
      prompt: "p",
      requester: "U_1",
      callbackMeta: { discussionId: "T_1" },
    });
    expect(result.kind).toBe("dispatched");
    const peek = callbacks.peek(result.token, { tenant_id: "default" });
    expect(peek.meta.requester).toBe("U_1");
    expect(peek.meta.discussionId).toBe("T_1");
    expect(peek.meta.tenant_id).toBe("default");
  });

  test("RegistryTenantResolver: URL and meta carry the resolved tenant_id", async () => {
    const stub = {
      ResolveByChannelKey: async () => ({
        tenant_id: "t-1",
        channel: "test-channel",
        channel_tenant_key: "k-1",
        state: "active",
      }),
      ResolveByRepo: async () => null,
      ResolveByTenantId: async () => null,
    };
    dispatcher = new Dispatcher({
      clock,
      callbacks,
      ack,
      store,
      callbackBaseUrl: "https://bridge.example",
      workflowFile: "kata-dispatch.yml",
      githubRepo: "owner/repo",
      tokenResolver: makeTokenResolver(),
      tenantResolver: new RegistryTenantResolver({ client: stub }),
    });
    const ctx = makeCtx();
    ctx.channel_tenant_key = "k-1";
    const result = await dispatcher.dispatch({
      ctx,
      prompt: "p",
      requester: "U_1",
      callbackMeta: {},
    });
    expect(result.kind).toBe("dispatched");
    const body = JSON.parse(fetchStub.calls[0].init.body);
    expect(body.inputs.callback_url).toBe(
      `https://bridge.example/api/callback/t-1/${result.token}`,
    );
    const inboxUrl = new URL(body.inputs.inbox_url);
    expect(inboxUrl.pathname).toBe(`/api/inbox/t-1/${result.correlationId}`);
    expect(inboxUrl.search).toBe("");
    const peek = callbacks.peek(result.token, { tenant_id: "t-1" });
    expect(peek.meta.tenant_id).toBe("t-1");
  });

  test("tenant resolver returning null yields a transient result, no callback registered", async () => {
    const nullResolver = {
      resolve: async () => null,
      resolveByRepo: async () => null,
      resolveByTenantId: async () => null,
    };
    dispatcher = new Dispatcher({
      clock,
      callbacks,
      ack,
      store,
      callbackBaseUrl: "https://bridge.example",
      workflowFile: "kata-dispatch.yml",
      githubRepo: "owner/repo",
      tokenResolver: makeTokenResolver(),
      tenantResolver: nullResolver,
    });
    const ctx = makeCtx();
    const result = await dispatcher.dispatch({
      ctx,
      prompt: "p",
      requester: "U_1",
      callbackMeta: {},
    });
    expect(result.kind).toBe("transient");
    expect(callbacks.size).toBe(0);
    expect(fetchStub.calls).toHaveLength(0);
  });
});
