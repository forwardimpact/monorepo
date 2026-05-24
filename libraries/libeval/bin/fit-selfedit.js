#!/usr/bin/env node
/**
 * fit-selfedit — write stdin to a path that .claude/settings.json
 * permits Edit on, while on a non-main git branch. See
 * libraries/libeval/README.md § fit-selfedit for the full rationale.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import fsPromises from "node:fs/promises";
import { parseArgs } from "node:util";
import { resolve, relative, dirname } from "node:path";
import { execFileSync } from "node:child_process";

import { Finder } from "@forwardimpact/libutil";
import { minimatch } from "minimatch";

const HELP = `fit-selfedit — write stdin to a settings.json-allowed path on a non-main branch.

Usage:
  echo content | fit-selfedit <path>
  fit-selfedit <path> < input.txt

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
  process.stderr.write(`fit-selfedit: ${message}\n`);
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

const absoluteTarget = resolve(process.cwd(), targetArg);

// Safeguard 1: settings.json must grant Edit() on this path.
const settingsPath = new Finder(fsPromises, { debug() {} }).findUpward(
  dirname(absoluteTarget),
  ".claude/settings.json",
  20,
);
if (!settingsPath) {
  fail(
    `no .claude/settings.json found walking upward from ${dirname(absoluteTarget)}`,
  );
}

const projectRoot = dirname(dirname(settingsPath));
const relativeTarget = relative(projectRoot, absoluteTarget);

let settings;
try {
  settings = JSON.parse(readFileSync(settingsPath, "utf8"));
} catch (err) {
  fail(`failed to parse ${settingsPath}: ${err.message}`);
}

const allowRules = settings?.permissions?.allow;
if (!Array.isArray(allowRules)) {
  fail(`${settingsPath} has no permissions.allow[] array`);
}

const editPatterns = allowRules
  .filter((rule) => typeof rule === "string")
  .map((rule) => rule.match(/^Edit\((.+)\)$/)?.[1])
  .filter(Boolean);

if (editPatterns.length === 0) {
  fail(`${settingsPath} has no Edit() rules in permissions.allow[]`);
}

const matchedPattern = editPatterns.find((pattern) =>
  minimatch(relativeTarget, pattern, { dot: true }),
);
if (!matchedPattern) {
  fail(
    `no Edit() rule in ${relative(projectRoot, settingsPath)} matches '${relativeTarget}' ` +
      `(tried: ${editPatterns.map((p) => `Edit(${p})`).join(", ")})`,
  );
}

// Safeguard 2: branch must not be main and HEAD must not be detached.
let branch;
try {
  branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  }).trim();
} catch {
  fail("failed to read current git branch (not inside a git repository?)");
}

if (branch === "HEAD") {
  fail("HEAD is detached — refusing (check out a non-main branch first)");
}
if (branch === "main") {
  fail("refusing to write while on branch 'main' — switch to a feature branch");
}

const parent = dirname(absoluteTarget);
if (!existsSync(parent)) {
  fail(`parent directory '${relative(projectRoot, parent)}' does not exist`);
}

if (process.stdin.isTTY) {
  fail(
    "stdin is a TTY — pipe content in (e.g. `echo … | fit-selfedit <path>`)",
  );
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const content = Buffer.concat(chunks);

try {
  writeFileSync(absoluteTarget, content);
} catch (err) {
  process.stderr.write(`fit-selfedit: write failed: ${err.message}\n`);
  process.exit(1);
}

process.stderr.write(
  `fit-selfedit: wrote ${content.length} byte${content.length === 1 ? "" : "s"} to ${relativeTarget} ` +
    `(matched Edit(${matchedPattern}), branch ${branch})\n`,
);
