import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createMockLogger } from "@forwardimpact/libmock/mock";

import { createBridgeServer } from "../src/server.js";

describe("createBridgeServer", () => {
  let bridge;
  let baseUrl;

  beforeEach(async () => {
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
        return c.json({ token: c.req.param("token"), body }, 200);
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

  test("POST to /api/callback/:token runs onCallback with the token", async () => {
    const res = await fetch(`${baseUrl}/api/callback/tok-123`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary: "done" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toBe("tok-123");
    expect(json.body).toEqual({ summary: "done" });
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
