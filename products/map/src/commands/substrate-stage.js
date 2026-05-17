/**
 * `fit-map substrate stage` — workspace-prep terminal phase for the
 * kata-interview workflow targeting Landmark. Runs init against the
 * target dir, brings up the local Supabase stack, discovers its URL/anon
 * key, migrates the schema, seeds the activity data, provisions
 * auth.users for the roster, and runs a self-smoke against every gated
 * Landmark command.
 *
 * Designed to be invoked once per interview run from CI; not a developer
 * verb (use `fit-map activity start` + manual seed in dev flows).
 */

import path from "node:path";
import { createSupabaseCli as defaultCreateCli } from "../lib/supabase-cli.js";
import { findDataDir as defaultFindDataDir } from "../lib/data-dir.js";
import { createMapClient as defaultCreateMapClient } from "../lib/client.js";
import { createProductConfig } from "@forwardimpact/libconfig";
import { formatSuccess } from "@forwardimpact/libcli";

/**
 * Run the staging pipeline. Each phase is wrapped so failures surface
 * with a `[substrate stage: <phase>] <reason>` error so the CI step's
 * stderr identifies which substrate step failed.
 *
 * Dependencies are injectable for tests; production callers pass only
 * `config` (and optionally `target`) and the defaults wire up the real
 * Supabase CLI, mapClient, data-dir resolver, init, seed, provision,
 * and smoke surfaces.
 *
 * @param {object} params
 * @param {object} params.config - libconfig product config for "map".
 * @param {string} [params.target] - Target dir for the init bootstrap
 *   (default: process.cwd()).
 * @param {object} [deps]
 * @returns {Promise<number>}
 */
export async function runStageCommand(
  { config, target = process.cwd() },
  {
    loadInit = () => import("./init.js").then((m) => m.runInit),
    createSupabaseCli = defaultCreateCli,
    findDataDir = defaultFindDataDir,
    createMapClient = defaultCreateMapClient,
    loadSeed = () => import("./activity.js").then((m) => m.seed),
    loadProvision = () =>
      import("./people-provision.js").then((m) => m.runProvisionCommand),
    loadSmoke = () =>
      import("./substrate-smoke.js").then((m) => m.runSelfSmoke),
    // Anchor the re-read at `target` so the post-init load observes the
    // bootstrapped target/config/config.json. fit-map.js's module-top
    // createProductConfig("map") ran from process.cwd() before init —
    // in CI that's the monorepo root, not the agent workspace — so a
    // plain createProductConfig() here would re-read the same root
    // config and silently no-op against the writer's contribution.
    reloadConfig = () =>
      createProductConfig(
        "map",
        {},
        {
          cwd: () => target,
          env: process.env,
        },
      ),
  } = {},
) {
  const runInit = await loadInit();
  await runPhase("init", () => runInit(target));
  const stageConfig = (await reloadConfig()) ?? config;

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

  const supabase = createMapClient({ config: stageConfig });
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
  await runPhase("smoke", () =>
    runSelfSmoke({ supabase, config: stageConfig }),
  );

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
