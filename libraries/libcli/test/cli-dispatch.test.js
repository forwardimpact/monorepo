import { test, describe } from "node:test";
import assert from "node:assert";

import { Cli, createCli as createRealCli } from "../src/cli.js";
import { HelpRenderer } from "../src/help.js";
import { createTestRuntime } from "@forwardimpact/libmock";
import { createProc, definition, createCli } from "./cli-helpers.js";

describe("Cli", () => {
  describe("error", () => {
    test("writes prefixed message to stderr and sets exitCode to 1", () => {
      const proc = createProc();
      const cli = createCli(proc);
      cli.error("something broke");
      assert.strictEqual(
        proc.stderr.output,
        "fit-test: error: something broke\n",
      );
      assert.strictEqual(proc.exitCode, 1);
    });
  });

  describe("usageError", () => {
    test("writes prefixed message to stderr and sets exitCode to 2", () => {
      const proc = createProc();
      const cli = createCli(proc);
      cli.usageError("bad argument");
      assert.strictEqual(proc.stderr.output, "fit-test: error: bad argument\n");
      assert.strictEqual(proc.exitCode, 2);
    });
  });

  describe("dispatch", () => {
    test("maps positional names to argv values and calls handler with frozen ctx", () => {
      const proc = createProc();
      const received = [];
      const def = {
        name: "fit-test",
        commands: [
          {
            name: "skill",
            args: ["id"],
            argsUsage: "[<id>]",
            description: "Show skill",
            handler: (ctx) => received.push(ctx),
          },
        ],
        globalOptions: {
          json: { type: "boolean", description: "JSON output" },
          help: { type: "boolean", short: "h", description: "Show help" },
        },
      };
      const helpRenderer = new HelpRenderer({ process: proc });
      const cli = new Cli(def, { process: proc, helpRenderer });
      const parsed = cli.parse(["skill", "testing", "--json"]);
      cli.dispatch(parsed, { data: { skills: [] } });

      assert.strictEqual(received.length, 1);
      const ctx = received[0];
      assert.strictEqual(ctx.args.id, "testing");
      assert.strictEqual(ctx.options.json, true);
      assert.strictEqual(Object.isFrozen(ctx), true);
      assert.strictEqual(Object.isFrozen(ctx.args), true);
    });

    test("omits missing trailing positionals from args", () => {
      const proc = createProc();
      const received = [];
      const def = {
        name: "fit-test",
        commands: [
          {
            name: "skill",
            args: ["id", "format"],
            argsUsage: "[<id>] [<format>]",
            description: "Show skill",
            handler: (ctx) => received.push(ctx),
          },
        ],
        globalOptions: {
          help: { type: "boolean", short: "h", description: "Show help" },
        },
      };
      const helpRenderer = new HelpRenderer({ process: proc });
      const cli = new Cli(def, { process: proc, helpRenderer });
      const parsed = cli.parse(["skill", "testing"]);
      cli.dispatch(parsed, { data: {} });

      assert.strictEqual(received[0].args.id, "testing");
      assert.strictEqual(received[0].args.format, undefined);
    });

    test("legacy string-shaped args still work with parse()", () => {
      const proc = createProc();
      const def = {
        name: "fit-test",
        commands: [
          {
            name: "run",
            args: "<file>",
            description: "Run a file",
          },
        ],
        globalOptions: {
          help: { type: "boolean", short: "h", description: "Show help" },
        },
      };
      const helpRenderer = new HelpRenderer({ process: proc });
      const cli = new Cli(def, { process: proc, helpRenderer });
      const result = cli.parse(["run", "main.js"]);
      assert.deepStrictEqual(result.positionals, ["run", "main.js"]);
    });

    test("throws when no matching subcommand", () => {
      const proc = createProc();
      const def = {
        name: "fit-test",
        commands: [
          {
            name: "skill",
            args: ["id"],
            handler: () => {},
          },
        ],
        globalOptions: {
          help: { type: "boolean", short: "h", description: "Show help" },
        },
      };
      const helpRenderer = new HelpRenderer({ process: proc });
      const cli = new Cli(def, { process: proc, helpRenderer });
      const parsed = cli.parse(["bogus"]);
      assert.throws(() => cli.dispatch(parsed, { data: {} }), {
        message: /no matching subcommand/,
      });
    });

    test("throws when command lacks handler", () => {
      const proc = createProc();
      const def = {
        name: "fit-test",
        commands: [
          {
            name: "skill",
            args: ["id"],
            description: "Show skill",
          },
        ],
        globalOptions: {
          help: { type: "boolean", short: "h", description: "Show help" },
        },
      };
      const helpRenderer = new HelpRenderer({ process: proc });
      const cli = new Cli(def, { process: proc, helpRenderer });
      const parsed = cli.parse(["skill", "testing"]);
      assert.throws(() => cli.dispatch(parsed, { data: {} }), {
        message: /lacks a handler/,
      });
    });
  });

  // The ctx.deps slot carries host-injected collaborators.
  describe("dispatch deps slot", () => {
    function depsDef(received) {
      return {
        name: "fit-test",
        commands: [
          {
            name: "skill",
            args: ["id"],
            handler: (ctx) => received.push(ctx),
          },
        ],
        globalOptions: {
          help: { type: "boolean", short: "h", description: "Show help" },
        },
      };
    }

    test("exposes both data and deps on the frozen context", () => {
      const proc = createProc();
      const received = [];
      const helpRenderer = new HelpRenderer({ process: proc });
      const cli = new Cli(depsDef(received), { process: proc, helpRenderer });
      const runtime = createTestRuntime();
      const parsed = cli.parse(["skill", "x"]);
      cli.dispatch(parsed, { data: { a: 1 }, deps: { runtime } });

      const ctx = received[0];
      assert.strictEqual(ctx.data.a, 1);
      assert.strictEqual(ctx.deps.runtime, runtime);
      assert.strictEqual(Object.isFrozen(ctx.deps), true);
    });

    test("works unchanged when only data is supplied (deps undefined)", () => {
      const proc = createProc();
      const received = [];
      const helpRenderer = new HelpRenderer({ process: proc });
      const cli = new Cli(depsDef(received), { process: proc, helpRenderer });
      const parsed = cli.parse(["skill", "x"]);
      cli.dispatch(parsed, { data: {} });

      assert.strictEqual(received[0].deps, undefined);
    });
  });

  // createCli(definition, { runtime }) routes process I/O through
  // the injected runtime.proc instead of the global process.
  describe("createCli runtime wiring", () => {
    test("error output routes through runtime.proc.stderr", () => {
      const runtime = createTestRuntime();
      const cli = createRealCli(definition, { runtime });
      cli.error("boom");
      assert.match(runtime.proc.stderr.chunks.join(""), /error: boom/);
      assert.strictEqual(runtime.proc.exitCode, 1);
    });

    test("usageError sets exit code 2 on runtime.proc", () => {
      const runtime = createTestRuntime();
      const cli = createRealCli(definition, { runtime });
      cli.usageError("bad usage");
      assert.match(runtime.proc.stderr.chunks.join(""), /error: bad usage/);
      assert.strictEqual(runtime.proc.exitCode, 2);
    });
  });
});
