import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";

import { BridgeService } from "../index.js";
import grpc from "@grpc/grpc-js";
import {
  createMockConfig,
  createMockStorage,
  createMockLogger,
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
    };

    await service.SaveDiscussion(rec);
    const loaded = await service.LoadDiscussion({
      channel: "github-discussions",
      discussion_id: "42",
    });

    assert.strictEqual(loaded.id, rec.id);
    assert.strictEqual(loaded.channel, rec.channel);
    assert.strictEqual(loaded.discussion_id, rec.discussion_id);
    assert.strictEqual(loaded.lead, rec.lead);
    assert.ok(loaded.history.length === 2);
    assert.strictEqual(loaded.participants[0].metadata_json, '{"ref":"abc"}');
    assert.strictEqual(loaded.pending_callbacks["tok-a"], "corr-1");
    assert.ok(loaded.open_rfcs["corr-1"]);
  });

  test("HasOrigin returns false for unknown id; true after RecordOrigin", async () => {
    const before = await service.HasOrigin({ id: "comment-1" });
    assert.strictEqual(before.exists, false);

    await service.RecordOrigin({
      id: "comment-1",
      discussion_id: "42",
      posted_at: Date.now(),
    });

    const after = await service.HasOrigin({ id: "comment-1" });
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
    });

    const found = await service.LoadDiscussionByCorrelation({
      correlation_id: "corr-1",
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
    });

    const found = await service.LoadDiscussionByCorrelation({
      correlation_id: "corr-2",
    });
    assert.strictEqual(found.discussion_id, "99");
  });

  test("LoadDiscussionByCorrelation rejects with NOT_FOUND when no record owns the id", async () => {
    await assert.rejects(
      () => service.LoadDiscussionByCorrelation({ correlation_id: "missing" }),
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
    });

    const result = await service.ListOpenRecesses({});
    assert.strictEqual(result.refs.length, 1);
    assert.strictEqual(result.refs[0].correlation_id, "corr-with-due");
    assert.strictEqual(result.refs[0].due_at, 999);
  });

  test("Sweep evicts discussions whose last_active_at is older than conversation_ttl_ms", async () => {
    const now = Date.now();
    const stale = now - DEFAULTS.conversation_ttl_ms - 1;

    await service.SaveDiscussion({
      id: "github-discussions:old",
      channel: "github-discussions",
      discussion_id: "old",
      lead: "alice",
      last_active_at: stale,
    });
    await service.SaveDiscussion({
      id: "github-discussions:fresh",
      channel: "github-discussions",
      discussion_id: "fresh",
      lead: "bob",
      last_active_at: now,
    });

    const result = await service.Sweep({ now });
    assert.strictEqual(result.evicted_discussions, 1);

    await assert.rejects(
      () =>
        service.LoadDiscussion({
          channel: "github-discussions",
          discussion_id: "old",
        }),
      (err) => err.code === grpc.status.NOT_FOUND,
    );
    const fresh = await service.LoadDiscussion({
      channel: "github-discussions",
      discussion_id: "fresh",
    });
    assert.strictEqual(fresh.discussion_id, "fresh");
  });

  test("Sweep evicts origins whose posted_at is older than origin_ttl_ms", async () => {
    const now = Date.now();
    const stale = now - DEFAULTS.origin_ttl_ms - 1;

    await service.RecordOrigin({
      id: "old-origin",
      discussion_id: "42",
      posted_at: stale,
    });
    await service.RecordOrigin({
      id: "fresh-origin",
      discussion_id: "42",
      posted_at: now,
    });

    const result = await service.Sweep({ now });
    assert.strictEqual(result.evicted_origins, 1);

    const oldCheck = await service.HasOrigin({ id: "old-origin" });
    assert.strictEqual(oldCheck.exists, false);
    const freshCheck = await service.HasOrigin({ id: "fresh-origin" });
    assert.strictEqual(freshCheck.exists, true);
  });

  test("PutPendingDispatch then ResolvePendingDispatch returns and consumes the record", async () => {
    await service.PutPendingDispatch({
      pending: {
        link_token: "lt-1",
        surface: "github-discussions",
        surface_user_id: "42",
        discussion_id: "d-100",
        created_at: Date.now(),
      },
    });

    const resolved = await service.ResolvePendingDispatch({
      link_token: "lt-1",
    });
    assert.strictEqual(resolved.link_token, "lt-1");
    assert.strictEqual(resolved.surface, "github-discussions");
    assert.strictEqual(resolved.surface_user_id, "42");
    assert.strictEqual(resolved.discussion_id, "d-100");

    await assert.rejects(
      () => service.ResolvePendingDispatch({ link_token: "lt-1" }),
      (err) => err.code === grpc.status.NOT_FOUND,
    );
  });

  test("Sweep evicts pending dispatches older than TTL", async () => {
    const now = Date.now();
    const stale = now - 11 * 60 * 1000;

    await service.PutPendingDispatch({
      pending: {
        link_token: "lt-old",
        surface: "github-discussions",
        surface_user_id: "42",
        discussion_id: "d-1",
        created_at: stale,
      },
    });

    const result = await service.Sweep({ now });
    assert.ok(result.evicted_pending >= 1);

    await assert.rejects(
      () => service.ResolvePendingDispatch({ link_token: "lt-old" }),
      (err) => err.code === grpc.status.NOT_FOUND,
    );
  });

  test("Concurrent SaveDiscussion from two channels both land", async () => {
    await Promise.all([
      service.SaveDiscussion({
        id: "github-discussions:1",
        channel: "github-discussions",
        discussion_id: "1",
        lead: "alice",
        last_active_at: Date.now(),
      }),
      service.SaveDiscussion({
        id: "msteams:2",
        channel: "msteams",
        discussion_id: "2",
        lead: "bob",
        last_active_at: Date.now(),
      }),
    ]);

    const gh = await service.LoadDiscussion({
      channel: "github-discussions",
      discussion_id: "1",
    });
    const ms = await service.LoadDiscussion({
      channel: "msteams",
      discussion_id: "2",
    });
    assert.strictEqual(gh.lead, "alice");
    assert.strictEqual(ms.lead, "bob");
  });
});
