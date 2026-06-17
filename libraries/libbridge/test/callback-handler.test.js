import { describe, test, beforeEach, afterEach } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { createDefaultClock } from "@forwardimpact/libutil/runtime";

import { Acknowledgement } from "../src/acknowledgement.js";
import {
  CallbackHandlerError,
  createCallbackHandler,
} from "../src/callback-handler.js";
import { CallbackRegistry } from "../src/callback-registry.js";

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
    listOpenRecesses: async () => [],
    add: async (ctx) => records.set(ctx.id, ctx),
    flush: async () => {},
    shutdown: async () => {},
  };
}

function makeLogger() {
  const calls = [];
  const sink = (level) => (channel, msg, fields) => {
    calls.push({ level, channel, msg, fields });
  };
  return {
    calls,
    debug: sink("debug"),
    info: sink("info"),
    warn: sink("warn"),
    error: sink("error"),
  };
}

function makeTracer() {
  const events = [];
  const noop = () => {};
  return {
    events,
    startSpan: (name, opts) => ({
      addEvent: (event, attrs) => events.push({ name, event, attrs }),
      setOk: noop,
      setError: noop,
      end: async () => {},
    }),
  };
}

function makeReactionAdapter() {
  const removes = [];
  return {
    removes,
    add: async () => "rid",
    remove: async (rid, target) => {
      removes.push({ rid, target });
    },
  };
}

