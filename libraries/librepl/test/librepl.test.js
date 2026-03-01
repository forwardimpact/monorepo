import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";

import { createMockStorage } from "@forwardimpact/libharness";

// Module under test
import { Repl } from "../index.js";

describe("librepl", () => {
  describe("Repl", () => {
    let mockReadline, mockProcess, mockFormatter, mockOs, mockStorage;

    beforeEach(() => {
      // Mock readline
      const mockRlInterface = {
        on: () => {},
        prompt: () => {},
        close: () => {},
      };
      mockReadline = {
        createInterface: () => mockRlInterface,
      };

      // Mock process with proper exit handling
      mockProcess = {
        argv: ["node", "script.js"],
        stdin: {
          isTTY: true,
          setEncoding: () => {},
          async *[Symbol.asyncIterator]() {
            yield "test input";
            return; // This ensures the iterator completes
          },
        },
        stdout: { write: () => {} },
        stderr: { write: () => {} },
        exit: (code) => {
          // Don't actually exit in tests - just mark that exit was called
          mockProcess._exitCalled = true;
          mockProcess._exitCode = code;
        },
        _exitCalled: false,
        _exitCode: null,
      };

      // Mock formatter factory function
      mockFormatter = () => ({
        format: (text) => `formatted: ${text}`,
      });

      // Mock OS module
      mockOs = {
        userInfo: () => ({ uid: 1000 }),
      };

      // Mock storage interface
      mockStorage = createMockStorage();
    });

    test("creates repl with minimal app configuration", () => {
      const repl = new Repl(
        {},
        mockFormatter,
        mockReadline,
        mockProcess,
        mockOs,
      );
      assert(repl instanceof Repl);
    });

    test("creates repl with complete app configuration", () => {
      const app = {
        prompt: "test> ",
        onLine: async (input, state, output) => {
          output.write(`You said: ${input}`);
        },
        beforeLine: async () => {},
        afterLine: async () => {},
        setup: async () => {},
        commands: {
          test: async () => "Test executed",
        },
        help: "Custom help text",
        state: {
          testVar: "default",
        },
        storage: mockStorage,
      };

      const repl = new Repl(
        app,
        mockFormatter,
        mockReadline,
        mockProcess,
        mockOs,
      );
      assert(repl instanceof Repl);
      assert.strictEqual(repl.state.testVar, "default");
    });

    test("requires formatter dependency", () => {
      assert.throws(() => {
        new Repl({}, null, mockReadline, mockProcess, mockOs);
      }, /formatter dependency is required/);
    });

    test("handles command line argument parsing for state", async () => {
      mockProcess.argv = [
        "node",
        "script.js",
        "--testVar",
        "fromArgs",
        "--numVar",
        "42",
      ];

      const app = {
        state: {
          testVar: "default",
          numVar: 0,
        },
        commands: {
          testVar: {
            usage: "Set test variable",
            handler: (args, state) => {
              state.testVar = args[0];
            },
          },
          numVar: {
            usage: "Set number variable",
            handler: (args, state) => {
              state.numVar = parseInt(args[0]);
            },
          },
        },
      };

      const repl = new Repl(
        app,
        mockFormatter,
        mockReadline,
        mockProcess,
        mockOs,
      );

      // Arguments are parsed during start()
      await repl.start();

      assert.strictEqual(repl.state.testVar, "fromArgs");
      assert.strictEqual(repl.state.numVar, 42);
    });

    test("handles numeric command line arguments", async () => {
      mockProcess.argv = [
        "node",
        "script.js",
        "--intVal",
        "100",
        "--floatVal",
        "0.75",
      ];

      const app = {
        state: {
          intVal: 0,
          floatVal: 0.0,
        },
        commands: {
          intVal: {
            usage: "Set integer value",
            handler: (args, state) => {
              state.intVal = parseInt(args[0]);
            },
          },
          floatVal: {
            usage: "Set float value",
            handler: (args, state) => {
              state.floatVal = parseFloat(args[0]);
            },
          },
        },
      };

      const repl = new Repl(
        app,
        mockFormatter,
        mockReadline,
        mockProcess,
        mockOs,
      );

      // Arguments are parsed during start()
      await repl.start();

      assert.strictEqual(repl.state.intVal, 100);
      assert.strictEqual(repl.state.floatVal, 0.75);
    });

    test("initializes with storage interface", () => {
      const app = {
        storage: mockStorage,
        state: {
          testVar: "default",
        },
      };

      const repl = new Repl(
        app,
        mockFormatter,
        mockReadline,
        mockProcess,
        mockOs,
      );

      assert(repl instanceof Repl);
    });

    test("handles interactive mode initialization", () => {
      mockProcess.stdin.isTTY = true;

      const app = {
        prompt: "custom> ",
        onLine: async (input, state, output) => {
          output.write(`Response: ${input}`);
        },
      };

      const repl = new Repl(
        app,
        mockFormatter,
        mockReadline,
        mockProcess,
        mockOs,
      );

      // Just test that it can be created in interactive mode
      assert(repl instanceof Repl);
    });

    test("handles onLine with output stream", async () => {
      const app = {
        prompt: "stream> ",
        onLine: async (input, state, output) => {
          output.write(`Streamed: ${input}`);
        },
      };

      const repl = new Repl(
        app,
        mockFormatter,
        mockReadline,
        mockProcess,
        mockOs,
      );

      let outputData = "";
      mockProcess.stdout.write = (text) => {
        outputData += text;
      };

      // Override stdin to provide input
      mockProcess.stdin = {
        isTTY: false, // Non-interactive mode is easier to test
        setEncoding: () => {},
        async *[Symbol.asyncIterator]() {
          yield "test input\n";
        },
      };

      await repl.start();

      assert(outputData.includes("formatted: Streamed: test input"));
    });

    test("merges default app configuration with provided app", () => {
      const app = {
        prompt: "custom> ",
        commands: {
          custom: async () => "custom output",
        },
      };

      const repl = new Repl(
        app,
        mockFormatter,
        mockReadline,
        mockProcess,
        mockOs,
      );

      // Should have custom prompt but other defaults
      assert(repl instanceof Repl);
    });
  });
});
