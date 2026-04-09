import { runSupabase } from "../supabase-cli.js";
import { transformAll } from "@forwardimpact/map/activity/transform";
import { transformPeople } from "@forwardimpact/map/activity/transform/people";
import { transformAllGetDX } from "@forwardimpact/map/activity/transform/getdx";
import { transformAllGitHub } from "@forwardimpact/map/activity/transform/github";
import { getOrganization } from "@forwardimpact/map/activity/queries/org";

export async function start() {
  await runSupabase(["start"]);
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

function report(target, counts) {
  console.log(`Transform ${target}:`, JSON.stringify(counts, null, 2));
}
