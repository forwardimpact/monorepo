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

const A = "tenant-a";
const B = "tenant-b";

function discussion(tenant_id, discussion_id, extra = {}) {
  return {
    id: `github-discussions:${discussion_id}`,
    channel: "github-discussions",
    discussion_id,
    lead: "alice",
    last_active_at: Date.now(),
    tenant_id,
    ...extra,
  };
}

describe("bridge per-tenant scoping", () => {
  let service;

  beforeEach(() => {
    const config = createMockConfig("bridge", DEFAULTS);
    service = new BridgeService(config, {
      storage: createMockStorage(),
      logger: createMockLogger(),
      tracer: null,
      clock: createMockClock({ start: Date.now() }),
    });
  });

  afterEach(async () => {
    await service.shutdown();
  });

  test("SaveDiscussion/LoadDiscussion round-trips on the tenant-scoped key", async () => {
    await service.SaveDiscussion(discussion("default", "42"));
    const loaded = await service.LoadDiscussion({
      channel: "github-discussions",
      discussion_id: "42",
      tenant_id: "default",
    });
    assert.strictEqual(loaded.id, "github-discussions:default:42");
    assert.strictEqual(loaded.tenant_id, "default");
  });

  test("a non-default tenant scopes its own records", async () => {
    await service.SaveDiscussion(discussion(A, "42"));
    const loaded = await service.LoadDiscussion({
      channel: "github-discussions",
      discussion_id: "42",
      tenant_id: A,
    });
    assert.strictEqual(loaded.id, `github-discussions:${A}:42`);
  });

  test("LoadDiscussion does not cross tenants on the same discussion_id", async () => {
    await service.SaveDiscussion(discussion(A, "42"));
    await assert.rejects(
      () =>
        service.LoadDiscussion({
          channel: "github-discussions",
          discussion_id: "42",
          tenant_id: B,
        }),
      (err) => err.code === grpc.status.NOT_FOUND,
    );
  });

  test("LoadDiscussionByCorrelation is invisible across tenants", async () => {
    await service.SaveDiscussion(
      discussion(A, "42", { pending_callbacks: { "tok-a": "corr-shared" } }),
    );
    const fromA = await service.LoadDiscussionByCorrelation({
      correlation_id: "corr-shared",
      tenant_id: A,
    });
    assert.strictEqual(fromA.discussion_id, "42");
    await assert.rejects(
      () =>
        service.LoadDiscussionByCorrelation({
          correlation_id: "corr-shared",
          tenant_id: B,
        }),
      (err) => err.code === grpc.status.NOT_FOUND,
    );
  });

  test("ListOpenRecesses filters by request tenant_id", async () => {
    await service.SaveDiscussion(
      discussion(A, "1", {
        open_rfcs: {
          "corr-a": {
            trigger: { kind: "elapsed", elapsed: "PT1H" },
            opened_at: 1,
            history_index_at_open: 0,
            due_at: 100,
          },
        },
      }),
    );
    await service.SaveDiscussion(
      discussion(B, "2", {
        open_rfcs: {
          "corr-b": {
            trigger: { kind: "elapsed", elapsed: "PT1H" },
            opened_at: 1,
            history_index_at_open: 0,
            due_at: 200,
          },
        },
      }),
    );

    const a = await service.ListOpenRecesses({ tenant_id: A });
    assert.strictEqual(a.refs.length, 1);
    assert.strictEqual(a.refs[0].correlation_id, "corr-a");

    const b = await service.ListOpenRecesses({ tenant_id: B });
    assert.strictEqual(b.refs.length, 1);
    assert.strictEqual(b.refs[0].correlation_id, "corr-b");
  });

  test("HasOrigin is tenant-scoped", async () => {
    await service.RecordOrigin({
      id: "comment-1",
      discussion_id: "42",
      posted_at: Date.now(),
      tenant_id: A,
    });
    assert.strictEqual(
      (await service.HasOrigin({ id: "comment-1", tenant_id: A })).exists,
      true,
    );
    assert.strictEqual(
      (await service.HasOrigin({ id: "comment-1", tenant_id: B })).exists,
      false,
    );
  });

  test("DrainInbox returns only the requesting tenant's messages", async () => {
    await service.EnqueueInbox({
      tenant_id: A,
      message: { correlation_id: "corr", text: "from-a", author: "u1" },
    });
    await service.EnqueueInbox({
      tenant_id: B,
      message: { correlation_id: "corr", text: "from-b", author: "u2" },
    });

    const a = await service.DrainInbox({
      correlation_id: "corr",
      since_seq: 0,
      tenant_id: A,
    });
    assert.strictEqual(a.messages.length, 1);
    assert.strictEqual(a.messages[0].text, "from-a");

    const b = await service.DrainInbox({
      correlation_id: "corr",
      since_seq: 0,
      tenant_id: B,
    });
    assert.strictEqual(b.messages.length, 1);
    assert.strictEqual(b.messages[0].text, "from-b");
  });

  test("PutPendingDispatch/ResolvePendingDispatch is tenant-scoped", async () => {
    await service.PutPendingDispatch({
      tenant_id: A,
      pending: {
        link_token: "lt",
        surface: "github-discussions",
        surface_user_id: "u1",
        discussion_id: "d",
        created_at: Date.now(),
      },
    });
    await assert.rejects(
      () => service.ResolvePendingDispatch({ link_token: "lt", tenant_id: B }),
      (err) => err.code === grpc.status.NOT_FOUND,
    );
    const resolved = await service.ResolvePendingDispatch({
      link_token: "lt",
      tenant_id: A,
    });
    assert.strictEqual(resolved.link_token, "lt");
  });

  describe("empty tenant_id is rejected with INVALID_ARGUMENT", () => {
    const rejects = (fn) =>
      assert.rejects(fn, (err) => err.code === grpc.status.INVALID_ARGUMENT);

    test("on every RPC", async () => {
      await rejects(() => service.SaveDiscussion(discussion("", "42")));
      await rejects(() =>
        service.LoadDiscussion({
          channel: "github-discussions",
          discussion_id: "42",
          tenant_id: "",
        }),
      );
      await rejects(() =>
        service.LoadDiscussionByCorrelation({ correlation_id: "c" }),
      );
      await rejects(() => service.ListOpenRecesses({}));
      await rejects(() => service.HasOrigin({ id: "x" }));
      await rejects(() =>
        service.RecordOrigin({ id: "x", discussion_id: "d", posted_at: 1 }),
      );
      await rejects(() => service.Sweep({}));
      await rejects(() =>
        service.PutPendingDispatch({ pending: { link_token: "lt" } }),
      );
      await rejects(() => service.ResolvePendingDispatch({ link_token: "lt" }));
      await rejects(() =>
        service.EnqueueInbox({ message: { correlation_id: "c" } }),
      );
      await rejects(() => service.DrainInbox({ correlation_id: "c" }));
    });
  });
});
