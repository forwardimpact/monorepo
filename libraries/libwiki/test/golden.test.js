import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCli } from "@forwardimpact/libcli";
import { createDefinition } from "../src/cli-definition.js";
import { makeRuntime } from "./helpers.js";

// Byte-for-byte CLI-contract guard: the definition + libcli help
// renderer must keep producing the snapshots captured in golden/fit-wiki/. The
// committed `*.txt` were captured from the bin with the version normalised to
// `X.Y.Z`; rendering in-process with that version reproduces them without a
// process spawn. `scripts/capture-cli-golden.mjs --verify` runs the same cases
// against the real spawned bin in the release-merge gate.
const GOLDEN_DIR = fileURLToPath(new URL("./golden/fit-wiki", import.meta.url));

function golden(file) {
  return readFileSync(join(GOLDEN_DIR, file), "utf-8");
}

function cli() {
  const harness = makeRuntime({});
  const definition = createDefinition();
  // Goldens were captured with the version normalised to X.Y.Z; set it
  // explicitly so createCli's packageJsonUrl auto-fill stays out of the way.
  definition.version = "X.Y.Z";
  return {
    harness,
    definition,
    cli: createCli(definition, { runtime: harness.runtime }),
  };
}

const HELP_CASES = [
  [[], "help.stdout.txt"],
  [["--help"], "help-flag.stdout.txt"],
  [["boot", "--help"], "boot-help.stdout.txt"],
  [["log", "--help"], "log-help.stdout.txt"],
  [["claim", "--help"], "claim-help.stdout.txt"],
  [["release", "--help"], "release-help.stdout.txt"],
  [["inbox", "--help"], "inbox-help.stdout.txt"],
  [["rotate", "--help"], "rotate-help.stdout.txt"],
  [["audit", "--help"], "audit-help.stdout.txt"],
  [["fix", "--help"], "fix-help.stdout.txt"],
  [["memo", "--help"], "memo-help.stdout.txt"],
  [["refresh", "--help"], "refresh-help.stdout.txt"],
  [["product-mix", "--help"], "product-mix-help.stdout.txt"],
  [["init", "--help"], "init-help.stdout.txt"],
  [["push", "--help"], "push-help.stdout.txt"],
  [["pull", "--help"], "pull-help.stdout.txt"],
  [["ledger", "--help"], "ledger-help.stdout.txt"],
];

describe("fit-wiki golden CLI contract", () => {
  for (const [argv, file] of HELP_CASES) {
    test(`help output matches ${file}`, () => {
      const { harness, cli: c } = cli();
      const parsed = c.parse(argv);
      if (parsed && parsed.positionals.length === 0) c.showHelp();
      assert.equal(harness.stdout, golden(file));
    });
  }

  test("--version output matches version.stdout.txt", () => {
    const { harness, cli: c } = cli();
    c.parse(["--version"]);
    assert.equal(harness.stdout, golden("version.stdout.txt"));
  });

  test("unknown command matches unknown.stderr.txt", () => {
    const { harness, definition, cli: c } = cli();
    c.parse(["bogus"]);
    if (!definition.commands.some((cmd) => cmd.name === "bogus")) {
      c.usageError('unknown command "bogus"');
    }
    assert.equal(harness.stderr, golden("unknown.stderr.txt"));
  });
});
