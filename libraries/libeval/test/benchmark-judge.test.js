import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { parseConcludeFromTrace } from "../src/benchmark/judge.js";

const RT = createDefaultRuntime();

async function writeTrace(lines) {
  const dir = await mkdtemp(join(tmpdir(), "benchmark-judge-"));
  const path = join(dir, "trace.ndjson");
  await writeFile(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return path;
}

function envelopeAssistant(source, blocks) {
  return {
    source,
    seq: 0,
    event: {
      type: "assistant",
      message: { content: blocks },
    },
  };
}

const concludeBlock = (verdict, summary) => ({
  type: "tool_use",
  name: "Conclude",
  input: { verdict, summary },
});

describe("parseConcludeFromTrace", () => {
  test("supervisor success → pass", async () => {
    const path = await writeTrace([
      envelopeAssistant("supervisor", [concludeBlock("success", "all good")]),
    ]);
    const parsed = await parseConcludeFromTrace(path, RT);
    assert.deepStrictEqual(parsed, { verdict: "pass", summary: "all good" });
  });

  test("no Conclude → null", async () => {
    const path = await writeTrace([
      envelopeAssistant("supervisor", [
        { type: "text", text: "I think the agent did fine." },
      ]),
    ]);
    const parsed = await parseConcludeFromTrace(path, RT);
    assert.strictEqual(parsed, null);
  });

  test("two Conclude calls — last one wins", async () => {
    const path = await writeTrace([
      envelopeAssistant("supervisor", [concludeBlock("success", "first")]),
      envelopeAssistant("supervisor", [concludeBlock("failure", "second")]),
    ]);
    const parsed = await parseConcludeFromTrace(path, RT);
    assert.deepStrictEqual(parsed, { verdict: "fail", summary: "second" });
  });

  test("agent-source Conclude is ignored (only supervisor counts)", async () => {
    const path = await writeTrace([
      envelopeAssistant("agent", [concludeBlock("success", "agent lies")]),
    ]);
    const parsed = await parseConcludeFromTrace(path, RT);
    assert.strictEqual(parsed, null);
  });

  test("accepts mcp__orchestration__Conclude (the SDK's namespaced form)", async () => {
    // Live judge traces from the Claude Agent SDK report MCP-server tools
    // under their namespaced name. The orchestration `Conclude` tool
    // arrives as `mcp__orchestration__Conclude`.
    const path = await writeTrace([
      envelopeAssistant("supervisor", [
        {
          type: "tool_use",
          name: "mcp__orchestration__Conclude",
          input: { verdict: "success", summary: "ns ok" },
        },
      ]),
    ]);
    const parsed = await parseConcludeFromTrace(path, RT);
    assert.deepStrictEqual(parsed, { verdict: "pass", summary: "ns ok" });
  });
});
