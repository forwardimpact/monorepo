import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
 * @param {string} [params.target]   Absolute path; defaults to `process.cwd()`.
 * @param {object} [params.fragment] Top-level keys are product-owned
 *   namespaces; may be `{}` or omitted.
 * @param {Record<string,string>} [params.env] `.env` entries the product
 *   wants written; may be `{}` or omitted.
 * @param {{ config?: string[], env?: string[] }} [params.overwrites]
 *   Explicit overwrite intent, partitioned per file. `config` entries are
 *   top-level namespace names (single segment); `env` entries are bare keys.
 * @returns {Promise<void>}
 */
export async function bootstrapProject({
  target = process.cwd(),
  fragment = {},
  env = {},
  overwrites = {},
} = {}) {
  const configDir = path.join(target, "config");
  const configPath = path.join(configDir, "config.json");
  const envPath = path.join(target, ".env");

  const existingConfig = await readJsonOrEmpty(configPath);
  const existingEnv = await readEnvSubset(Object.keys(env), envPath);

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

  await mkdir(configDir, { recursive: true });
  await writeFile(configPath, JSON.stringify(cfg.result, null, 2) + "\n");

  // Iterate the input `env`, not `ev.result`. Same-key-same-value writes are
  // idempotent line rewrites in updateEnvFile (the line content is unchanged),
  // and updateEnvFile's per-call chmod 0o600 is the mechanism that re-enforces
  // mode 0o600 on every invocation — required for the spec's `.env` mode
  // criterion to survive a pre-existing .env with mode 0o644. The merged
  // `ev.result` is computed for classification only.
  for (const [key, value] of Object.entries(env)) {
    await updateEnvFile(key, value, envPath);
  }
}

async function readJsonOrEmpty(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

async function readEnvSubset(keys, envPath) {
  const out = {};
  for (const key of keys) {
    const value = await readEnvFile(key, envPath);
    if (value !== undefined) out[key] = value;
  }
  return out;
}
