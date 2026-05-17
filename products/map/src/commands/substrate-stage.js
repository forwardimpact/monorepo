/**
 * `fit-map substrate stage` — workspace-prep terminal phase for the
 * kata-interview workflow targeting Landmark. Brings up the local
 * Supabase stack, discovers its URL/anon key, migrates the schema,
 * seeds the activity data, provisions auth.users for the roster, and
 * runs a self-smoke against every gated Landmark command.
 *
 * Designed to be invoked once per interview run from CI; not a developer
 * verb (use `fit-map activity start` + manual seed in dev flows).
 */

import path from "node:path";
import { createSupabaseCli as defaultCreateCli } from "../lib/supabase-cli.js";
import { findDataDir as defaultFindDataDir } from "../lib/data-dir.js";
import { createMapClient as defaultCreateMapClient } from "../lib/client.js";
import { formatSuccess } from "@forwardimpact/libcli";

/**
 * Run the staging pipeline. Each phase is wrapped so failures surface
 * with a `[substrate stage: <phase>] <reason>` error so the CI step's
 * stderr identifies which substrate step failed.
 *
 * Dependencies are injectable for tests; production callers pass only
 * `config` and the defaults wire up the real Supabase CLI, mapClient,
 * data-dir resolver, seed, provision, and smoke surfaces.
 *
 * @param {object} params
 * @param {object} params.config - libconfig product config for "map".
 * @param {object} [deps]
 * @returns {Promise<number>}
 */
export async function runStageCommand(
  { config },
  {
    createSupabaseCli = defaultCreateCli,
    findDataDir = defaultFindDataDir,
    createMapClient = defaultCreateMapClient,
    loadSeed = () => import("./activity.js").then((m) => m.seed),
    loadProvision = () =>
      import("./people-provision.js").then((m) => m.runProvisionCommand),
    loadSmoke = () =>
      import("./substrate-smoke.js").then((m) => m.runSelfSmoke),
  } = {},
) {
  const cli = createSupabaseCli();

  await runPhase("stack", () => cli.run(["start"]));

  await runPhase("url-discovery", async () => {
    const json = await cli.capture(["status", "--output", "json"]);
    const status = JSON.parse(json);
    if (!status.api_url) throw new Error("supabase status: no api_url");
    if (!status.anon_key) throw new Error("supabase status: no anon_key");
    // libconfig's #env() reads process.env first; setting these here
    // makes the createMapClient call below (and any same-process
    // children) observe the live local-stack values.
    process.env.SUPABASE_URL = status.api_url;
    process.env.SUPABASE_ANON_KEY = status.anon_key;
  });

  await runPhase("migrate", () => cli.run(["db", "reset"]));

  const supabase = createMapClient({ config });
  const dataDir = await findDataDir(undefined);
  const dataRoot = path.dirname(dataDir);
  const seed = await loadSeed();
  const runProvisionCommand = await loadProvision();
  await runPhase("seed", () => seed({ data: dataRoot, supabase }));
  await runPhase("provision", () => runProvisionCommand({ supabase }));

  if (process.env.SUBSTRATE_FORCE_EMPTY_CORPUS === "true") {
    throw new Error("[substrate stage: smoke] empty corpus (test injection)");
  }
  const runSelfSmoke = await loadSmoke();
  await runPhase("smoke", () => runSelfSmoke({ supabase, config }));

  process.stdout.write(formatSuccess("Substrate ready") + "\n");
  return 0;
}

async function runPhase(name, fn) {
  try {
    await fn();
  } catch (err) {
    throw new Error(`[substrate stage: ${name}] ${err.message}`);
  }
}
