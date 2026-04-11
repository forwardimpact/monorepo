/**
 * Factory for the fit-map Supabase CLI wrapper.
 *
 * `createSupabaseCli()` returns an object with a single `run(args)` method
 * that spawns the supabase CLI from the fit-map package root without
 * requiring the user to `cd` into node_modules. It resolves the invocation
 * the first time it is called and memoizes the result on instance state —
 * there are no module-level singletons.
 *
 * Resolution order:
 *   1. Bare `supabase` on PATH (Homebrew, system package, npm -g bin on PATH)
 *   2. `npx --no-install -- supabase` (npm-local install, reached via npx
 *      walking up from the fit-map package root to the consumer's node_modules)
 */

import { spawn as realSpawn } from "child_process";
import { getPackageRoot } from "./package-root.js";

const SUPABASE_INSTALL_URL =
  "https://supabase.com/docs/guides/local-development";

function probe(spawnFn, cwd, cmd, args) {
  return new Promise((resolve) => {
    const child = spawnFn(cmd, args, { cwd, stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

// Invariant: must never reject. Both failure modes — ENOENT and non-zero
// exit — are converted to `false` inside `probe`, so the returned promise
// always fulfils with either a descriptor or `null`. If this ever changes,
// a rejected cached promise would re-throw for every subsequent caller.
async function doResolve(spawnFn, cwd) {
  if (await probe(spawnFn, cwd, "supabase", ["--version"])) {
    return { cmd: "supabase", prefix: [] };
  }
  if (
    await probe(spawnFn, cwd, "npx", [
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

/**
 * Create a Supabase CLI wrapper.
 *
 * @param {object} [opts]
 * @param {typeof realSpawn} [opts.spawnFn] - Injected spawn for tests.
 * @param {string} [opts.cwd] - Working directory for every spawn. Defaults
 *   to the fit-map package root so npx walks up to the consumer's
 *   `node_modules/.bin/supabase` on the npm-local install path.
 * @returns {{
 *   run: (args: string[]) => Promise<void>,
 *   resolve: () => Promise<{cmd: string, prefix: string[]} | null>,
 * }}
 */
export function createSupabaseCli({
  spawnFn = realSpawn,
  cwd = getPackageRoot(),
} = {}) {
  let resolvedPromise = null;

  function resolve() {
    if (!resolvedPromise) resolvedPromise = doResolve(spawnFn, cwd);
    return resolvedPromise;
  }

  async function run(args) {
    const desc = await resolve();
    if (!desc) {
      throw new Error(
        "Could not find the `supabase` CLI. Install it via Homebrew " +
          "(`brew install supabase/tap/supabase`) or npm " +
          "(`npm install supabase` in this project, or `npm install -g supabase`), " +
          `then retry. See ${SUPABASE_INSTALL_URL}.`,
      );
    }

    return new Promise((res, rej) => {
      const child = spawnFn(desc.cmd, [...desc.prefix, ...args], {
        cwd,
        stdio: "inherit",
      });
      child.on("error", rej);
      child.on("exit", (code) => {
        if (code === 0) res();
        else rej(new Error(`supabase ${args.join(" ")} exited ${code}`));
      });
    });
  }

  return { run, resolve };
}
