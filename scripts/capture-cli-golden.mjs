#!/usr/bin/env node
// Golden-output capture. Before a CLI's refactor PR touches any
// source, the first commit captures byte-exact stdout/stderr/exitCode for a
// representative set of invocations; the refactor must replay identically.
//
// Cases live in `<golden-dir>/cases.json`:
//   [{ name?, args: string[], env?: {}, exitCode: number,
//      stdoutFile: string, stderrFile: string,
//      transform?: [{ pattern: string, replacement: string }] }]
// `transform` regexes (applied with the `g` flag) normalise non-deterministic
// output (timestamps, ids) so snapshots stay stable.
//
// Usage:
//   node scripts/capture-cli-golden.mjs --bin <name> [--exec <path>] [--golden-dir <dir>]
//   node scripts/capture-cli-golden.mjs --bin <name> --verify [...]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseFlags(argv) {
  const flags = { verify: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--verify") flags.verify = true;
    else if (a === "--bin") flags.bin = argv[++i];
    else if (a === "--exec") flags.exec = argv[++i];
    else if (a === "--golden-dir") flags.goldenDir = argv[++i];
  }
  return flags;
}

/**
 * Resolve `<golden-dir>` for a bin. Defaults to the cwd convention
 * `test/golden/<bin>` so a library runs it from its own package root.
 */
function resolveGoldenDir(flags) {
  if (flags.goldenDir) return resolve(flags.goldenDir);
  return resolve(process.cwd(), "test", "golden", flags.bin);
}

function applyTransforms(text, transform = []) {
  let out = text;
  for (const { pattern, replacement } of transform) {
    out = out.replace(new RegExp(pattern, "g"), replacement);
  }
  return out;
}

/** Run one case and return normalised `{ stdout, stderr, exitCode }`. */
function runCase(execPath, c) {
  const isJs = execPath.endsWith(".js") || execPath.endsWith(".mjs");
  const cmd = isJs ? "node" : execPath;
  const args = isJs ? [execPath, ...c.args] : c.args;
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    env: { ...process.env, ...(c.env ?? {}) },
  });
  return {
    stdout: applyTransforms(result.stdout ?? "", c.transform),
    stderr: applyTransforms(result.stderr ?? "", c.transform),
    exitCode: result.status ?? 0,
  };
}

function loadCases(goldenDir) {
  const casesPath = join(goldenDir, "cases.json");
  if (!existsSync(casesPath)) {
    throw new Error(`no cases.json at ${casesPath}`);
  }
  return JSON.parse(readFileSync(casesPath, "utf8"));
}

function capture(flags) {
  const goldenDir = resolveGoldenDir(flags);
  const execPath = flags.exec ? resolve(flags.exec) : flags.bin;
  const cases = loadCases(goldenDir);
  mkdirSync(goldenDir, { recursive: true });
  for (const c of cases) {
    const r = runCase(execPath, c);
    writeFileSync(join(goldenDir, c.stdoutFile), r.stdout);
    writeFileSync(join(goldenDir, c.stderrFile), r.stderr);
  }
  return { count: cases.length, goldenDir };
}

function verify(flags) {
  const goldenDir = resolveGoldenDir(flags);
  const execPath = flags.exec ? resolve(flags.exec) : flags.bin;
  const cases = loadCases(goldenDir);
  const diffs = [];
  for (const c of cases) {
    const r = runCase(execPath, c);
    const expectedOut = readFileSync(join(goldenDir, c.stdoutFile), "utf8");
    const expectedErr = readFileSync(join(goldenDir, c.stderrFile), "utf8");
    if (r.stdout !== expectedOut) diffs.push(`${c.stdoutFile} (stdout)`);
    if (r.stderr !== expectedErr) diffs.push(`${c.stderrFile} (stderr)`);
    if (r.exitCode !== c.exitCode) {
      diffs.push(`${c.name ?? c.args.join(" ")} exitCode ${r.exitCode}`);
    }
  }
  return { ok: diffs.length === 0, diffs, count: cases.length };
}

function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (!flags.bin) {
    console.error("usage: capture-cli-golden.mjs --bin <name> [--verify]");
    process.exitCode = 2;
    return;
  }
  if (flags.verify) {
    const { ok, diffs, count } = verify(flags);
    if (!ok) {
      for (const d of diffs) console.error(`golden diff: ${d}`);
      process.exitCode = 1;
      return;
    }
    console.log(`golden verify clean: ${count} case(s)`);
  } else {
    const { count, goldenDir } = capture(flags);
    console.log(`captured ${count} case(s) → ${goldenDir}`);
  }
}

// Export internals for the regression test; only run when invoked directly.
export { applyTransforms, runCase, resolveGoldenDir, capture, verify };

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main();
}
