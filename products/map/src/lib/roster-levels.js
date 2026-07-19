/**
 * Seeding invariant: every level carried by a seeded person must exist
 * in the installed standard's `levels.yaml`. A roster row whose level
 * the standard does not define makes every level-gated consumer fail
 * with "Unknown level" long after seeding, so seeding fails fast
 * instead. When no standard is installed at the given pathway dir the
 * invariant is vacuous and the check is skipped.
 */

import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getOrganization } from "../activity/queries/org.js";

/**
 * Throw when `organization_people` contains level ids absent from the
 * installed `levels.yaml`.
 *
 * @param {object} params
 * @param {import('@supabase/supabase-js').SupabaseClient} params.supabase - Client bound to the activity schema.
 * @param {string} params.pathwayDir - Installed standard dir (contains levels.yaml).
 * @param {import('@forwardimpact/libutil/runtime').Runtime} params.runtime - Injected collaborators (fs).
 * @returns {Promise<void>}
 */
export async function assertSeededLevelsCovered({
  supabase,
  pathwayDir,
  runtime,
}) {
  const levelsPath = join(pathwayDir, "levels.yaml");
  let content;
  try {
    content = await runtime.fs.readFile(levelsPath, "utf-8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    return;
  }
  const installed = new Set(parseYaml(content).map((level) => level.id));
  const people = await getOrganization(supabase);
  const missing = [
    ...new Set(
      people
        .map((person) => person.level)
        .filter((level) => level && !installed.has(level)),
    ),
  ].sort();
  if (missing.length > 0) {
    throw new Error(
      `Seeded roster uses levels missing from the installed standard ` +
        `(${levelsPath}): ${missing.join(", ")}. Installed levels: ` +
        `${[...installed].join(", ")}. Add the missing levels to ` +
        `levels.yaml or correct the roster.`,
    );
  }
}
