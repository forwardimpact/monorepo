import { afterEach, beforeEach, describe, expect, test } from "bun:test";

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

function makeC({ token, body, parseFails } = {}) {
  return {
    req: {
      param: () => token,
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
  { discussionId = "D_1", meta = {} } = {},
) {
  const correlationId = "corr-1";
  const token = callbacks.register(correlationId, {
    discussionId,
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
    callbacks = new CallbackRegistry();
    reactions = makeReactionAdapter();
    ack = new Acknowledgement({ reactionAdapter: reactions });
    logger = makeLogger();
    tracer = makeTracer();
    handleReplyCalls = [];
    handler = createCallbackHandler({
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
    expect(() => createCallbackHandler({})).toThrow();
    expect(() =>
      createCallbackHandler({
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
    const res = await handler(makeC({ token: "none", body: {} }));
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
    const token = callbacks.register("corr-x", { discussionId: "missing" });
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

  test("unexpected handleReply errors return 500", async () => {
    const { token, correlationId } = await seed(store, callbacks);
    handler = createCallbackHandler({
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
