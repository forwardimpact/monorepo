import { createSupabaseCli } from "../supabase-cli.js";
import { storeRaw } from "@forwardimpact/map/activity/storage";
import { transformAll } from "@forwardimpact/map/activity/transform";
import { transformPeople } from "@forwardimpact/map/activity/transform/people";
import { transformAllGetDX } from "@forwardimpact/map/activity/transform/getdx";
import { transformAllGitHub } from "@forwardimpact/map/activity/transform/github";
import { getOrganization } from "@forwardimpact/map/activity/queries/org";
import {
  formatHeader,
  formatSubheader,
  formatSuccess,
  formatError,
  formatBullet,
  SummaryRenderer,
} from "@forwardimpact/libcli";

const summary = new SummaryRenderer({ process });

const supabaseCli = createSupabaseCli();

export async function start() {
  await supabaseCli.run(["start"]);
  process.stdout.write("\n");
  process.stdout.write(
    formatSubheader("Export these variables to use the activity layer:") +
      "\n\n",
  );
  process.stdout.write("  export MAP_SUPABASE_URL=http://127.0.0.1:54321\n");
  process.stdout.write(
    "  export MAP_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU\n\n",
  );
  return 0;
}

export async function stop() {
  await supabaseCli.run(["stop"]);
  return 0;
}

export async function status() {
  await supabaseCli.run(["status"]);
  return 0;
}

export async function migrate() {
  await supabaseCli.run(["db", "reset"]);
  return 0;
}

export async function transform(target, supabase) {
  switch (target) {
    case "people": {
      const r = await transformPeople(supabase);
      report("people", { imported: r.imported, errors: r.errors.length });
      return r.errors.length === 0 ? 0 : 1;
    }
    case "getdx": {
      const r = await transformAllGetDX(supabase);
      report("getdx", summarizeCounts(r));
      return r.errors.length === 0 ? 0 : 1;
    }
    case "github": {
      const r = await transformAllGitHub(supabase);
      report("github", summarizeCounts(r));
      return r.errors.length === 0 ? 0 : 1;
    }
    case "all":
    case undefined: {
      const r = await transformAll(supabase);
      report("people", {
        imported: r.people.imported,
        errors: r.people.errors.length,
      });
      report("getdx", summarizeCounts(r.getdx));
      report("github", summarizeCounts(r.github));
      const ok =
        r.people.errors.length === 0 &&
        r.getdx.errors.length === 0 &&
        r.github.errors.length === 0;
      return ok ? 0 : 1;
    }
    default:
      process.stderr.write(
        formatError(`Unknown transform target: ${target}`) + "\n",
      );
      return 1;
  }
}

export async function verify(supabase) {
  const people = await getOrganization(supabase);

  const { count: snapshotCount, error: snapErr } = await supabase
    .from("getdx_snapshots")
    .select("*", { count: "exact", head: true });
  if (snapErr) throw new Error(`getdx_snapshots: ${snapErr.message}`);

  const { count: eventCount, error: eventErr } = await supabase
    .from("github_events")
    .select("*", { count: "exact", head: true });
  if (eventErr) throw new Error(`github_events: ${eventErr.message}`);

  summary.render({
    title: formatHeader("Activity tables"),
    items: [
      { label: "organization_people", description: `${people.length} rows` },
      { label: "getdx_snapshots", description: `${snapshotCount ?? 0} rows` },
      { label: "github_events", description: `${eventCount ?? 0} rows` },
    ],
  });

  const hasPeople = people.length > 0;
  const hasDerived = (snapshotCount ?? 0) > 0 || (eventCount ?? 0) > 0;

  if (!hasPeople) {
    process.stderr.write("\n");
    process.stderr.write(
      formatError(
        "organization_people is empty. Run `fit-map people push <file>`.",
      ) + "\n",
    );
    return 1;
  }
  if (!hasDerived) {
    process.stderr.write("\n");
    process.stderr.write(
      formatError(
        "No derived-table rows found. Run `fit-map getdx sync` or configure the github-webhook.",
      ) + "\n",
    );
    return 1;
  }

  process.stdout.write("\n" + formatSuccess("Activity layer verified") + "\n");
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
    process.stderr.write(
      formatError(`Failed to upload roster: ${stored.error}`) + "\n",
    );
    return 1;
  }
  report("Upload roster", { stored: 1 });

  // 2. Upload raw documents (github/, getdx/ prefixes)
  const uploaded = await uploadRawDir(supabase, rawDir);
  report("Upload raw", {
    stored: uploaded.count,
    errors: uploaded.errors.length,
  });
  for (const err of uploaded.errors) {
    process.stderr.write(formatBullet(err, 1) + "\n");
  }

  // 3. Run all transforms
  const result = await transformAll(supabase);
  report("Transform people", {
    imported: result.people.imported,
    errors: result.people.errors.length,
  });
  report("Transform getdx", summarizeCounts(result.getdx));
  report("Transform github", summarizeCounts(result.github));

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
        const result = await storeRaw(
          supabase,
          storagePath,
          content,
          contentType,
        );
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

/**
 * Summarize a transform result into label/description pairs, dropping the
 * errors array so numeric fields can be rendered individually.
 * @param {object} counts
 * @returns {object}
 */
function summarizeCounts(counts) {
  const out = {};
  for (const [key, value] of Object.entries(counts)) {
    if (key === "errors") {
      out.errors = Array.isArray(value) ? value.length : value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Render a labeled transform report using the SummaryRenderer.
 * @param {string} target
 * @param {object} counts
 */
function report(target, counts) {
  summary.render({
    title: formatSubheader(target),
    items: Object.entries(counts).map(([label, value]) => ({
      label,
      description: String(value),
    })),
  });
  process.stdout.write("\n");
}
