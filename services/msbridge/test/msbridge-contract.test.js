import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import {
  createMockLogger,
  createMockClock,
  createMockTracer,
  createMockDiscussionClient,
} from "@forwardimpact/libmock";

import {
  MsBridgeService,
  appendHistory,
  buildPrompt,
  validateCallbackPayload,
} from "../index.js";
import { makeConfig, makeAdapter, newService } from "./msbridge-helpers.js";

describe("msbridge service", () => {
  describe("module exports", () => {
    test("exports MsBridgeService class", () => {
      expect(typeof MsBridgeService).toBe("function");
      expect(MsBridgeService.prototype.start).toBeTruthy();
      expect(MsBridgeService.prototype.stop).toBeTruthy();
    });

    test("re-exports buildPrompt, appendHistory, validateCallbackPayload from libbridge", () => {
      expect(typeof buildPrompt).toBe("function");
      expect(typeof appendHistory).toBe("function");
      expect(typeof validateCallbackPayload).toBe("function");
    });
  });

  describe("validateCallbackPayload (lenient libbridge contract)", () => {
    test("requires only correlation_id", () => {
      expect(validateCallbackPayload(null)).toBeNull();
      expect(validateCallbackPayload({})).toBeNull();
      const minimal = validateCallbackPayload({ correlation_id: "c-1" });
      expect(minimal).toEqual({
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

    test("passes through optional channel-agnostic fields", () => {
      const payload = validateCallbackPayload({
        correlation_id: "c-1",
        verdict: "adjourned",
        summary: "done",
        replies: [{ body: "hi" }],
        trigger: { kind: "missing_input", replies: 2 },
        discussion_id: "GD_x",
      });
      expect(payload.replies).toEqual([{ body: "hi" }]);
      expect(payload.trigger).toEqual({ kind: "missing_input", replies: 2 });
      expect(payload.discussion_id).toBe("GD_x");
    });
  });

  describe("MsBridgeService construction", () => {
    test("creates instance with config", () => {
      const service = newService();
      expect(service).toBeTruthy();
      expect(service.store).toBeTruthy();
      expect(service.callbacks).toBeTruthy();
    });

    test("throws if logger is missing", () => {
      expect(
        () =>
          new MsBridgeService(makeConfig(), {
            tracer: createMockTracer(),
            clock: createMockClock(),
            discussionClient: createMockDiscussionClient(),
            adapter: makeAdapter(),
          }),
      ).toThrow("logger is required");
    });

    test("throws if tracer is missing", () => {
      expect(
        () =>
          new MsBridgeService(makeConfig(), {
            logger: createMockLogger(),
            discussionClient: createMockDiscussionClient(),
            adapter: makeAdapter(),
          }),
      ).toThrow("tracer is required");
    });

    test("throws if storage is missing", () => {
      expect(
        () =>
          new MsBridgeService(makeConfig(), {
            logger: createMockLogger(),
            tracer: createMockTracer(),
            clock: createMockClock(),
            adapter: makeAdapter(),
          }),
      ).toThrow("discussionClient is required");
    });
  });
});
