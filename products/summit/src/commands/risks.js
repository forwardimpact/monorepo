/**
 * `fit-summit risks <team>` — show structural risks for a team.
 *
 * Pipeline: load roster → resolve team → compute coverage → detect
 * risks → apply audience filter → format.
 */

import { loadRoster } from "../roster/index.js";
import { computeCoverage, resolveTeam } from "../aggregation/coverage.js";
import { detectRisks } from "../aggregation/risks.js";
import { EmptyTeamError, TeamNotFoundError } from "../aggregation/errors.js";
import {
  decorateCoverageWithEvidence,
  decorateRisksWithEvidence,
  EvidenceUnavailableError,
  loadEvidence,
} from "../evidence/index.js";
import {
  createSummitClient,
  SupabaseUnavailableError,
} from "../lib/supabase.js";
import { resolveAudience, withAudienceFilter } from "../lib/audience.js";
import { Format, getRosterSource, resolveFormat } from "../lib/cli.js";
import { risksToText } from "../formatters/risks/text.js";
import { risksToJson } from "../formatters/risks/json.js";
import { risksToMarkdown } from "../formatters/risks/markdown.js";

/**
 * @param {object} params
 * @param {object} params.data
 * @param {string[]} params.args
 * @param {object} params.options
 */
export async function runRisksCommand({
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
  const resolved = safeResolveTeam(roster, data, target);

  if (resolved.members.length === 0) {
    runtime.proc.stdout.write(`  ${new EmptyTeamError(resolved.id).message}\n`);
    return;
  }

  let coverage = computeCoverage(resolved, data);
  let risks = detectRisks({ resolvedTeam: resolved, coverage, data });

  if (options.evidenced) {
    const evidence = await loadEvidenceSafe(resolved, options, config, runtime);
    coverage = decorateCoverageWithEvidence(coverage, evidence);
    risks = decorateRisksWithEvidence(risks, coverage, evidence);
  }

  const filtered = withAudienceFilter(coverage, audience);

  if (format === Format.JSON) {
    runtime.proc.stdout.write(
      JSON.stringify(
        risksToJson({ coverage: filtered, risks, audience }),
        null,
        2,
      ) + "\n",
    );
    return;
  }
  if (format === Format.MARKDOWN) {
    runtime.proc.stdout.write(
      risksToMarkdown({ coverage: filtered, risks, audience }),
    );
    return;
  }
  runtime.proc.stdout.write(
    risksToText({ coverage: filtered, risks, data, audience }),
  );
}

function resolveTarget(args, options) {
  if (options.project) return { projectId: options.project };
  const teamId = args[0];
  if (!teamId) {
    throw new Error(
      "summit: a team id is required. Usage: fit-summit risks <team> or fit-summit risks --project <name>.",
    );
  }
  return { teamId };
}

function safeResolveTeam(roster, data, target) {
  try {
    return resolveTeam(roster, data, target);
  } catch (e) {
    if (e instanceof TeamNotFoundError) {
      throw new Error(`summit: ${e.message}`, { cause: e });
    }
    throw e;
  }
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
