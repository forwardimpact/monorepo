import { afterEach, describe, expect, test } from "bun:test";
import { createMockStorage } from "@forwardimpact/libmock/mock";

import { DiscussionContextStore } from "../src/discussion-context.js";

describe("DiscussionContextStore", () => {
  let store;

  afterEach(async () => {
    if (store) {
      await store.shutdown();
      store = null;
    }
  });

  test("keyOf composes channel:discussion_id", () => {
    expect(DiscussionContextStore.keyOf("github-discussions", "D_kw")).toBe(
      "github-discussions:D_kw",
    );
    expect(DiscussionContextStore.keyOf("msteams", "thread-99")).toBe(
      "msteams:thread-99",
    );
  });

  test("add then loadByChannel round-trips a record", async () => {
    const storage = createMockStorage();
    store = new DiscussionContextStore(storage);
    const record = makeRecord("github-discussions", "D_kw");
    await store.add(record);
    const loaded = await store.loadByChannel("github-discussions", "D_kw");
    expect(loaded).not.toBeNull();
    expect(loaded.discussion_id).toBe("D_kw");
    expect(loaded.history).toEqual([]);
  });

  test("loadByChannel returns null for unknown keys", async () => {
    const storage = createMockStorage();
    store = new DiscussionContextStore(storage);
    expect(
      await store.loadByChannel("github-discussions", "missing"),
    ).toBeNull();
  });

  test("flush persists buffered records to storage as JSONL", async () => {
    const storage = createMockStorage();
    store = new DiscussionContextStore(storage, {
      flushIntervalMs: 10_000,
    });
    await store.add(makeRecord("msteams", "thread-1"));
    await store.add(makeRecord("msteams", "thread-2"));
    const flushed = await store.flush();
    expect(flushed).toBe(2);
    expect(storage.append.mock.callCount()).toBe(1);

    const [key, value] = storage.append.mock.calls[0].arguments;
    expect(key).toBe("discussions.jsonl");
    const lines = value.trim().split("\n");
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).id).toBe("msteams:thread-1");
  });

  test("indexKey override is honoured", async () => {
    const storage = createMockStorage();
    store = new DiscussionContextStore(storage, {
      indexKey: "bridges/discussions.jsonl",
      flushIntervalMs: 10_000,
    });
    await store.add(makeRecord("msteams", "thread-x"));
    await store.flush();
    expect(storage.append.mock.calls[0].arguments[0]).toBe(
      "bridges/discussions.jsonl",
    );
  });

  test("participants[?].metadata survives JSON round-trip (covers Bot Framework ConversationReference)", async () => {
    const storage = createMockStorage();
    store = new DiscussionContextStore(storage, {
      flushIntervalMs: 10_000,
    });
    const reference = {
      bot: { id: "28:bot-id", name: "Kata" },
      channelId: "msteams",
      conversation: {
        id: "19:thread@thread.v2",
        tenantId: "tenant-uuid",
      },
      serviceUrl: "https://smba.trafficmanager.net/",
      user: { id: "29:user", name: "User" },
      activityId: "1700000000000",
    };
    const record = makeRecord("msteams", "thread-z");
    record.participants = [
      {
        name: "user",
        kind: "human",
        external_id: "29:user",
        metadata: reference,
      },
    ];
    await store.add(record);
    await store.flush();

    // Re-hydrate via the same storage backing
    const fresh = new DiscussionContextStore(storage, {
      flushIntervalMs: 10_000,
    });
    try {
      const loaded = await fresh.loadByChannel("msteams", "thread-z");
      expect(loaded.participants[0].metadata).toEqual(reference);
    } finally {
      await fresh.shutdown();
    }
  });

  test("sweepNow evicts records past conversationTtlMs", async () => {
    const storage = createMockStorage();
    store = new DiscussionContextStore(storage, {
      conversationTtlMs: 1000,
      sweepIntervalMs: 1_000_000,
    });
    const now = Date.now();
    const fresh = makeRecord("msteams", "fresh", now);
    const stale = makeRecord("msteams", "stale", now - 5000);
    await store.add(fresh);
    await store.add(stale);

    const evicted = store.sweepNow(now);
    expect(evicted).toBe(1);
    expect(await store.loadByChannel("msteams", "fresh")).not.toBeNull();
    expect(await store.loadByChannel("msteams", "stale")).toBeNull();
  });

  test("conversationTtlMs default matches legacy 24h", async () => {
    const storage = createMockStorage();
    store = new DiscussionContextStore(storage, {
      sweepIntervalMs: 1_000_000,
    });
    const now = Date.now();
    const justBelow = makeRecord(
      "msteams",
      "below",
      now - (24 * 60 * 60 * 1000 - 1000),
    );
    const justAbove = makeRecord(
      "msteams",
      "above",
      now - (24 * 60 * 60 * 1000 + 1000),
    );
    await store.add(justBelow);
    await store.add(justAbove);
    expect(store.sweepNow(now)).toBe(1);
    expect(await store.loadByChannel("msteams", "below")).not.toBeNull();
    expect(await store.loadByChannel("msteams", "above")).toBeNull();
  });

  test("shutdown stops the sweep timer and flushes the buffer", async () => {
    const storage = createMockStorage();
    store = new DiscussionContextStore(storage, {
      flushIntervalMs: 10_000,
    });
    await store.add(makeRecord("msteams", "x"));
    await store.shutdown();
    expect(storage.append.mock.callCount()).toBe(1);
    store = null;
  });
});

function makeRecord(channel, discussionId, lastActiveAt = Date.now()) {
  return {
    id: DiscussionContextStore.keyOf(channel, discussionId),
    channel,
    discussion_id: discussionId,
    history: [],
    participants: [],
    open_rfcs: {},
    lead: "release-engineer",
    pending_callbacks: {},
    last_active_at: lastActiveAt,
  };
}
