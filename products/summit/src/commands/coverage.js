/**
 * `fit-summit coverage <team>` — show a team's capability coverage.
 *
 * Loads the roster, resolves the requested team, computes coverage via
 * the aggregation primitives from Part 02, applies the audience filter,
 * then dispatches to a text / JSON / markdown formatter.
 */

import { loadRoster } from "../roster/index.js";
import { computeCoverage, resolveTeam } from "../aggregation/coverage.js";
import { EmptyTeamError, TeamNotFoundError } from "../aggregation/errors.js";
import {
  decorateCoverageWithEvidence,
  EvidenceUnavailableError,
  loadEvidence,
} from "../evidence/index.js";
import { SupabaseUnavailableError } from "../lib/supabase.js";
import { createSummitClient } from "../lib/supabase.js";
import { resolveAudience, withAudienceFilter } from "../lib/audience.js";
import { Format, getRosterSource, resolveFormat } from "../lib/cli.js";
import { coverageToText } from "../formatters/coverage/text.js";
import { coverageToJson } from "../formatters/coverage/json.js";
import { coverageToMarkdown } from "../formatters/coverage/markdown.js";

/**
 * @param {object} params
 * @param {object} params.data
 * @param {string[]} params.args
 * @param {object} params.options
 */
export async function runCoverageCommand({ data, args, options }) {
  const format = resolveFormat(options);
  const audience = resolveAudience(options);
  const target = resolveTarget(args, options);

  const roster = await loadRoster(getRosterSource(options));
  const resolved = resolveCommandTeam(roster, data, target);

  if (resolved.members.length === 0) {
    process.stdout.write(`  ${new EmptyTeamError(resolved.id).message}\n`);
    return;
  }

  let coverage = computeCoverage(resolved, data);

  if (options.evidenced) {
    coverage = await decorateWithEvidence(coverage, resolved, options);
  }

  const filtered = withAudienceFilter(coverage, audience);

  if (format === Format.JSON) {
    process.stdout.write(
      JSON.stringify(coverageToJson(filtered), null, 2) + "\n",
    );
    return;
  }
  if (format === Format.MARKDOWN) {
    process.stdout.write(coverageToMarkdown(filtered));
    return;
  }
  process.stdout.write(coverageToText(filtered, data));
}

function resolveTarget(args, options) {
  if (options.project) return { projectId: options.project };
  const teamId = args[0];
  if (!teamId) {
    throw new Error(
      "summit: a team id is required. Usage: fit-summit coverage <team> or fit-summit coverage --project <name>.",
    );
  }
  return { teamId };
}

function resolveCommandTeam(roster, data, target) {
  try {
    return resolveTeam(roster, data, target);
  } catch (e) {
    if (e instanceof TeamNotFoundError) {
      throw new Error(`summit: ${e.message}`, { cause: e });
    }
    throw e;
  }
}

async function decorateWithEvidence(coverage, resolved, options) {
  try {
    const client = options.supabase ?? createSummitClient();
    const evidence = await loadEvidence(client, {
      team: resolved,
      lookbackMonths: Number(options.lookbackMonths ?? 12),
    });
    return decorateCoverageWithEvidence(coverage, evidence);
  } catch (e) {
    if (
      e instanceof EvidenceUnavailableError ||
      e instanceof SupabaseUnavailableError
    ) {
      process.stderr.write(`summit: ${e.message}\n`);
      return decorateCoverageWithEvidence(coverage, new Map());
    }
    throw e;
  }
}
