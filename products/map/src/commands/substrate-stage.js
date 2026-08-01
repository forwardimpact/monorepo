/**
 * `fit-map substrate stage` — workspace-prep terminal phase for the
 * kata-interview workflow that targets Landmark. The command runs init
 * against the target dir. It copies the activity data and the pathway
 * standard from the same data root. It brings up the local Supabase
 * stack. It discovers the stack's URL and anon key. It migrates the
 * schema. It seeds the activity data. It provisions auth.users for the
 * roster. It proves the seeded roster's levels against the staged
 * standard. It runs a self-smoke against every gated Landmark command.
 *
 * Call this once per interview run from CI. It is not a developer verb.
 * Use `fit-map activity start` and a manual seed in dev flows.
 */

import path from "node:path";
import { createSupabaseCli as defaultCreateCli } from "../lib/supabase-cli.js";
import { findDataDir as defaultFindDataDir } from "../lib/data-dir.js";
import { createMapClient as defaultCreateMapClient } from "../lib/client.js";
import { createProductConfig } from "@forwardimpact/libconfig";
import { formatSuccess } from "@forwardimpact/libcli";

/**
 * Run the stage pipeline. The function wraps each phase so failures
 * surface with a `[substrate stage: <phase>] <reason>` error. The CI
 * step's stderr then identifies which substrate step failed.
 *
 * Tests inject the dependencies. Production callers pass only `config`
 * and optionally `target`. The defaults then wire up the real Supabase
 * CLI, mapClient, data-dir resolver, init, seed, provision, and smoke
 * surfaces.
 *
 * @param {object} params
 * @param {object} params.config - libconfig product config for "map".
 * @param {string} [params.target] - Target dir for the init bootstrap
 *   (default: `runtime.proc.cwd()`).
 * @param {string} [params.emitEnv] - Path to append `SUPABASE_URL=` /
 *   `SUPABASE_ANON_KEY=` to after the `url-discovery` phase (e.g.
 *   `$GITHUB_ENV`). Omit to skip the emit. All phases are unchanged.
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
    loadCopyPathway = () =>
      import("../lib/copy-activity.js").then((m) => m.copyPathway),
    loadAssertLevels = () =>
      import("../lib/roster-levels.js").then(
        (m) => m.assertSeededLevelsCovered,
      ),
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
    // createProductConfig("map") ran from cwd before init. In CI that cwd
    // is the monorepo root. It is not the agent workspace. So a plain
    // createProductConfig() here would re-read the same root config and
    // silently no-op against the writer's contribution.
    reloadConfig = (stageTarget) =>
      createProductConfig(
        "map",
        {},
        {
          runtime: {
            ...runtime,
            proc: { ...runtime.proc, cwd: () => stageTarget },
          },
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

  // Activity and pathway are a matched pair from the same data root. The
  // roster seeded below carries level ids the standard must define. So
  // the staged pathway ships from the same source as the activity data.
  // When no source pathway exists, init's starter copy stays as the
  // fallback.
  const copyPathway = await loadCopyPathway();
  await runPhase("copy-pathway", async () => {
    const source = await findDataDir(undefined, runtime);
    await copyPathway({ source, target: stageTarget, runtime });
  });

  const stageConfig = (await reloadConfig(stageTarget)) ?? config;

  const cli = createSupabaseCli({ runtime });

  await runPhase("stack", () => cli.run(["start"]));

  await runPhase("url-discovery", async () => {
    const json = await cli.capture(["status", "--output", "json"]);
    const status = JSON.parse(json);
    if (!status.API_URL) throw new Error("supabase status: no API_URL");
    if (!status.ANON_KEY) throw new Error("supabase status: no ANON_KEY");
    // libconfig's #env() reads env first. Set these here so the
    // createMapClient call below observes the live local-stack values.
    // Any same-process children observe them too.
    runtime.proc.env.SUPABASE_URL = status.API_URL;
    runtime.proc.env.SUPABASE_ANON_KEY = status.ANON_KEY;
    // Carry the same two lines across CI steps when asked. The emit shape
    // matches `fit-terrain substrate up --emit-env`, so a consumer can swap
    // the FI stage for the generic bring-up and keep the action unchanged.
    if (emitEnv) {
      await runtime.fs.appendFile(
        emitEnv,
        `SUPABASE_URL=${status.API_URL}\nSUPABASE_ANON_KEY=${status.ANON_KEY}\n`,
      );
    }
  });

  await runPhase("migrate", () => cli.run(["db", "reset"]));

  // Two clients run from here on. The activity-schema client serves seed
  // (vendor tables). Provision and the smoke run the libterrain-owned
  // substrate capability. Its queries name contract relations and need a
  // client bound to the `substrate` schema. The activity client would fail
  // them with "relation people not found".
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

  // Prove the seeded roster against the standard this workspace actually
  // ships. The seed phase checked against the source data root. This
  // phase checks the staged copy end-to-end.
  const assertSeededLevelsCovered = await loadAssertLevels();
  await runPhase("roster-standard", () =>
    assertSeededLevelsCovered({
      supabase,
      pathwayDir: path.join(stageTarget, "data", "pathway"),
      runtime,
    }),
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
    // Prefix the phase onto the original error. Do not wrap the error, so
    // the stack still points at the frame that failed.
    err.message = `[substrate stage: ${name}] ${err.message}`;
    throw err;
  }
}
