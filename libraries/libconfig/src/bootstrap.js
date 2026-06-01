import path from "node:path";
import { readEnvFile, updateEnvFile } from "@forwardimpact/libsecret";

import { mergeConfigFragment, mergeEnvEntries } from "./merge.js";
import { bootstrapRefusal } from "./errors.js";

/**
 * Bootstrap a Forward Impact product directory.
 *
 * Materialises `target/config/config.json` (always) and `target/.env`
 * (when at least one entry is supplied), under namespace-scoped ownership
 * semantics. A same-key-different-value write refuses by default with
 * `bootstrapRefusal`; pass `overwrites.config` (top-level keys) or
 * `overwrites.env` (bare keys) to opt in.
 *
 * Both surfaces are classified before any filesystem mutation, so a refused
 * write never leaves a half-written `config.json` on disk. Cross-file
 * atomicity between `config.json` and `.env` mid-write remains deferred
 * (spec § *Out of scope*).
 *
 * @param {object} params
 * @param {string} [params.target]   Absolute path; defaults to `runtime.proc.cwd()`.
 * @param {object} [params.fragment] Top-level keys are product-owned
 *   namespaces; may be `{}` or omitted.
 * @param {Record<string,string>} [params.env] `.env` entries the product
 *   wants written; may be `{}` or omitted.
 * @param {{ config?: string[], env?: string[] }} [params.overwrites]
 *   Explicit overwrite intent, partitioned per file. `config` entries are
 *   top-level namespace names (single segment); `env` entries are bare keys.
 * @param {{ runtime?: import("@forwardimpact/libutil/runtime").Runtime }} [params.deps]
 *   Injected collaborators. `runtime.fs` is used for all filesystem I/O;
 *   `runtime.proc.cwd()` resolves the default `target`. When omitted the
 *   production runtime is used (backward-compatible).
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
  // diagnostics surface deterministically regardless of input ordering.
  const conflicts = [...cfg.conflicts, ...ev.conflicts];
  if (conflicts.length > 0) throw bootstrapRefusal(conflicts[0]);

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(cfg.result, null, 2) + "\n");

  // Iterate the input `env`, not `ev.result`. Same-key-same-value writes are
  // idempotent line rewrites in updateEnvFile (the line content is unchanged),
  // and updateEnvFile's per-call chmod 0o600 is the mechanism that re-enforces
  // mode 0o600 on every invocation — required for the spec's `.env` mode
  // criterion to survive a pre-existing .env with mode 0o644. The merged
  // `ev.result` is computed for classification only.
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