function makeC({ token, tenant_id = "default", body, parseFails } = {}) {
  return {
    req: {
      param: (name) => {
        if (name === "tenant_id") return tenant_id;
        if (name === "token") return token;
        return undefined;
      },
      json: async () => {
        if (parseFails) throw new Error("bad json");
        return body;
      },
    },
    json: (b, status) =>
      new Response(JSON.stringify(b), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  };
}

const channel = "test-channel";

async function seed(
  store,
  callbacks,
  { discussionId = "D_1", tenant_id = "default", meta = {} } = {},
) {
  const correlationId = "corr-1";
  const token = callbacks.register(correlationId, {
    discussionId,
    tenant_id,
    ...meta,
  });
  const ctx = {
    id: `${channel}:${discussionId}`,
    channel,
    discussion_id: discussionId,
    history: [],
    participants: [],
    open_rfcs: {},
    lead: "release-engineer",
    pending_callbacks: { [token]: correlationId },
    dispatches: [],
    last_active_at: Date.now(),
  };
  await store.add(ctx);
  await store.flush();
  return { token, correlationId, ctx };
}

const clock = createDefaultClock();

describe("createCallbackHandler", () => {
  let store;
  let callbacks;
  let ack;
  let reactions;
  let logger;
  let tracer;
  let handleReplyCalls;
  let handler;

  beforeEach(() => {
    store = createFakeAdapter();
    callbacks = new CallbackRegistry({ clock });
    reactions = makeReactionAdapter();
    ack = new Acknowledgement({ reactionAdapter: reactions });
    logger = makeLogger();
    tracer = makeTracer();
    handleReplyCalls = [];
    handler = createCallbackHandler({
      clock,
      channel,
      callbacks,
      ack,
      store,
      logger,
      tracer,
      spanName: "Test.HandleCallback",
      loadDiscussionId: (meta) => meta.meta?.discussionId,
      handleReply: async (ctx, payload, meta) => {
        handleReplyCalls.push({ ctx, payload, meta });
      },
    });
  });

  test("rejects construction when required options are missing", () => {
    expect(() => createCallbackHandler({ clock })).toThrow();
    expect(() =>
      createCallbackHandler({
        clock,
        channel: "c",
        callbacks,
        ack,
        store,
        logger,
        tracer,
        spanName: "n",
      }),
    ).toThrow(/loadDiscussionId/);
  });

  test("unknown token returns 404", async () => {
    const res = await handler(
      makeC({
        token: "none",
        body: {
          correlation_id: "any",
          kind: "terminal",
          verdict: "adjourned",
          summary: "",
        },
      }),
    );
    expect(res.status).toBe(404);
  });

  test("tenant_id mismatch returns 404 (registry returns null on consume)", async () => {
    const { token, correlationId } = await seed(store, callbacks);
    const res = await handler(
      makeC({
        token,
        tenant_id: "other-tenant",
        body: {
          correlation_id: correlationId,
          kind: "terminal",
          verdict: "adjourned",
          summary: "",
        },
      }),
    );
    expect(res.status).toBe(404);
  });

  test("invalid JSON returns 400", async () => {
    const { token } = await seed(store, callbacks);
    const res = await handler(makeC({ token, parseFails: true }));
    expect(res.status).toBe(400);
  });

  test("payload missing correlation_id returns 400", async () => {
    const { token } = await seed(store, callbacks);
    const res = await handler(makeC({ token, body: {} }));
    expect(res.status).toBe(400);
  });

  test("correlation_id mismatch returns 400", async () => {
    const { token } = await seed(store, callbacks);
    const res = await handler(
      makeC({
        token,
        body: { correlation_id: "wrong", verdict: "adjourned", summary: "" },
      }),
    );
    expect(res.status).toBe(400);
  });

  test("missing context returns 410", async () => {
    const token = callbacks.register("corr-x", {
      discussionId: "missing",
      tenant_id: "default",
    });
    const res = await handler(
      makeC({
        token,
        body: {
          correlation_id: "corr-x",
          verdict: "adjourned",
          summary: "",
        },
      }),
    );
    expect(res.status).toBe(410);
  });

  test("happy path invokes handleReply and flushes the store", async () => {
    const { token, correlationId, ctx } = await seed(store, callbacks);
    const res = await handler(
      makeC({
        token,
        body: {
          correlation_id: correlationId,
          verdict: "adjourned",
          summary: "done",
          replies: [{ body: "hi" }],
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(handleReplyCalls).toHaveLength(1);
    expect(handleReplyCalls[0].payload.verdict).toBe("adjourned");
    expect(handleReplyCalls[0].ctx.discussion_id).toBe(ctx.discussion_id);
    const reloaded = await store.loadByChannel(channel, "D_1");
    expect(reloaded.pending_callbacks[token]).toBeUndefined();
    expect(reloaded.last_active_at).toBeGreaterThan(0);
  });

  test("ack.finish runs before handleReply", async () => {
    const { token, correlationId } = await seed(store, callbacks);
    let finishedFirst = false;
    handler = createCallbackHandler({
      clock,
      channel,
      callbacks,
      ack,
      store,
      logger,
      tracer,
      spanName: "Test.HandleCallback",
      loadDiscussionId: (meta) => meta.meta?.discussionId,
      handleReply: async () => {
        finishedFirst = reactions.removes.length === 1;
      },
    });
    // Have something to remove.
    await ack.start(token, { subjectId: "S" });
    await handler(
      makeC({
        token,
        body: {
          correlation_id: correlationId,
          verdict: "adjourned",
          summary: "",
        },
      }),
    );
    expect(finishedFirst).toBe(true);
  });

  test("ackFinishTarget is forwarded when supplied", async () => {
    const { token, correlationId } = await seed(store, callbacks);
    handler = createCallbackHandler({
      clock,
      channel,
      callbacks,
      ack,
      store,
      logger,
      tracer,
      spanName: "Test.HandleCallback",
      loadDiscussionId: (meta) => meta.meta?.discussionId,
      ackFinishTarget: (meta) => ({ subjectId: meta.meta?.discussionId }),
      handleReply: async () => {},
    });
    await ack.start(token, { subjectId: "ORIGINAL" });
    await handler(
      makeC({
        token,
        body: {
          correlation_id: correlationId,
          verdict: "adjourned",
          summary: "",
        },
      }),
    );
    expect(reactions.removes[0].target).toEqual({ subjectId: "D_1" });
  });

  test("handleReply may throw CallbackHandlerError to short-circuit with a custom status", async () => {
    const { token, correlationId } = await seed(store, callbacks);
    handler = createCallbackHandler({
      clock,
      channel,
      callbacks,
      ack,
      store,
      logger,
      tracer,
      spanName: "Test.HandleCallback",
      loadDiscussionId: (meta) => meta.meta?.discussionId,
      handleReply: async () => {
        throw new CallbackHandlerError(410, "Conversation reference missing");
      },
    });
    const res = await handler(
      makeC({
        token,
        body: {
          correlation_id: correlationId,
          verdict: "adjourned",
          summary: "",
        },
      }),
    );
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toBe("Gone");
  });

  test("streaming reply (kind=reply) peeks token and updates last_posted_seq", async () => {
    const { token, correlationId } = await seed(store, callbacks);
    const res = await handler(
      makeC({
        token,
        body: {
          correlation_id: correlationId,
          kind: "reply",
          seq: 3,
          body: "partial answer",
          agent: "staff-engineer",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(handleReplyCalls).toHaveLength(1);
    expect(handleReplyCalls[0].payload.verdict).toBeNull();
    expect(handleReplyCalls[0].payload.replies).toEqual([
      { body: "partial answer", agent: "staff-engineer" },
    ]);
    // Token NOT consumed — peek was used
    expect(callbacks.peek(token, { tenant_id: "default" })).not.toBeNull();
    const reloaded = await store.loadByChannel(channel, "D_1");
    expect(reloaded.last_posted_seq).toBe(3);
    expect(reloaded.pending_callbacks[token]).toBe(correlationId);
  });

  test("duplicate seq returns dedupe response", async () => {
    const { token, correlationId, ctx } = await seed(store, callbacks);
    ctx.last_posted_seq = 5;
    await store.add(ctx);
    const res = await handler(
      makeC({
        token,
        body: {
          correlation_id: correlationId,
          kind: "reply",
          seq: 3,
          body: "old",
          agent: "a",
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dedupe).toBe(true);
    expect(handleReplyCalls).toHaveLength(0);
  });

  test("terminal event consumes token and clears active_requester", async () => {
    const { token, correlationId, ctx } = await seed(store, callbacks);
    ctx.active_requester = "user-1";
    await store.add(ctx);
    const res = await handler(
      makeC({
        token,
        body: {
          correlation_id: correlationId,
          kind: "terminal",
          verdict: "adjourned",
          summary: "done",
          replies: [],
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(callbacks.peek(token, { tenant_id: "default" })).toBeNull();
    const reloaded = await store.loadByChannel(channel, "D_1");
    expect(reloaded.active_requester).toBeNull();
    expect(reloaded.pending_callbacks[token]).toBeUndefined();
  });

  test("unexpected handleReply errors return 500", async () => {
    const { token, correlationId } = await seed(store, callbacks);
    handler = createCallbackHandler({
      clock,
      channel,
      callbacks,
      ack,
      store,
      logger,
      tracer,
      spanName: "Test.HandleCallback",
      loadDiscussionId: (meta) => meta.meta?.discussionId,
      handleReply: async () => {
        throw new Error("network");
      },
    });
    const res = await handler(
      makeC({
        token,
        body: {
          correlation_id: correlationId,
          verdict: "adjourned",
          summary: "",
        },
      }),
    );
    expect(res.status).toBe(500);
  });
});
