import { describe, test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createTraceCollector,
  createTraceQuery,
} from "@forwardimpact/libharness";

// Exercises gemba-trace stats result-event parity against repro-derived and
// synthetic fixtures, loaded via the same exported path the `gemba-trace` CLI's
// loadTrace uses: createTraceCollector for NDJSON, createTraceQuery for
// structured JSON. Totals must agree with the trace's own result events.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "fixtures", "trace-parity");

/**
 * Load a parity fixture through the production query path.
 * @param {string} file
 * @returns {import("../src/trace-query.js").TraceQuery}
 */
function load(file) {
  const content = fs.readFileSync(path.join(dir, file), "utf8");
  if (file.endsWith(".json")) {
    return createTraceQuery(JSON.parse(content));
  }
  const collector = createTraceCollector();
  for (const line of content.split("\n")) collector.addLine(line);
  return createTraceQuery(collector.toJSON());
}

/** Field-wise sum of every assistant stream event's usage (the old multiply-count path). */
function perStreamEventSum(file) {
  const content = fs.readFileSync(path.join(dir, file), "utf8");
  const totals = {
    inputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    let ev = JSON.parse(line);
    if (ev.event) ev = ev.event;
    if (ev.type !== "assistant" || !ev.message?.usage) continue;
    totals.inputTokens += ev.message.usage.input_tokens ?? 0;
    totals.cacheReadInputTokens +=
      ev.message.usage.cache_read_input_tokens ?? 0;
    totals.cacheCreationInputTokens +=
      ev.message.usage.cache_creation_input_tokens ?? 0;
  }
  return totals;
}

/** Cost of only the last result event (the old last-wins path). */
function lastResultCost(file) {
  const content = fs.readFileSync(path.join(dir, file), "utf8");
  let cost = 0;
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    let ev = JSON.parse(line);
    if (ev.event) ev = ev.event;
    if (ev.type === "result") cost = ev.total_cost_usd ?? 0;
  }
  return cost;
}

