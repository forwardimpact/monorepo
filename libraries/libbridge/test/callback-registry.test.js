import { describe, expect, test } from "bun:test";

import { CallbackRegistry } from "../src/callback-registry.js";

describe("CallbackRegistry", () => {
  test("register returns a token and consume returns the metadata once", () => {
    const reg = new CallbackRegistry();
    const token = reg.register("corr-1", { threadId: "T1" });
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
    expect(reg.size).toBe(1);

    const first = reg.consume(token);
    expect(first).not.toBeNull();
    expect(first.correlationId).toBe("corr-1");
    expect(first.meta).toEqual({ threadId: "T1" });
    expect(reg.size).toBe(0);

    const second = reg.consume(token);
    expect(second).toBeNull();
  });

  test("peek returns metadata without consuming", () => {
    const reg = new CallbackRegistry();
    const token = reg.register("corr-2");
    const peeked = reg.peek(token);
    expect(peeked.correlationId).toBe("corr-2");
    expect(reg.size).toBe(1);
  });

  test("register rejects empty correlationId", () => {
    const reg = new CallbackRegistry();
    expect(() => reg.register("")).toThrow();
    expect(() => reg.register(undefined)).toThrow();
  });

  test("sweep evicts entries older than ttlMs", () => {
    const reg = new CallbackRegistry({ ttlMs: 1000 });
    const fresh = reg.register("corr-fresh");
    const stale = reg.register("corr-stale");

    const staleEntry = reg.peek(stale);
    staleEntry.createdAt = Date.now() - 5000;

    const evicted = reg.sweep();
    expect(evicted).toBe(1);
    expect(reg.consume(stale)).toBeNull();
    expect(reg.consume(fresh)).not.toBeNull();
  });

  test("default ttlMs matches the legacy 2h constant", () => {
    const reg = new CallbackRegistry();
    const token = reg.register("corr-default-ttl");
    const peeked = reg.peek(token);
    peeked.createdAt = Date.now() - (2 * 60 * 60 * 1000 - 1000);
    expect(reg.sweep()).toBe(0);
    peeked.createdAt = Date.now() - (2 * 60 * 60 * 1000 + 1000);
    expect(reg.sweep()).toBe(1);
  });

  test("issues unique tokens for distinct correlationIds", () => {
    const reg = new CallbackRegistry();
    const t1 = reg.register("a");
    const t2 = reg.register("b");
    expect(t1).not.toBe(t2);
  });
});
