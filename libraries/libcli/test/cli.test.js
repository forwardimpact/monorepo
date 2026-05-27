import { test, describe } from "node:test";
import assert from "node:assert";

import { Cli } from "../src/cli.js";
import { HelpRenderer } from "../src/help.js";
import { assertThrowsMessage } from "@forwardimpact/libmock";

function createProc() {
  return {
    env: {},
    stdout: {
      isTTY: false,
      output: "",
      write(data) {
        this.output += data;
      },
    },
    stderr: {
      output: "",
      write(data) {
        this.output += data;
      },
    },
    exitCode: 0,
  };
}

const definition = {
  name: "fit-test",
  version: "1.0.0",
  description: "Test CLI",
  globalOptions: {
    output: { type: "string", description: "Output path" },
    json: { type: "boolean", description: "JSON output" },
    help: { type: "boolean", short: "h", description: "Show help" },
    version: { type: "boolean", description: "Show version" },
  },
};

function createCli(proc) {
  const helpRenderer = new HelpRenderer({ process: proc });
  return new Cli(definition, { process: proc, helpRenderer });
}

describe("Cli", () => {
  describe("parse", () => {
    test("returns values and positionals for normal input", () => {
      const proc = createProc();
      const cli = createCli(proc);
      const result = cli.parse(["run", "--output=out.txt"]);
      assert.deepStrictEqual(result.positionals, ["run"]);
      assert.strictEqual(result.values.output, "out.txt");
    });

    test("returns null and writes help when --help is passed", () => {
      const proc = createProc();
      const cli = createCli(proc);
      const result = cli.parse(["--help"]);
      assert.strictEqual(result, null);
      assert.ok(proc.stdout.output.includes("fit-test"));
      assert.ok(proc.stdout.output.includes("Test CLI"));
    });

    test("returns null and writes JSON when --help --json is passed", () => {
      const proc = createProc();
      const cli = createCli(proc);
      const result = cli.parse(["--help", "--json"]);
      assert.strictEqual(result, null);
      const parsed = JSON.parse(proc.stdout.output);
      assert.strictEqual(parsed.name, "fit-test");
    });

    test("returns null and writes version when --version is passed", () => {
      const proc = createProc();
      const cli = createCli(proc);
      const result = cli.parse(["--version"]);
      assert.strictEqual(result, null);
      assert.strictEqual(proc.stdout.output.trim(), "1.0.0");
    });

    test("throws on unknown flags", () => {
      const proc = createProc();
      const cli = createCli(proc);
      assert.throws(() => cli.parse(["--unknown"]), {
        code: "ERR_PARSE_ARGS_UNKNOWN_OPTION",
      });
    });
  });

  describe("showHelp", () => {
    test("writes help to stdout without re-parsing", () => {
      const proc = createProc();
      const cli = createCli(proc);
      cli.showHelp();
      assert.ok(proc.stdout.output.includes("fit-test"));
      assert.ok(proc.stdout.output.includes("Test CLI"));
    });
  });

  describe("parse with multiple option", () => {
    test("collects repeated flags into an array", () => {
      const proc = createProc();
      const multiDef = {
        name: "fit-multi",
        globalOptions: {
          tag: { type: "string", multiple: true, description: "Tags" },
          help: { type: "boolean", short: "h", description: "Show help" },
        },
      };
      const helpRenderer = new HelpRenderer({ process: proc });
      const cli = new Cli(multiDef, { process: proc, helpRenderer });
      const result = cli.parse(["--tag=a", "--tag=b"]);
      assert.deepStrictEqual(result.values.tag, ["a", "b"]);
    });
  });

  describe("legacy schema rejection", () => {
    test("throws on definition with legacy options field", () => {
      const proc = createProc();
      assertThrowsMessage(
        () =>
          new Cli(
            { name: "old", options: { help: { type: "boolean" } } },
            {
              process: proc,
              helpRenderer: new HelpRenderer({ process: proc }),
            },
          ),
        /globalOptions/,
      );
    });
  });

  describe("per-command help", () => {
    test("renders per-command help when command --help is passed", () => {
      const proc = createProc();
      const def = {
        name: "fit-test",
        commands: [
          {
            name: "run",
            args: "<file>",
            description: "Run a file",
            options: {
              watch: { type: "boolean", description: "Watch mode" },
            },
            examples: ["fit-test run main.js --watch"],
          },
        ],
        globalOptions: {
          help: { type: "boolean", short: "h", description: "Show help" },
        },
      };
      const helpRenderer = new HelpRenderer({ process: proc });
      const cli = new Cli(def, { process: proc, helpRenderer });
      const result = cli.parse(["run", "--help"]);
      assert.strictEqual(result, null);
      assert.ok(proc.stdout.output.includes("fit-test run <file>"));
      assert.ok(proc.stdout.output.includes("--watch"));
      assert.ok(proc.stdout.output.includes("Global options:"));
    });

    test("renders per-command JSON when command --help --json is passed", () => {
      const proc = createProc();
      const def = {
        name: "fit-test",
        commands: [
          {
            name: "run",
            args: "<file>",
            description: "Run a file",
            options: {
              watch: { type: "boolean", description: "Watch mode" },
            },
          },
        ],
        globalOptions: {
          json: { type: "boolean", description: "JSON output" },
          help: { type: "boolean", short: "h", description: "Show help" },
        },
      };
      const helpRenderer = new HelpRenderer({ process: proc });
      const cli = new Cli(def, { process: proc, helpRenderer });
      const result = cli.parse(["run", "--help", "--json"]);
      assert.strictEqual(result, null);
      const parsed = JSON.parse(proc.stdout.output);
      assert.strictEqual(parsed.name, "run");
      assert.strictEqual(parsed.parent, "fit-test");
      assert.ok(parsed.options.watch);
    });
  });

  describe("command-specific option scoping", () => {
    test("throws on command-specific option used with wrong command", () => {
      const proc = createProc();
      const def = {
        name: "fit-test",
        commands: [
          {
            name: "run",
            options: {
              watch: { type: "boolean", description: "W" },
            },
          },
          { name: "check" },
        ],
        globalOptions: {
          help: { type: "boolean", short: "h", description: "Show help" },
        },
      };
      const helpRenderer = new HelpRenderer({ process: proc });
      const cli = new Cli(def, { process: proc, helpRenderer });
      assert.throws(() => cli.parse(["check", "--watch"]), {
        code: "ERR_PARSE_ARGS_UNKNOWN_OPTION",
      });
    });
  });

  describe("flag-to-command migration hint", () => {
    test("suggests command when unknown flag matches a command name", () => {
      const proc = createProc();
      const def = {
        name: "fit-outpost",
        commands: [
          { name: "daemon", description: "Run continuously" },
          { name: "wake", args: "<agent>", description: "Wake an agent" },
        ],
        globalOptions: {
          help: { type: "boolean", short: "h", description: "Show help" },
        },
      };
      const helpRenderer = new HelpRenderer({ process: proc });
      const cli = new Cli(def, { process: proc, helpRenderer });
      assert.throws(() => cli.parse(["--daemon"]), {
        message:
          'Unknown option "--daemon". "daemon" is a command, not an option. Usage: fit-outpost daemon',
      });
    });

    test("includes args in usage hint", () => {
      const proc = createProc();
      const def = {
        name: "fit-outpost",
        commands: [
          { name: "wake", args: "<agent>", description: "Wake an agent" },
        ],
        globalOptions: {
          help: { type: "boolean", short: "h", description: "Show help" },
        },
      };
      const helpRenderer = new HelpRenderer({ process: proc });
      const cli = new Cli(def, { process: proc, helpRenderer });
      assert.throws(() => cli.parse(["--wake"]), {
        message:
          'Unknown option "--wake". "wake" is a command, not an option. Usage: fit-outpost wake <agent>',
      });
    });

    test("still throws original error for truly unknown flags", () => {
      const proc = createProc();
      const def = {
        name: "fit-test",
        commands: [{ name: "run", description: "Run" }],
        globalOptions: {
          help: { type: "boolean", short: "h", description: "Show help" },
        },
      };
      const helpRenderer = new HelpRenderer({ process: proc });
      const cli = new Cli(def, { process: proc, helpRenderer });
      assert.throws(() => cli.parse(["--bogus"]), {
        code: "ERR_PARSE_ARGS_UNKNOWN_OPTION",
      });
    });
  });

  describe("multi-word commands", () => {
    test("matches multi-word commands for per-command help", () => {
      const proc = createProc();
      const def = {
        name: "fit-test",
        commands: [{ name: "org show", description: "Show org" }],
        globalOptions: {
          help: { type: "boolean", short: "h", description: "Show help" },
        },
      };
      const helpRenderer = new HelpRenderer({ process: proc });
      const cli = new Cli(def, { process: proc, helpRenderer });
      const result = cli.parse(["org", "show", "--help"]);
      assert.strictEqual(result, null);
      assert.ok(proc.stdout.output.includes("fit-test org show"));
    });
  });

  describe("option name collision", () => {
    test("throws on command option colliding with global option", () => {
      const proc = createProc();
      assertThrowsMessage(
        () =>
          new Cli(
            {
              name: "t",
              commands: [
                {
                  name: "a",
                  options: {
                    data: { type: "string", description: "X" },
                  },
                },
              ],
              globalOptions: {
                data: { type: "string", description: "Y" },
              },
            },
            {
              process: proc,
              helpRenderer: new HelpRenderer({ process: proc }),
            },
          ),
        /collides/,
      );
    });
  });

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
});
