/**
 * Verifies the no-token-on-disk invariant: after a consume the on-disk
 * `pending_dispatches.jsonl` carries no substring match for the consumed
 * `link_token` (and no `"deleted":true` tombstone), and a fresh
 * BridgeService over the same storage path does not re-surface the
 * consumed entry on restart.
 *
 * Uses the real LocalStorage backend (not the mock) so the assertion goes
 * against actual disk bytes, not an in-memory hash.
 */
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import * as fsp from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import grpc from "@grpc/grpc-js";

import { BridgeService } from "../index.js";
import {
  createMockConfig,
  createMockLogger,
  createMockClock,
} from "@forwardimpact/libmock";
import { LocalStorage } from "@forwardimpact/libstorage";

const CONFIG = {
  discussion_flush_interval_ms: 5_000,
  discussion_max_buffer_size: 1_000,
  origin_flush_interval_ms: 1_000,
  origin_max_buffer_size: 100,
  pending_flush_interval_ms: 1_000,
  conversation_ttl_ms: 24 * 60 * 60 * 1000,
  origin_ttl_ms: 24 * 60 * 60 * 1000,
  sweep_interval_ms: 60_000,
};

const T = "default";

function newService(storage) {
  return new BridgeService(createMockConfig("bridge", CONFIG), {
    storage,
    logger: createMockLogger(),
    tracer: null,
    clock: createMockClock({ start: Date.now() }),
  });
}

describe("bridge — pending-dispatches compaction on disk", () => {
  let tmpDir;
  let storage;
  let service;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "bridge-pending-"));
    storage = new LocalStorage(tmpDir, fsp);
    service = newService(storage);
  });

  afterEach(async () => {
    await service.shutdown();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("consume removes the link_token from the on-disk file", async () => {
    await service.PutPendingDispatch({
      pending: {
        link_token: "lt-on-disk",
        surface: "github-discussions",
        surface_user_id: "42",
        discussion_id: "d-1",
        created_at: Date.now(),
      },
      tenant_id: T,
    });
    await service.ResolvePendingDispatch({
      link_token: "lt-on-disk",
      tenant_id: T,
    });

    const onDisk = await fsp.readFile(
      join(tmpDir, "pending_dispatches.jsonl"),
      "utf8",
    );
    assert.strictEqual(
      onDisk.includes("lt-on-disk"),
      false,
      "consumed token must not remain on disk",
    );
    assert.strictEqual(
      onDisk.includes("deleted"),
      false,
      "tombstone marker must not remain on disk",
    );
  });

  test("restart durability: a fresh BridgeService does not re-surface a consumed entry", async () => {
    await service.PutPendingDispatch({
      pending: {
        link_token: "lt-a",
        surface: "github-discussions",
        surface_user_id: "1",
        discussion_id: "d-a",
        created_at: Date.now(),
      },
      tenant_id: T,
    });
    await service.PutPendingDispatch({
      pending: {
        link_token: "lt-b",
        surface: "github-discussions",
        surface_user_id: "2",
        discussion_id: "d-b",
        created_at: Date.now(),
      },
      tenant_id: T,
    });
    await service.PutPendingDispatch({
      pending: {
        link_token: "lt-c",
        surface: "github-discussions",
        surface_user_id: "3",
        discussion_id: "d-c",
        created_at: Date.now(),
      },
      tenant_id: T,
    });
    await service.ResolvePendingDispatch({ link_token: "lt-b", tenant_id: T });
    await service.shutdown();

    const restarted = newService(storage);
    service = restarted;

    const a = await restarted.ResolvePendingDispatch({
      link_token: "lt-a",
      tenant_id: T,
    });
    const c = await restarted.ResolvePendingDispatch({
      link_token: "lt-c",
      tenant_id: T,
    });
    assert.strictEqual(a.link_token, "lt-a");
    assert.strictEqual(c.link_token, "lt-c");

    await assert.rejects(
      () =>
        restarted.ResolvePendingDispatch({
          link_token: "lt-b",
          tenant_id: T,
        }),
      (err) => err.code === grpc.status.NOT_FOUND,
      "consumed token must not be visible after restart",
    );

    const onDisk = await fsp.readFile(
      join(tmpDir, "pending_dispatches.jsonl"),
      "utf8",
    );
    assert.strictEqual(
      onDisk.includes("lt-b"),
      false,
      "consumed token must not survive in the on-disk file across restart",
    );
  });

  test("sweep compacts the on-disk file when entries are evicted", async () => {
    const start = Date.now();
    await service.PutPendingDispatch({
      pending: {
        link_token: "lt-stale",
        surface: "github-discussions",
        surface_user_id: "42",
        discussion_id: "d-1",
        created_at: start - 11 * 60 * 1000,
      },
      tenant_id: T,
    });
    await service.PutPendingDispatch({
      pending: {
        link_token: "lt-fresh",
        surface: "github-discussions",
        surface_user_id: "43",
        discussion_id: "d-2",
        created_at: start,
      },
      tenant_id: T,
    });

    const result = await service.Sweep({ now: start, tenant_id: T });
    assert.ok(result.evicted_pending >= 1);

    const onDisk = await fsp.readFile(
      join(tmpDir, "pending_dispatches.jsonl"),
      "utf8",
    );
    assert.strictEqual(
      onDisk.includes("lt-stale"),
      false,
      "swept-out token must not remain on disk",
    );
    assert.strictEqual(
      onDisk.includes("lt-fresh"),
      true,
      "live token must remain on disk",
    );
  });
});
