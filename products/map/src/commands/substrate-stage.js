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
 *   (default: `runtime.proc.cwd()`).
 * @param {string} [params.emitEnv] - Path to append `SUPABASE_URL=` /
 *   `SUPABASE_ANON_KEY=` to after the `url-discovery` phase (e.g.
 *   `$GITHUB_ENV`). Omit to skip the emit; all phases are unchanged.
 * @param {import('@forwardimpact/libutil/runtime').Runtime} params.runtime - Injected collaborators.
 * @param {object} [deps]
 * @returns {Promise<number>}
 */
export async function runStageCommand(
  { config, target, emitEnv, runtime },
  {
    loadInit = () => import("./init.js").then((m) => m.runInit),
    loadCopyActivity = () =>
      import("../lib/copy-activity.js").then((m) => m.copyActivity),
    createSupabaseCli = defaultCreateCli,
    findDataDir = defaultFindDataDir,
    createMapClient = defaultCreateMapClient,
    loadSeed = () => import("./activity.js").then((m) => m.seed),
    loadProvision = () =>
      import("@forwardimpact/libterrain/substrate").then((m) => m.runProvision),
    loadSmoke = () =>
      import("./substrate-smoke.js").then((m) => m.runSelfSmoke),
    // Anchor the re-read at `target` so the post-init load observes the
    // bootstrapped target/config/config.json. fit-map.js's module-top
    // createProductConfig("map") ran from cwd before init — in CI that's
    // the monorepo root, not the agent workspace — so a plain
    // createProductConfig() here would re-read the same root config and
    // silently no-op against the writer's contribution.
    reloadConfig = (stageTarget) =>
      createProductConfig(
        "map",
        {},
        {
          cwd: () => stageTarget,
          env: runtime.proc.env,
        },
      ),
  } = {},
) {
  const stageTarget = target ?? runtime.proc.cwd();
  const runInit = await loadInit();
  await runPhase("init", () => runInit(stageTarget, runtime));

  const copyActivity = await loadCopyActivity();
  await runPhase("copy-activity", async () => {
    const dataDir = await findDataDir(undefined, runtime);
    const source = path.join(path.dirname(dataDir), "activity");
    await copyActivity({ source, target: stageTarget, runtime });
  });

  const stageConfig = (await reloadConfig(stageTarget)) ?? config;

  const cli = createSupabaseCli({ runtime });

  await runPhase("stack", () => cli.run(["start"]));

  await runPhase("url-discovery", async () => {
    const json = await cli.capture(["status", "--output", "json"]);
    const status = JSON.parse(json);
    if (!status.API_URL) throw new Error("supabase status: no API_URL");
    if (!status.ANON_KEY) throw new Error("supabase status: no ANON_KEY");
    // libconfig's #env() reads env first; setting these here makes the
    // createMapClient call below (and any same-process children) observe
    // the live local-stack values.
    runtime.proc.env.SUPABASE_URL = status.API_URL;
    runtime.proc.env.SUPABASE_ANON_KEY = status.ANON_KEY;
    // Carry the same two lines across CI steps when asked. Same emit shape
    // as `fit-terrain substrate up --emit-env`, so a consumer can swap the
    // FI stage for the generic bring-up without changing the action.
    if (emitEnv) {
      await runtime.fs.appendFile(
        emitEnv,
        `SUPABASE_URL=${status.API_URL}\nSUPABASE_ANON_KEY=${status.ANON_KEY}\n`,
      );
    }
  });

  await runPhase("migrate", () => cli.run(["db", "reset"]));

  // Two clients from here on: the activity-schema client serves seed (vendor
  // tables), while provision and the smoke run the libterrain-owned substrate
  // capability, whose queries name contract relations and need a client bound
  // to the `substrate` schema — the activity client would fail them with
  // "relation people not found".
  const supabase = createMapClient({ config: stageConfig });
  const substrateClient = createMapClient({
    config: stageConfig,
    schema: "substrate",
  });
  const dataDir = await findDataDir(undefined, runtime);
  const dataRoot = path.dirname(dataDir);
  const seed = await loadSeed();
  const runProvision = await loadProvision();
  await runPhase("seed", () => seed({ data: dataRoot, supabase, runtime }));
  await runPhase("provision", () =>
    runProvision({ supabase: substrateClient, runtime }),
  );

  if (runtime.proc.env.SUBSTRATE_FORCE_EMPTY_CORPUS === "true") {
    throw new Error("[substrate stage: smoke] empty corpus (test injection)");
  }
  const runSelfSmoke = await loadSmoke();
  await runPhase("smoke", () =>
    runSelfSmoke({ supabase: substrateClient, config: stageConfig, runtime }),
  );

  runtime.proc.stdout.write(formatSuccess("Substrate ready") + "\n");
  return 0;
}

async function runPhase(name, fn) {
  try {
    await fn();
  } catch (err) {
    throw new Error(`[substrate stage: ${name}] ${err.message}`);
  }
}
