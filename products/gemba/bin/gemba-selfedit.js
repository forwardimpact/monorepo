#!/usr/bin/env node
/**
 * gemba-selfedit — write stdin to a path that .claude/settings.json
 * permits Edit on, while on a non-main git branch. See
 * libraries/libharness/README.md § gemba-selfedit for the full rationale.
 */

import "@forwardimpact/libpreflight/node22";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import {
  runSelfeditCommand,
  SelfeditError,
} from "@forwardimpact/libharness/commands/selfedit.js";

const HELP = `gemba-selfedit — write stdin to a settings.json-allowed path on a non-main branch.

Usage:
  echo content | gemba-selfedit <path>
  gemba-selfedit <path> < input.txt

Safeguards (checked in order):
  1. The nearest .claude/settings.json must contain an Edit(<glob>) rule
     in permissions.allow[] that resolves to the target path.
  2. HEAD must not be detached and the current branch must not be 'main'.

Exit codes:
  0  wrote the file
  2  safeguard violation (no settings.json, no matching Edit rule, on
     main, detached HEAD, missing parent directory, TTY stdin)
  1  unexpected I/O error

Why this exists:
  Some session harnesses block Edit/Write (and interactive bash writes)
  on .claude/skills/**, even when the project allowlist permits them.
  This CLI is a narrow, audited bypass: a subprocess write that still
  has to clear the project allowlist and the normal merge gates.
`;

function fail(message) {
  process.stderr.write(`gemba-selfedit: ${message}\n`);
  process.exit(2);
}

const { values, positionals } = parseArgs({
  options: {
    help: { type: "boolean", short: "h" },
    version: { type: "boolean" },
  },
  allowPositionals: true,
});

if (values.help) {
  process.stdout.write(HELP);
  process.exit(0);
}

if (values.version) {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  process.stdout.write(`${pkg.version}\n`);
  process.exit(0);
}

const [targetArg, ...extra] = positionals;
if (!targetArg) fail("missing <path> (try --help)");
if (extra.length > 0) fail(`unexpected extra arguments: ${extra.join(" ")}`);

if (process.stdin.isTTY) {
  fail(
    "stdin is a TTY — pipe content in (e.g. `echo … | gemba-selfedit <path>`)",
  );
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const content = Buffer.concat(chunks);

const runtime = createDefaultRuntime();

try {
  const { bytes, relativeTarget, matchedPattern, branch } = runSelfeditCommand(
    targetArg,
    content,
    { runtime },
  );
  process.stderr.write(
    `gemba-selfedit: wrote ${bytes} byte${bytes === 1 ? "" : "s"} to ${relativeTarget} ` +
      `(matched Edit(${matchedPattern}), branch ${branch})\n`,
  );
} catch (err) {
  if (err instanceof SelfeditError) fail(err.message);
  process.stderr.write(`gemba-selfedit: write failed: ${err.message}\n`);
  process.exit(1);
}
