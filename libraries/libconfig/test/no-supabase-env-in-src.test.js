import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");

// Permanent exemptions for per-module injection seams and the three setup
// paths. Do not add entries without a corresponding design-doc note.
const ALLOW = new Set([
  // libstorage: libconfig depends on libstorage; threading Config would cycle.
  "libraries/libstorage/src/index.js",
  // substrate-stage: discovers SUPABASE_URL/SUPABASE_ANON_KEY from the local
  // stack after `supabase start` (only known post-bring-up). The values must
  // propagate to in-process createMapClient (libconfig #env() reads
  // process.env first); cross-step propagation is via $GITHUB_ENV in the
  // workflow.
  "products/map/src/commands/substrate-stage.js",
]);

// Walks one directory tree (src/ or bin/ or a flat services entry) and yields
// every .js/.mjs/.cjs/.ts file under it. Excludes test/ and node_modules/.
async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "test" || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.(m?js|cjs|ts)$/.test(entry.name)) {
      const rel = full.slice(REPO_ROOT.length + 1);
      if (ALLOW.has(rel)) continue;
      yield full;
    }
  }
}

async function listSubdirs(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory());
  } catch {
    return [];
  }
}

async function* walkGroup(group) {
  for (const entry of await listSubdirs(join(REPO_ROOT, group))) {
    for (const sub of ["src", "bin"]) {
      yield* walk(join(REPO_ROOT, group, entry.name, sub));
    }
  }
}

async function* walkServices() {
  for (const entry of await listSubdirs(join(REPO_ROOT, "services"))) {
    yield* walk(join(REPO_ROOT, "services", entry.name));
  }
}

// Discover every src/ and bin/ under products/ and libraries/, plus every
// flat .js under services/<name>/ (services do not nest src/).
async function* productionFiles() {
  yield* walkGroup("products");
  yield* walkGroup("libraries");
  yield* walkServices();
}

// Catches every legacy-shim form forbidden by the no-direct-env invariant:
// canonical process.env.SUPABASE_* (the migration must flow through Config),
// legacy process.env.MAP_SUPABASE_*, and standalone process.env.JWT_SECRET.
// Matches both dot-access (`process.env.SUPABASE_URL`) and bracket-access
// (`process.env["SUPABASE_URL"]`) so a future contributor cannot bypass the
// gate via the bracket idiom.
const FORBIDDEN =
  /process\.env(?:\.|\[["']?)(MAP_SUPABASE_|SUPABASE_|JWT_SECRET\b)/;

describe("no direct Supabase env reads in src/bin", () => {
  test("no process.env.SUPABASE_, MAP_SUPABASE_, or JWT_SECRET literals", async () => {
    const hits = [];
    for await (const file of productionFiles()) {
      const body = await readFile(file, "utf8");
      if (FORBIDDEN.test(body)) hits.push(file);
    }
    assert.deepEqual(
      hits,
      [],
      `Direct Supabase env reads found: ${hits.join(", ")}`,
    );
  });
});
