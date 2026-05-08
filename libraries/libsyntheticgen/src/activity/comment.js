/**
 * Snapshot-comment ProseActivity — binds the snapshot-comment output to
 * the three pipeline stages: deterministic generation, prose-context
 * construction, and output rendering.
 *
 * Compared to the pre-820 implementation, `generate` carries the full
 * team-affect driver array on each comment-key (instead of collapsing
 * to the top driver only). The top driver is still used as the *topic*
 * driver for shuffle ordering and as the human-readable `driver_name`
 * scalar consumed by the render layer, but the array is preserved end
 * to end so `proseKeys` can populate `ProseContext.drivers` uniformly
 * with what the webhook activity already emits.
 *
 * @module libsyntheticgen/activity/comment
 */

import { createSeededRNG } from "../engine/rng.js";

/**
 * @param {import('../engine/rng.js').SeededRNG} rng
 * @param {Date} start
 * @param {Date} end
 */
function randDate(rng, start, end) {
  return new Date(
    start.getTime() + rng.random() * (end.getTime() - start.getTime()),
  );
}

/**
 * Find scenarios active during a snapshot date.
 * @param {object[]} scenarios
 * @param {Date} snapDate
 * @returns {object[]}
 */
function findActiveScenarios(scenarios, snapDate) {
  return scenarios.filter((scenario) => {
    const start = new Date(scenario.timerange_start + "-01");
    const end = new Date(scenario.timerange_end + "-28");
    return snapDate >= start && snapDate <= end;
  });
}

/**
 * Collect candidates from a single affect's team members.
 *
 * Carries the FULL team-affect driver array on each candidate (sorted
 * by `|magnitude|` descending so `drivers[0]` is the topic driver).
 * The top driver continues to drive shuffle ordering by trajectory and
 * the render-time `driver_name` scalar; the rest of the array crosses
 * unchanged into `ProseContext.drivers` for the LLM prompt.
 *
 * @param {object} affect
 * @param {object} scenario
 * @param {object[]} people
 * @param {object[]} teams
 * @param {Map<string, object>} driverMap
 * @returns {object[]}
 */
function collectAffectCandidates(affect, scenario, people, teams, driverMap) {
  const team = teams.find((t) => t.id === affect.team_id);
  if (!team) return [];

  const teamPeople = people.filter((p) => p.team_id === team.id);
  const drivers = (affect.dx_drivers || [])
    .map((d) => ({
      driver_id: d.driver_id,
      trajectory: d.trajectory,
      magnitude: d.magnitude,
    }))
    .sort((a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude));
  if (drivers.length === 0) return [];

  const topDriver = drivers[0];
  const driverDef = driverMap.get(topDriver.driver_id);
  return teamPeople.map((person) => ({
    person,
    team,
    scenario,
    topic_driver_id: topDriver.driver_id,
    topic_trajectory: topDriver.trajectory,
    driver_name: driverDef?.name || topDriver.driver_id,
    drivers,
  }));
}

/**
 * Collect candidates from active scenarios for comment generation.
 * @param {object[]} activeScenarios
 * @param {object[]} people
 * @param {object[]} teams
 * @param {Map<string, object>} driverMap
 * @returns {object[]}
 */
