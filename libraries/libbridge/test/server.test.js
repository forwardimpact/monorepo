import { describe, test, beforeEach, afterEach } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { createMockLogger } from "@forwardimpact/libmock/mock";

import { createBridgeServer } from "../src/server.js";

describe("createBridgeServer", () => {
  let bridge;
  let baseUrl;
  let inboxCalls;

  beforeEach(async () => {
    inboxCalls = [];
    bridge = createBridgeServer({
      config: { host: "127.0.0.1", port: 0 },
      logger: createMockLogger(),
      webhookPath: "/api/test-webhook",
      onWebhook: async (c) => {
        const body = await c.req.json();
        return c.json(
          { received: body, hasRawBody: Buffer.isBuffer(c.get("rawBody")) },
          200,
        );
      },
      onCallback: async (c) => {
        const body = await c.req.json();
        return c.json(
          {
            tenant_id: c.req.param("tenant_id"),
            token: c.req.param("token"),
            body,
          },
          200,
        );
      },
      onInbox: async (c) => {
        inboxCalls.push({
          tenant_id: c.req.param("tenant_id"),
          correlationId: c.req.param("correlationId"),
        });
        return c.json({ messages: [] }, 200);
      },
    });
    await bridge.start();
    baseUrl = `http://127.0.0.1:${bridge.address().port}`;
  });

  afterEach(async () => {
    await bridge.stop();
  });

  test("OPTIONS on the webhook path returns 200", async () => {
    const res = await fetch(`${baseUrl}/api/test-webhook`, {
      method: "OPTIONS",
    });
    expect(res.status).toBe(200);
  });

  test("POST on the webhook path runs onWebhook with raw body available", async () => {
    const res = await fetch(`${baseUrl}/api/test-webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.received).toEqual({ hello: "world" });
    expect(json.hasRawBody).toBe(true);
  });

  test("responses include security headers", async () => {
    const res = await fetch(`${baseUrl}/api/test-webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ping: true }),
    });
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("POST to /api/callback/:tenant_id/:token runs onCallback with both params", async () => {
    const res = await fetch(`${baseUrl}/api/callback/default/tok-123`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary: "done" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tenant_id).toBe("default");
    expect(json.token).toBe("tok-123");
    expect(json.body).toEqual({ summary: "done" });
  });

  test("POST to /api/callback/:tenant_id/:token surfaces an arbitrary tenant_id segment", async () => {
    const res = await fetch(`${baseUrl}/api/callback/t-1/tok-abc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary: "ok" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tenant_id).toBe("t-1");
    expect(json.token).toBe("tok-abc");
  });

  test("POST to /api/callback/:token (missing :tenant_id segment) returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/callback/tok-only`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary: "" }),
    });
    expect(res.status).toBe(404);
  });

  test("GET /api/inbox/:tenant_id/:correlationId routes to onInbox with both params (default tenant)", async () => {
    const res = await fetch(`${baseUrl}/api/inbox/default/corr-1`);
    expect(res.status).toBe(200);
    expect(inboxCalls).toEqual([
      { tenant_id: "default", correlationId: "corr-1" },
    ]);
  });

  test("GET /api/inbox/:tenant_id/:correlationId routes to onInbox with a non-default tenant", async () => {
    const res = await fetch(`${baseUrl}/api/inbox/t-7/corr-9`);
    expect(res.status).toBe(200);
    expect(inboxCalls).toEqual([{ tenant_id: "t-7", correlationId: "corr-9" }]);
  });

  test("GET /api/inbox/:correlationId (legacy one-segment shape) does not reach onInbox", async () => {
    const res = await fetch(`${baseUrl}/api/inbox/foo`);
    expect(res.status).toBe(404);
    expect(inboxCalls).toHaveLength(0);
  });

  test("handler throws → 500 with error envelope", async () => {
    await bridge.stop();
    bridge = createBridgeServer({
      config: { host: "127.0.0.1", port: 0 },
      logger: createMockLogger(),
      webhookPath: "/api/test-webhook",
      onWebhook: async () => {
        throw new Error("boom");
      },
      onCallback: async (c) => c.body(null, 200),
    });
    await bridge.start();
    const res = await fetch(
      `http://127.0.0.1:${bridge.address().port}/api/test-webhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("Webhook failure");
  });

  test("missing required parameters throw on construction", () => {
    const logger = createMockLogger();
    const ok = () => {};
    expect(() =>
      createBridgeServer({
        logger,
        webhookPath: "/a",
        onWebhook: ok,
        onCallback: ok,
      }),
    ).toThrow();
    expect(() =>
      createBridgeServer({
        config: { port: 0 },
        webhookPath: "/a",
        onWebhook: ok,
        onCallback: ok,
      }),
    ).toThrow();
    expect(() =>
      createBridgeServer({
        config: { port: 0 },
        logger,
        onWebhook: ok,
        onCallback: ok,
      }),
    ).toThrow();
    expect(() =>
      createBridgeServer({
        config: { port: 0 },
        logger,
        webhookPath: "/a",
        onCallback: ok,
      }),
    ).toThrow();
    expect(() =>
      createBridgeServer({
        config: { port: 0 },
        logger,
        webhookPath: "/a",
        onWebhook: ok,
      }),
    ).toThrow();
  });
});
