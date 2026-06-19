import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Cli } from "@forwardimpact/libcli";
import { HelpRenderer } from "@forwardimpact/libcli";

// Read version from package.json so the fixture tracks the published version
// instead of drifting (the previous hardcode was 2.11.0 while the package was
// already at 2.12.6).
const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_VERSION = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
).version;

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
  name: "fit-outpost",
  version: PKG_VERSION,
  description: "Schedule autonomous agents across knowledge bases",
  commands: [
    { name: "daemon", description: "Run continuously (poll every 60s)" },
    {
      name: "wake",
      args: "<agent>",
      description: "Wake a specific agent immediately",
    },
    {
      name: "init",
      args: "<path>",
      description: "Initialize a new knowledge base",
    },
    {
      name: "update",
      args: "[path]",
      description: "Update KB with latest CLAUDE.md, agents and skills",
    },
    {
      name: "stop",
      description: "Gracefully stop daemon and all running agents",
    },
    { name: "validate", description: "Validate agent definitions exist" },
    { name: "status", description: "Show agent status" },
    {
      name: "posture",
      args: "[brief|brief+draft]",
      description: "Show or set the adoption posture (brief or brief+draft)",
    },
  ],
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "JSON output (with --help)" },
  },
};

function createCli(proc) {
  const helpRenderer = new HelpRenderer({ process: proc });
  return new Cli(definition, { process: proc, helpRenderer });
}

describe("fit-outpost CLI parsing", () => {
  test('parse(["daemon"]) returns positionals with daemon', () => {
    const proc = createProc();
    const cli = createCli(proc);
    const result = cli.parse(["daemon"]);
    assert.deepStrictEqual(result.positionals, ["daemon"]);
  });

  test('parse(["wake", "my-agent"]) returns correct positionals', () => {
    const proc = createProc();
    const cli = createCli(proc);
    const result = cli.parse(["wake", "my-agent"]);
    assert.deepStrictEqual(result.positionals, ["wake", "my-agent"]);
  });

  test('parse(["--help"]) returns null (help handled)', () => {
    const proc = createProc();
    const cli = createCli(proc);
    const result = cli.parse(["--help"]);
    assert.strictEqual(result, null);
    assert.ok(proc.stdout.output.includes("fit-outpost"));
  });

  test('parse(["badcmd"]) returns positionals with badcmd', () => {
    const proc = createProc();
    const cli = createCli(proc);
    const result = cli.parse(["badcmd"]);
    assert.deepStrictEqual(result.positionals, ["badcmd"]);
  });

  test("parse([]) returns empty positionals", () => {
    const proc = createProc();
    const cli = createCli(proc);
    const result = cli.parse([]);
    assert.deepStrictEqual(result.positionals, []);
  });

  test('parse(["init", "/tmp/kb"]) returns correct positionals', () => {
    const proc = createProc();
    const cli = createCli(proc);
    const result = cli.parse(["init", "/tmp/kb"]);
    assert.deepStrictEqual(result.positionals, ["init", "/tmp/kb"]);
  });

  test('parse(["--version"]) returns null (version handled)', () => {
    const proc = createProc();
    const cli = createCli(proc);
    const result = cli.parse(["--version"]);
    assert.strictEqual(result, null);
    assert.ok(proc.stdout.output.includes(PKG_VERSION));
  });
});
