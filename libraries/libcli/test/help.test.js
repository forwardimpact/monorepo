import { test, describe } from "node:test";
import assert from "node:assert";

import { HelpRenderer } from "../src/help.js";

function createStream() {
  return {
    output: "",
    write(data) {
      this.output += data;
    },
  };
}

const proc = { env: {}, stdout: { isTTY: false, write() {} } };

function createRenderer() {
  return new HelpRenderer({ process: proc });
}

const fullDefinition = {
  name: "fit-test",
  version: "1.0.0",
  description: "A test CLI",
  commands: [
    { name: "run", args: "<file>", description: "Run a file" },
    { name: "check", description: "Check syntax" },
  ],
  globalOptions: {
    output: { type: "string", description: "Output path" },
    verbose: { type: "boolean", short: "v", description: "Verbose output" },
    help: { type: "boolean", short: "h", description: "Show this help" },
  },
  examples: ["fit-test run main.js", "fit-test check --verbose"],
};

describe("HelpRenderer", () => {
  describe("render", () => {
    test("includes a header line with the name, version, and description", () => {
      const stream = createStream();
      createRenderer().render(fullDefinition, stream);
      assert.ok(stream.output.includes("fit-test 1.0.0"));
      assert.ok(stream.output.includes("A test CLI"));
    });

    test("includes one line per command with aligned descriptions", () => {
      const stream = createStream();
      createRenderer().render(fullDefinition, stream);
      assert.ok(stream.output.includes("run <file>"));
      assert.ok(stream.output.includes("Run a file"));
      assert.ok(stream.output.includes("check"));
      assert.ok(stream.output.includes("Check syntax"));
    });

    test("includes options with type hints and descriptions", () => {
      const stream = createStream();
      createRenderer().render(fullDefinition, stream);
      assert.ok(stream.output.includes("--output=<string>"));
      assert.ok(stream.output.includes("--verbose, -v"));
      assert.ok(stream.output.includes("--help, -h"));
    });

    test("includes examples section", () => {
      const stream = createStream();
      createRenderer().render(fullDefinition, stream);
      assert.ok(stream.output.includes("fit-test run main.js"));
      assert.ok(stream.output.includes("fit-test check --verbose"));
    });

    test("omits commands section when definition has no commands", () => {
      const stream = createStream();
      const def = {
        name: "fit-simple",
        globalOptions: {
          help: { type: "boolean", description: "Help" },
        },
      };
      createRenderer().render(def, stream);
      assert.ok(!stream.output.includes("Commands:"));
    });

    test("uses custom usage string when provided", () => {
      const stream = createStream();
      const def = { name: "fit-query", usage: "fit-query <s> <p> <o>" };
      createRenderer().render(def, stream);
      assert.ok(stream.output.includes("Usage: fit-query <s> <p> <o>"));
    });

    test("includes hint line when commands exist", () => {
      const stream = createStream();
      createRenderer().render(fullDefinition, stream);
      assert.ok(stream.output.includes("--help for command-specific options"));
    });

    test("omits hint line when no commands exist", () => {
      const stream = createStream();
      const def = {
        name: "fit-simple",
        globalOptions: {
          help: { type: "boolean", description: "Help" },
        },
      };
      createRenderer().render(def, stream);
      assert.ok(!stream.output.includes("--help for command-specific options"));
    });

    test("global help shows only globalOptions, not per-command options", () => {
      const stream = createStream();
      const def = {
        name: "fit-test",
        commands: [
          {
            name: "run",
            options: {
              watch: { type: "boolean", description: "Watch mode" },
            },
            description: "Run a file",
          },
        ],
        globalOptions: {
          help: { type: "boolean", short: "h", description: "Show help" },
        },
      };
      createRenderer().render(def, stream);
      assert.ok(!stream.output.includes("--watch"));
    });
  });

  describe("per-command help", () => {
    test("renders per-command help with command and global options", () => {
      const stream = createStream();
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
            examples: ["fit-test run main.js"],
          },
        ],
        globalOptions: {
          data: { type: "string", description: "Data path" },
          help: { type: "boolean", short: "h", description: "Show help" },
          version: {
            type: "boolean",
            short: "v",
            description: "Show version",
          },
        },
      };
      createRenderer().render(def, stream, def.commands[0]);
      assert.ok(stream.output.includes("fit-test run <file>"));
      assert.ok(stream.output.includes("Options:"));
      assert.ok(stream.output.includes("--watch"));
      assert.ok(stream.output.includes("Global options:"));
      assert.ok(stream.output.includes("--data"));
      assert.ok(!stream.output.includes("--version"));
      assert.ok(stream.output.includes("fit-test run main.js"));
    });

    test("omits Options section when command has no options", () => {
      const stream = createStream();
      const def = {
        name: "fit-test",
        commands: [{ name: "check", description: "Check syntax" }],
        globalOptions: {
          help: { type: "boolean", short: "h", description: "Show help" },
        },
      };
      createRenderer().render(def, stream, def.commands[0]);
      assert.ok(stream.output.includes("Global options:"));
      const lines = stream.output.split("\n");
      const optionLines = lines.filter((l) => l.trim() === "Options:");
      assert.strictEqual(optionLines.length, 0);
    });
  });

  describe("documentation section", () => {
    test("renders Documentation section when entries are present", () => {
      const stream = createStream();
      const def = {
        name: "fit-test",
        documentation: [
          {
            title: "Agent Evaluations",
            url: "https://www.forwardimpact.team/docs/libraries/agent-evaluations/index.md",
            description: "Author a judge profile, run an eval locally.",
          },
          {
            title: "Trace Analysis",
            url: "https://www.forwardimpact.team/docs/libraries/trace-analysis/index.md",
          },
        ],
      };
      createRenderer().render(def, stream);
      assert.ok(stream.output.includes("Documentation:"));
      assert.ok(stream.output.includes("Agent Evaluations"));
      assert.ok(
        stream.output.includes(
          "https://www.forwardimpact.team/docs/libraries/agent-evaluations/index.md",
        ),
      );
      assert.ok(
        stream.output.includes("Author a judge profile, run an eval locally."),
      );
      assert.ok(stream.output.includes("Trace Analysis"));
    });

    test("omits description line when entry has no description", () => {
      const stream = createStream();
      const def = {
        name: "fit-test",
        documentation: [
          {
            title: "Trace Analysis",
            url: "https://www.forwardimpact.team/docs/libraries/trace-analysis/index.md",
          },
        ],
      };
      createRenderer().render(def, stream);
      const lines = stream.output.split("\n");
      const idx = lines.findIndex((l) => l.includes("Trace Analysis"));
      assert.ok(idx >= 0);
      assert.ok(lines[idx + 1].includes("trace-analysis/index.md"));
      assert.strictEqual(lines[idx + 2].trim(), "");
    });

    test("omits Documentation section when documentation is missing or empty", () => {
      const stream = createStream();
      createRenderer().render(fullDefinition, stream);
      assert.ok(!stream.output.includes("Documentation:"));

      const stream2 = createStream();
      createRenderer().render({ name: "fit-test", documentation: [] }, stream2);
      assert.ok(!stream2.output.includes("Documentation:"));
    });

    test("renderJson includes documentation array verbatim", () => {
      const stream = createStream();
      const def = {
        name: "fit-test",
        documentation: [
          {
            title: "Agent Evaluations",
            url: "https://www.forwardimpact.team/docs/libraries/agent-evaluations/index.md",
            description: "Author a judge profile.",
          },
        ],
      };
      createRenderer().renderJson(def, stream);
      const parsed = JSON.parse(stream.output);
      assert.deepStrictEqual(parsed.documentation, def.documentation);
    });
  });

  describe("renderJson", () => {
    test("produces valid JSON matching the definition", () => {
      const stream = createStream();
      createRenderer().renderJson(fullDefinition, stream);
      const parsed = JSON.parse(stream.output);
      assert.strictEqual(parsed.name, "fit-test");
      assert.strictEqual(parsed.commands.length, 2);
      assert.strictEqual(parsed.commands[0].name, "run");
    });

    test("per-command JSON includes documentation from parent definition", () => {
      const stream = createStream();
      const def = {
        name: "fit-test",
        commands: [{ name: "run", description: "Run" }],
        globalOptions: {
          help: { type: "boolean", short: "h", description: "Show help" },
        },
        documentation: [
          {
            title: "Run Guide",
            url: "https://www.forwardimpact.team/docs/libraries/run/index.md",
          },
        ],
      };
      createRenderer().renderJson(def, stream, def.commands[0]);
      const parsed = JSON.parse(stream.output);
      assert.deepStrictEqual(parsed.documentation, def.documentation);
    });

    test("per-command JSON includes command metadata and scoped options", () => {
      const stream = createStream();
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
          data: { type: "string", description: "Data path" },
          version: {
            type: "boolean",
            short: "v",
            description: "Show version",
          },
        },
      };
      createRenderer().renderJson(def, stream, def.commands[0]);
      const parsed = JSON.parse(stream.output);
      assert.strictEqual(parsed.parent, "fit-test");
      assert.strictEqual(parsed.name, "run");
      assert.ok(parsed.options.watch);
      assert.ok(parsed.globalOptions.data);
      assert.ok(!parsed.globalOptions.version);
    });
  });

  describe("args: string[] with argsUsage", () => {
    test("renders argsUsage in commands list when args is an array", () => {
      const stream = createStream();
      const def = {
        name: "fit-test",
        commands: [
          {
            name: "skill",
            args: ["id"],
            argsUsage: "[<id>]",
            description: "Show skill",
          },
        ],
        globalOptions: {
          help: { type: "boolean", short: "h", description: "Show help" },
        },
      };
      createRenderer().render(def, stream);
      assert.ok(stream.output.includes("skill [<id>]"));
      assert.ok(stream.output.includes("Show skill"));
    });

    test("renders argsUsage in per-command help when args is an array", () => {
      const stream = createStream();
      const def = {
        name: "fit-test",
        commands: [
          {
            name: "skill",
            args: ["id"],
            argsUsage: "[<id>]",
            description: "Show skill",
          },
        ],
        globalOptions: {
          help: { type: "boolean", short: "h", description: "Show help" },
        },
      };
      createRenderer().render(def, stream, def.commands[0]);
      assert.ok(stream.output.includes("fit-test skill [<id>]"));
    });

    test("handles args: string[] without argsUsage gracefully", () => {
      const stream = createStream();
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
      createRenderer().render(def, stream);
      assert.ok(stream.output.includes("skill"));
      assert.ok(stream.output.includes("Show skill"));
    });
  });
});
