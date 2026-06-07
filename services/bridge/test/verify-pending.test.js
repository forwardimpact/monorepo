import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";

import { BridgeService } from "../index.js";
import grpc from "@grpc/grpc-js";
import {
  createMockConfig,
  createMockStorage,
  createMockLogger,
  createMockClock,
} from "@forwardimpact/libmock";

const DEFAULTS = {
  discussion_flush_interval_ms: 5_000,
  discussion_max_buffer_size: 1_000,
  origin_flush_interval_ms: 1_000,
  origin_max_buffer_size: 100,
  conversation_ttl_ms: 24 * 60 * 60 * 1000,
  origin_ttl_ms: 24 * 60 * 60 * 1000,
  sweep_interval_ms: 60_000,
};

const T = "default";

describe("bridge VerifyPendingDispatch", () => {
  let service;
  let storage;
  let logger;

  beforeEach(() => {
    storage = createMockStorage();
    logger = createMockLogger();
    const config = createMockConfig("bridge", DEFAULTS);
    service = new BridgeService(config, {
      storage,
      logger,
      tracer: null,
      clock: createMockClock({ start: Date.now() }),
    });
  });

  afterEach(async () => {
    await service.shutdown();
  });

  test("no pending entry for link_token returns NOT_FOUND", async () => {
    await assert.rejects(
      () =>
        service.VerifyPendingDispatch({
          link_token: "lt-missing",
          expected_surface: "msteams",
          expected_surface_user_id: "aad-1",
          tenant_id: T,
        }),
      (err) => err.code === grpc.status.NOT_FOUND,
    );
  });

  test("pending entry with mismatched expected_surface returns FAILED_PRECONDITION", async () => {
    await service.PutPendingDispatch({
      pending: {
        link_token: "lt-surface",
        surface: "msteams",
        surface_user_id: "aad-1",
        discussion_id: "d-1",
        created_at: Date.now(),
      },
      tenant_id: T,
    });
    await assert.rejects(
      () =>
        service.VerifyPendingDispatch({
          link_token: "lt-surface",
          expected_surface: "github-discussions",
          expected_surface_user_id: "aad-1",
          tenant_id: T,
        }),
      (err) => err.code === grpc.status.FAILED_PRECONDITION,
    );
  });

  test("pending entry with mismatched expected_surface_user_id returns FAILED_PRECONDITION", async () => {
    await service.PutPendingDispatch({
      pending: {
        link_token: "lt-suid",
        surface: "msteams",
        surface_user_id: "victim",
        discussion_id: "d-2",
        created_at: Date.now(),
      },
      tenant_id: T,
    });
    await assert.rejects(
      () =>
        service.VerifyPendingDispatch({
          link_token: "lt-suid",
          expected_surface: "msteams",
          expected_surface_user_id: "attacker",
          tenant_id: T,
        }),
      (err) => err.code === grpc.status.FAILED_PRECONDITION,
    );
  });

  test("valid pending entry resolves on first claim and records the link_token", async () => {
    await service.PutPendingDispatch({
      pending: {
        link_token: "lt-ok",
        surface: "msteams",
        surface_user_id: "aad-1",
        discussion_id: "d-3",
        created_at: Date.now(),
      },
      tenant_id: T,
    });
    const result = await service.VerifyPendingDispatch({
      link_token: "lt-ok",
      expected_surface: "msteams",
      expected_surface_user_id: "aad-1",
      tenant_id: T,
    });
    assert.deepStrictEqual(result, {});
    // Persisted claim survives a flush: the ledger now carries the
    // tenant-scoped key.
    const claimed = await storage.get("claimed_dispatches.jsonl");
    assert.ok(Array.isArray(claimed));
    assert.strictEqual(claimed.length, 1);
    assert.strictEqual(claimed[0].link_token, "lt-ok");
    assert.strictEqual(claimed[0].id, `${T}:lt-ok`);
  });

  test("same link_token claimed twice rejects the second call with FAILED_PRECONDITION", async () => {
    await service.PutPendingDispatch({
      pending: {
        link_token: "lt-twice",
        surface: "msteams",
        surface_user_id: "aad-1",
        discussion_id: "d-4",
        created_at: Date.now(),
      },
      tenant_id: T,
    });
    await service.VerifyPendingDispatch({
      link_token: "lt-twice",
      expected_surface: "msteams",
      expected_surface_user_id: "aad-1",
      tenant_id: T,
    });
    await assert.rejects(
      () =>
        service.VerifyPendingDispatch({
          link_token: "lt-twice",
          expected_surface: "msteams",
          expected_surface_user_id: "aad-1",
          tenant_id: T,
        }),
      (err) => err.code === grpc.status.FAILED_PRECONDITION,
    );
  });

  test("two concurrent verifies for the same link_token: exactly one OK, one FAILED_PRECONDITION", async () => {
    await service.PutPendingDispatch({
      pending: {
        link_token: "lt-race",
        surface: "msteams",
        surface_user_id: "aad-1",
        discussion_id: "d-5",
        created_at: Date.now(),
      },
      tenant_id: T,
    });
    const settled = await Promise.allSettled([
      service.VerifyPendingDispatch({
        link_token: "lt-race",
        expected_surface: "msteams",
        expected_surface_user_id: "aad-1",
        tenant_id: T,
      }),
      service.VerifyPendingDispatch({
        link_token: "lt-race",
        expected_surface: "msteams",
        expected_surface_user_id: "aad-1",
        tenant_id: T,
      }),
    ]);
    const fulfilled = settled.filter((s) => s.status === "fulfilled");
    const rejected = settled.filter((s) => s.status === "rejected");
    assert.strictEqual(fulfilled.length, 1);
    assert.strictEqual(rejected.length, 1);
    assert.strictEqual(
      rejected[0].reason.code,
      grpc.status.FAILED_PRECONDITION,
    );
  });

  test("tenant scoping: a verify from tenant B cannot consume tenant A's pending entry", async () => {
    await service.PutPendingDispatch({
      pending: {
        link_token: "lt-tenant",
        surface: "msteams",
        surface_user_id: "aad-1",
        discussion_id: "d-6",
        created_at: Date.now(),
      },
      tenant_id: "A",
    });
    await assert.rejects(
      () =>
        service.VerifyPendingDispatch({
          link_token: "lt-tenant",
          expected_surface: "msteams",
          expected_surface_user_id: "aad-1",
          tenant_id: "B",
        }),
      (err) => err.code === grpc.status.NOT_FOUND,
    );
  });
});
