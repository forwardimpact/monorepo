import { describe, test, beforeEach } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { createDefaultClock } from "@forwardimpact/libutil/runtime";

import { CallbackRegistry } from "../src/callback-registry.js";
import { createInboxHandler } from "../src/inbox-handler.js";

function makeC({ tenant_id, correlationId, since } = {}) {
  return {
    req: {
      param: (name) => {
        if (name === "tenant_id") return tenant_id;
        if (name === "correlationId") return correlationId;
        return undefined;
      },
      query: (name) => {
        if (name === "since") return since;
        return undefined;
      },
    },
    json: (body, status) =>
      new Response(JSON.stringify(body), {
        status: status ?? 200,
        headers: { "Content-Type": "application/json" },
      }),
  };
}

function makeLogger() {
  const calls = [];
  return {
    calls,
    error: (channel, err) => calls.push({ channel, err }),
  };
}

function makeClock({ start = 1_000_000 } = {}) {
  let now = start;
  return {
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    advance: (ms) => {
      now += ms;
    },
  };
}

function makeClient({ messages = [], throws = null } = {}) {
  const calls = [];
  return {
    calls,
    DrainInbox: async (req) => {
      calls.push(req);
      if (throws) throw throws;
      return { messages };
    },
  };
}

const clock = createDefaultClock();

describe("createInboxHandler", () => {
  let callbacks;
  let logger;

  beforeEach(() => {
    callbacks = new CallbackRegistry({ clock });
    logger = makeLogger();
  });

  test("throws when callbacks dependency is missing", () => {
    expect(() => createInboxHandler({ client: {}, logger, clock })).toThrow(
      /callbacks/,
    );
  });

  test("throws when clock dependency is missing", () => {
    expect(() => createInboxHandler({ client: {}, logger, callbacks })).toThrow(
      /clock/,
    );
  });

  test("known correlation + matching tenant calls DrainInbox with path tenant_id", async () => {
    callbacks.register("corr-1", { tenant_id: "tenant-a" });
    const client = makeClient({ messages: [{ seq: 1, body: "hi" }] });
    const handler = createInboxHandler({
      client,
      logger,
      callbacks,
      clock: makeClock(),
      pollTimeoutMs: 100,
      pollIntervalMs: 1,
    });
    const res = await handler(
      makeC({
        tenant_id: "tenant-a",
        correlationId: "corr-1",
        since: "0",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].tenant_id).toBe("tenant-a");
    expect(client.calls[0].correlation_id).toBe("corr-1");
  });

  test("unknown correlation returns 404 with Unknown correlation body and never calls client", async () => {
    const client = makeClient();
    const handler = createInboxHandler({
      client,
      logger,
      callbacks,
      clock: makeClock(),
    });
    const res = await handler(
      makeC({
        tenant_id: "tenant-a",
        correlationId: "corr-unknown",
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Unknown correlation" });
    expect(client.calls).toHaveLength(0);
  });

  test("wrong-tenant correlation returns 404 with the same body and never calls client", async () => {
    callbacks.register("corr-known", { tenant_id: "tenant-a" });
    const client = makeClient();
    const handler = createInboxHandler({
      client,
      logger,
      callbacks,
      clock: makeClock(),
    });
    const res = await handler(
      makeC({
        tenant_id: "tenant-b",
        correlationId: "corr-known",
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Unknown correlation" });
    expect(client.calls).toHaveLength(0);
  });

  test("unknown-correlation 404 body has the same top-level key set as callback wrong-token (criterion 6)", async () => {
    const client = makeClient();
    const handler = createInboxHandler({
      client,
      logger,
      callbacks,
      clock: makeClock(),
    });
    const res = await handler(
      makeC({
        tenant_id: "any",
        correlationId: "nope",
      }),
    );
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["error"]);
  });

  test("DrainInbox failure surfaces 500 with Inbox failure body", async () => {
    callbacks.register("corr-err", { tenant_id: "tenant-a" });
    const client = makeClient({ throws: new Error("backend down") });
    const handler = createInboxHandler({
      client,
      logger,
      callbacks,
      clock: makeClock(),
      pollTimeoutMs: 100,
      pollIntervalMs: 1,
    });
    const res = await handler(
      makeC({
        tenant_id: "tenant-a",
        correlationId: "corr-err",
      }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Inbox failure" });
    expect(logger.calls).toHaveLength(1);
  });

  test("empty deadline returns 200 with empty messages list", async () => {
    callbacks.register("corr-empty", { tenant_id: "tenant-a" });
    const client = makeClient({ messages: [] });
    const handler = createInboxHandler({
      client,
      logger,
      callbacks,
      clock: makeClock(),
      pollTimeoutMs: 5,
      pollIntervalMs: 10,
    });
    const res = await handler(
      makeC({
        tenant_id: "tenant-a",
        correlationId: "corr-empty",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ messages: [] });
  });
});
