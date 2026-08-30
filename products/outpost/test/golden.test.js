import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCli } from "@forwardimpact/libcli";
import { createMockProcess, createTestRuntime } from "@forwardimpact/libmock";
import { buildDefinition } from "../src/outpost.js";

// Byte-for-byte CLI-contract guard: buildDefinition plus the libcli help
// renderer must still produce the snapshots in golden/fit-outpost/. The
// committed fixtures came from a capture with the version pinned to
// 0.0.0-golden (cases.json pins LIBCLI_PACKAGE_VERSION for the spawned
// path, `scripts/capture-cli-golden.mjs`). An in-process render with that
// version reproduces them without a process spawn. The `no-args` case
// exercises the scheduler and stays capture-script-only.
const GOLDEN_DIR = fileURLToPath(
  new URL("./golden/fit-outpost", import.meta.url),
);

function golden(file) {
  return readFileSync(join(GOLDEN_DIR, file), "utf-8");
}

function cli() {
  const proc = createMockProcess({});
  const runtime = createTestRuntime({ proc });
  const definition = buildDefinition("0.0.0-golden");
  return {
    harness: {
      get stdout() {
        return proc.stdout.chunks.join("");
      },
      get stderr() {
        return proc.stderr.chunks.join("");
      },
    },
    definition,
    cli: createCli(definition, { runtime }),
  };
}

describe("fit-outpost golden CLI contract", () => {
  test("--help output matches help.stdout", () => {
    const { harness, cli: c } = cli();
    c.parse(["--help"]);
    assert.equal(harness.stdout, golden("help.stdout"));
  });

  test("--version output matches version.stdout", () => {
    const { harness, cli: c } = cli();
    c.parse(["--version"]);
    assert.equal(harness.stdout, golden("version.stdout"));
  });

  test("unknown command matches unknown.stderr", () => {
    const { harness, definition, cli: c } = cli();
    c.parse(["bogus"]);
    if (!definition.commands.some((cmd) => cmd.name === "bogus")) {
      c.usageError('unknown command "bogus"');
    }
    assert.equal(harness.stderr, golden("unknown.stderr"));
  });
});
