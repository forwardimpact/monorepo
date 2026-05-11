import { describe, test } from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConcludeFromTrace } from "../src/benchmark/judge.js";

function writeNdjson(lines) {
  const path = join(
    mkdtempSync(join(tmpdir(), "judge-trace-")),
    "trace.ndjson",
  );
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return path;
}

function concludeEnvelope(verdict, summary) {
  return {
    source: "supervisor",
    seq: 7,
    event: {
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            id: "tu-1",
            name: "Conclude",
            input: { verdict, summary },
          },
        ],
      },
    },
  };
}

describe("parseConcludeFromTrace", () => {
  test("returns pass for a supervisor Conclude(success)", async () => {
    const path = writeNdjson([concludeEnvelope("success", "looks good")]);
    const r = await parseConcludeFromTrace(path);
    assert.deepStrictEqual(r, { verdict: "pass", summary: "looks good" });
  });

  test("returns fail for a supervisor Conclude(failure)", async () => {
    const path = writeNdjson([concludeEnvelope("failure", "no good")]);
    const r = await parseConcludeFromTrace(path);
    assert.deepStrictEqual(r, { verdict: "fail", summary: "no good" });
  });

  test("returns null when no Conclude tool_use is found", async () => {
    const path = writeNdjson([
      {
        source: "supervisor",
        seq: 1,
        event: {
          type: "assistant",
          message: { content: [{ type: "text", text: "thinking…" }] },
        },
      },
    ]);
    const r = await parseConcludeFromTrace(path);
    assert.strictEqual(r, null);
  });

  test("last-Conclude-wins when two Conclude calls appear", async () => {
    const path = writeNdjson([
      concludeEnvelope("failure", "first call"),
      concludeEnvelope("success", "revised verdict"),
    ]);
    const r = await parseConcludeFromTrace(path);
    assert.deepStrictEqual(r, { verdict: "pass", summary: "revised verdict" });
  });

  test("ignores Conclude tool_use from non-supervisor source", async () => {
    const path = writeNdjson([
      {
        source: "agent",
        seq: 1,
        event: {
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "tu-1",
                name: "Conclude",
                input: { verdict: "success", summary: "agent fake" },
              },
            ],
          },
        },
      },
    ]);
    const r = await parseConcludeFromTrace(path);
    assert.strictEqual(r, null);
  });

  test("ignores invalid verdict values silently", async () => {
    const path = writeNdjson([concludeEnvelope("maybe", "bogus")]);
    const r = await parseConcludeFromTrace(path);
    assert.strictEqual(r, null);
  });

  test("tolerates malformed (non-JSON) lines", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "judge-")), "trace.ndjson");
    writeFileSync(
      path,
      `garbage\n${JSON.stringify(concludeEnvelope("success", "ok"))}\n`,
    );
    const r = await parseConcludeFromTrace(path);
    assert.deepStrictEqual(r, { verdict: "pass", summary: "ok" });
  });
});
