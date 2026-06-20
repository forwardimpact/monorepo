import { describe, test, beforeEach, afterEach } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { createTestRuntime } from "@forwardimpact/libmock";
const _rt = createTestRuntime();

import { InboxPoller } from "../src/inbox-poller.js";
import { createMessageBus } from "../src/message-bus.js";

describe("InboxPoller", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("polls inbox and lands messages on lead queue via synthetic", async () => {
    const ac = new AbortController();
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({
            messages: [{ seq: 1, text: "follow-up from human" }],
          }),
          { status: 200 },
        );
      }
      ac.abort();
      return new Response(JSON.stringify({ messages: [] }), { status: 200 });
    };

    const bus = createMessageBus({ participants: ["lead"] });
    const poller = new InboxPoller({
      runtime: _rt,
      inboxUrl: "https://bridge.test/api/inbox/default/corr-1",
      messageBus: bus,
      leadName: "lead",
      signal: ac.signal,
    });

    await poller.run();

    const messages = bus.drain("lead");
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].text).toBe("follow-up from human");
    expect(messages[0].kind).toBe("synthetic");
  });

  test("markActed records lastActedSeq", async () => {
    const ac = new AbortController();
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({ messages: [{ seq: 5, text: "msg" }] }),
          { status: 200 },
        );
      }
      ac.abort();
      return new Response(JSON.stringify({ messages: [] }), { status: 200 });
    };

    const bus = createMessageBus({ participants: ["lead"] });
    const poller = new InboxPoller({
      runtime: _rt,
      inboxUrl: "https://bridge.test/api/inbox/default/corr-1",
      messageBus: bus,
      leadName: "lead",
      signal: ac.signal,
    });

    expect(poller.lastActedSeq).toBe(-1);
    await poller.run();
    poller.markActed();
    expect(poller.lastActedSeq).toBe(5);
  });

  test("no-ops when inboxUrl is null", async () => {
    const bus = createMessageBus({ participants: ["lead"] });
    const ac = new AbortController();
    const poller = new InboxPoller({
      runtime: _rt,
      inboxUrl: null,
      messageBus: bus,
      leadName: "lead",
      signal: ac.signal,
    });
    await poller.run();
    expect(bus.drain("lead")).toHaveLength(0);
  });
});
