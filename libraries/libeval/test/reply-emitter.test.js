import { describe, expect, test, beforeEach, afterEach } from "bun:test";

import { ReplyEmitter } from "../src/reply-emitter.js";
import { SequenceCounter } from "../src/sequence-counter.js";

describe("ReplyEmitter", () => {
  let fetches;
  let originalFetch;

  beforeEach(() => {
    fetches = [];
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      fetches.push({ url, body: JSON.parse(init.body) });
      return new Response("{}", { status: 200 });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("emit assigns seq from counter and POSTs to callbackUrl", async () => {
    const counter = new SequenceCounter();
    const emitter = new ReplyEmitter({
      callbackUrl: "https://bridge.test/api/callback/token-1",
      correlationId: "corr-1",
      counter,
    });
    const seq = emitter.emit({
      kind: "reply",
      body: "hello",
      agent: "staff-engineer",
    });
    expect(seq).toBe(0);
    expect(counter.value).toBe(1);
    await new Promise((r) => setTimeout(r, 10));
    expect(fetches).toHaveLength(1);
    expect(fetches[0].body).toEqual({
      correlation_id: "corr-1",
      kind: "reply",
      seq: 0,
      body: "hello",
      agent: "staff-engineer",
    });
  });

  test("emit without callbackUrl still returns seq but does not fetch", () => {
    const counter = new SequenceCounter();
    const emitter = new ReplyEmitter({
      callbackUrl: null,
      correlationId: null,
      counter,
    });
    const seq = emitter.emit({ kind: "ack", body: "on it", agent: "agent-1" });
    expect(seq).toBe(0);
    expect(fetches).toHaveLength(0);
  });
});
