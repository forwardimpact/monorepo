import { describe, test } from "node:test";
import { expect } from "@forwardimpact/libmock/expect";
import { evaluateTrigger, parseIsoDuration } from "../src/triggers.js";

describe("parseIsoDuration", () => {
  test("parses P14D as 14 days", () => {
    expect(parseIsoDuration("P14D")).toBe(14 * 24 * 60 * 60 * 1000);
  });

  test("parses PT12H as 12 hours", () => {
    expect(parseIsoDuration("PT12H")).toBe(12 * 60 * 60 * 1000);
  });

  test("parses P1DT6H as 30 hours", () => {
    expect(parseIsoDuration("P1DT6H")).toBe(30 * 60 * 60 * 1000);
  });

  test("parses PT30M as 30 minutes", () => {
    expect(parseIsoDuration("PT30M")).toBe(30 * 60 * 1000);
  });

  test("parses PT45S as 45 seconds", () => {
    expect(parseIsoDuration("PT45S")).toBe(45 * 1000);
  });

  test("rejects empty and malformed strings", () => {
    expect(() => parseIsoDuration("")).toThrow();
    expect(() => parseIsoDuration("P")).toThrow();
    expect(() => parseIsoDuration("PT")).toThrow();
    expect(() => parseIsoDuration("14D")).toThrow();
    expect(() => parseIsoDuration("P1Y")).toThrow();
  });
});

describe("evaluateTrigger", () => {
  test("kind=missing_input fires when observed replies reaches the threshold", () => {
    const t = { kind: "missing_input", replies: 3 };
    expect(evaluateTrigger(t, { replies: 2 }, 0)).toEqual({ fired: false });
    expect(evaluateTrigger(t, { replies: 3 }, 0)).toEqual({ fired: true });
    expect(evaluateTrigger(t, { replies: 5 }, 0)).toEqual({ fired: true });
  });

  test("kind=missing_input without observed.replies treats it as 0", () => {
    expect(
      evaluateTrigger({ kind: "missing_input", replies: 1 }, {}, 0),
    ).toEqual({ fired: false });
  });

  test("kind=elapsed fires once now passes opened_at + duration", () => {
    const opened_at = 1_700_000_000_000;
    const day = 24 * 60 * 60 * 1000;
    const trigger = { kind: "elapsed", elapsed: "P14D" };
    expect(evaluateTrigger(trigger, { opened_at }, opened_at + day)).toEqual({
      fired: false,
      due_at: opened_at + 14 * day,
    });
    expect(
      evaluateTrigger(trigger, { opened_at }, opened_at + 14 * day),
    ).toEqual({ fired: true, due_at: opened_at + 14 * day });
    expect(
      evaluateTrigger(trigger, { opened_at }, opened_at + 20 * day),
    ).toEqual({ fired: true, due_at: opened_at + 14 * day });
  });

  test("kind=elapsed without opened_at returns fired:false (no due_at)", () => {
    expect(evaluateTrigger({ kind: "elapsed", elapsed: "P1D" }, {}, 0)).toEqual(
      { fired: false },
    );
  });

  test("kind=escalation_needed throws as reserved for future use", () => {
    expect(() =>
      evaluateTrigger({ kind: "escalation_needed", signal: "ack" }, {}, 0),
    ).toThrow(/reserved for future use/);
  });

  test("now is caller-provided — function never reads Date.now()", () => {
    const t = { kind: "elapsed", elapsed: "P14D" };
    const fixed = 0;
    const result = evaluateTrigger(t, { opened_at: -1_000 }, fixed);
    expect(result.fired).toBe(false);
    expect(typeof result.due_at).toBe("number");
  });

  test("rejects invalid trigger shapes", () => {
    expect(() => evaluateTrigger(null, {}, 0)).toThrow();
    expect(() => evaluateTrigger({ kind: "ufo" }, {}, 0)).toThrow();
    expect(() => evaluateTrigger({ kind: "either" }, {}, 0)).toThrow();
    expect(() => evaluateTrigger({ kind: "missing_input" }, {}, 0)).toThrow();
    expect(() => evaluateTrigger({ kind: "elapsed" }, {}, 0)).toThrow();
    expect(() =>
      evaluateTrigger({ kind: "elapsed", elapsed: "P14D" }, {}, "now"),
    ).toThrow();
  });
});
