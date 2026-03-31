import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { TeeWriter, createTeeWriter } from "@forwardimpact/libeval";

/**
 * Collect all data written to a PassThrough stream as a string.
 * @param {PassThrough} stream
 * @returns {string}
 */
function collect(stream) {
  const data = stream.read();
  return data ? data.toString() : "";
}

/**
 * Write lines to a TeeWriter and wait for it to finish.
 * @param {TeeWriter} writer
 * @param {string[]} lines - JSON lines to write
 */
async function writeLines(writer, lines) {
  for (const line of lines) {
    writer.write(line + "\n");
  }
  await new Promise((resolve) => writer.end(resolve));
}

describe("TeeWriter", () => {
  test("constructor throws on missing fileStream", () => {
    assert.throws(
      () => new TeeWriter({ textStream: new PassThrough() }),
      /fileStream is required/,
    );
  });

  test("constructor throws on missing textStream", () => {
    assert.throws(
      () => new TeeWriter({ fileStream: new PassThrough() }),
      /textStream is required/,
    );
  });

  test("writes NDJSON to fileStream and text to textStream in raw mode", async () => {
    const fileStream = new PassThrough();
    const textStream = new PassThrough();
    const writer = new TeeWriter({ fileStream, textStream, mode: "raw" });

    const events = [
      JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: "s1",
        model: "opus",
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "Hello world" }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "Bash",
              input: { command: "ls" },
            },
          ],
          usage: { input_tokens: 20, output_tokens: 10 },
        },
      }),
      JSON.stringify({
        type: "result",
        subtype: "success",
        duration_ms: 5000,
        num_turns: 2,
        total_cost_usd: 0.05,
        usage: { input_tokens: 30, output_tokens: 15 },
      }),
    ];

    await writeLines(writer, events);

    const fileData = collect(fileStream);
    const textData = collect(textStream);

    // File should contain all NDJSON lines
    const fileLines = fileData.trim().split("\n");
    assert.strictEqual(fileLines.length, 4);
    assert.deepStrictEqual(JSON.parse(fileLines[0]).type, "system");
    assert.deepStrictEqual(JSON.parse(fileLines[3]).type, "result");

    // Text should contain human-readable output
    assert.ok(textData.includes("Hello world"));
    assert.ok(textData.includes("> Tool: Bash"));
    assert.ok(textData.includes("--- Result: success"));
  });

  test("streams text incrementally as events arrive", async () => {
    const fileStream = new PassThrough();
    const textStream = new PassThrough();
    const writer = new TeeWriter({ fileStream, textStream, mode: "raw" });

    // Write first assistant message
    writer.write(
      JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "First message" }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      }) + "\n",
    );

    // Text should be available before stream ends
    const firstText = collect(textStream);
    assert.ok(firstText.includes("First message"));

    writer.write(
      JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "Second message" }],
          usage: { input_tokens: 20, output_tokens: 10 },
        },
      }) + "\n",
    );

    const secondText = collect(textStream);
    assert.ok(secondText.includes("Second message"));

    await new Promise((resolve) => writer.end(resolve));
  });

  test("supervised mode shows source labels and unwraps events", async () => {
    const fileStream = new PassThrough();
    const textStream = new PassThrough();
    const writer = new TeeWriter({
      fileStream,
      textStream,
      mode: "supervised",
    });

    const events = [
      JSON.stringify({
        source: "agent",
        turn: 0,
        event: {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Working on it" }],
            usage: { input_tokens: 10, output_tokens: 5 },
          },
        },
      }),
      JSON.stringify({
        source: "supervisor",
        turn: 1,
        event: {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Looks good" }],
            usage: { input_tokens: 20, output_tokens: 10 },
          },
        },
      }),
      JSON.stringify({
        source: "orchestrator",
        type: "summary",
        success: true,
        turns: 1,
      }),
    ];

    await writeLines(writer, events);

    const fileData = collect(fileStream);
    const textData = collect(textStream);

    // File should contain all raw tagged NDJSON
    const fileLines = fileData.trim().split("\n");
    assert.strictEqual(fileLines.length, 3);
    assert.strictEqual(JSON.parse(fileLines[0]).source, "agent");

    // Text should show source labels
    assert.ok(textData.includes("[agent]"));
    assert.ok(textData.includes("Working on it"));
    assert.ok(textData.includes("[supervisor]"));
    assert.ok(textData.includes("Looks good"));
    assert.ok(textData.includes("Evaluation completed after 1 turns"));
  });

  test("supervised mode shows incomplete status on failure", async () => {
    const fileStream = new PassThrough();
    const textStream = new PassThrough();
    const writer = new TeeWriter({
      fileStream,
      textStream,
      mode: "supervised",
    });

    await writeLines(writer, [
      JSON.stringify({
        source: "orchestrator",
        type: "summary",
        success: false,
        turns: 5,
      }),
    ]);

    const textData = collect(textStream);
    assert.ok(textData.includes("Evaluation incomplete after 5 turns"));
  });

  test("supervised mode only shows source label on change", async () => {
    const fileStream = new PassThrough();
    const textStream = new PassThrough();
    const writer = new TeeWriter({
      fileStream,
      textStream,
      mode: "supervised",
    });

    const events = [
      JSON.stringify({
        source: "agent",
        turn: 0,
        event: {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Step 1" }],
            usage: { input_tokens: 10, output_tokens: 5 },
          },
        },
      }),
      JSON.stringify({
        source: "agent",
        turn: 0,
        event: {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Step 2" }],
            usage: { input_tokens: 10, output_tokens: 5 },
          },
        },
      }),
    ];

    await writeLines(writer, events);

    const textData = collect(textStream);
    // [agent] label should appear only once
    const agentLabels = textData.split("[agent]").length - 1;
    assert.strictEqual(agentLabels, 1);
  });

  test("handles partial lines across chunks", async () => {
    const fileStream = new PassThrough();
    const textStream = new PassThrough();
    const writer = new TeeWriter({ fileStream, textStream, mode: "raw" });

    const fullLine = JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "text", text: "Split message" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    });

    // Split the line across two chunks
    const mid = Math.floor(fullLine.length / 2);
    writer.write(fullLine.slice(0, mid));
    writer.write(fullLine.slice(mid) + "\n");
    await new Promise((resolve) => writer.end(resolve));

    const textData = collect(textStream);
    assert.ok(textData.includes("Split message"));
  });

  test("truncates long tool input", async () => {
    const fileStream = new PassThrough();
    const textStream = new PassThrough();
    const writer = new TeeWriter({ fileStream, textStream, mode: "raw" });

    const longInput = { command: "x".repeat(300) };
    const event = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", id: "t1", name: "Bash", input: longInput },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    });

    await writeLines(writer, [event]);

    const textData = collect(textStream);
    assert.ok(textData.includes("> Tool: Bash"));
    assert.ok(textData.includes("..."));
    // Truncated to ~200 chars
    const toolLine = textData
      .split("\n")
      .find((l) => l.startsWith("> Tool:"));
    assert.ok(toolLine.length < 250);
  });

  test("defaults to raw mode", () => {
    const writer = new TeeWriter({
      fileStream: new PassThrough(),
      textStream: new PassThrough(),
    });
    assert.strictEqual(writer.mode, "raw");
  });

  test("createTeeWriter factory returns a TeeWriter instance", () => {
    const writer = createTeeWriter({
      fileStream: new PassThrough(),
      textStream: new PassThrough(),
    });
    assert.ok(writer instanceof TeeWriter);
  });
});
