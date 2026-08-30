import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Cli } from "@forwardimpact/libcli";
import { HelpRenderer } from "@forwardimpact/libcli";
import {
  createMockFs,
  createMockProcess,
  createTestRuntime,
} from "@forwardimpact/libmock";

import { run } from "../src/outpost.js";

// Read the version from package.json so the fixture tracks the published
// version and does not drift. The previous hardcode was 2.11.0 when the
// package was already at 2.12.6.
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
      args: "[name]",
      description: "Initialize a new knowledge base",
    },
    {
      name: "update",
      args: "[path]",
      description:
        "Update KB with latest CLAUDE.md, agents and skills (defaults to current directory)",
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

  test('parse(["init", "team"]) returns correct positionals', () => {
    const proc = createProc();
    const cli = createCli(proc);
    const result = cli.parse(["init", "team"]);
    assert.deepStrictEqual(result.positionals, ["init", "team"]);
  });

  test('parse(["--version"]) returns null (version handled)', () => {
    const proc = createProc();
    const cli = createCli(proc);
    const result = cli.parse(["--version"]);
    assert.strictEqual(result, null);
    assert.ok(proc.stdout.output.includes(PKG_VERSION));
  });
});

describe("fit-outpost validate with a KB path", () => {
  const FM = "---\ntype: note\ncreated: 2026-01-01\nupdated: 2026-01-02\n---\n";

  function runValidate(argv, files, dirs = []) {
    const fs = createMockFs(files);
    for (const dir of dirs) fs.dirs.add(dir);
    const proc = createMockProcess({
      argv: ["bun", "fit-outpost", ...argv],
    });
    const runtime = createTestRuntime({ fs, proc });
    return { exit: run(runtime, PKG_VERSION), proc };
  }

  test("a conforming vault exits 0", async () => {
    const { exit } = runValidate(["validate", "/vault"], {
      "/vault/3-Team/People/Sarah Chen.md": FM + "A colleague.",
    });
    assert.strictEqual(await exit, 0);
  });

  test("a violating vault exits 1 and reports file:line", async () => {
    const { exit, proc } = runValidate(["validate", "/vault"], {
      "/vault/3-Team/a.md": FM + "See [[3-Team/Ghost]].",
    });
    assert.strictEqual(await exit, 1);
    const out = proc.stderr.chunks.join("");
    assert.match(out, /3-Team\/a\.md:6 unresolved 3-Team\/Ghost/);
  });

  test("--json emits the findings array as the only stdout", async () => {
    const { exit, proc } = runValidate(["validate", "/vault", "--json"], {
      "/vault/3-Team/a.md": FM + "See [[3-Team/Ghost]].",
    });
    assert.strictEqual(await exit, 1);
    const out = proc.stdout.chunks.join("");
    const findings = JSON.parse(out);
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].kind, "unresolved");
    assert.strictEqual(findings[0].baselined, false);
  });

  test("a baselined-only vault exits 0 with a warning line", async () => {
    const { exit, proc } = runValidate(["validate", "/vault"], {
      "/vault/3-Team/a.md": FM + "See [[3-Team/Ghost]].",
      "/vault/validation-baseline.json": JSON.stringify({
        findings: [
          { kind: "unresolved", file: "3-Team/a.md", link: "3-Team/Ghost" },
        ],
      }),
    });
    assert.strictEqual(await exit, 0);
    assert.match(proc.stderr.chunks.join(""), /warn: 3-Team\/a\.md:6/);
  });

  test("without a path and no agents it keeps the exit-0 path", async () => {
    const { exit, proc } = runValidate(["validate"], {});
    assert.strictEqual(await exit, 0);
    assert.match(proc.stderr.chunks.join(""), /No agents configured/);
  });

  test("a malformed registry fails with one clean error line", async () => {
    const { exit, proc } = runValidate(["validate", "/vault"], {
      "/vault/3-Team/a.md": FM + "Note.",
      "/vault/registry.yaml": "types: [unclosed",
    });
    assert.strictEqual(await exit, 1);
    assert.match(proc.stderr.chunks.join(""), /validate failed for \/vault/);
  });
});
