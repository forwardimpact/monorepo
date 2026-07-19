import { isoTimestamp } from "@forwardimpact/libutil";
import { createSupabaseCli } from "../lib/supabase-cli.js";
import { storeRaw } from "@forwardimpact/map/activity/storage";
import { transformAll } from "@forwardimpact/map/activity/transform";
import { transformPeople } from "@forwardimpact/map/activity/transform/people";
import { transformAllGetDX } from "@forwardimpact/map/activity/transform/getdx";
import { transformAllGitHub } from "@forwardimpact/map/activity/transform/github";
import { transformEvidence } from "@forwardimpact/map/activity/transform/evidence";
import { transformEvidenceArtifact } from "@forwardimpact/map/activity/transform/evidence-artifact";
import { getOrganization } from "@forwardimpact/map/activity/queries/org";
import { assertSeededLevelsCovered } from "../lib/roster-levels.js";
import {
  formatHeader,
  formatSubheader,
  formatSuccess,
  formatError,
  formatBullet,
  SummaryRenderer,
} from "@forwardimpact/libcli";

/**
 * Build a SummaryRenderer bound to the injected process surface.
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime
 */
function makeSummary(runtime) {
  return new SummaryRenderer({ process: runtime.proc });
}

/** Start the local Supabase instance and print a one-line confirmation. */
export async function start({ cli, runtime, out = runtime.proc.stdout } = {}) {
  cli = cli ?? createSupabaseCli({ runtime });
  await cli.run(["start"]);
  const json = await cli.capture(["status", "--output", "json"]);
  const status = JSON.parse(json);
  out.write("\n" + formatSuccess(`Supabase ready at ${status.API_URL}`) + "\n");
  return 0;
}

/** Stop the local Supabase instance. */
export async function stop({ runtime } = {}) {
  await createSupabaseCli({ runtime }).run(["stop"]);
  return 0;
}

/** Print the current status of the local Supabase instance. */
export async function status({ runtime } = {}) {
  await createSupabaseCli({ runtime }).run(["status"]);
  return 0;
}

/**
 * Write the standard-data bundle the hosted Edge Functions read.
 * @param {{ runtime: object, mapData: object, outPath: string }} args
 */
export async function bundleStandardData({ runtime, mapData, outPath }) {
  await runtime.fs.writeFile(outPath, JSON.stringify(mapData, null, 2));
  return 0;
}

/** Reset the local Supabase database by re-applying all migrations. */
export async function migrate({ runtime } = {}) {
  await createSupabaseCli({ runtime }).run(["db", "reset"]);
  return 0;
}

const TRANSFORM_TARGETS = {
  people: {
    fn: transformPeople,
    summarize: (r) => ({ imported: r.imported, errors: r.errors.length }),
  },
  getdx: { fn: transformAllGetDX, summarize: summarizeCounts },
  github: { fn: transformAllGitHub, summarize: summarizeCounts },
  evidence: {
    fn: transformEvidence,
    summarize: (r) => ({
      inserted: r.inserted,
      skipped: r.skipped,
      errors: r.errors.length,
    }),
  },
  "evidence-artifact": {
    fn: (supabase, runtime, deps) =>
      transformEvidenceArtifact(supabase, { mapData: deps?.mapData }),
    summarize: (r) => ({
      inserted: r.inserted,
      skipped: r.skipped,
      errors: r.errors.length,
    }),
  },
};

async function transformAllTargets(supabase, runtime, { mapData } = {}) {
  const summary = makeSummary(runtime);
  const r = await transformAll(supabase, runtime, { mapData });
  report(
    summary,
    "people",
    { imported: r.people.imported, errors: r.people.errors.length },
    r.people.errors.length === 0,
  );
  report(
    summary,
    "getdx",
    summarizeCounts(r.getdx),
    r.getdx.errors.length === 0,
  );
  report(
    summary,
    "github",
    summarizeCounts(r.github),
    r.github.errors.length === 0,
  );
  report(
    summary,
    "evidence-artifact",
    {
      inserted: r.evidenceArtifact.inserted,
      skipped: r.evidenceArtifact.skipped,
      errors: r.evidenceArtifact.errors.length,
    },
    r.evidenceArtifact.errors.length === 0,
  );
  report(
    summary,
    "evidence",
    {
      inserted: r.evidence.inserted,
      skipped: r.evidence.skipped,
      errors: r.evidence.errors.length,
    },
    r.evidence.errors.length === 0,
  );
  const totalErrors =
    r.people.errors.length +
    r.getdx.errors.length +
    r.github.errors.length +
    r.evidenceArtifact.errors.length +
    r.evidence.errors.length;
  return totalErrors === 0 ? 0 : 1;
}