function collectCandidates(activeScenarios, people, teams, driverMap) {
  const candidates = activeScenarios.flatMap((scenario) =>
    scenario.affects.flatMap((affect) =>
      collectAffectCandidates(affect, scenario, people, teams, driverMap),
    ),
  );
  // Stable order so a downstream shuffle is reproducible regardless of how
  // upstream phases (people generation, scenario parsing) ordered their
  // outputs across platforms.
  candidates.sort((a, b) => {
    const ka = `${a.scenario.id} ${a.team.id} ${a.person.email} ${a.topic_driver_id}`;
    const kb = `${b.scenario.id} ${b.team.id} ${b.person.email} ${b.topic_driver_id}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return candidates;
}

/**
 * Generate snapshot-comment keys.
 *
 * The shared `rng` is intentionally ignored — an isolated RNG seeded
 * from `ast.seed` is used so the comment key set does not drift when
 * an unrelated upstream phase (scores, evidence, initiatives) consumes
 * a different number of random values across platforms.
 *
 * @param {object} ctx
 * @param {import('../dsl/parser.js').TerrainAST} ctx.ast
 * @param {import('../engine/rng.js').SeededRNG} ctx.rng - accepted, unused
 * @param {object} ctx.entities
 * @param {object[]} ctx.entities.people
 * @param {object[]} ctx.entities.teams
 * @param {object[]} ctx.entities.snapshots
 * @returns {{ keys: object[] }}
 */
function generateComment(ctx) {
  const { ast, entities } = ctx;
  const { people, teams, snapshots } = entities;

  const commentsPerSnapshot = ast.snapshots?.comments_per_snapshot || 0;
  if (commentsPerSnapshot === 0) return { keys: [] };

  // Use an isolated RNG seeded from ast.seed so the comment key set does
  // not drift when an unrelated upstream phase (scores, evidence,
  // initiatives) consumes a different number of random values across
  // platforms. The shared `rng` parameter is kept for signature stability.
  void ctx.rng;
  const commentRng = createSeededRNG(`${ast.seed}:comments`);

  const commentKeys = [];
  const driverMap = new Map(
    (ast.standard?.drivers || []).map((d) => [d.id, d]),
  );

  for (const snap of snapshots) {
    const snapDate = new Date(snap.completed_at);
    const activeScenarios = findActiveScenarios(ast.scenarios, snapDate);
    if (activeScenarios.length === 0) continue;

    const candidates = collectCandidates(
      activeScenarios,
      people,
      teams,
      driverMap,
    );

    const shuffled = commentRng.shuffle([...candidates]);
    const declining = shuffled.filter(
      (c) => c.topic_trajectory === "declining",
    );
    const rising = shuffled.filter((c) => c.topic_trajectory === "rising");
    const ordered = [...declining, ...rising];

    for (let i = 0; i < Math.min(commentsPerSnapshot, ordered.length); i++) {
      const c = ordered[i];
      commentKeys.push({
        snapshot_id: snap.snapshot_id,
        email: c.person.email,
        team_id: c.team.id,
        timestamp: randDate(
          commentRng,
          new Date(snap.scheduled_for),
          snapDate,
        ).toISOString(),
        topic_driver_id: c.topic_driver_id,
        topic_trajectory: c.topic_trajectory,
        driver_name: c.driver_name,
        drivers: c.drivers,
        scenario_name: c.scenario.name,
        team_name: c.team.name,
        person_level: c.person.level,
        person_discipline: c.person.discipline,
      });
    }
  }

  return { keys: commentKeys };
}

/**
 * Yield prose-context entries for snapshot comments.
 *
 * @param {{ keys: object[] }} output
 * @param {{ domain: string, orgName: string }} ctx
 * @returns {Iterable<[string, import('./index.js').ProseContext]>}
 */
function* commentProseKeys(output, { domain, orgName }) {
  for (const ck of output.keys) {
    yield [
      `snapshot_comment_${ck.snapshot_id}_${ck.email.replace(/[@.]/g, "_")}`,
      {
        topic: `GetDX snapshot survey comment about ${ck.topic_driver_id.replace(/_/g, " ")}`,
        tone: "authentic, first-person developer voice",
        length: "1-2 sentences",
        maxTokens: 80,
        domain,
        orgName,
        role: `${ck.person_level} ${ck.person_discipline.replace(/_/g, " ")} on the ${ck.team_name}`,
        scenario: ck.scenario_name,
        drivers: ck.drivers,
      },
    ];
  }
}

/**
 * Render snapshot-comment JSON files into the storage map.
 *
 * Falls back to a substring match when the prose map's exact key is
 * not present — the same fallback that lived in the pre-820
 * `renderGetDXComments` helper. The substring fallback exists for
 * cache-key drift; do not "tidy" it into a direct `.get()`.
 *
 * @param {{ keys: object[] }} output
 * @param {Map<string,string>} files
 * @param {Map<string,string>} [proseMap]
 */
function renderComment(output, files, proseMap) {
  if (!output?.keys?.length) return;

  const bySnapshot = new Map();
  for (const ck of output.keys) {
    if (!bySnapshot.has(ck.snapshot_id)) bySnapshot.set(ck.snapshot_id, []);
    bySnapshot.get(ck.snapshot_id).push(ck);
  }

  for (const [snapshotId, keys] of bySnapshot) {
    const comments = keys.map((ck) => {
      const proseKey = `snapshot_comment_${ck.snapshot_id}_${ck.email.replace(/[@.]/g, "_")}`;
      let text = null;
      if (proseMap) {
        for (const [k, v] of proseMap) {
          if (k.includes(proseKey) || proseKey.includes(k)) {
            text = v;
            break;
          }
        }
      }
      // Note: if text is still null, prose generation was not run for this key.
      // The prose map uses hashed keys, so fallback iteration is not feasible.

      return {
        snapshot_id: ck.snapshot_id,
        email: ck.email,
        driver_name: ck.driver_name,
        text:
          text ||
          `[${ck.driver_name} — ${ck.topic_trajectory}] Comment pending prose generation.`,
        timestamp: ck.timestamp,
        team_id: ck.team_id,
      };
    });

    files.set(
      `getdx/snapshots-comments/${snapshotId}.json`,
      JSON.stringify({ ok: true, comments }, null, 2),
    );
  }
}

/** @type {import('./index.js').ProseActivity} */
export const commentActivity = {
  id: "comment",
  generate: generateComment,
  proseKeys: commentProseKeys,
  render: renderComment,
};
