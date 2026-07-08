/**
 * `fit-terrain substrate up` — generic Supabase bring-up.
 *
 * Opinionated on Supabase by design: it starts the local stack from an
 * explicit `--cwd`, discovers the API URL and anon key via `supabase status
 * --output json`, and (with `--emit-env`) appends `SUPABASE_URL=` /
 * `SUPABASE_ANON_KEY=` lines to a target file. It knows nothing about
 * migrations, seed data, or any product schema — those stay with the
 * consumer's own command. This keeps the verb portable to any
 * Supabase-backed checkout (e.g. a different-domain app), not just repos
 * running the full Forward Impact stack.
 *
 * The spawner is inlined and cwd-explicit — it does not resolve a package
 * root — so a consumer running from its own checkout brings up the stack
 * defined by that checkout's `supabase/` directory. It is injectable for
 * tests so the bring-up logic is exercised without a real `supabase` binary.
 */

import { formatSuccess } from "@forwardimpact/libcli";

const SUPABASE_INSTALL_URL =
  "https://supabase.com/docs/guides/local-development";

function missingCliError() {
  return new Error(
    "Could not find the `supabase` CLI on PATH. Install it via Homebrew " +
      "(`brew install supabase/tap/supabase`), npm " +
      "(`npm install -g supabase`), or bun (`bun install -g supabase` — " +
      "ensure the bun global bin directory is on PATH). " +
      `See ${SUPABASE_INSTALL_URL}.`,
  );
}

/**
 * Build a thin, cwd-explicit Supabase spawner. Unlike fit-map's wrapper it
 * takes `cwd` verbatim (no package-root resolution) so it targets the
 * consumer's own checkout. Resolution order mirrors fit-map's: bare
 * `supabase` on PATH, then `npx --no-install -- supabase`.
 *
 * @param {object} opts
 * @param {import('@forwardimpact/libutil/runtime').Runtime} opts.runtime
 * @param {string} opts.cwd - Working directory for every invocation.
 * @returns {{ run: (args: string[]) => Promise<void>, capture: (args: string[]) => Promise<string> }}
 */
export function createSupabaseSpawner({ runtime, cwd }) {
  if (!runtime?.subprocess) {
    throw new Error("createSupabaseSpawner requires runtime.subprocess");
  }
  let resolvedPromise = null;

  async function doResolve() {
    const bare = await runtime.subprocess.run("supabase", ["--version"], {
      cwd,
    });
    if (bare.exitCode === 0) return { cmd: "supabase", prefix: [] };
    const viaNpx = await runtime.subprocess.run(
      "npx",
      ["--no-install", "--", "supabase", "--version"],
      { cwd },
    );
    if (viaNpx.exitCode === 0) {
      return { cmd: "npx", prefix: ["--no-install", "--", "supabase"] };
    }
    return null;
  }

  function resolve() {
    if (!resolvedPromise) resolvedPromise = doResolve();
    return resolvedPromise;
  }

  async function run(args) {
    const desc = await resolve();
    if (!desc) throw missingCliError();
    // Inherit stdio so `supabase start` progress streams to the operator.
    const child = runtime.subprocess.spawn(
      desc.cmd,
      [...desc.prefix, ...args],
      {
        cwd,
        stdio: "inherit",
      },
    );
    const code = await child.exitCode;
    if (code !== 0) {
      throw new Error(`supabase ${args.join(" ")} exited ${code}`);
    }
  }

  async function capture(args) {
    const desc = await resolve();
    if (!desc) throw missingCliError();
    const r = await runtime.subprocess.run(
      desc.cmd,
      [...desc.prefix, ...args],
      {
        cwd,
      },
    );
    if (r.exitCode !== 0) {
      throw new Error(`supabase ${args.join(" ")} exited ${r.exitCode}`);
    }
    return r.stdout;
  }

  return { run, capture };
}

/**
 * Bring up a local Supabase stack and, when requested, emit its discovery
 * vector as `KEY=value` lines.
 *
 * @param {object} params
 * @param {string} [params.cwd] - Checkout to start Supabase from (default:
 *   `runtime.proc.cwd()`).
 * @param {string} [params.emitEnv] - Path to append `SUPABASE_URL=` /
 *   `SUPABASE_ANON_KEY=` to (e.g. `$GITHUB_ENV`). Omit to skip the emit.
 * @param {import('@forwardimpact/libutil/runtime').Runtime} params.runtime
 * @param {(opts: object) => {run: Function, capture: Function}} [params.createSpawner]
 *   Injected for tests; defaults to the real cwd-explicit spawner.
 * @returns {Promise<number>}
 */
export async function runSubstrateUp({
  cwd,
  emitEnv,
  runtime,
  createSpawner = createSupabaseSpawner,
} = {}) {
  const targetCwd = cwd ?? runtime.proc.cwd();
  const supabase = createSpawner({ runtime, cwd: targetCwd });

  await supabase.run(["start"]);

  const json = await supabase.capture(["status", "--output", "json"]);
  const status = JSON.parse(json);
  if (!status.API_URL) throw new Error("supabase status: no API_URL");
  if (!status.ANON_KEY) throw new Error("supabase status: no ANON_KEY");

  // Make the live values visible to any same-process consumer (mirrors
  // fit-map's url-discovery phase); `--emit-env` carries them across steps.
  runtime.proc.env.SUPABASE_URL = status.API_URL;
  runtime.proc.env.SUPABASE_ANON_KEY = status.ANON_KEY;

  if (emitEnv) {
    await runtime.fs.appendFile(
      emitEnv,
      `SUPABASE_URL=${status.API_URL}\nSUPABASE_ANON_KEY=${status.ANON_KEY}\n`,
    );
  }

  runtime.proc.stdout.write(formatSuccess("Substrate up") + "\n");
  return 0;
}
