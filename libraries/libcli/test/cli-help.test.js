import { test, describe } from "node:test";
import assert from "node:assert";

import { Cli } from "../src/cli.js";
import { HelpRenderer } from "../src/help.js";
import { createProc, createCli } from "./cli-helpers.js";

describe("Cli", () => {
  describe("showHelp", () => {
    test("writes help to stdout without re-parsing", () => {
      const proc = createProc();
      const cli = createCli(proc);
      cli.showHelp();
      assert.ok(proc.stdout.output.includes("fit-test"));
      assert.ok(proc.stdout.output.includes("Test CLI"));
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
});
