import { runSupabase } from "../supabase-cli.js";
import { storeRaw } from "@forwardimpact/map/activity/storage";
import { transformAll } from "@forwardimpact/map/activity/transform";
import { transformPeople } from "@forwardimpact/map/activity/transform/people";
import { transformAllGetDX } from "@forwardimpact/map/activity/transform/getdx";
import { transformAllGitHub } from "@forwardimpact/map/activity/transform/github";
import { getOrganization } from "@forwardimpact/map/activity/queries/org";

export async function start() {
  await runSupabase(["start"]);
  console.log(`
Export these variables to use the activity layer:

  export MAP_SUPABASE_URL=http://127.0.0.1:54321
  export MAP_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
`);
  return 0;
}

export async function stop() {
  await runSupabase(["stop"]);
  return 0;
}

export async function status() {
  await runSupabase(["status"]);
  return 0;
}

export async function migrate() {
  await runSupabase(["db", "reset"]);
  return 0;
}

export async function transform(target, supabase) {
  switch (target) {
    case "people": {
      const r = await transformPeople(supabase);
      report("people", { imported: r.imported, errors: r.errors });
      return r.errors.length === 0 ? 0 : 1;
    }
    case "getdx": {
      const r = await transformAllGetDX(supabase);
      report("getdx", r);
      return r.errors.length === 0 ? 0 : 1;
    }
    case "github": {
      const r = await transformAllGitHub(supabase);
      report("github", r);
      return r.errors.length === 0 ? 0 : 1;
    }
    case "all":
    case undefined: {
      const r = await transformAll(supabase);
      report("all", r);
      const ok =
        r.people.errors.length === 0 &&
        r.getdx.errors.length === 0 &&
        r.github.errors.length === 0;
      return ok ? 0 : 1;
    }
    default:
      console.error(`Unknown transform target: ${target}`);
      return 1;
  }
}

export async function verify(supabase) {
  const people = await getOrganization(supabase);
  console.log(`  organization_people: ${people.length} rows`);

  const { count: snapshotCount, error: snapErr } = await supabase
    .from("getdx_snapshots")
    .select("*", { count: "exact", head: true });
  if (snapErr) throw new Error(`getdx_snapshots: ${snapErr.message}`);
  console.log(`  getdx_snapshots:     ${snapshotCount ?? 0} rows`);

  const { count: eventCount, error: eventErr } = await supabase
    .from("github_events")
    .select("*", { count: "exact", head: true });
  if (eventErr) throw new Error(`github_events: ${eventErr.message}`);
  console.log(`  github_events:       ${eventCount ?? 0} rows`);

  const hasPeople = people.length > 0;
  const hasDerived = (snapshotCount ?? 0) > 0 || (eventCount ?? 0) > 0;

  if (!hasPeople) {
    console.error(
      "\norganization_people is empty. Run `fit-map people push <file>`.",
    );
    return 1;
  }
  if (!hasDerived) {
    console.error(
      "\nNo derived-table rows found. Run `fit-map getdx sync` or " +
        "configure the github-webhook.",
    );
    return 1;
  }

  console.log("\nActivity layer verified");
  return 0;
}

/**
 * Seed the activity database from synthetic data.
 * @param {object} options
 * @param {string} options.data - Path to data directory
 * @param {import('@supabase/supabase-js').SupabaseClient} options.supabase
 * @returns {Promise<number>} exit code
 */
export async function seed({ data, supabase }) {
  const { readFile } = await import("fs/promises");
  const { join } = await import("path");

  const activityDir = join(data, "activity");
  const rawDir = join(activityDir, "raw");

  // 1. Upload roster to Supabase Storage (people/ prefix)
  const rosterPath = join(activityDir, "roster.yaml");
  const rosterContent = await readFile(rosterPath, "utf-8");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const stored = await storeRaw(
    supabase,
    `people/${timestamp}.yaml`,
    rosterContent,
    "text/yaml",
  );
  if (!stored.stored) {
    console.error(`Failed to upload roster: ${stored.error}`);
    return 1;
  }
  report("Upload roster", { stored: 1 });

  // 2. Upload raw documents (github/, getdx/ prefixes)
  const uploaded = await uploadRawDir(supabase, rawDir);
  report("Upload raw", {
    stored: uploaded.count,
    errors: uploaded.errors.length,
  });
  for (const err of uploaded.errors) console.error(`  ${err}`);

  // 3. Run all transforms
  const result = await transformAll(supabase);
  report("Transform people", result.people);
  report("Transform getdx", result.getdx);
  report("Transform github", result.github);

  // 4. Verify
  return verify(supabase);
}

async function uploadRawDir(supabase, rawDir) {
  const { readFile, readdir } = await import("fs/promises");
  const { join, relative } = await import("path");

  const errors = [];
  let count = 0;

  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // directory doesn't exist — skip silently
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        const storagePath = relative(rawDir, fullPath);
        const content = await readFile(fullPath, "utf-8");
        const contentType =
          fullPath.endsWith(".yaml") || fullPath.endsWith(".yml")
            ? "text/yaml"
            : "application/json";
        const result = await storeRaw(supabase, storagePath, content, contentType);
        if (result.stored) {
          count++;
        } else {
          errors.push(`${storagePath}: ${result.error}`);
        }
      }
    }
  }

  await walk(rawDir);
  return { count, errors };
}

function report(target, counts) {
  console.log(`Transform ${target}:`, JSON.stringify(counts, null, 2));
}
