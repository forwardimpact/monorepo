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

describe("bridge service", () => {
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

  test("LoadDiscussion on unknown (channel, discussion_id) rejects with NOT_FOUND", async () => {
    await assert.rejects(
      () =>
        service.LoadDiscussion({
          channel: "github-discussions",
          discussion_id: "999",
          tenant_id: T,
        }),
      (err) => err.code === grpc.status.NOT_FOUND,
    );
  });

  test("SaveDiscussion then LoadDiscussion round-trips every field", async () => {
    const rec = {
      id: "github-discussions:42",
      channel: "github-discussions",
      discussion_id: "42",
      lead: "alice",
      last_active_at: Date.now(),
      dispatches: [1, 2, 3],
      history: [
        { role: "user", text: "hello" },
        { role: "assistant", text: "hi" },
      ],
      participants: [
        {
          name: "alice",
          kind: "human",
          external_id: "u1",
          metadata_json: '{"ref":"abc"}',
        },
      ],
      open_rfcs: {
        "corr-1": {
          trigger: { kind: "elapsed", elapsed: "PT1H" },
          opened_at: 100,
          history_index_at_open: 0,
          due_at: 200,
        },
      },
      pending_callbacks: { "tok-a": "corr-1" },
      tenant_id: T,
    };

    await service.SaveDiscussion(rec);
    const loaded = await service.LoadDiscussion({
      channel: "github-discussions",
      discussion_id: "42",
      tenant_id: T,
    });

    assert.strictEqual(loaded.id, "github-discussions:default:42");
    assert.strictEqual(loaded.channel, rec.channel);
    assert.strictEqual(loaded.discussion_id, rec.discussion_id);
    assert.strictEqual(loaded.lead, rec.lead);
    assert.ok(loaded.history.length === 2);
    assert.strictEqual(loaded.participants[0].metadata_json, '{"ref":"abc"}');
    assert.strictEqual(loaded.pending_callbacks["tok-a"], "corr-1");
    assert.ok(loaded.open_rfcs["corr-1"]);
  });

  test("HasOrigin returns false for unknown id; true after RecordOrigin", async () => {
    const before = await service.HasOrigin({ id: "comment-1", tenant_id: T });
    assert.strictEqual(before.exists, false);

    await service.RecordOrigin({
      id: "comment-1",
      discussion_id: "42",
      posted_at: Date.now(),
      tenant_id: T,
    });

    const after = await service.HasOrigin({ id: "comment-1", tenant_id: T });
    assert.strictEqual(after.exists, true);
  });

  test("LoadDiscussionByCorrelation finds record via pending_callbacks map", async () => {
    await service.SaveDiscussion({
      id: "github-discussions:42",
      channel: "github-discussions",
      discussion_id: "42",
      lead: "alice",
      last_active_at: Date.now(),
      pending_callbacks: { "tok-a": "corr-1" },
      tenant_id: T,
    });

    const found = await service.LoadDiscussionByCorrelation({
      correlation_id: "corr-1",
      tenant_id: T,
    });
    assert.strictEqual(found.discussion_id, "42");
  });

  test("LoadDiscussionByCorrelation finds record via open_rfcs map", async () => {
    await service.SaveDiscussion({
      id: "msteams:99",
      channel: "msteams",
      discussion_id: "99",
      lead: "bob",
      last_active_at: Date.now(),
      open_rfcs: {
        "corr-2": {
          trigger: { kind: "elapsed", elapsed: "PT1H" },
          opened_at: 100,
          history_index_at_open: 0,
          due_at: 500,
        },
      },
      tenant_id: T,
    });

    const found = await service.LoadDiscussionByCorrelation({
      correlation_id: "corr-2",
      tenant_id: T,
    });
    assert.strictEqual(found.discussion_id, "99");
  });

  test("LoadDiscussionByCorrelation rejects with NOT_FOUND when no record owns the id", async () => {
    await assert.rejects(
      () =>
        service.LoadDiscussionByCorrelation({
          correlation_id: "missing",
          tenant_id: T,
        }),
      (err) => err.code === grpc.status.NOT_FOUND,
    );
  });

  test("ListOpenRecesses emits one entry per open_rfcs with due_at; omits entries without due_at", async () => {
    await service.SaveDiscussion({
      id: "github-discussions:42",
      channel: "github-discussions",
      discussion_id: "42",
      lead: "alice",
      last_active_at: Date.now(),
      open_rfcs: {
        "corr-with-due": {
          trigger: { kind: "elapsed", elapsed: "PT1H" },
          opened_at: 100,
          history_index_at_open: 0,
          due_at: 999,
        },
        "corr-no-due": {
          trigger: { kind: "responses", responses: 3 },
          opened_at: 100,
          history_index_at_open: 0,
        },
      },
      tenant_id: T,
    });

    const result = await service.ListOpenRecesses({ tenant_id: T });
    assert.strictEqual(result.refs.length, 1);
    assert.strictEqual(result.refs[0].correlation_id, "corr-with-due");
    assert.strictEqual(result.refs[0].due_at, 999);
  });
});
