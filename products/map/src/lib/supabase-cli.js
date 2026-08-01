/**
 * Factory for the fit-map Supabase CLI wrapper.
 *
 * `createSupabaseCli({ runtime })` returns an object with `run(args)` and
 * `capture(args)` methods. They invoke the supabase CLI from the fit-map
 * package root. The user does not need to `cd` into node_modules. The
 * object resolves the invocation on the first call. It then memoizes the
 * result on instance state. There are no module-level singletons.
 *
 * Resolution order:
 *   1. Bare `supabase` on PATH (Homebrew, system package, npm -g bin on PATH)
 *   2. `npx --no-install -- supabase` (npm-local install, reached when npx
 *      walks up from the fit-map package root to the consumer's node_modules)
 *
 * All process invocation goes through the injected `runtime.subprocess`
 * surface. `run` is buffered and resolves with `exitCode`. It drives the
 * probe and the captured-output path. `spawn` with inherited stdio drives
 * the interactive path. So the progress from `supabase start` and
 * `db reset` streams to the operator's terminal unchanged.
 */

import { getPackageRoot } from "./package-root.js";

const SUPABASE_INSTALL_URL =
  "https://supabase.com/docs/guides/local-development";

/**
 * Probe a candidate invocation. `runtime.subprocess.run` resolves and never
 * rejects. An absent binary surfaces as `exitCode` 127. A probe that fails
 * surfaces as any non-zero exit. Both map to `false` (design Decision
 * lesson 3).
 */
async function probe(runtime, cwd, cmd, args) {
  const r = await runtime.subprocess.run(cmd, args, { cwd });
  return r.exitCode === 0;
}

async function doResolve(runtime, cwd) {
  if (await probe(runtime, cwd, "supabase", ["--version"])) {
    return { cmd: "supabase", prefix: [] };
  }
  if (
    await probe(runtime, cwd, "npx", [
      "--no-install",
      "--",
      "supabase",
      "--version",
    ])
  ) {
    return { cmd: "npx", prefix: ["--no-install", "--", "supabase"] };
  }
  return null;
}

function missingCliError() {
  return new Error(
    "Could not find the `supabase` CLI on PATH. Install it with Homebrew " +
      "(`brew install supabase/tap/supabase`), npm " +
      "(`npm install supabase` in this project, or `npm install -g supabase`), " +
      "or bun (`bun install -g supabase`, and make sure the bun global bin " +
      "directory is on PATH). Verify the install with `which supabase`. " +
      `See ${SUPABASE_INSTALL_URL}.`,
  );
}

/**
 * Create a Supabase CLI wrapper.
 *
 * @param {object} opts
 * @param {import('@forwardimpact/libutil/runtime').Runtime} opts.runtime - Injected collaborators (subprocess).
 * @param {string} [opts.cwd] - Working directory for every invocation.
 *   Defaults to the fit-map package root so npx walks up to the consumer's
 *   `node_modules/.bin/supabase` on the npm-local install path.
 * @returns {{
 *   run: (args: string[]) => Promise<void>,
 *   capture: (args: string[]) => Promise<string>,
 *   resolve: () => Promise<{cmd: string, prefix: string[]} | null>,
 * }}
 */
export function createSupabaseCli({ runtime, cwd = getPackageRoot() } = {}) {
  if (!runtime?.subprocess) {
    throw new Error("createSupabaseCli requires runtime.subprocess");
  }
  let resolvedPromise = null;

  function resolve() {
    if (!resolvedPromise) resolvedPromise = doResolve(runtime, cwd);
    return resolvedPromise;
  }

  async function run(args) {
    const desc = await resolve();
    if (!desc) throw missingCliError();
    // Interactive path: inherit stdio so the operator sees live progress.
    const child = runtime.subprocess.spawn(
      desc.cmd,
      [...desc.prefix, ...args],
      { cwd, stdio: "inherit" },
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

  return { run, capture, resolve };
}
