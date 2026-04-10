import { test, describe } from "node:test";
import assert from "node:assert";
import { writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seed } from "../../bin/lib/commands/activity.js";

function createFakeSeedClient() {
  const uploads = [];
  const upsertCalls = [];

  return {
    uploads,
    upsertCalls,
    storage: {
      from(bucket) {
        assert.strictEqual(bucket, "raw");
        return {
          async upload(path, content, opts) {
            uploads.push({ path, content, contentType: opts.contentType });
            return { error: null };
          },
          async list(prefix, _opts) {
            const matching = uploads.filter((u) => u.path.startsWith(prefix));
            return {
              data: matching.map((u) => ({
                name: u.path.slice(prefix.length),
                created_at: new Date().toISOString(),
              })),
              error: null,
            };
          },
          async download(path) {
            const uploaded = uploads.find((u) => u.path === path);
            return {
              data: { text: async () => uploaded?.content || "" },
              error: null,
            };
          },
        };
      },
    },
    from(table) {
      const chain = {
        async upsert(rows, opts) {
          upsertCalls.push({ table, rows, onConflict: opts?.onConflict });
          return { error: null };
        },
        select(_cols, _opts) {
          // Support chained .order() for getOrganization query
          return {
            count: 0,
            error: null,
            order() {
              return { data: [], error: null };
            },
          };
        },
      };
      return chain;
    },
  };
}

describe("activity/seed", () => {
  let tmpDir;

  async function setupSeedDir(options = {}) {
    tmpDir = await mkdtemp(join(tmpdir(), "map-seed-"));
    const activityDir = join(tmpDir, "activity");
    await mkdir(activityDir, { recursive: true });

    await writeFile(
      join(activityDir, "roster.yaml"),
      "roster:\n  - email: a@x\n    name: A\n    discipline: se\n    level: J040\n",
    );

    if (options.withRaw !== false) {
      const githubDir = join(activityDir, "raw", "github");
      const getdxDir = join(activityDir, "raw", "getdx");
      await mkdir(githubDir, { recursive: true });
      await mkdir(getdxDir, { recursive: true });
      await writeFile(join(githubDir, "events.json"), '{"events": []}');
      await writeFile(join(getdxDir, "snapshots.yaml"), "snapshots: []");
    }

    return tmpDir;
  }

  test("uploads roster and raw files then runs transforms", async () => {
    const data = await setupSeedDir();
    const fake = createFakeSeedClient();
    await seed({ data, supabase: fake });

    const rosterUploads = fake.uploads.filter((u) =>
      u.path.startsWith("people/"),
    );
    assert.strictEqual(rosterUploads.length, 1);
    assert.strictEqual(rosterUploads[0].contentType, "text/yaml");

    const rawUploads = fake.uploads.filter(
      (u) => !u.path.startsWith("people/"),
    );
    assert.strictEqual(rawUploads.length, 2);

    // Transform ran — people were upserted
    assert.ok(fake.upsertCalls.length > 0);

    await rm(tmpDir, { recursive: true });
  });

  test("completes when raw directory is missing", async () => {
    const data = await setupSeedDir({ withRaw: false });
    const fake = createFakeSeedClient();
    await seed({ data, supabase: fake });

    assert.strictEqual(fake.uploads.length, 1);
    await rm(tmpDir, { recursive: true });
  });

  test("returns 1 when roster upload fails", async () => {
    const data = await setupSeedDir();
    const fake = createFakeSeedClient();
    fake.storage.from = () => ({
      async upload() {
        return { error: { message: "upload failed" } };
      },
      async list() {
        return { data: [], error: null };
      },
    });

    const exitCode = await seed({ data, supabase: fake });
    assert.strictEqual(exitCode, 1);

    await rm(tmpDir, { recursive: true });
  });
});
