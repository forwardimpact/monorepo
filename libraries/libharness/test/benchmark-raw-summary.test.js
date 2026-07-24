import { describe, test } from "node:test";
import assert from "node:assert";

import { createMockFs } from "@forwardimpact/libmock";

import { summarizeRawTrace } from "../src/benchmark/raw-summary.js";
import { cellEnvelopes } from "./benchmark-trace-helpers.js";

const RAW = "/out/runs/task/0/trace--task-r0.raw.ndjson";

function runtimeWith(content) {
  return { fs: createMockFs({ [RAW]: content }) };
}

function ndjson(envelopes) {
  return envelopes.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

describe("summarizeRawTrace", () => {
  test("sums cost per source from result events (the one cost path)", async () => {
    const rt = runtimeWith(
      ndjson(cellEnvelopes({ agentCost: 0.05, supervisorCost: 0.02 })),
    );
    const summary = await summarizeRawTrace(rt, RAW);
    assert.strictEqual(summary.costUsd, 0.07);
    assert.deepStrictEqual(summary.costBreakdown, {
      agent: 0.05,
      supervisor: 0.02,
    });
  });

  test("extracts turns from the last orchestrator summary event", async () => {
    const rt = runtimeWith(
      ndjson([
        ...cellEnvelopes({ turns: 2 }),
        {
          source: "orchestrator",
          seq: 9,
          event: { type: "summary", turns: 7 },
        },
      ]),
    );
    const summary = await summarizeRawTrace(rt, RAW);
    assert.strictEqual(summary.turns, 7);
  });

  test("extracts the last agent assistant text block as the submission", async () => {
    const rt = runtimeWith(
      ndjson([
        ...cellEnvelopes({ submission: "first" }),
        {
          source: "agent",
          seq: 10,
          event: {
            type: "assistant",
            message: {
              content: [
                { type: "tool_use", name: "Bash" },
                { type: "text", text: "final answer" },
              ],
            },
          },
        },
        {
          source: "supervisor",
          seq: 11,
          event: {
            type: "assistant",
            message: { content: [{ type: "text", text: "not the agent" }] },
          },
        },
      ]),
    );
    const summary = await summarizeRawTrace(rt, RAW);
    assert.strictEqual(summary.submission, "final answer");
  });

  test("yields zeros and an empty submission on an empty (materialized-stub) file", async () => {
    const rt = runtimeWith("");
    const summary = await summarizeRawTrace(rt, RAW);
    assert.deepStrictEqual(summary, {
      costUsd: 0,
      costBreakdown: { agent: 0, supervisor: 0 },
      turns: 0,
      submission: "",
    });
  });

  test("tolerates malformed and blank lines", async () => {
    const rt = runtimeWith(
      ["", "not json {{{", ndjson(cellEnvelopes()).trim(), "  "].join("\n"),
    );
    const summary = await summarizeRawTrace(rt, RAW);
    assert.strictEqual(summary.costUsd, 0.03);
    assert.strictEqual(summary.turns, 3);
    assert.strictEqual(summary.submission, "done");
  });
});
