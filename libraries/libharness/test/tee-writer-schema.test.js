/**
 * TeeWriter tests for the v1.1 schema expansion. The writer must render
 * system and user roles the same way as `TraceCollector.toText()`. The live
 * stream then equals the offline replay.
 */
import { describe, test } from "node:test";
import assert from "node:assert";
import { PassThrough } from "node:stream";

import { TeeWriter } from "@forwardimpact/libharness";
import {
  collectStream as collect,
  stripAnsi,
  writeLines,
} from "@forwardimpact/libmock";

describe("TeeWriter output for the v1.1 schema", () => {
  test("renders system turns with the subtype label", async () => {
    const fileStream = new PassThrough();
    const textStream = new PassThrough();
    const writer = new TeeWriter({ fileStream, textStream, mode: "raw" });

    await writeLines(writer, [
      JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: "sess-1",
        model: "claude-opus-4-6",
        tools: ["Bash"],
      }),
      JSON.stringify({
        type: "system",
        subtype: "hook",
        hook_name: "pre-tool",
      }),
    ]);

    const text = stripAnsi(collect(textStream));
    assert.ok(text.includes("[init]"), `expected [init] in ${text}`);
    assert.ok(text.includes("[hook]"), `expected [hook] in ${text}`);
  });

  test("renders user text turns with the [user] prefix", async () => {
    const fileStream = new PassThrough();
    const textStream = new PassThrough();
    const writer = new TeeWriter({ fileStream, textStream, mode: "raw" });

    await writeLines(writer, [
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: [{ type: "text", text: "Analyse this run." }],
        },
      }),
    ]);

    const text = stripAnsi(collect(textStream));
    assert.ok(
      text.includes("[user] Analyse this run."),
      `expected user prefix in ${text}`,
    );
  });

  test("supervised mode keeps the source prefix on system/user lines", async () => {
    const fileStream = new PassThrough();
    const textStream = new PassThrough();
    const writer = new TeeWriter({
      fileStream,
      textStream,
      mode: "supervised",
    });

    await writeLines(writer, [
      JSON.stringify({
        source: "agent",
        seq: 0,
        event: {
          type: "system",
          subtype: "init",
          session_id: "sess-sup",
          model: "claude-opus-4-6",
          tools: ["Bash"],
        },
      }),
      JSON.stringify({
        source: "agent",
        seq: 1,
        event: {
          type: "user",
          message: {
            role: "user",
            content: [{ type: "text", text: "Go." }],
          },
        },
      }),
    ]);

    const text = stripAnsi(collect(textStream));
    assert.ok(text.includes("agent: [init]"), `missing source init: ${text}`);
    assert.ok(
      text.includes("agent: [user] Go."),
      `missing source user: ${text}`,
    );
  });
});
