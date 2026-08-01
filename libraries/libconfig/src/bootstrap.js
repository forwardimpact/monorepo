import path from "node:path";
import { readEnvFile, updateEnvFile } from "@forwardimpact/libsecret";

import { mergeConfigFragment, mergeEnvEntries } from "./merge.js";
import { bootstrapRefusal } from "./errors.js";

/**
 * Bootstrap a Forward Impact product directory.
 *
 * Always writes `target/config/config.json`. Writes `target/.env` when the
 * caller supplies at least one entry. Both writes follow namespace-scoped
 * ownership semantics. A same-key-different-value write refuses by default
 * with `bootstrapRefusal`. Pass `overwrites.config` (top-level keys) or
 * `overwrites.env` (bare keys) to opt in.
 *
 * This function classifies both surfaces before it changes the filesystem,
 * so a refused write never leaves a half-written `config.json` on disk.
 * Cross-file atomicity between `config.json` and `.env` mid-write remains
 * deferred (spec § *Out of scope*).
 *
 * @param {object} params
 * @param {string} [params.target]   Absolute path. Defaults to `runtime.proc.cwd()`.
 * @param {object} [params.fragment] Top-level keys are product-owned
 *   namespaces. Pass `{}` or omit the parameter.
 * @param {Record<string,string>} [params.env] `.env` entries the product
 *   wants on disk. Pass `{}` or omit the parameter.
 * @param {{ config?: string[], env?: string[] }} [params.overwrites]
 *   Explicit overwrite intent, with one list per file. `config` entries are
 *   top-level namespace names (single segment). `env` entries are bare keys.
 * @param {{ runtime?: import("@forwardimpact/libutil/runtime").Runtime }} [params.deps]
 *   Injected collaborators. All filesystem I/O uses `runtime.fs`.
 *   `runtime.proc.cwd()` resolves the default `target`. When you omit this
 *   parameter, the function uses the production runtime (backward-compatible).
 * @returns {Promise<void>}
 */
export async function bootstrapProject({
  target,
  fragment = {},
  env = {},
  overwrites = {},
  deps,
} = {}) {
  const runtime = deps?.runtime;
  if (!runtime) throw new Error("deps.runtime is required");
  const { fs, proc } = runtime;
  const resolvedTarget = target ?? proc.cwd();

  const configDir = path.join(resolvedTarget, "config");
  const configPath = path.join(configDir, "config.json");
  const envPath = path.join(resolvedTarget, ".env");

  const existingConfig = await readJsonOrEmpty(fs, configPath);
  const existingEnv = await readEnvSubset(Object.keys(env), envPath, runtime);

  const cfg = mergeConfigFragment({
    existing: existingConfig,
    fragment,
    overwrites: overwrites.config ?? [],
  });
  const ev = mergeEnvEntries({
    existing: existingEnv,
    fragment: env,
    overwrites: overwrites.env ?? [],
  });
  // Config conflicts take precedence over env conflicts so stderr
  // diagnostics surface deterministically regardless of the input order.
  const conflicts = [...cfg.conflicts, ...ev.conflicts];
  if (conflicts.length > 0) throw bootstrapRefusal(conflicts[0]);

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(cfg.result, null, 2) + "\n");

  // Iterate the input `env`. Do not iterate `ev.result`. In updateEnvFile a
  // same-key-same-value write is an idempotent line rewrite (the line
  // content is unchanged). The per-call chmod 0o600 in updateEnvFile
  // re-enforces mode 0o600 on every call. The spec's `.env` mode criterion
  // needs that chmod to survive a pre-existing .env with mode 0o644. This
  // function computes the merged `ev.result` for classification only.
  for (const [key, value] of Object.entries(env)) {
    await updateEnvFile(key, value, envPath, runtime);
  }
}

async function readJsonOrEmpty(fs, filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

async function readEnvSubset(keys, envPath, runtime) {
  const out = {};
  for (const key of keys) {
    const value = await readEnvFile(key, envPath, runtime);
    if (value !== undefined) out[key] = value;
  }
  return out;
}
