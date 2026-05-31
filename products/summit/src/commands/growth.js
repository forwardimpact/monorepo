/**
 * `fit-summit growth <team>` — show growth opportunities aligned with
 * team needs.
 */

import { loadRoster } from "../roster/index.js";
import { resolveTeam } from "../aggregation/coverage.js";
import { computeGrowthAlignment } from "../aggregation/growth.js";
import { TeamNotFoundError } from "../aggregation/errors.js";
import { EvidenceUnavailableError, loadEvidence } from "../evidence/index.js";
import { loadDriverScores } from "../outcomes/index.js";
import {
  createSummitClient,
  SupabaseUnavailableError,
} from "../lib/supabase.js";
import { resolveAudience } from "../lib/audience.js";
import { Format, getRosterSource, resolveFormat } from "../lib/cli.js";
import { growthToText } from "../formatters/growth/text.js";
import { growthToJson } from "../formatters/growth/json.js";
import { growthToMarkdown } from "../formatters/growth/markdown.js";

/**
 * @param {object} params
 * @param {object} params.data
 * @param {string[]} params.args
 * @param {object} params.options
 */
export async function runGrowthCommand({
  data,
  args,
  options,
  config,
  runtime,
}) {
  const format = resolveFormat(options);
  const audience = resolveAudience(options);
  const target = resolveTarget(args, options);

  const roster = await loadRoster({
    ...getRosterSource(options, config),
    fs: runtime.fs,
  });
  let resolved;
  try {
    resolved = resolveTeam(roster, data, target);
  } catch (e) {
    if (e instanceof TeamNotFoundError) {
      throw new Error(`summit: ${e.message}`, { cause: e });
    }
    throw e;
  }

  const team = resolved.members.map((m) => ({
    email: m.email,
    name: m.name,
    job: m.job,
    allocation: m.allocation,
  }));

  const evidence = options.evidenced
    ? await loadEvidenceSafe(resolved, options, config, runtime)
    : undefined;
  const driverScores = options.outcomes
    ? await loadScoresSafe(resolved, options, config, runtime)
    : undefined;

  const recommendations = computeGrowthAlignment({
    team,
    mapData: data,
    evidence,
    driverScores,
  });

  if (format === Format.JSON) {
    runtime.proc.stdout.write(
      JSON.stringify(
        growthToJson({ teamId: resolved.id, recommendations, audience }),
        null,
        2,
      ) + "\n",
    );
    return;
  }
  if (format === Format.MARKDOWN) {
    runtime.proc.stdout.write(
      growthToMarkdown({ teamId: resolved.id, recommendations, audience }),
    );
    return;
  }
  runtime.proc.stdout.write(
    growthToText({ teamId: resolved.id, recommendations, audience }),
  );
}

function resolveTarget(args, options) {
  if (options.project) return { projectId: options.project };
  const teamId = args[0];
  if (!teamId) {
    throw new Error(
      "summit: a team id is required. Usage: fit-summit growth <team> or fit-summit growth --project <name>.",
    );
  }
  return { teamId };
}

async function loadEvidenceSafe(resolved, options, config, runtime) {
  try {
    const client = options.supabase ?? (await createSummitClient({ config }));
    return await loadEvidence(client, {
      team: resolved,
      lookbackMonths: Number(options["lookback-months"] ?? 12),
      clock: runtime.clock,
    });
  } catch (e) {
    if (
      e instanceof EvidenceUnavailableError ||
      e instanceof SupabaseUnavailableError
    ) {
      runtime.proc.stderr.write(`summit: ${e.message}\n`);
      return new Map();
    }
    throw e;
  }
}

async function loadScoresSafe(resolved, options, config, runtime) {
  try {
    const client = options.supabase ?? (await createSummitClient({ config }));
    return await loadDriverScores(client, { team: resolved });
  } catch (e) {
    if (e instanceof SupabaseUnavailableError) {
      runtime.proc.stderr.write(`summit: ${e.message}\n`);
      return new Map();
    }
    throw e;
  }
}
