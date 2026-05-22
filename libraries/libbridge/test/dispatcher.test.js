import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createMockStorage } from "@forwardimpact/libharness";

import { Acknowledgement } from "../src/acknowledgement.js";
import { CallbackRegistry } from "../src/callback-registry.js";
import { DiscussionContextStore } from "../src/discussion-context.js";
import { Dispatcher } from "../src/dispatcher.js";

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

describe("Dispatcher", () => {
  let store;
  let callbacks;
  let reactions;
  let ack;
  let dispatcher;
  let fetchStub;

  beforeEach(() => {
    store = new DiscussionContextStore(createMockStorage());
    callbacks = new CallbackRegistry();
    reactions = makeReactionAdapter();
    ack = new Acknowledgement({ reactionAdapter: reactions });
    fetchStub = stubFetch();
    dispatcher = new Dispatcher({
      callbacks,
      ack,
      store,
      callbackBaseUrl: "https://bridge.example",
      workflowFile: "kata-dispatch.yml",
      githubRepo: "owner/repo",
      getGithubToken: async () => "ghs_test",
    });
  });

  afterEach(async () => {
    fetchStub.restore();
    await store.shutdown();
  });

  test("rejects construction when required options are missing", () => {
    expect(() => new Dispatcher({})).toThrow();
    expect(
      () =>
        new Dispatcher({
          callbacks,
          ack,
          store,
          callbackBaseUrl: "x",
          workflowFile: "w",
          githubRepo: "r",
        }),
    ).toThrow("getGithubToken is required");
  });

  test("happy path: registers callback, starts ack, dispatches, appends history, flushes store", async () => {
    const ctx = makeCtx();
    const result = await dispatcher.dispatch({
      ctx,
      prompt: "hello",
      ackTarget: { subjectId: "S_1" },
      historyText: "hello",
      callbackMeta: { discussionId: "T_1" },
      workflowInputs: { discussionId: "T_1" },
    });
    expect(typeof result.token).toBe("string");
    expect(typeof result.correlationId).toBe("string");
    expect(ctx.pending_callbacks[result.token]).toBe(result.correlationId);
    expect(ctx.history).toEqual([{ role: "user", text: "hello" }]);
    expect(ctx.dispatches).toHaveLength(1);
    expect(reactions.adds).toEqual([{ subjectId: "S_1" }]);
    expect(callbacks.peek(result.token)?.meta).toEqual({ discussionId: "T_1" });
    expect(fetchStub.calls).toHaveLength(1);
    const body = JSON.parse(fetchStub.calls[0].init.body);
    expect(body.inputs.callback_url).toBe(
      `https://bridge.example/api/callback/${result.token}`,
    );
    expect(body.inputs.correlation_id).toBe(result.correlationId);
    expect(body.inputs.discussion_id).toBe("T_1");
    const reloaded = await store.loadByChannel("test-channel", "T_1");
    expect(reloaded).not.toBeNull();
  });

  test("ackTarget omitted: no reaction is added", async () => {
    const ctx = makeCtx();
    await dispatcher.dispatch({
      ctx,
      prompt: "resume",
      callbackMeta: { discussionId: "T_1" },
      workflowInputs: { discussionId: "T_1", resumeContext: "{}" },
    });
    expect(reactions.adds).toHaveLength(0);
  });

  test("historyText omitted: no history is appended", async () => {
    const ctx = makeCtx();
    await dispatcher.dispatch({
      ctx,
      prompt: "p",
      callbackMeta: {},
      ackTarget: { subjectId: "S" },
    });
    expect(ctx.history).toEqual([]);
  });

  test("workflowInputs flow through to the dispatch payload", async () => {
    const ctx = makeCtx();
    await dispatcher.dispatch({
      ctx,
      prompt: "p",
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
      dispatcher.dispatch({ ctx, prompt: "p", callbackMeta: {} }),
    ).rejects.toThrow();
    expect(reactions.removes).toHaveLength(0);
    expect(callbacks.size).toBe(0);
    expect(Object.keys(ctx.pending_callbacks)).toHaveLength(0);
  });

  test("getGithubToken receives await — accepts sync or async values", async () => {
    let calls = 0;
    dispatcher = new Dispatcher({
      callbacks,
      ack,
      store,
      callbackBaseUrl: "https://bridge.example",
      workflowFile: "kata-dispatch.yml",
      githubRepo: "owner/repo",
      getGithubToken: () => {
        calls++;
        return "sync_token";
      },
    });
    const ctx = makeCtx();
    await dispatcher.dispatch({ ctx, prompt: "p", callbackMeta: {} });
    expect(calls).toBe(1);
    expect(fetchStub.calls[0].init.headers.Authorization).toBe(
      "Bearer sync_token",
    );
  });
});