/** Run the named transform target (or all targets) against raw activity data. */
export async function transform(target, supabase, runtime, { mapData } = {}) {
  if (target === "all" || target === undefined) {
    return transformAllTargets(supabase, runtime, { mapData });
  }
  const cfg = TRANSFORM_TARGETS[target];
  if (!cfg) {
    runtime.proc.stderr.write(
      formatError(`Unknown transform target: ${target}`) + "\n",
    );
    return 1;
  }
  const r = await cfg.fn(supabase, runtime, { mapData });
  report(makeSummary(runtime), target, cfg.summarize(r), r.errors.length === 0);
  return r.errors.length === 0 ? 0 : 1;
}

async function countRows(supabase, table) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

/** Report per-table row counts for all activity tables and exit non-zero if the people roster or all derived-data tables (getdx_snapshots, github_events) are empty. */
export async function verify(supabase, runtime) {
  const summary = makeSummary(runtime);
  const people = await getOrganization(supabase);
  const snapshotCount = await countRows(supabase, "getdx_snapshots");
  const eventCount = await countRows(supabase, "github_events");
  const evidenceCount = await countRows(supabase, "evidence");
  const commentCount = await countRows(supabase, "getdx_snapshot_comments");

  const hasPeople = people.length > 0;
  const hasDerived = snapshotCount > 0 || eventCount > 0;

  summary.render({
    title: formatHeader("Activity tables"),
    ok: hasPeople && hasDerived,
    items: [
      { label: "organization_people", description: `${people.length} rows` },
      { label: "getdx_snapshots", description: `${snapshotCount} rows` },
      { label: "github_events", description: `${eventCount} rows` },
      { label: "evidence", description: `${evidenceCount} rows` },
      {
        label: "getdx_snapshot_comments",
        description: `${commentCount} rows`,
      },
    ],
  });

  if (!hasPeople) {
    runtime.proc.stderr.write("\n");
    runtime.proc.stderr.write(
      formatError(
        "organization_people is empty. Run `fit-map people push <file>`.",
      ) + "\n",
    );
    return 1;
  }
  if (!hasDerived) {
    runtime.proc.stderr.write("\n");
    runtime.proc.stderr.write(
      formatError(
        "No derived-table rows found. Run `fit-map getdx sync` or configure the github-webhook.",
      ) + "\n",
    );
    return 1;
  }

  runtime.proc.stdout.write(
    "\n" + formatSuccess("Activity layer verified") + "\n",
  );
  return 0;
}

/**
 * Seed the activity database from synthetic data.
 * @param {object} options
 * @param {string} options.data - Path to data directory
 * @param {import('@supabase/supabase-js').SupabaseClient} options.supabase
 * @param {import('@forwardimpact/libutil/runtime').Runtime} options.runtime - Injected collaborators (fs, clock).
 * @param {object} [options.mapData] - Standard data for the artifact-driven
 *   evidence producer; when omitted, that producer is skipped.
 * @returns {Promise<number>} exit code
 */
