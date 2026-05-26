/**
 * Static-inspection guard for the ingestion service-role credential.
 *
 * Map's ingestion code path keeps the service-role credential — this test
 * locks the property in so a future refactor does not silently migrate
 * ingestion to the anon-keyed client and break the write path.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = join(__dirname, "..", "..", "src");

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.(m?js|cjs|ts)$/.test(entry.name)) {
      yield full;
    }
  }
}

describe("Map ingestion retains the service-role write-path credential", () => {
  test("at least one src/ file calls config.supabaseServiceRoleKey()", async () => {
    let hits = 0;
    for await (const file of walk(SRC_ROOT)) {
      const body = await readFile(file, "utf8");
      if (body.includes("supabaseServiceRoleKey")) hits += 1;
    }
    assert.ok(
      hits >= 1,
      "Map ingestion must keep at least one call to config.supabaseServiceRoleKey() — the write-path credential. " +
        "Found zero references; ingestion may have been silently migrated to the anon-keyed client.",
    );
  });
});
