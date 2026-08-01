#!/usr/bin/env node

/**
 * Substrate subcommand dispatch. This module sits outside `bin/fit-map.js`
 * so the CLI entry point stays under biome's
 * `nursery/noExcessiveLinesPerFile` cap
 * (`biome.json`: `maxLines: 530, skipBlankLines: true`).
 *
 * Only `stage` lives here. The identity verbs (provision, pick, roster,
 * issue) moved to `fit-terrain substrate` behind the Substrate Contract.
 *
 * Callers pass `{ config, cli, runtime }` so this module stays dep-free at
 * import time (no Supabase init, no CLI singleton). `runtime` is the
 * injected collaborator bag. `bin/fit-map.js` threads it through. That file
 * is the sole construction site.
 */

import { fileURLToPath } from "node:url";
import { resolveVersion } from "@forwardimpact/libcli";

/**
 * @param {string} subcommand
 * @param {Array<string>} _rest
 * @param {Record<string, string|undefined>} values
 * @param {{ config: object, cli: { usageError: (msg: string) => void }, runtime: import('@forwardimpact/libutil/runtime').Runtime }} deps
 * @returns {Promise<number>}
 */
export async function dispatchSubstrate(subcommand, _rest, values, deps) {
  const { config, cli, runtime } = deps;
  switch (subcommand) {
    case "stage": {
      const { runStageCommand } = await import(
        "../src/commands/substrate-stage.js"
      );
      return runStageCommand({
        config,
        target: values.cwd,
        emitEnv: values["emit-env"],
        runtime,
      });
    }
    default:
      cli.usageError(`unknown substrate subcommand: ${subcommand || "(none)"}`);
      return 1;
  }
}

const USAGE = `dispatch-substrate <stage> [options]

Single-flow entry for the pipeline that stages the Landmark substrate. You
normally run it as \`fit-map substrate stage\`. It constructs the default
runtime. Then it dispatches. Persona identity verbs live in
\`fit-terrain substrate\`.`;

/**
 * Single-flow entry point. The bin is the sole construction site for the
 * injected runtime bag. It is also the only caller of runtime.proc.exit
 * (design Decision 4). The version, help, and usage paths never touch
 * Supabase.
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime
 */
async function main(runtime) {
  const argv = runtime.proc.argv.slice(2);

  if (argv.includes("--version")) {
    const version = resolveVersion({
      packageJsonUrl: new URL("../package.json", import.meta.url),
      runtime,
    });
    runtime.proc.stdout.write(version + "\n");
    return 0;
  }
  if (argv.includes("--help") || argv.length === 0) {
    runtime.proc.stdout.write(USAGE + "\n");
    return 0;
  }

  const [subcommand, ...rest] = argv;
  const known = new Set(["stage"]);
  if (!known.has(subcommand)) {
    runtime.proc.stderr.write(
      `dispatch-substrate: error: unknown substrate subcommand: ${subcommand}\n`,
    );
    return 2;
  }

  const { createProductConfig } = await import("@forwardimpact/libconfig");
  const config = await createProductConfig("map");
  const cli = {
    usageError: (msg) =>
      runtime.proc.stderr.write(`dispatch-substrate: error: ${msg}\n`),
  };
  return dispatchSubstrate(subcommand, rest, parseValues(rest), {
    config,
    cli,
    runtime,
  });
}

/** Minimal `--key value` / `--key` flag parser for the standalone entry. */
function parseValues(rest) {
  const values = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      values[key] = next;
      i += 1;
    } else {
      values[key] = true;
    }
  }
  return values;
}

// Run as a standalone bin only when Node runs this file directly. An import
// from bin/fit-map.js does not run it. That file threads its own runtime
// through dispatchSubstrate.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { createDefaultRuntime } = await import(
    "@forwardimpact/libutil/runtime"
  );
  const runtime = createDefaultRuntime();
  const code = await main(runtime);
  runtime.proc.exit(code ?? 0);
}
