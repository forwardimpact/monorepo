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

  test("peek returns metadata without consuming and clones the entry", () => {
    const reg = new CallbackRegistry();
    const token = reg.register("corr-2");
    const peeked = reg.peek(token);
    expect(peeked.correlationId).toBe("corr-2");
    expect(reg.size).toBe(1);

    // Mutating the peeked entry must not corrupt internal state.
    peeked.correlationId = "tampered";
    const second = reg.peek(token);
    expect(second.correlationId).toBe("corr-2");
  });

  test("register rejects empty correlationId", () => {
    const reg = new CallbackRegistry();
    expect(() => reg.register("")).toThrow();
    expect(() => reg.register(undefined)).toThrow();
  });

  test("sweep evicts entries older than ttlMs (caller-provided clock)", () => {
    const reg = new CallbackRegistry({ ttlMs: 1000 });
    const before = Date.now();
    const a = reg.register("corr-a");
    const b = reg.register("corr-b");
    const after = Date.now();

    // No eviction when `now` is still inside the window.
    expect(reg.sweep(after)).toBe(0);

    // Eviction when `now` has advanced past createdAt + ttlMs for both.
    expect(reg.sweep(before + 5000)).toBe(2);
    expect(reg.consume(a)).toBeNull();
    expect(reg.consume(b)).toBeNull();
  });

  test("default ttlMs matches the legacy 2h constant", () => {
    const reg = new CallbackRegistry();
    const before = Date.now();
    reg.register("corr-default-ttl");
    const twoHours = 2 * 60 * 60 * 1000;
    expect(reg.sweep(before + twoHours - 1000)).toBe(0);
    expect(reg.sweep(before + twoHours + 1000)).toBe(1);
  });

  test("issues unique tokens for distinct correlationIds", () => {
    const reg = new CallbackRegistry();
    const t1 = reg.register("a");
    const t2 = reg.register("b");
    expect(t1).not.toBe(t2);
  });
});
