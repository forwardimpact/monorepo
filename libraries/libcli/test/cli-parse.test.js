import { test, describe } from "node:test";
import assert from "node:assert";

import { Cli } from "../src/cli.js";
import { HelpRenderer } from "../src/help.js";
import { assertThrowsMessage } from "@forwardimpact/libmock";
import { createProc, createCli } from "./cli-helpers.js";

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
});
