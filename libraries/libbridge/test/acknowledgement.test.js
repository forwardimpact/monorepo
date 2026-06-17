import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import {
  Acknowledgement,
  DEFAULT_TYPING_VERBS,
} from "../src/acknowledgement.js";
import { ProgressTicker } from "../src/progress-ticker.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function makeReactionAdapter({ addImpl, removeImpl } = {}) {
  const adds = [];
  const removes = [];
  return {
    adds,
    removes,
    add: async (target) => {
      adds.push(target);
      return addImpl ? addImpl(target) : "reaction-id-1";
    },
    remove: async (reactionId, target) => {
      removes.push({ reactionId, target });
      if (removeImpl) await removeImpl(reactionId, target);
    },
  };
}

function makeTypingAdapter({ sendImpl } = {}) {
  const sends = [];
  return {
    sends,
    send: async (target, text) => {
      sends.push({ target, text });
      if (sendImpl) await sendImpl(target, text);
    },
  };
}

describe("Acknowledgement", () => {
  test("rejects construction without a reaction adapter", () => {
    expect(() => new Acknowledgement({})).toThrow();
    expect(() => new Acknowledgement({ reactionAdapter: {} })).toThrow();
  });

  test("rejects a typing adapter that lacks send()", () => {
    expect(
      () =>
        new Acknowledgement({
          reactionAdapter: makeReactionAdapter(),
          typingAdapter: {},
        }),
    ).toThrow();
  });

  test("rejects an empty typingVerbs list", () => {
    expect(
      () =>
        new Acknowledgement({
          reactionAdapter: makeReactionAdapter(),
          typingVerbs: [],
        }),
    ).toThrow();
  });

  test("start adds the reaction immediately and finish removes it", async () => {
    const reactions = makeReactionAdapter();
    const ack = new Acknowledgement({ reactionAdapter: reactions });
    await ack.start("tok-1", { subjectId: "S_1" });
    expect(reactions.adds).toEqual([{ subjectId: "S_1" }]);
    expect(ack.pending("tok-1")).toBe(true);
    await ack.finish("tok-1");
    expect(reactions.removes).toHaveLength(1);
    expect(reactions.removes[0]).toEqual({
      reactionId: "reaction-id-1",
      target: { subjectId: "S_1" },
    });
    expect(ack.pending("tok-1")).toBe(false);
  });

  test("reaction-only mode never starts the typing ticker", async () => {
    const reactions = makeReactionAdapter();
    const ticker = new ProgressTicker({ intervalMs: 10 });
    const ack = new Acknowledgement({
      reactionAdapter: reactions,
      progressTicker: ticker,
    });
    await ack.start("tok-2", { id: "x" });
    await wait(35);
    await ack.finish("tok-2");
    expect(ticker.size).toBe(0);
  });

  test("when a typing adapter is supplied, send() runs on each interval with a verb", async () => {
    const reactions = makeReactionAdapter();
    const typing = makeTypingAdapter();
    const ack = new Acknowledgement({
      reactionAdapter: reactions,
      typingAdapter: typing,
      progressTicker: new ProgressTicker({ intervalMs: 10 }),
    });
    await ack.start("tok-3", { ref: "abc" });
    await wait(55);
    await ack.finish("tok-3");
    expect(typing.sends.length).toBeGreaterThanOrEqual(3);
    for (const { target, text } of typing.sends) {
      expect(target).toEqual({ ref: "abc" });
      expect(text).toMatch(/^[A-Z][a-z]+\.\.\.$/);
      const verb = text.replace(/\.\.\.$/, "");
      expect(DEFAULT_TYPING_VERBS).toContain(verb);
    }
  });

  test("custom typingVerbs override the default pool", async () => {
    const typing = makeTypingAdapter();
    const ack = new Acknowledgement({
      reactionAdapter: makeReactionAdapter(),
      typingAdapter: typing,
      typingVerbs: ["Chirping"],
      progressTicker: new ProgressTicker({ intervalMs: 10 }),
    });
    await ack.start("tok-custom", "T");
    await wait(35);
    await ack.finish("tok-custom");
    expect(typing.sends.length).toBeGreaterThan(0);
    for (const { text } of typing.sends) {
      expect(text).toBe("Chirping...");
    }
  });

  test("add() errors are swallowed and the lifecycle still proceeds", async () => {
    const reactions = {
      add: async () => {
        throw new Error("network");
      },
      remove: async () => {},
    };
    const ack = new Acknowledgement({ reactionAdapter: reactions });
    await expect(ack.start("tok-4", null)).resolves.toBeUndefined();
    expect(ack.pending("tok-4")).toBe(true);
    await ack.finish("tok-4");
    expect(ack.pending("tok-4")).toBe(false);
  });

  test("remove() errors are swallowed so the host's reply path is not blocked", async () => {
    const reactions = makeReactionAdapter({
      removeImpl: () => {
        throw new Error("offline");
      },
    });
    const ack = new Acknowledgement({ reactionAdapter: reactions });
    await ack.start("tok-5", "T");
    await expect(ack.finish("tok-5")).resolves.toBeUndefined();
  });

  test("typing send() errors auto-stop the ticker without blocking finish()", async () => {
    const reactions = makeReactionAdapter();
    const typing = makeTypingAdapter({
      sendImpl: () => {
        throw new Error("post failed");
      },
    });
    const ticker = new ProgressTicker({ intervalMs: 10 });
    const ack = new Acknowledgement({
      reactionAdapter: reactions,
      typingAdapter: typing,
      progressTicker: ticker,
    });
    await ack.start("tok-6", "T");
    await wait(30);
    expect(ticker.size).toBe(0);
    await ack.finish("tok-6");
    expect(reactions.removes).toHaveLength(1);
  });

  test("finish without start is a no-op", async () => {
    const reactions = makeReactionAdapter();
    const ack = new Acknowledgement({ reactionAdapter: reactions });
    await ack.finish("never-started");
    expect(reactions.removes).toHaveLength(0);
  });

  test("double start on the same token is idempotent", async () => {
    const reactions = makeReactionAdapter();
    const ack = new Acknowledgement({ reactionAdapter: reactions });
    await ack.start("tok-7", "A");
    await ack.start("tok-7", "B");
    expect(reactions.adds).toEqual(["A"]);
  });
});
