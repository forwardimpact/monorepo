import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOTS = [
  join(__dirname, "..", "..", "src"),
  join(__dirname, "..", "..", "bin"),
];

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

async function grepRoots(pattern) {
  const hits = [];
  for (const root of ROOTS) {
    for await (const file of walk(root)) {
      const body = await readFile(file, "utf8");
      if (pattern.test(body)) hits.push(file);
    }
  }
  return hits;
}

describe("Landmark src/ + bin/ — service-role boundary (criterion 3a)", () => {
  it("contains no MAP_SUPABASE_SERVICE_ROLE_KEY reference", async () => {
    const hits = await grepRoots(/MAP_SUPABASE_SERVICE_ROLE_KEY/);
    assert.deepEqual(
      hits,
      [],
      `service-role key leaked into Landmark code paths: ${hits.join(", ")}`,
    );
  });

  it("contains no auth.admin. call (mirror of criterion 10's grep)", async () => {
    const hits = await grepRoots(/auth\.admin\./);
    assert.deepEqual(
      hits,
      [],
      `auth-admin API leaked into Landmark code paths: ${hits.join(", ")}`,
    );
  });

  it("does not import anything from a /test/ path (no test-only helper in production)", async () => {
    // Covers `import x from ".../test/..."`, `import(".../test/...")` and
    // `require(".../test/...")` — three routes a developer could use to
    // pull a test helper into the production code path.
    const hits = await grepRoots(
      /(?:from\s+|import\(\s*|require\(\s*)["'][^"']*\/test\//,
    );
    assert.deepEqual(
      hits,
      [],
      `Landmark production code imports a test helper: ${hits.join(", ")}`,
    );
  });
});
