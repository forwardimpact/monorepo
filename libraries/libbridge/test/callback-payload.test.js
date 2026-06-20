import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { createDefaultClock } from "@forwardimpact/libutil/runtime";

import {
  MAX_FIELD_LENGTH,
  MAX_REPLY_COUNT,
  newDiscussionContext,
  normalizeBaseUrl,
  validateCallbackPayload,
} from "../src/callback-payload.js";

const clock = createDefaultClock();

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
      kind: "terminal",
      seq: -1,
      body: "",
      agent: "",
      last_acted_seq: -1,
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
      trigger: { kind: "missing_input", replies: 2 },
      discussion_id: "GD_x",
      run_url: "https://github.com/owner/repo/actions/runs/1",
    });
    expect(payload.replies).toHaveLength(2);
    expect(payload.trigger).toEqual({ kind: "missing_input", replies: 2 });
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

  test("truncates reply body strings to MAX_FIELD_LENGTH", () => {
    const long = "y".repeat(MAX_FIELD_LENGTH + 500);
    const payload = validateCallbackPayload({
      correlation_id: "c-1",
      replies: [{ body: long }],
    });
    expect(payload.replies[0].body).toHaveLength(MAX_FIELD_LENGTH);
  });

  test("caps reply count at MAX_REPLY_COUNT", () => {
    const replies = Array.from({ length: MAX_REPLY_COUNT + 10 }, (_, i) => ({
      body: `r${i}`,
    }));
    const payload = validateCallbackPayload({
      correlation_id: "c-1",
      replies,
    });
    expect(payload.replies).toHaveLength(MAX_REPLY_COUNT);
  });

  test("rejects trigger with unknown kind", () => {
    const payload = validateCallbackPayload({
      correlation_id: "c-1",
      trigger: { kind: "evil", responses: 1 },
    });
    expect(payload.trigger).toBeUndefined();
  });

  test("rejects trigger with non-string kind", () => {
    const payload = validateCallbackPayload({
      correlation_id: "c-1",
      trigger: { kind: 42 },
    });
    expect(payload.trigger).toBeUndefined();
  });

  test("accepts trigger with allowed kind values", () => {
    for (const kind of ["missing_input", "escalation_needed", "elapsed"]) {
      const payload = validateCallbackPayload({
        correlation_id: "c-1",
        trigger: { kind },
      });
      expect(payload.trigger).toEqual({ kind });
    }
  });

  test("rejects legacy kinds (responses, either, any) at the payload boundary", () => {
    for (const kind of ["responses", "either", "any"]) {
      const payload = validateCallbackPayload({
        correlation_id: "c-1",
        trigger: { kind },
      });
      expect(payload.trigger).toBeUndefined();
    }
  });

  test("validates trigger replies as a finite non-negative number", () => {
    const bad = validateCallbackPayload({
      correlation_id: "c-1",
      trigger: { kind: "missing_input", replies: -1 },
    });
    expect(bad.trigger).toBeUndefined();

    const good = validateCallbackPayload({
      correlation_id: "c-1",
      trigger: { kind: "missing_input", replies: 3 },
    });
    expect(good.trigger).toEqual({ kind: "missing_input", replies: 3 });
  });

  test("validates trigger elapsed as a string", () => {
    const bad = validateCallbackPayload({
      correlation_id: "c-1",
      trigger: { kind: "elapsed", elapsed: 300 },
    });
    expect(bad.trigger).toBeUndefined();

    const good = validateCallbackPayload({
      correlation_id: "c-1",
      trigger: { kind: "elapsed", elapsed: "PT5M" },
    });
    expect(good.trigger).toEqual({ kind: "elapsed", elapsed: "PT5M" });
  });

  test("payload with kind=reply sets kind and defaults seq", () => {
    const payload = validateCallbackPayload({
      correlation_id: "c-1",
      kind: "reply",
      body: "hello",
      agent: "staff-engineer",
      seq: 5,
    });
    expect(payload.kind).toBe("reply");
    expect(payload.seq).toBe(5);
    expect(payload.body).toBe("hello");
    expect(payload.agent).toBe("staff-engineer");
  });

  test("payload without kind defaults to terminal", () => {
    const payload = validateCallbackPayload({
      correlation_id: "c-1",
      verdict: "adjourned",
      summary: "done",
    });
    expect(payload.kind).toBe("terminal");
    expect(payload.seq).toBe(-1);
    expect(payload.last_acted_seq).toBe(-1);
  });

  test("truncates body and agent to MAX_FIELD_LENGTH", () => {
    const long = "x".repeat(MAX_FIELD_LENGTH + 100);
    const payload = validateCallbackPayload({
      correlation_id: "c-1",
      body: long,
      agent: long,
    });
    expect(payload.body.length).toBe(MAX_FIELD_LENGTH);
    expect(payload.agent.length).toBe(MAX_FIELD_LENGTH);
  });

  test("validates trigger signal as a non-empty string for escalation_needed", () => {
    const bad = validateCallbackPayload({
      correlation_id: "c-1",
      trigger: { kind: "escalation_needed", signal: "" },
    });
    expect(bad.trigger).toBeUndefined();

    const good = validateCallbackPayload({
      correlation_id: "c-1",
      trigger: { kind: "escalation_needed", signal: "reviewer-ack" },
    });
    expect(good.trigger).toEqual({
      kind: "escalation_needed",
      signal: "reviewer-ack",
    });
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
      clock,
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
    expect(ctx.active_requester).toBeNull();
    expect(ctx.last_posted_seq).toBe(-1);
  });

  test("supports the msteams channel shape", () => {
    const ref = { conversation: { id: "thread-1" } };
    const ctx = newDiscussionContext({
      clock,
      channel: "msteams",
      discussionId: "thread-1",
      participant: { name: "teams-user", kind: "human", metadata: ref },
    });
    expect(ctx.id).toBe("msteams:thread-1");
    expect(ctx.participants[0].metadata).toBe(ref);
  });
});
