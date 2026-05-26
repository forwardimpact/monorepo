#!/usr/bin/env bun
import {
  generateBase64Secret,
  generateSecret,
  getOrGenerateSecret,
  mintSupabaseAnonKey,
  mintSupabaseServiceRoleKey,
  updateEnvFile,
} from "@forwardimpact/libsecret";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

/**
 * Unified bootstrap script.
 *
 * Generates every secret previously split between scripts/env-secrets.js
 * and scripts/env-storage.js. All values land in a single .env. Re-runs
 * are idempotent: every value written by the first run is preserved
 * verbatim by the second.
 *
 * To rotate a single value, delete its line from .env and re-run.
 * To rotate SUPABASE_JWT_SECRET, also delete SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY so they re-mint against the new secret.
 *
 * Usage:
 *   env-setup.js                             # Updates .env
 *   env-setup.js --output $PATH              # Writes key=value pairs to file
 *   env-setup.js --add-mask --output $PATH   # Prints ::add-mask:: per value
 */
async function main() {
  const { values } = parseArgs({
    options: {
      output: { type: "string" },
      "add-mask": { type: "boolean", default: false },
    },
  });

  const get = (key, gen) => getOrGenerateSecret(key, gen);

  // Generate / read the Supabase JWT secret first; the anon and
  // service-role keys are HMAC-signed against it.
  const supabaseJwtSecret = await get("SUPABASE_JWT_SECRET", () =>
    generateSecret(32),
  );

  const entries = [
    ["SERVICE_SECRET", await get("SERVICE_SECRET", () => generateSecret())],
    [
      "DATABASE_PASSWORD",
      await get("DATABASE_PASSWORD", () => generateSecret(16)),
    ],
    ["MCP_TOKEN", await get("MCP_TOKEN", () => generateSecret())],
    ["SUPABASE_JWT_SECRET", supabaseJwtSecret],
    [
      "SUPABASE_ANON_KEY",
      await get("SUPABASE_ANON_KEY", () =>
        mintSupabaseAnonKey({ secret: supabaseJwtSecret }),
      ),
    ],
    [
      "SUPABASE_SERVICE_ROLE_KEY",
      await get("SUPABASE_SERVICE_ROLE_KEY", () =>
        mintSupabaseServiceRoleKey({ secret: supabaseJwtSecret }),
      ),
    ],
    [
      "AWS_ACCESS_KEY_ID",
      await get("AWS_ACCESS_KEY_ID", () => generateBase64Secret(16)),
    ],
    [
      "AWS_SECRET_ACCESS_KEY",
      await get("AWS_SECRET_ACCESS_KEY", () => generateBase64Secret(32)),
    ],
  ];

  if (values.output) {
    const content =
      entries.map(([k, v]) => `${k.toLowerCase()}=${v}`).join("\n") + "\n";
    await writeFile(values.output, content);
    if (values["add-mask"]) {
      for (const [, v] of entries) console.log(`::add-mask::${v}`);
    }
    return;
  }

  for (const [k, v] of entries) await updateEnvFile(k, v);
  for (const [k] of entries) console.log(`${k} is set in .env`);
}

main();
