import { describe, expect, test } from "bun:test";

import {
  MAX_FIELD_LENGTH,
  newDiscussionContext,
  normalizeBaseUrl,
  validateCallbackPayload,
} from "../src/callback-payload.js";

describe("validateCallbackPayload", () => {
  test("rejects non-object bodies", () => {
    expect(validateCallbackPayload(null)).toBeNull();
    expect(validateCallbackPayload(undefined)).toBeNull();
    expect(validateCallbackPayload("string")).toBeNull();
  });

  test("rejects when correlation_id is missing or non-string", () => {
    expect(validateCallbackPayload({})).toBeNull();
    expect(validateCallbackPayload({ correlation_id: 42 })).toBeNull();
    expect(validateCallbackPayload({ correlation_id: "" })).toBeNull();
  });

  test("defaults verdict to 'unknown' and summary to '' when missing", () => {
    const payload = validateCallbackPayload({ correlation_id: "c-1" });
    expect(payload).toEqual({
      correlation_id: "c-1",
      verdict: "unknown",
      summary: "",
      replies: [],
    });
  });

  test("passes through verdict and summary, truncating to MAX_FIELD_LENGTH", () => {
    const long = "x".repeat(MAX_FIELD_LENGTH + 100);
    const payload = validateCallbackPayload({
      correlation_id: "c-1",
      verdict: long,
      summary: long,
    });
    expect(payload.verdict).toHaveLength(MAX_FIELD_LENGTH);
    expect(payload.summary).toHaveLength(MAX_FIELD_LENGTH);
  });

  test("preserves replies array, trigger object, discussion_id, and run_url", () => {
    const payload = validateCallbackPayload({
      correlation_id: "c-1",
      verdict: "adjourned",
      summary: "done",
      replies: [{ body: "hi" }, { body: "follow up", in_reply_to: "C_1" }],
      trigger: { kind: "responses", responses: 2 },
      discussion_id: "GD_x",
      run_url: "https://github.com/owner/repo/actions/runs/1",
    });
    expect(payload.replies).toHaveLength(2);
    expect(payload.trigger).toEqual({ kind: "responses", responses: 2 });
    expect(payload.discussion_id).toBe("GD_x");
    expect(payload.run_url).toBe(
      "https://github.com/owner/repo/actions/runs/1",
    );
  });

  test("drops non-array replies and non-object triggers", () => {
    const payload = validateCallbackPayload({
      correlation_id: "c-1",
      replies: "not an array",
      trigger: "not an object",
    });
    expect(payload.replies).toEqual([]);
    expect(payload.trigger).toBeUndefined();
  });
});

describe("normalizeBaseUrl", () => {
  test("strips trailing slashes", () => {
    expect(normalizeBaseUrl("https://x.test/")).toBe("https://x.test");
    expect(normalizeBaseUrl("https://x.test///")).toBe("https://x.test");
    expect(normalizeBaseUrl("https://x.test")).toBe("https://x.test");
  });

  test("returns empty string for null/undefined", () => {
    expect(normalizeBaseUrl(null)).toBe("");
    expect(normalizeBaseUrl(undefined)).toBe("");
  });
});

describe("newDiscussionContext", () => {
  test("composes the canonical record shape from channel/discussionId/participant", () => {
    const participant = {
      name: "alice",
      kind: "human",
      external_id: "42",
      metadata: { node_id: "U_1" },
    };
    const ctx = newDiscussionContext({
      channel: "github-discussions",
      discussionId: "D_kw1",
      participant,
    });
    expect(ctx.id).toBe("github-discussions:D_kw1");
    expect(ctx.channel).toBe("github-discussions");
    expect(ctx.discussion_id).toBe("D_kw1");
    expect(ctx.participants).toEqual([participant]);
    expect(ctx.history).toEqual([]);
    expect(ctx.open_rfcs).toEqual({});
    expect(ctx.pending_callbacks).toEqual({});
    expect(ctx.dispatches).toEqual([]);
    expect(ctx.lead).toBe("release-engineer");
    expect(typeof ctx.last_active_at).toBe("number");
  });

  test("supports the msteams channel shape", () => {
    const ref = { conversation: { id: "thread-1" } };
    const ctx = newDiscussionContext({
      channel: "msteams",
      discussionId: "thread-1",
      participant: { name: "teams-user", kind: "human", metadata: ref },
    });
    expect(ctx.id).toBe("msteams:thread-1");
    expect(ctx.participants[0].metadata).toBe(ref);
  });
});
