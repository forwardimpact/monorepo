import { describe, test, beforeEach, afterEach } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { createDefaultClock } from "@forwardimpact/libutil/runtime";

import { Acknowledgement } from "../src/acknowledgement.js";
import { CallbackRegistry } from "../src/callback-registry.js";
import { Dispatcher } from "../src/dispatcher.js";
import { ResumeScheduler } from "../src/resume-scheduler.js";
import { DefaultTenantResolver } from "../src/tenant-resolver.js";

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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function makeCtx({ channel = "test-channel", id = "T_1", history = [] } = {}) {
  return {
    id: `${channel}:${id}`,
    channel,
    discussion_id: id,
    history,
    participants: [],
    open_rfcs: {},
    lead: "release-engineer",
    pending_callbacks: {},
    dispatches: [],
    last_active_at: 0,
  };
}

function stubFetch() {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.startsWith("https://api.github.com/")) {
      calls.push({ url: target, init });
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
  const calls = [];
  return {
    calls,
    resolve: async (surface, surfaceUserId) => {
      calls.push({ surface, surfaceUserId });
      return { kind: "token", token };
    },
  };
}

function buildEnv({
  buildCallbackMeta,
  buildResumeInputs,
  onDeclined,
  tokenResolver,
} = {}) {
  const store = createFakeAdapter();
  const callbacks = new CallbackRegistry({ clock });
  const ack = new Acknowledgement({
    reactionAdapter: {
      add: async () => null,
      remove: async () => {},
    },
  });
  const tr = tokenResolver ?? makeTokenResolver();
  const dispatcher = new Dispatcher({
    clock,
    callbacks,
    ack,
    store,
    callbackBaseUrl: "https://bridge.example",
    workflowFile: "kata-dispatch.yml",
    githubRepo: "owner/repo",
    tokenResolver: tr,
    tenantResolver: new DefaultTenantResolver({ channel: "test-channel" }),
  });
  const scheduler = new ResumeScheduler({
    clock,
    dispatcher,
    store,
    buildCallbackMeta,
    buildResumeInputs,
    onDeclined,
  });
  return { store, callbacks, dispatcher, scheduler, tokenResolver: tr };
}

const clock = createDefaultClock();

