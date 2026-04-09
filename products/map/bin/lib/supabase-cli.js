/**
 * Wraps the `supabase` CLI so fit-map can run it from the package root
 * without requiring the user to cd into node_modules. Detects a missing
 * binary and reports with a clear install link.
 */

import { spawn } from "child_process";
import { getSupabaseDir } from "./package-root.js";

const SUPABASE_INSTALL_URL =
  "https://supabase.com/docs/guides/local-development";

export async function detectSupabaseCli() {
  return new Promise((resolve) => {
    const child = spawn("supabase", ["--version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

export async function runSupabase(args, { cwd } = {}) {
  const ok = await detectSupabaseCli();
  if (!ok) {
    throw new Error(
      "The `supabase` CLI is not installed or not on your PATH. " +
        `Install it from ${SUPABASE_INSTALL_URL} and retry.`,
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn("supabase", args, {
      cwd: cwd ?? getSupabaseDir(),
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`supabase ${args.join(" ")} exited ${code}`));
    });
  });
}
