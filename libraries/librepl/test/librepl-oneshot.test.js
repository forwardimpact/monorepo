/**
 * One-shot input contract: one line of input produces exactly one
 * onLine call whether it arrives as positional argv or piped stdin,
 * flags win over positionals, and positionals are always prompt text —
 * never commands.
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { createReplEnvironment } from "@forwardimpact/libmock";

import { Repl } from "../src/index.js";

describe("librepl one-shot input", () => {
  let mockReadline, mockProcess, mockFormatter, mockOs;
  let onLineCalls, outputData;

  beforeEach(() => {
    ({
      readline: mockReadline,
      process: mockProcess,
      os: mockOs,
      formatter: mockFormatter,
    } = createReplEnvironment());
    onLineCalls = [];
    outputData = "";
    mockProcess.stdout.write = (text) => {
      outputData += text;
    };
  });

  function buildRepl(app = {}) {
    return new Repl(
      {
        prompt: "> ",
        onLine: async (input) => {
          onLineCalls.push(input);
        },
        ...app,
      },
      mockFormatter,
      mockReadline,
      mockProcess,
      mockOs,
    );
  }

  function pipeStdin(line) {
    mockProcess.stdin = {
      isTTY: false,
      setEncoding: () => {},
      async *[Symbol.asyncIterator]() {
        yield line;
      },
    };
  }

  test("positional argv produces one onLine call, echoes the prompt, exits 0", async () => {
    mockProcess.argv = ["node", "script.js", "hello", "world"];

    await buildRepl().start();

    assert.deepStrictEqual(onLineCalls, ["hello world"]);
    assert(outputData.includes("> hello world"));
    assert.strictEqual(mockProcess._exitCalled, true);
    assert.strictEqual(mockProcess._exitCode, 0);
  });

  test("positional argv and piped stdin deliver the identical single line", async () => {
    mockProcess.argv = ["node", "script.js", "hello", "world"];
    await buildRepl().start();
    const argvCalls = [...onLineCalls];

    onLineCalls = [];
    mockProcess.argv = ["node", "script.js"];
    pipeStdin("hello world\n");
    await buildRepl().start();

    assert.deepStrictEqual(argvCalls, ["hello world"]);
    assert.deepStrictEqual(onLineCalls, argvCalls);
  });

  test("a flag handler returning false exits before any positional prompt", async () => {
    mockProcess.argv = ["node", "script.js", "--status", "hello"];

    await buildRepl({
      commands: {
        status: {
          usage: "Report status",
          type: "boolean",
          handler: async () => false,
        },
      },
    }).start();

    assert.deepStrictEqual(onLineCalls, []);
  });

  test("args consumed as flag values are not prompt text", async () => {
    mockProcess.argv = ["node", "script.js", "--set-var", "value", "hello"];

    await buildRepl({
      state: { var: null },
      commands: {
        set_var: {
          usage: "Set var",
          handler: async ([value], state) => {
            state.var = value;
          },
        },
      },
    }).start();

    assert.deepStrictEqual(onLineCalls, ["hello"]);
  });

  test("positional words are prompt text even when they match a command name", async () => {
    let statusRuns = 0;
    mockProcess.argv = ["node", "script.js", "status"];

    await buildRepl({
      commands: {
        status: {
          usage: "Report status",
          type: "boolean",
          handler: async () => {
            statusRuns++;
            return false;
          },
        },
      },
    }).start();

    assert.strictEqual(statusRuns, 0);
    assert.deepStrictEqual(onLineCalls, ["status"]);
  });
});
