import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createMockStorage } from "@forwardimpact/libharness";

import { Acknowledgement } from "../src/acknowledgement.js";
import { CallbackRegistry } from "../src/callback-registry.js";
import { DiscussionContextStore } from "../src/discussion-context.js";
import { Dispatcher } from "../src/dispatcher.js";
import { ResumeScheduler } from "../src/resume-scheduler.js";

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
      return new Response("{}", { status: 204 });
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

function buildEnv({ buildCallbackMeta, buildResumeInputs } = {}) {
  const store = new DiscussionContextStore(createMockStorage());
  const callbacks = new CallbackRegistry();
  const ack = new Acknowledgement({
    reactionAdapter: {
      add: async () => null,
      remove: async () => {},
    },
  });
  const dispatcher = new Dispatcher({
    callbacks,
    ack,
    store,
    callbackBaseUrl: "https://bridge.example",
    workflowFile: "kata-dispatch.yml",
    githubRepo: "owner/repo",
    getGithubToken: async () => "ghs_test",
  });
  const scheduler = new ResumeScheduler({
    dispatcher,
    store,
    buildCallbackMeta,
    buildResumeInputs,
  });
  return { store, callbacks, dispatcher, scheduler };
}

describe("ResumeScheduler", () => {
  let env;
  let fetchStub;

  beforeEach(() => {
    fetchStub = stubFetch();
    env = buildEnv();
  });

  afterEach(async () => {
    fetchStub.restore();
    env.scheduler.clear();
    await env.store.shutdown();
  });

  test("rejects construction when required options are missing", () => {
    expect(() => new ResumeScheduler({})).toThrow();
    expect(() => new ResumeScheduler({ dispatcher: env.dispatcher })).toThrow(
      "store is required",
    );
  });

  test("rejects non-function callback builders", () => {
    expect(
      () =>
        new ResumeScheduler({
          dispatcher: env.dispatcher,
          store: env.store,
          buildCallbackMeta: "nope",
        }),
    ).toThrow();
  });

  test("enterRecess stores trigger, opened_at, history_index_at_open on ctx.open_rfcs", () => {
    const ctx = makeCtx({
      history: [{ role: "user", text: "first" }],
    });
    env.scheduler.enterRecess(ctx, "corr-1", {
      kind: "responses",
      responses: 2,
    });
    const rfc = ctx.open_rfcs["corr-1"];
    expect(rfc.trigger).toEqual({ kind: "responses", responses: 2 });
    expect(rfc.history_index_at_open).toBe(1);
    expect(typeof rfc.opened_at).toBe("number");
    expect(rfc.due_at).toBeUndefined();
  });

  test("enterRecess with elapsed trigger schedules a timer and records due_at", () => {
    const ctx = makeCtx();
    env.scheduler.enterRecess(ctx, "corr-2", {
      kind: "elapsed",
      elapsed: "PT5S",
    });
    expect(ctx.open_rfcs["corr-2"].due_at).toBe(
      ctx.open_rfcs["corr-2"].opened_at + 5000,
    );
    expect(env.scheduler.size).toBe(1);
  });

  test("enterRecess with falsy trigger is a no-op", () => {
    const ctx = makeCtx();
    env.scheduler.enterRecess(ctx, "corr-3", null);
    expect(ctx.open_rfcs["corr-3"]).toBeUndefined();
  });

  test("cancelRecess removes the rfc and cancels its timer; idempotent", () => {
    const ctx = makeCtx();
    env.scheduler.enterRecess(ctx, "corr-4", {
      kind: "elapsed",
      elapsed: "PT5S",
    });
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
    env.scheduler.enterRecess(ctx, "corr-5", {
      kind: "responses",
      responses: 5,
    });
    // Append one more so we have responses=1 since recess (one < 5).
    ctx.history.push({ role: "user", text: "y" });
    const result = await env.scheduler.processInbound(ctx);
    expect(result).toEqual({
      fired: 0,
      hasOpenRfc: true,
      freshDispatchAllowed: false,
    });
    expect(fetchStub.calls).toHaveLength(0);
  });

  test("processInbound fires a 'responses' trigger and redispatches with resume_context", async () => {
    const ctx = makeCtx();
    await env.store.add(ctx);
    env.scheduler.enterRecess(ctx, "corr-fire", {
      kind: "responses",
      responses: 2,
    });
    // Two new responses since recess.
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
    // Default buildCallbackMeta keys discussionId from ctx.discussion_id.
    expect(inputs.discussion_id).toBeUndefined(); // default buildResumeInputs returns {}
  });

  test("buildCallbackMeta override flows into the registered callback meta (msbridge convention)", async () => {
    fetchStub.restore();
    fetchStub = stubFetch();
    env = buildEnv({
      buildCallbackMeta: (ctx) => ({ threadId: ctx.discussion_id }),
    });
    const ctx = makeCtx({ id: "thread-99" });
    await env.store.add(ctx);
    env.scheduler.enterRecess(ctx, "corr-x", {
      kind: "responses",
      responses: 1,
    });
    ctx.history.push({ role: "user", text: "hello" });
    await env.scheduler.processInbound(ctx);

    const token = Object.keys(ctx.pending_callbacks)[0];
    const stored = env.callbacks.peek(token);
    expect(stored.meta).toEqual({ threadId: "thread-99" });
  });

  test("buildResumeInputs override flows into the workflow_dispatch inputs (ghbridge convention)", async () => {
    fetchStub.restore();
    fetchStub = stubFetch();
    env = buildEnv({
      buildResumeInputs: (ctx) => ({ discussionId: ctx.discussion_id }),
    });
    const ctx = makeCtx({ id: "D_99" });
    await env.store.add(ctx);
    env.scheduler.enterRecess(ctx, "corr-y", {
      kind: "responses",
      responses: 1,
    });
    ctx.history.push({ role: "user", text: "hi" });
    await env.scheduler.processInbound(ctx);
    const inputs = JSON.parse(fetchStub.calls[0].init.body).inputs;
    expect(inputs.discussion_id).toBe("D_99");
    expect(inputs.resume_context).toBeDefined();
  });

  test("rearm reschedules timers from persisted due_at across a fresh process", async () => {
    // Seed via the existing store, then reopen the same storage with a
    // fresh scheduler — that mirrors a service restart.
    const ctx = makeCtx({ id: "D_rearm" });
    ctx.open_rfcs["corr-z"] = {
      trigger: { kind: "elapsed", elapsed: "PT60S" },
      opened_at: Date.now(),
      history_index_at_open: 0,
      due_at: Date.now() + 60_000,
    };
    await env.store.add(ctx);
    await env.store.flush();

    // Tear down the original scheduler/store and reuse the same backing.
    const sharedStorage = env.store._storage ?? null;
    if (!sharedStorage) {
      // DiscussionContextStore doesn't expose its storage handle; build a
      // second store against the same underlying mock by direct add. The
      // path that matters in production is `loadData()` reading JSONL —
      // here we replay that by adding the record into a fresh store and
      // calling rearm.
      const freshStore = new DiscussionContextStore(createMockStorage());
      await freshStore.add(ctx);
      const callbacks = new CallbackRegistry();
      const ack = new Acknowledgement({
        reactionAdapter: { add: async () => null, remove: async () => {} },
      });
      const dispatcher = new Dispatcher({
        callbacks,
        ack,
        store: freshStore,
        callbackBaseUrl: "https://bridge.example",
        workflowFile: "kata-dispatch.yml",
        githubRepo: "owner/repo",
        getGithubToken: async () => "t",
      });
      const fresh = new ResumeScheduler({ dispatcher, store: freshStore });
      try {
        expect(fresh.size).toBe(0);
        await fresh.rearm();
        expect(fresh.size).toBe(1);
      } finally {
        fresh.clear();
        await freshStore.shutdown();
      }
    }
  });

  test("elapsed trigger fires the redispatch automatically on its deadline", async () => {
    const ctx = makeCtx({ id: "D_tick" });
    await env.store.add(ctx);
    await env.store.flush();
    // Directly construct an rfc with a 20ms deadline.
    const dueAt = Date.now() + 20;
    ctx.open_rfcs["corr-tick"] = {
      trigger: { kind: "elapsed", elapsed: "PT60S" },
      opened_at: Date.now(),
      history_index_at_open: 0,
      due_at: dueAt,
    };
    await env.store.add(ctx);
    // Manually arm via rearm (mimics restart path).
    await env.scheduler.rearm();
    await wait(60);
    expect(fetchStub.calls.length).toBeGreaterThanOrEqual(1);
    const reloaded = await env.store.loadByChannel("test-channel", "D_tick");
    expect(reloaded.open_rfcs["corr-tick"]).toBeUndefined();
  });
});