export async function seed({ data, supabase, runtime, mapData }) {
  const { join } = await import("path");
  const summary = makeSummary(runtime);

  const activityDir = join(data, "activity");
  const rawDir = join(activityDir, "raw");

  // 1. Upload roster to Supabase Storage (people/ prefix)
  const rosterPath = join(activityDir, "roster.yaml");
  const rosterContent = await runtime.fs.readFile(rosterPath, "utf-8");
  const timestamp = isoTimestamp(runtime.clock.now()).replace(/[:.]/g, "-");
  const stored = await storeRaw(
    supabase,
    `people/${timestamp}.yaml`,
    rosterContent,
    "text/yaml",
  );
  if (!stored.stored) {
    runtime.proc.stderr.write(
      formatError(`Failed to upload roster: ${stored.error}`) + "\n",
    );
    return 1;
  }
  report(summary, "Upload roster", { stored: 1 }, true);

  // 2. Upload raw documents (github/, getdx/ prefixes)
  const uploaded = await uploadRawDir(supabase, rawDir, runtime);
  report(
    summary,
    "Upload raw",
    { stored: uploaded.count, errors: uploaded.errors.length },
    uploaded.errors.length === 0,
  );
  for (const err of uploaded.errors) {
    runtime.proc.stderr.write(formatBullet(err, 1) + "\n");
  }

  // 3. Run all transforms
  const result = await transformAll(supabase, runtime, { mapData });
  report(
    summary,
    "Transform people",
    { imported: result.people.imported, errors: result.people.errors.length },
    result.people.errors.length === 0,
  );
  report(
    summary,
    "Transform getdx",
    summarizeCounts(result.getdx),
    result.getdx.errors.length === 0,
  );
  report(
    summary,
    "Transform github",
    summarizeCounts(result.github),
    result.github.errors.length === 0,
  );
  report(
    summary,
    "Transform evidence-artifact",
    {
      inserted: result.evidenceArtifact.inserted,
      skipped: result.evidenceArtifact.skipped,
      errors: result.evidenceArtifact.errors.length,
    },
    result.evidenceArtifact.errors.length === 0,
  );
  report(
    summary,
    "Transform evidence",
    {
      inserted: result.evidence.inserted,
      skipped: result.evidence.skipped,
      errors: result.evidence.errors.length,
    },
    result.evidence.errors.length === 0,
  );

  // 4. Enforce the seeding invariant: every seeded level exists in the
  // installed standard (skipped when no standard is installed).
  await assertSeededLevelsCovered({
    supabase,
    pathwayDir: join(data, "pathway"),
    runtime,
  });

  // 5. Verify
  return verify(supabase, runtime);
}

function detectContentType(filePath) {
  return filePath.endsWith(".yaml") || filePath.endsWith(".yml")
    ? "text/yaml"
    : "application/json";
}

async function uploadFile(supabase, runtime, rawDir, fullPath, relative) {
  const storagePath = relative(rawDir, fullPath);
  const content = await runtime.fs.readFile(fullPath, "utf-8");
  const result = await storeRaw(
    supabase,
    storagePath,
    content,
    detectContentType(fullPath),
  );
  return { storagePath, stored: result.stored, error: result.error };
}

async function walkAndCollect(runtime, join, dir) {
  let entries;
  try {
    entries = await runtime.fs.readdir(dir, { withFileTypes: true });
  } catch {
    return []; // directory doesn't exist — skip silently
  }
  const filePaths = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      filePaths.push(...(await walkAndCollect(runtime, join, fullPath)));
    } else {
      filePaths.push(fullPath);
    }
  }
  return filePaths;
}

async function uploadRawDir(supabase, rawDir, runtime) {
  const { join, relative } = await import("path");

  const errors = [];
  let count = 0;

  const filePaths = await walkAndCollect(runtime, join, rawDir);
  for (const fullPath of filePaths) {
    const result = await uploadFile(
      supabase,
      runtime,
      rawDir,
      fullPath,
      relative,
    );
    if (result.stored) {
      count++;
    } else {
      errors.push(`${result.storagePath}: ${result.error}`);
    }
  }

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
 * @param {SummaryRenderer} summary
 * @param {string} target
 * @param {object} counts
 * @param {boolean} ok
 */
function report(summary, target, counts, ok) {
  summary.render({
    title: formatSubheader(target),
    ok,
    items: Object.entries(counts).map(([label, value]) => ({
      label,
      description: String(value),
    })),
  });
}
