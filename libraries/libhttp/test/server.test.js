import { describe, test, beforeEach, afterEach } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { createMockLogger } from "@forwardimpact/libmock/mock";

import { createHttpService } from "../src/server.js";

describe("createHttpService", () => {
  let service;
  let baseUrl;

  async function startWith(options) {
    service = createHttpService({
      name: "test",
      config: { host: "127.0.0.1", port: 0 },
      logger: createMockLogger(),
      ...options,
    });
    await service.start();
    baseUrl = `http://127.0.0.1:${service.address().port}`;
    return service;
  }

  afterEach(async () => {
    if (service) await service.stop();
    service = null;
  });

  describe("required options", () => {
    test("throws without name, config, logger, or configure", () => {
      expect(() => createHttpService({})).toThrow("name is required");
      expect(() => createHttpService({ name: "x" })).toThrow(
        "config is required",
      );
      expect(() =>
        createHttpService({ name: "x", config: { port: 0 } }),
      ).toThrow("logger is required");
      expect(() =>
        createHttpService({
          name: "x",
          config: { port: 0 },
          logger: createMockLogger(),
        }),
      ).toThrow("configure is required");
    });
  });

  describe("standard wiring", () => {
    beforeEach(async () => {
      await startWith({
        configure(app) {
          app.get("/hello", (c) => c.json({ hello: "world" }));
          app.get("/boom", () => {
            throw new Error("kaboom");
          });
        },
      });
    });

    test("auto-mounts /health", async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ok" });
    });

    test("configure routes are reachable", async () => {
      const res = await fetch(`${baseUrl}/hello`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ hello: "world" });
    });

    test("applies security headers", async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });

    test("uncaught handler errors become a 500 envelope", async () => {
      const res = await fetch(`${baseUrl}/boom`);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "server_error" });
    });

    test("address() returns the bound port", () => {
      expect(service.address().port).toBeGreaterThan(0);
    });
  });

  describe("body limit", () => {
    test("rejects bodies over the configured limit", async () => {
      await startWith({
        bodyLimit: 16,
        configure(app) {
          app.post("/echo", async (c) => c.json(await c.req.json()));
        },
      });
      const res = await fetch(`${baseUrl}/echo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: "x".repeat(100) }),
      });
      expect(res.status).toBe(413);
    });

    test("bodyLimit: 0 leaves the body untouched", async () => {
      await startWith({
        bodyLimit: 0,
        configure(app) {
          app.post("/echo", async (c) => c.json(await c.req.json()));
        },
      });
      const big = { value: "x".repeat(100) };
      const res = await fetch(`${baseUrl}/echo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(big),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(big);
    });
  });

  describe("lifecycle", () => {
    test("onStop runs during stop() and stop() is idempotent", async () => {
      let stopped = 0;
      await startWith({
        onStop: () => {
          stopped += 1;
        },
        configure() {},
      });
      await service.stop();
      await service.stop();
      service = null; // prevent afterEach double-stop
      expect(stopped).toBe(1); // stop() is idempotent — onStop fires once
    });

    test("forwards logger and tracer to configure", async () => {
      let received;
      const tracer = { tag: "tracer" };
      await startWith({
        tracer,
        configure(_app, deps) {
          received = deps;
        },
      });
      expect(received.tracer).toBe(tracer);
      expect(received.logger).toBeDefined();
    });
  });
});