describe("ResumeScheduler", () => {
  let env;
  let fetchStub;

  beforeEach(() => {
    fetchStub = stubFetch();
    env = buildEnv();
  });

  afterEach(() => {
    fetchStub.restore();
    env.scheduler.clear();
  });

  test("rejects construction when required options are missing", () => {
    expect(() => new ResumeScheduler({ clock })).toThrow();
    expect(
      () => new ResumeScheduler({ clock, dispatcher: env.dispatcher }),
    ).toThrow("store is required");
  });

  test("rejects non-function callback builders", () => {
    expect(
      () =>
        new ResumeScheduler({
          clock,
          dispatcher: env.dispatcher,
          store: env.store,
          buildCallbackMeta: "nope",
        }),
    ).toThrow();
  });

  test("rejects non-function onDeclined", () => {
    expect(
      () =>
        new ResumeScheduler({
          clock,
          dispatcher: env.dispatcher,
          store: env.store,
          onDeclined: "nope",
        }),
    ).toThrow("onDeclined must be a function");
  });

  test("enterRecess stores trigger, opened_at, history_index_at_open, and requester on ctx.open_rfcs", () => {
    const ctx = makeCtx({
      history: [{ role: "user", text: "first" }],
    });
    env.scheduler.enterRecess(
      ctx,
      "corr-1",
      {
        kind: "missing_input",
        replies: 2,
      },
      "U_1",
    );
    const rfc = ctx.open_rfcs["corr-1"];
    expect(rfc.trigger).toEqual({ kind: "missing_input", replies: 2 });
    expect(rfc.history_index_at_open).toBe(1);
    expect(typeof rfc.opened_at).toBe("number");
    expect(rfc.due_at).toBeUndefined();
    expect(rfc.requester).toBe("U_1");
  });

  test("enterRecess with elapsed trigger schedules a timer and records due_at", () => {
    const ctx = makeCtx();
    env.scheduler.enterRecess(
      ctx,
      "corr-2",
      {
        kind: "elapsed",
        elapsed: "PT5S",
      },
      "U_1",
    );
    expect(ctx.open_rfcs["corr-2"].due_at).toBe(
      ctx.open_rfcs["corr-2"].opened_at + 5000,
    );
    expect(env.scheduler.size).toBe(1);
  });

  test("enterRecess with falsy trigger is a no-op", () => {
    const ctx = makeCtx();
    env.scheduler.enterRecess(ctx, "corr-3", null, "U_1");
    expect(ctx.open_rfcs["corr-3"]).toBeUndefined();
  });

  test("cancelRecess removes the rfc and cancels its timer; idempotent", () => {
    const ctx = makeCtx();
    env.scheduler.enterRecess(
      ctx,
      "corr-4",
      {
        kind: "elapsed",
        elapsed: "PT5S",
      },
      "U_1",
    );
    expect(env.scheduler.size).toBe(1);
    env.scheduler.cancelRecess(ctx, "corr-4");
    expect(ctx.open_rfcs["corr-4"]).toBeUndefined();
    expect(env.scheduler.size).toBe(0);
    expect(() => env.scheduler.cancelRecess(ctx, "corr-4")).not.toThrow();
  });

  test("processInbound returns freshDispatchAllowed=true when there are no rfcs", async () => {
    const ctx = makeCtx();
    const result = await env.scheduler.processInbound(ctx);
    expect(result).toEqual({
      fired: 0,
      hasOpenRfc: false,
      freshDispatchAllowed: true,
    });
  });

  test("processInbound returns freshDispatchAllowed=false when an rfc is open but no trigger fired", async () => {
    const ctx = makeCtx({ history: [{ role: "user", text: "x" }] });
    env.scheduler.enterRecess(
      ctx,
      "corr-5",
      {
        kind: "missing_input",
        replies: 5,
      },
      "U_1",
    );
    ctx.history.push({ role: "user", text: "y" });
    const result = await env.scheduler.processInbound(ctx);
    expect(result).toEqual({
      fired: 0,
      hasOpenRfc: true,
      freshDispatchAllowed: false,
    });
    expect(fetchStub.calls).toHaveLength(0);
  });

  test("processInbound fires a 'missing_input' trigger and redispatches with resume_context", async () => {
    const ctx = makeCtx();
    await env.store.add(ctx);
    env.scheduler.enterRecess(
      ctx,
      "corr-fire",
      {
        kind: "missing_input",
        replies: 2,
      },
      "U_1",
    );
    ctx.history.push({ role: "user", text: "one" });
    ctx.history.push({ role: "user", text: "two" });

    const result = await env.scheduler.processInbound(ctx);
    expect(result.fired).toBe(1);
    expect(result.hasOpenRfc).toBe(false);
    expect(result.freshDispatchAllowed).toBe(false);
    expect(ctx.open_rfcs["corr-fire"]).toBeUndefined();

    expect(fetchStub.calls).toHaveLength(1);
    const inputs = JSON.parse(fetchStub.calls[0].init.body).inputs;
    expect(inputs.resume_context).toBeDefined();
    const resume = JSON.parse(inputs.resume_context);
    expect(resume.correlation_id).toBe("corr-fire");
    expect(resume.history_since).toEqual([
      { role: "user", text: "one" },
      { role: "user", text: "two" },
    ]);
  });

  test("buildCallbackMeta override flows into the registered callback meta (msbridge convention)", async () => {
    fetchStub.restore();
    fetchStub = stubFetch();
    env = buildEnv({
      buildCallbackMeta: (ctx) => ({ threadId: ctx.discussion_id }),
    });
    const ctx = makeCtx({ id: "thread-99" });
    await env.store.add(ctx);
    env.scheduler.enterRecess(
      ctx,
      "corr-x",
      {
        kind: "missing_input",
        replies: 1,
      },
      "U_1",
    );
    ctx.history.push({ role: "user", text: "hello" });
    await env.scheduler.processInbound(ctx);

    const token = Object.keys(ctx.pending_callbacks)[0];
    const stored = env.callbacks.peek(token, { tenant_id: "default" });
    expect(stored.meta.threadId).toBe("thread-99");
    expect(stored.meta.requester).toBe("U_1");
  });

  test("buildResumeInputs override flows into the workflow_dispatch inputs (ghbridge convention)", async () => {
    fetchStub.restore();
    fetchStub = stubFetch();
    env = buildEnv({
      buildResumeInputs: (ctx) => ({ discussionId: ctx.discussion_id }),
    });
    const ctx = makeCtx({ id: "D_99" });
    await env.store.add(ctx);
    env.scheduler.enterRecess(
      ctx,
      "corr-y",
      {
        kind: "missing_input",
        replies: 1,
      },
      "U_1",
    );
    ctx.history.push({ role: "user", text: "hi" });
    await env.scheduler.processInbound(ctx);
    const inputs = JSON.parse(fetchStub.calls[0].init.body).inputs;
    expect(inputs.discussion_id).toBe("D_99");
    expect(inputs.resume_context).toBeDefined();
  });

  test("rearm reschedules timers from persisted due_at across a fresh process", async () => {
    const ctx = makeCtx({ id: "D_rearm" });
    ctx.open_rfcs["corr-z"] = {
      trigger: { kind: "elapsed", elapsed: "PT60S" },
      opened_at: Date.now(),
      history_index_at_open: 0,
      due_at: Date.now() + 60_000,
      requester: "U_1",
    };

    const freshStore = createFakeAdapter();
    await freshStore.add(ctx);
    const callbacks = new CallbackRegistry({ clock });
    const ack = new Acknowledgement({
      reactionAdapter: { add: async () => null, remove: async () => {} },
    });
    const dispatcher = new Dispatcher({
      clock,
      callbacks,
      ack,
      store: freshStore,
      callbackBaseUrl: "https://bridge.example",
      workflowFile: "kata-dispatch.yml",
      githubRepo: "owner/repo",
      tokenResolver: makeTokenResolver(),
      tenantResolver: new DefaultTenantResolver({ channel: "test-channel" }),
    });
    const fresh = new ResumeScheduler({ clock, dispatcher, store: freshStore });
    try {
      expect(fresh.size).toBe(0);
      await fresh.rearm();
      expect(fresh.size).toBe(1);
    } finally {
      fresh.clear();
    }
  });

  test("elapsed trigger fires the redispatch automatically on its deadline", async () => {
    const ctx = makeCtx({ id: "D_tick" });
    await env.store.add(ctx);
    await env.store.flush();
    const dueAt = Date.now() + 20;
    ctx.open_rfcs["corr-tick"] = {
      trigger: { kind: "elapsed", elapsed: "PT60S" },
      opened_at: Date.now(),
      history_index_at_open: 0,
      due_at: dueAt,
      requester: "U_1",
    };
    await env.store.add(ctx);
    await env.scheduler.rearm();
    await wait(60);
    expect(fetchStub.calls.length).toBeGreaterThanOrEqual(1);
    const reloaded = await env.store.loadByChannel("test-channel", "D_tick");
    expect(reloaded.open_rfcs["corr-tick"]).toBeUndefined();
  });

  test("resume redispatch passes recorded requester to dispatch", async () => {
    const tr = makeTokenResolver();
    env = buildEnv({ tokenResolver: tr });
    const ctx = makeCtx();
    await env.store.add(ctx);
    env.scheduler.enterRecess(
      ctx,
      "corr-req",
      {
        kind: "missing_input",
        replies: 1,
      },
      "U_42",
    );
    ctx.history.push({ role: "user", text: "trigger" });
    await env.scheduler.processInbound(ctx);
    expect(tr.calls.length).toBeGreaterThanOrEqual(1);
    expect(tr.calls[0].surfaceUserId).toBe("U_42");
    expect(tr.calls[0].surface).toBe("test-channel");
  });

  test("resume declined: cancelRecess + onDeclined called", async () => {
    const declinedCalls = [];
    const tr = {
      resolve: async () => ({
        kind: "link_required",
        authorizeUrl: "https://example.com/auth",
      }),
    };
    env = buildEnv({
      tokenResolver: tr,
      onDeclined: async (ctx, outcome) => {
        declinedCalls.push({
          discussion_id: ctx.discussion_id,
          kind: outcome.kind,
        });
      },
    });
    const ctx = makeCtx();
    await env.store.add(ctx);
    env.scheduler.enterRecess(
      ctx,
      "corr-dec",
      {
        kind: "missing_input",
        replies: 1,
      },
      "U_1",
    );
    ctx.history.push({ role: "user", text: "trigger" });
    await env.scheduler.processInbound(ctx);
    expect(ctx.open_rfcs["corr-dec"]).toBeUndefined();
    expect(declinedCalls).toHaveLength(1);
    expect(declinedCalls[0].kind).toBe("link_required");
  });

  test("RFC missing requester: cancel + skip, dispatch not called", async () => {
    const tr = makeTokenResolver();
    env = buildEnv({ tokenResolver: tr });
    const ctx = makeCtx();
    await env.store.add(ctx);
    ctx.open_rfcs["corr-old"] = {
      trigger: { kind: "missing_input", replies: 1 },
      opened_at: Date.now(),
      history_index_at_open: 0,
    };
    ctx.history.push({ role: "user", text: "trigger" });
    await env.scheduler.processInbound(ctx);
    expect(ctx.open_rfcs["corr-old"]).toBeUndefined();
    expect(tr.calls).toHaveLength(0);
    expect(fetchStub.calls).toHaveLength(0);
  });
});