describe("gemba-trace stats result-event parity", () => {
  test("single-result parity", () => {
    const s = load("single-result.ndjson").stats();
    assert.strictEqual(s.totals.inputTokens, 6301);
    assert.strictEqual(s.totals.outputTokens, 28095);
    assert.strictEqual(s.totals.cacheReadInputTokens, 2524055);
    assert.strictEqual(s.totals.cacheCreationInputTokens, 160162);
    assert.strictEqual(s.totals.totalCostUsd.toFixed(5), "5.99384");
  });

  test("multi-result parity sums over all six result events", () => {
    const s = load("multi-result.ndjson").stats();
    assert.strictEqual(s.totals.inputTokens, 8166);
    assert.strictEqual(s.totals.outputTokens, 7654);
    assert.strictEqual(s.totals.cacheReadInputTokens, 742072);
    assert.strictEqual(s.totals.cacheCreationInputTokens, 110587);
    assert.strictEqual(s.totals.totalCostUsd.toFixed(5), "2.58877");
    assert.strictEqual(s.totals.resultEventTurns, 19);
  });

  test("multi-lane totals sum across every lane", () => {
    const s = load("multi-lane.ndjson").stats();
    assert.strictEqual(s.totals.inputTokens, 150);
    assert.strictEqual(s.totals.outputTokens, 800);
    assert.strictEqual(s.totals.cacheReadInputTokens, 1500);
    assert.strictEqual(s.totals.cacheCreationInputTokens, 300);
    assert.strictEqual(s.totals.totalCostUsd.toFixed(5), "1.50000");
    assert.strictEqual(s.totals.resultEventTurns, 5);
  });

  test("duration is the sum of result-event durations, labeled", () => {
    const s = load("multi-result.ndjson").stats();
    // Six result events at 30000ms each.
    assert.strictEqual(s.totals.durationMs, 180000);
    assert.strictEqual(s.totals.durationLabel, "cumulative invocation time");
  });

  test("modelUsage merges additively across result events", () => {
    const mu = load("multi-result.ndjson").stats().modelUsage[
      "claude-opus-4-x"
    ];
    assert.strictEqual(mu.inputTokens, 8166);
    assert.strictEqual(mu.outputTokens, 7654);
    assert.strictEqual(mu.cacheReadInputTokens, 742072);
    assert.strictEqual(mu.cacheCreationInputTokens, 110587);
    assert.strictEqual(mu.costUSD.toFixed(5), "2.58877");
    // Non-additive field carried first-seen, not multiplied by six.
    assert.strictEqual(mu.contextWindow, 200000);
  });

  test("perTurn is one row per API message, not per stream event", () => {
    const s = load("multi-result.ndjson").stats();
    // 34 assistant stream events span 14 unique message ids.
    assert.strictEqual(s.perTurn.length, 14);
    const ids = s.perTurn.map((r) => r.messageId);
    assert.strictEqual(new Set(ids).size, 14);
    for (const row of s.perTurn) {
      assert.strictEqual(row.population, "api-message");
    }
  });

  test("populations are labeled on totals, perTurn, and overview", () => {
    for (const file of ["single-result.ndjson", "multi-result.ndjson"]) {
      const q = load(file);
      const s = q.stats();
      assert.strictEqual(s.totals.population, "result-event-sum");
      assert.strictEqual(s.totals.resultEventsPresent, true);
      assert.strictEqual(s.perTurn[0].population, "api-message");
      const o = q.overview();
      assert.strictEqual(o.turnPopulations.turnCount, "rendered-trace-turns");
      assert.strictEqual(
        o.turnPopulations.resultEventTurns,
        "result-event-turns",
      );
      assert.strictEqual(typeof o.resultEventTurns, "number");
    }
  });

  test("partial trace falls back without silent zeros", () => {
    const s = load("no-result-event.ndjson").stats();
    assert.strictEqual(s.totals.inputTokens, 220);
    assert.strictEqual(s.totals.outputTokens, 35);
    assert.strictEqual(s.totals.population, "per-message-fallback");
    assert.strictEqual(s.totals.resultEventsPresent, false);
    assert.strictEqual(s.totals.outputIsStreamingSnapshot, true);
    assert.strictEqual(s.totals.totalCostUsd, null);
    assert.strictEqual(s.totals.durationMs, null);
    assert.strictEqual(s.totals.resultEventTurns, null);
  });

  test("divergence is surfaced while result-event totals stay authoritative", () => {
    const s = load("divergence.ndjson").stats();
    assert.strictEqual(s.totals.inputTokens, 999);
    assert.ok(s.divergence);
    assert.strictEqual(s.divergence.field, "inputTokens");
    assert.strictEqual(s.divergence.perMessageSum, 200);
    assert.strictEqual(s.divergence.resultEventSum, 999);
  });

  test("pre-change structured document is readable and labeled", () => {
    const s = load("pre-change-structured.json").stats();
    assert.strictEqual(s.totals.population, "carried-document-summary");
    assert.strictEqual(s.perTurn[0].population, "carried-document-per-turn");
  });

  test("rendering commands are unaffected by the measurement change", () => {
    for (const file of ["single-result.ndjson", "multi-result.ndjson"]) {
      const q = load(file);
      // Timeline, head, tail, and turn-by-index all read turns, not stats.
      assert.ok(q.timeline().length > 0);
      assert.strictEqual(q.head(3).length, 3);
      assert.strictEqual(q.tail(3).length, 3);
      assert.ok(q.turn(1));
    }
  });

  test("fixtures pin the defect family: old paths disagree with the pinned figures", () => {
    // The old multiply-count (per-stream-event sum) overcounts input/cacheRead.
    const sr = perStreamEventSum("single-result.ndjson");
    assert.notStrictEqual(sr.inputTokens, 6301);
    assert.notStrictEqual(sr.cacheReadInputTokens, 2524055);
    assert.notStrictEqual(sr.cacheCreationInputTokens, 160162);
    const mr = perStreamEventSum("multi-result.ndjson");
    assert.notStrictEqual(mr.inputTokens, 8166);
    assert.notStrictEqual(mr.cacheCreationInputTokens, 110587);
    // The old last-wins cost undercounts the multi-result session.
    assert.notStrictEqual(lastResultCost("multi-result.ndjson"), 2.58877);
  });
});
