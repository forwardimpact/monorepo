#!/usr/bin/env node
/**
 * Load example data from examples/activity/raw/ into the local Supabase instance.
 *
 * Usage: node products/map/scripts/load-examples.js
 *
 * Steps:
 *   1. Upload people YAML files as a combined YAML array to Storage
 *   2. Upload GitHub event JSON files to Storage
 *   3. Upload GetDX data (teams, snapshots, snapshot details) to Storage
 *   4. Run the transform pipeline to populate database tables
 */

import { createClient } from "@supabase/supabase-js";
import { readFile, readdir } from "fs/promises";
import { join, resolve } from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { storeRaw } from "../activity/storage.js";
import { transformAll } from "../activity/transform/index.js";

const SUPABASE_URL = "http://127.0.0.1:54321";
// Default local dev service_role key (deterministic, not secret)
const SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const ROOT = resolve(import.meta.dirname, "../../../examples/activity/raw");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "activity" },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[load-examples] ${msg}`);
}

function logError(msg) {
  console.error(`[load-examples] ERROR: ${msg}`);
}

// ── People ───────────────────────────────────────────────────────────────────

async function uploadPeople() {
  const dir = join(ROOT, "people");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".yaml"));

  log(`Reading ${files.length} people YAML files...`);

  const people = [];
  for (const file of files) {
    const content = await readFile(join(dir, file), "utf-8");
    const person = parseYaml(content);
    // Map fields to the schema the transform expects
    people.push({
      email: person.email,
      name: person.name,
      github_username: person.github,
      discipline: person.discipline,
      level: person.level,
      track: person.track || null,
      manager_email: person.manager_email || null,
    });
  }

  // Upload as a single combined YAML file
  const combined = stringifyYaml(people);
  const result = await storeRaw(supabase, "people/roster.yaml", combined, "text/yaml");

  if (!result.stored) {
    logError(`Failed to upload people: ${result.error}`);
    return 0;
  }

  log(`Uploaded ${people.length} people to Storage as people/roster.yaml`);
  return people.length;
}

// ── GitHub Events ────────────────────────────────────────────────────────────

async function uploadGitHub() {
  const dir = join(ROOT, "github");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json") && f.startsWith("evt-"));

  log(`Uploading ${files.length} GitHub event files...`);

  let uploaded = 0;
  let errors = 0;
  const BATCH_SIZE = 100;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (file) => {
        const content = await readFile(join(dir, file), "utf-8");
        return storeRaw(supabase, `github/${file}`, content);
      }),
    );

    for (const r of results) {
      if (r.stored) uploaded++;
      else errors++;
    }

    if ((i + BATCH_SIZE) % 1000 === 0 || i + BATCH_SIZE >= files.length) {
      log(`  GitHub progress: ${Math.min(i + BATCH_SIZE, files.length)}/${files.length}`);
    }
  }

  log(`Uploaded ${uploaded} GitHub events (${errors} errors)`);
  return uploaded;
}

// ── GetDX ────────────────────────────────────────────────────────────────────

async function uploadGetDX() {
  const dir = join(ROOT, "getdx");
  let uploaded = 0;

  // teams.list.json → getdx/teams-list/latest.json
  const teamsContent = await readFile(join(dir, "teams.list.json"), "utf-8");
  const teamsResult = await storeRaw(supabase, "getdx/teams-list/latest.json", teamsContent);
  if (teamsResult.stored) uploaded++;
  else logError(`Failed to upload teams list: ${teamsResult.error}`);

  // snapshots.list.json → getdx/snapshots-list/latest.json
  const snapshotsContent = await readFile(join(dir, "snapshots.list.json"), "utf-8");
  const snapshotsResult = await storeRaw(supabase, "getdx/snapshots-list/latest.json", snapshotsContent);
  if (snapshotsResult.stored) uploaded++;
  else logError(`Failed to upload snapshots list: ${snapshotsResult.error}`);

  // snapshots/*.json → getdx/snapshots-info/*.json
  const snapshotsDir = join(dir, "snapshots");
  const snapshotFiles = (await readdir(snapshotsDir)).filter((f) => f.endsWith(".json"));
  for (const file of snapshotFiles) {
    const content = await readFile(join(snapshotsDir, file), "utf-8");
    const result = await storeRaw(supabase, `getdx/snapshots-info/${file}`, content);
    if (result.stored) uploaded++;
    else logError(`Failed to upload snapshot ${file}: ${result.error}`);
  }

  log(`Uploaded ${uploaded} GetDX files`);
  return uploaded;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log("Starting example data load...");
  log(`Source: ${ROOT}`);

  // Step 1: Upload raw data to Storage
  log("\n── Step 1: Upload raw data to Supabase Storage ──");
  const peopleCount = await uploadPeople();
  const getdxCount = await uploadGetDX();
  const githubCount = await uploadGitHub();

  log(`\nStorage upload complete: ${peopleCount} people, ${githubCount} GitHub events, ${getdxCount} GetDX files`);

  // Step 2: Run transforms
  log("\n── Step 2: Run transform pipeline ──");
  const result = await transformAll(supabase);
  log(`Transform complete:`);
  log(`  People: ${result.people.imported} imported`);
  log(`  GetDX: ${result.getdx.teams} teams, ${result.getdx.snapshots} snapshots, ${result.getdx.scores} scores`);
  log(`  GitHub: ${result.github.events} events, ${result.github.artifacts} artifacts`);

  const allErrors = [
    ...result.people.errors,
    ...result.getdx.errors,
    ...result.github.errors,
  ];

  if (allErrors.length > 0) {
    log(`\n${allErrors.length} transform errors:`);
    allErrors.slice(0, 10).forEach((e) => log(`  - ${e}`));
    if (allErrors.length > 10) log(`  ... and ${allErrors.length - 10} more`);
  }

  log("\nDone!");
}

main().catch((err) => {
  logError(err.message);
  process.exit(1);
});
