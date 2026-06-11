import { describe, expect, test } from "bun:test";
import { createDefaultClock } from "@forwardimpact/libutil/runtime";

import { CallbackRegistry } from "../src/callback-registry.js";

const DEFAULT = { tenant_id: "default" };

const clock = createDefaultClock();

/**
 * Deterministic clock double: `advance` moves `now`, and intervals are
 * captured for manual firing instead of scheduling host timers.
 * @param {number} [start]
 * @returns {object}
 */
function createFakeClock(start = 0) {
  let now = start;
  const intervals = [];
  return {
    now: () => now,
    advance: (ms) => {
      now += ms;
    },
    setInterval: (fn, ms) => {
      const handle = { fn, ms, cleared: false, unref: () => handle };
      intervals.push(handle);
      return handle;
    },
    clearInterval: (handle) => {
      handle.cleared = true;
    },
    intervals,
  };
}

describe("CallbackRegistry", () => {
  test("register returns a token and consume returns the metadata once", () => {
    const reg = new CallbackRegistry({ clock });
    const token = reg.register("corr-1", {
      threadId: "T1",
      tenant_id: "default",
    });
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
    expect(reg.size).toBe(1);

    const first = reg.consume(token, DEFAULT);
    expect(first).not.toBeNull();
    expect(first.correlationId).toBe("corr-1");
    expect(first.meta).toEqual({ threadId: "T1", tenant_id: "default" });
    expect(reg.size).toBe(0);

    const second = reg.consume(token, DEFAULT);
    expect(second).toBeNull();
  });

  test("peek returns metadata without consuming and clones the entry", () => {
    const reg = new CallbackRegistry({ clock });
    const token = reg.register("corr-2", { tenant_id: "default" });
    const peeked = reg.peek(token, DEFAULT);
    expect(peeked.correlationId).toBe("corr-2");
    expect(reg.size).toBe(1);

    // Mutating the peeked entry must not corrupt internal state.
    peeked.correlationId = "tampered";
    const second = reg.peek(token, DEFAULT);
    expect(second.correlationId).toBe("corr-2");
  });

  test("register rejects empty correlationId", () => {
    const reg = new CallbackRegistry({ clock });
    expect(() => reg.register("", { tenant_id: "default" })).toThrow();
    expect(() => reg.register(undefined, { tenant_id: "default" })).toThrow();
  });

  test("register requires meta.tenant_id", () => {
    const reg = new CallbackRegistry({ clock });
    expect(() => reg.register("corr", {})).toThrow(/tenant_id/);
    expect(() => reg.register("corr")).toThrow(/tenant_id/);
    expect(() => reg.register("corr", { tenant_id: "" })).toThrow(/tenant_id/);
  });

  test("consume returns null when tenant_id does not match the stored binding", () => {
    const reg = new CallbackRegistry({ clock });
    const token = reg.register("corr-mismatch", { tenant_id: "tenant-a" });
    expect(reg.consume(token, { tenant_id: "tenant-b" })).toBeNull();
    // Mismatched consume leaves the entry intact for the rightful caller.
    expect(reg.size).toBe(1);
    const ok = reg.consume(token, { tenant_id: "tenant-a" });
    expect(ok).not.toBeNull();
    expect(ok.correlationId).toBe("corr-mismatch");
  });

  test("peek returns null when tenant_id does not match the stored binding", () => {
    const reg = new CallbackRegistry({ clock });
    const token = reg.register("corr-peek", { tenant_id: "tenant-a" });
    expect(reg.peek(token, { tenant_id: "tenant-b" })).toBeNull();
    expect(reg.peek(token, { tenant_id: "tenant-a" })).not.toBeNull();
  });

  test("consume and peek require a tenant_id argument", () => {
    const reg = new CallbackRegistry({ clock });
    const token = reg.register("corr-required", { tenant_id: "default" });
    expect(() => reg.consume(token)).toThrow(/tenant_id/);
    expect(() => reg.consume(token, {})).toThrow(/tenant_id/);
    expect(() => reg.peek(token)).toThrow(/tenant_id/);
    expect(() => reg.peek(token, {})).toThrow(/tenant_id/);
  });

  test("sweep evicts entries older than ttlMs (caller-provided clock)", () => {
    const reg = new CallbackRegistry({ clock, ttlMs: 1000 });
    const before = Date.now();
    const a = reg.register("corr-a", { tenant_id: "default" });
    const b = reg.register("corr-b", { tenant_id: "default" });
    const after = Date.now();

    // No eviction when `now` is still inside the window.
    expect(reg.sweep(after)).toBe(0);

    // Eviction when `now` has advanced past createdAt + ttlMs for both.
    expect(reg.sweep(before + 5000)).toBe(2);
    expect(reg.consume(a, DEFAULT)).toBeNull();
    expect(reg.consume(b, DEFAULT)).toBeNull();
  });

  test("default ttlMs matches the legacy 2h constant", () => {
    const reg = new CallbackRegistry({ clock });
    const before = Date.now();
    reg.register("corr-default-ttl", { tenant_id: "default" });
    const twoHours = 2 * 60 * 60 * 1000;
    expect(reg.sweep(before + twoHours - 1000)).toBe(0);
    expect(reg.sweep(before + twoHours + 1000)).toBe(1);
  });

  test("issues unique tokens for distinct correlationIds", () => {
    const reg = new CallbackRegistry({ clock });
    const t1 = reg.register("a", { tenant_id: "default" });
    const t2 = reg.register("b", { tenant_id: "default" });
    expect(t1).not.toBe(t2);
  });

  test("tenantOf returns the bound tenant for an active correlation", () => {
    const reg = new CallbackRegistry({ clock });
    reg.register("corr-known", { tenant_id: "tenant-a" });
    expect(reg.tenantOf("corr-known")).toBe("tenant-a");
  });

  test("tenantOf returns null for an unknown correlation", () => {
    const reg = new CallbackRegistry({ clock });
    expect(reg.tenantOf("nope")).toBeNull();
  });

  test("tenantOf returns null for invalid argument shapes (no throw)", () => {
    const reg = new CallbackRegistry({ clock });
    expect(reg.tenantOf("")).toBeNull();
    expect(reg.tenantOf(undefined)).toBeNull();
    expect(reg.tenantOf(null)).toBeNull();
    expect(reg.tenantOf(42)).toBeNull();
  });

  test("tenantOf returns null after consume removes the entry", () => {
    const reg = new CallbackRegistry({ clock });
    const token = reg.register("corr-consume", { tenant_id: "tenant-a" });
    reg.consume(token, { tenant_id: "tenant-a" });
    expect(reg.tenantOf("corr-consume")).toBeNull();
  });

  test("tenantOf returns null after sweep evicts the entry", () => {
    const reg = new CallbackRegistry({ clock, ttlMs: 1000 });
    const before = Date.now();
    reg.register("corr-evict", { tenant_id: "tenant-a" });
    reg.sweep(before + 5000);
    expect(reg.tenantOf("corr-evict")).toBeNull();
  });

  test("consume returns null and drops the entry once the TTL has elapsed", () => {
    const fake = createFakeClock();
    const reg = new CallbackRegistry({ clock: fake, ttlMs: 1000 });
    const token = reg.register("corr-stale", { tenant_id: "default" });
    fake.advance(1001);
    expect(reg.consume(token, DEFAULT)).toBeNull();
    expect(reg.size).toBe(0);
  });

  test("peek returns null and drops the entry once the TTL has elapsed", () => {
    const fake = createFakeClock();
    const reg = new CallbackRegistry({ clock: fake, ttlMs: 1000 });
    const token = reg.register("corr-stale-peek", { tenant_id: "default" });
    fake.advance(1000);
    expect(reg.peek(token, DEFAULT)).not.toBeNull();
    fake.advance(1);
    expect(reg.peek(token, DEFAULT)).toBeNull();
    expect(reg.size).toBe(0);
  });

  test("tenantOf ignores and drops expired entries without a sweep", () => {
    const fake = createFakeClock();
    const reg = new CallbackRegistry({ clock: fake, ttlMs: 1000 });
    reg.register("corr-stale-tenant", { tenant_id: "tenant-a" });
    fake.advance(1001);
    expect(reg.tenantOf("corr-stale-tenant")).toBeNull();
    expect(reg.size).toBe(0);
  });

  test("startSweepTimer schedules a periodic sweep; stopSweepTimer clears it", () => {
    const fake = createFakeClock();
    const reg = new CallbackRegistry({ clock: fake, ttlMs: 1000 });
    reg.startSweepTimer(60_000);
    reg.startSweepTimer(60_000);
    expect(fake.intervals.length).toBe(1);

    reg.register("corr-swept", { tenant_id: "default" });
    fake.advance(5000);
    fake.intervals[0].fn();
    expect(reg.size).toBe(0);

    reg.stopSweepTimer();
    expect(fake.intervals[0].cleared).toBe(true);
    // A stopped registry can start sweeping again.
    reg.startSweepTimer(60_000);
    expect(fake.intervals.length).toBe(2);
    reg.stopSweepTimer();
  });
});
