import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { TeeWriter, createTeeWriter } from "@forwardimpact/libeval";
import {
  collectStream as collect,
  stripAnsi,
  writeLines,
} from "@forwardimpact/libmock";

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
        source: "agent",
        seq: 0,
        event: {
          type: "system",
          subtype: "init",
          session_id: "s1",
          model: "opus",
        },
      }),
      JSON.stringify({
        source: "agent",
        seq: 1,
        event: {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Hello world" }],
            usage: { input_tokens: 10, output_tokens: 5 },
          },
        },
      }),
      JSON.stringify({
        source: "agent",
        seq: 2,
        event: {
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
        },
      }),
      JSON.stringify({
        source: "agent",
        seq: 3,
        event: {
          type: "result",
          subtype: "success",
          duration_ms: 5000,
          num_turns: 2,
          total_cost_usd: 0.05,
          usage: { input_tokens: 30, output_tokens: 15 },
        },
      }),
    ];

    await writeLines(writer, events);

    const fileData = collect(fileStream);
    const textData = collect(textStream);

    const fileLines = fileData.trim().split("\n");
    assert.strictEqual(fileLines.length, 4);

    // New shape: `<Tool>: <hint>` only, no JSON punctuation.
    const plain = stripAnsi(textData);
    assert.ok(plain.includes("Hello world"));
    assert.ok(plain.includes("Bash: ls"));
    assert.ok(!plain.includes('"command"'));
    assert.ok(!plain.includes("{"));
  });

  test("streams text incrementally as events arrive", async () => {
    const fileStream = new PassThrough();
    const textStream = new PassThrough();
    const writer = new TeeWriter({ fileStream, textStream, mode: "raw" });

    writer.write(
      JSON.stringify({
        source: "agent",
        seq: 0,
        event: {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "First message" }],
            usage: { input_tokens: 10, output_tokens: 5 },
          },
        },
      }) + "\n",
    );

    const firstText = collect(textStream);
    assert.ok(stripAnsi(firstText).includes("First message"));

    writer.write(
      JSON.stringify({
        source: "agent",
        seq: 1,
        event: {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Second message" }],
            usage: { input_tokens: 20, output_tokens: 10 },
          },
        },
      }) + "\n",
    );

    const secondText = collect(textStream);
    assert.ok(stripAnsi(secondText).includes("Second message"));

    await new Promise((resolve) => writer.end(resolve));
  });

  test("supervised mode shows source labels and colors", async () => {
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
        seq: 0,
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
        seq: 1,
        event: {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Looks good" }],
            usage: { input_tokens: 20, output_tokens: 10 },
          },
        },
      }),
    ];

    await writeLines(writer, events);

    const fileData = collect(fileStream);
    const textData = collect(textStream);

    const fileLines = fileData.trim().split("\n");
    assert.strictEqual(fileLines.length, 2);
    assert.strictEqual(JSON.parse(fileLines[0]).source, "agent");

    const plain = stripAnsi(textData);
    assert.ok(plain.includes("agent: Working on it"));
    assert.ok(plain.includes("supervisor: Looks good"));
    // Color bytes present — the raw textData has ESC sequences.
    assert.ok(textData.includes("\u001b["), "expected ANSI escapes");
  });

  test("orchestrator summary verdict reaches the result footer", async () => {
    const fileStream = new PassThrough();
    const textStream = new PassThrough();
    const writer = new TeeWriter({
      fileStream,
      textStream,
      mode: "supervised",
    });

    const events = [
      // SDK reports its per-runner subtype="success" (the runner exited
      // cleanly), but the supervisor's verdict is "failure".
      JSON.stringify({
        source: "supervisor",
        seq: 1,
        event: {
          type: "result",
          subtype: "success",
          duration_ms: 5000,
          num_turns: 2,
          total_cost_usd: 0.05,
        },
      }),
      JSON.stringify({
        source: "orchestrator",
        seq: 2,
        event: {
          type: "summary",
          success: false,
          verdict: "failure",
          turns: 2,
          summary: "Agent ignored MCP tools.",
        },
      }),
    ];

    await writeLines(writer, events);
    const textData = collect(textStream);

    assert.ok(stripAnsi(textData).includes("--- Result: failure"));
    assert.ok(!textData.includes("--- Result: success"));
  });

  test("suppresses the six orchestrator lifecycle events from textStream", async () => {
    const fileStream = new PassThrough();
    const textStream = new PassThrough();
    const writer = new TeeWriter({
      fileStream,
      textStream,
      mode: "supervised",
    });

    const suppressed = ["session_start", "agent_start", "summary", "meta"];
    const events = suppressed.map((type, i) =>
      JSON.stringify({
        source: "orchestrator",
        seq: i,
        event: { type, success: true, turns: 1 },
      }),
    );

    await writeLines(writer, events);

    const fileData = collect(fileStream);
    const textData = collect(textStream);

    // Every suppressed event stays in the fileStream — the NDJSON
    // artifact is unchanged.
    assert.strictEqual(fileData.trim().split("\n").length, suppressed.length);

    // None of them render to textStream, and the old footer is gone.
    assert.strictEqual(stripAnsi(textData).trim(), "");
    assert.ok(!textData.includes("--- Evaluation"));
  });

  test("retains the source: prefix even with color bytes", async () => {
    const fileStream = new PassThrough();
    const textStream = new PassThrough();
    const writer = new TeeWriter({
      fileStream,
      textStream,
      mode: "supervised",
    });

    const events = [
      JSON.stringify({
        source: "staff-engineer",
        seq: 0,
        event: {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "hi" }],
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        },
      }),
    ];

    await writeLines(writer, events);

    const textData = collect(textStream);
    // Prefix sits OUTSIDE the color escape so grep/color-stripped views
    // still see it.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI SGR detection is the assertion.
    assert.match(textData, /^staff-engineer: \u001b\[/);
  });

  test("suppresses success Result lines, renders Error lines in red", async () => {
    const fileStream = new PassThrough();
    const textStream = new PassThrough();
    const writer = new TeeWriter({
      fileStream,
      textStream,
      mode: "supervised",
    });

    const events = [
      // Successful Bash call
      JSON.stringify({
        source: "staff-engineer",
        seq: 0,
        event: {
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "Bash",
                input: { command: "pwd" },
              },
            ],
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        },
      }),
      JSON.stringify({
        source: "staff-engineer",
        seq: 1,
        event: {
          type: "user",
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "t1",
                content: "/home/user",
              },
            ],
          },
        },
      }),
      // Failed Read call
      JSON.stringify({
        source: "staff-engineer",
        seq: 2,
        event: {
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "t2",
                name: "Read",
                input: { file_path: "/nope" },
              },
            ],
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        },
      }),
      JSON.stringify({
        source: "staff-engineer",
        seq: 3,
        event: {
          type: "user",
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "t2",
                is_error: true,
                content: "ENOENT: no such file",
              },
            ],
          },
        },
      }),
    ];

    await writeLines(writer, events);

    const textData = collect(textStream);
    const plain = stripAnsi(textData);

    assert.ok(plain.includes("Bash: pwd"));
    assert.ok(plain.includes("Read: /nope"));
    assert.ok(plain.includes("Error: ENOENT: no such file"));

    // No per-tool-call success preview line: nothing should start with
    // `Result:` (the trailing `--- Result: <verdict> ---` footer has a
    // distinct shape and is filtered out below).
    const previewLines = plain
      .split("\n")
      .filter(
        (l) =>
          (l.startsWith("Result:") || l.includes(": Result:")) &&
          !l.startsWith("---"),
      );
    assert.deepStrictEqual(previewLines, []);

    // The error preview line carries the reserved red escape.
    const errorLine = textData
      .split("\n")
      .find((l) => l.includes("Error: ENOENT"));
    assert.ok(errorLine, "error preview line should be present");
    assert.ok(
      errorLine.includes("\u001b[38;2;241;76;76m"),
      "error line should carry the reserved red escape",
    );
  });

  test("MCP tool calls render the full input as single-line JSON", async () => {
    const fileStream = new PassThrough();
    const textStream = new PassThrough();
    const writer = new TeeWriter({ fileStream, textStream, mode: "raw" });

    const ghInput = {
      owner: "forwardimpact",
      repo: "monorepo",
      issue_number: 1,
      body: "hello",
    };
    const askInput = { to: "alice", from: "bob", message: "hi" };

    const events = [
      JSON.stringify({
        source: "agent",
        seq: 0,
        event: {
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "mcp__github__add_issue_comment",
                input: ghInput,
              },
            ],
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        },
      }),
      JSON.stringify({
        source: "agent",
        seq: 1,
        event: {
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                id: "t2",
                name: "mcp__orchestration__Ask",
                input: askInput,
              },
            ],
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        },
      }),
    ];

    await writeLines(writer, events);

    const plain = stripAnsi(collect(textStream));
    assert.ok(
      plain.includes(`add_issue_comment: ${JSON.stringify(ghInput)}`),
      `expected full JSON for github tool, got:\n${plain}`,
    );
    assert.ok(
      plain.includes(`Ask: ${JSON.stringify(askInput)}`),
      `expected full JSON for orchestration tool, got:\n${plain}`,
    );
  });

  test("handles partial lines across chunks", async () => {
    const fileStream = new PassThrough();
    const textStream = new PassThrough();
    const writer = new TeeWriter({ fileStream, textStream, mode: "raw" });

    const fullLine = JSON.stringify({
      source: "agent",
      seq: 0,
      event: {
        type: "assistant",
        message: {
          content: [{ type: "text", text: "Split message" }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      },
    });

    const mid = Math.floor(fullLine.length / 2);
    writer.write(fullLine.slice(0, mid));
    writer.write(fullLine.slice(mid) + "\n");
    await new Promise((resolve) => writer.end(resolve));

    const textData = collect(textStream);
    assert.ok(stripAnsi(textData).includes("Split message"));
  });

  test('no tool-call line contains { or " from the input object', async () => {
    const fileStream = new PassThrough();
    const textStream = new PassThrough();
    const writer = new TeeWriter({ fileStream, textStream, mode: "raw" });

    const event = JSON.stringify({
      source: "agent",
      seq: 0,
      event: {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "Bash",
              input: { command: 'echo "hello {world}"' },
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
    });

    await writeLines(writer, [event]);

    const textData = collect(textStream);
    const plain = stripAnsi(textData);
    const toolLine = plain.split("\n").find((l) => l.startsWith("Bash:"));
    assert.ok(toolLine);
    assert.ok(!toolLine.includes("{"));
    assert.ok(!toolLine.includes("}"));
    assert.ok(!toolLine.includes('"'));
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
