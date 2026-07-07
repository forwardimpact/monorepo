#!/usr/bin/env node

/**
 * Substrate subcommand dispatch — extracted from `bin/fit-map.js` so the
 * CLI entry point stays under biome's `nursery/noExcessiveLinesPerFile`
 * cap (`biome.json` line 46-49: `maxLines: 530, skipBlankLines: true`).
 * Keeping the `substrate pick` case here (instead of inlining it into
 * `fit-map.js`) preserves headroom under the line cap.
 *
 * Callers pass `{ config, mapClient, cli, runtime }` so this module stays
 * dep-free at import time (no Supabase init, no CLI singleton) and
 * stays easy to test if needed. `runtime` is the injected collaborator
 * bag threaded from `bin/fit-map.js` (the sole construction site).
 */

import { fileURLToPath } from "node:url";
import { resolveVersion } from "@forwardimpact/libcli";

/**
 * @param {string} subcommand
 * @param {Array<string>} _rest
 * @param {Record<string, string|undefined>} values
 * @param {{ config: object, mapClient: () => Promise<object>, cli: { usageError: (msg: string) => void }, runtime: import('@forwardimpact/libutil/runtime').Runtime }} deps
 * @returns {Promise<number>}
 */
export async function dispatchSubstrate(subcommand, _rest, values, deps) {
  const { config, mapClient, cli, runtime } = deps;
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
    case "roster": {
      const supabase = await mapClient();
      const { runRosterCommand } = await import(
        "../src/commands/substrate-roster.js"
      );
      return runRosterCommand({
        supabase,
        options: { format: values.format },
        runtime,
      });
    }
    case "pick": {
      const supabase = await mapClient();
      const { runPickCommand } = await import(
        "../src/commands/substrate-pick.js"
      );
      return runPickCommand({
        supabase,
        options: {
          memoryWindow: values["memory-window"],
          format: values.format,
        },
        runtime,
      });
    }
    case "issue": {
      const supabase = await mapClient();
      const { runSubstrateIssueCommand } = await import(
        "../src/commands/substrate-issue.js"
      );
      return runSubstrateIssueCommand({
        supabase,
        config,
        options: {
          email: values.email,
          cwd: values.cwd,
          ttl: values.ttl,
          stash: values.stash,
        },
        runtime,
      });
    }
    default:
      cli.usageError(`unknown substrate subcommand: ${subcommand || "(none)"}`);
      return 1;
  }
}

const USAGE = `dispatch-substrate <stage|roster|pick|issue> [options]

Single-flow entry for the Landmark-substrate verbs (normally invoked as
\`fit-map substrate <verb>\`). Constructs the default runtime and dispatches.`;

/**
 * Single-flow entry point. The bin is the sole construction site for the
 * injected runtime bag and the only caller of runtime.proc.exit (design
 * Decision 4). Version/help/usage paths never touch Supabase.
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
  const known = new Set(["stage", "roster", "pick", "issue"]);
  if (!known.has(subcommand)) {
    runtime.proc.stderr.write(
      `dispatch-substrate: error: unknown substrate subcommand: ${subcommand}\n`,
    );
    return 2;
  }

  const { createProductConfig } = await import("@forwardimpact/libconfig");
  const { createMapClient } = await import("../src/lib/client.js");
  const config = await createProductConfig("map");
  const cli = {
    usageError: (msg) =>
      runtime.proc.stderr.write(`dispatch-substrate: error: ${msg}\n`),
  };
  return dispatchSubstrate(subcommand, rest, parseValues(rest), {
    config,
    mapClient: () => createMapClient({ config }),
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

// Run as a standalone bin only when invoked directly (not when imported by
// bin/fit-map.js, which threads its own runtime through dispatchSubstrate).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { createDefaultRuntime } = await import(
    "@forwardimpact/libutil/runtime"
  );
  const runtime = createDefaultRuntime();
  const code = await main(runtime);
  runtime.proc.exit(code ?? 0);
}
