/**
 * Webhook generation for activity data.
 *
 * @module libuniverse/engine/activity-webhooks
 */

import { generateHash } from "@forwardimpact/libutil";

const COMMIT_MULT = {
  baseline: 1.0,
  moderate: 1.5,
  elevated: 2.5,
  spike: 4.0,
  sustained_spike: 3.5,
  very_high: 5.0,
};
const PR_MULT = {
  baseline: 1.0,
  moderate: 1.3,
  elevated: 2.0,
  very_high: 3.5,
};

const FEATURES = [
  "authentication",
  "pipeline",
  "scoring",
  "analytics",
  "export",
  "batch-processing",
  "data-validation",
  "api-gateway",
  "monitoring",
  "caching",
  "search",
  "notification",
  "scheduling",
  "reporting",
];

const COMMIT_MSGS = [
  "Add {f} endpoint",
  "Fix {f} validation",
  "Update {f} tests",
  "Refactor {f} module",
  "Optimize {f} performance",
  "Add error handling for {f}",
  "Update {f} documentation",
  "Implement {f} caching",
  "Add {f} monitoring",
  "Fix race condition in {f}",
  "Migrate {f} to new API",
  "Add integration tests for {f}",
  "Clean up {f} imports",
];

const PR_TITLES = [
  "Add {f} support",
  "Implement {f} workflow",
  "Fix {f} edge cases",
  "Upgrade {f} dependencies",
  "Refactor {f} architecture",
  "Add {f} tests",
];

const PR_BODIES = [
  "LGTM",
  "Looks good to me!",
  "Nice work.",
  "A few minor comments.",
  "Please address the feedback.",
  "Approved with minor suggestions.",
];

/** @param {import('./rng.js').SeededRNG} rng @param {Date} start @param {Date} end */
function randDate(rng, start, end) {
  return new Date(
    start.getTime() + rng.random() * (end.getTime() - start.getTime()),
  );
}

/**
 * Compute scenario multipliers for a given team and week.
 * @param {object[]} scenarios
 * @param {string} teamId
 * @param {Date} week
 * @returns {{ cm: number, pm: number }}
 */
function getMultipliers(scenarios, teamId, week) {
  let cm = 1;
  let pm = 1;
  for (const s of scenarios) {
    const sStart = new Date(s.timerange_start + "-01");
    const sEnd = new Date(s.timerange_end + "-28");
    if (week >= sStart && week <= sEnd) {
      for (const a of s.affects) {
        if (a.team_id === teamId) {
          cm = Math.max(cm, COMMIT_MULT[a.github_commits] || 1);
          pm = Math.max(pm, PR_MULT[a.github_prs] || 1);
        }
      }
    }
  }
  return { cm, pm };
}

/**
 * Generate push webhooks for a team week.
 * @returns {object[]}
 */
function generatePushEvents(
  rng,
  members,
  cm,
  orgName,
  team,
  week,
  weekEnd,
  counter,
) {
  const webhooks = [];
  const pushCount = Math.round(members.length * cm * 0.3);
  for (let i = 0; i < pushCount; i++) {
    const author = rng.pick(members);
    const repo = rng.pick(
      team.repos.length > 0 ? team.repos : ["default-repo"],
    );
    const feat = rng.pick(FEATURES);
    const ts = randDate(rng, week, weekEnd);
    const cid = generateHash(
      String(counter.value),
      author.name,
      ts.toISOString(),
    );

    webhooks.push({
      delivery_id: `evt-${String(++counter.value).padStart(8, "0")}`,
      event_type: "push",
      occurred_at: ts.toISOString(),
      payload: {
        ref: "refs/heads/main",
        commits: [
          {
            id: cid + cid,
            message: rng.pick(COMMIT_MSGS).replace("{f}", feat),
            timestamp: ts.toISOString(),
            added: [`src/${feat}.js`],
            removed: [],
            modified: ["src/index.js"],
          },
        ],
        repository: { full_name: `${orgName}/${repo}` },
        sender: { login: author.github_username },
      },
    });
  }
  return webhooks;
}

/**
 * Generate PR webhooks for a team week.
 * @returns {object[]}
 */
function generatePREvents(
  rng,
  members,
  pm,
  orgName,
  team,
  week,
  weekEnd,
  counter,
) {
  const webhooks = [];
  const prCount = Math.round(members.length * pm * 0.15);
  for (let i = 0; i < prCount; i++) {
    const author = rng.pick(members);
    const repo = rng.pick(
      team.repos.length > 0 ? team.repos : ["default-repo"],
    );
    const feat = rng.pick(FEATURES);
    const ts = randDate(rng, week, weekEnd);
    const prNum = rng.randomInt(1, 999);
    const branch = `feature/${feat}`;

    webhooks.push({
      delivery_id: `evt-${String(++counter.value).padStart(8, "0")}`,
      event_type: "pull_request",
      occurred_at: ts.toISOString(),
      payload: {
        action: rng.pick(["opened", "closed"]),
        number: prNum,
        pull_request: {
          number: prNum,
          title: rng.pick(PR_TITLES).replace("{f}", feat),
          state: "open",
          user: { login: author.github_username },
          created_at: ts.toISOString(),
          updated_at: ts.toISOString(),
          additions: rng.randomInt(10, 500),
          deletions: rng.randomInt(0, 100),
          changed_files: rng.randomInt(1, 20),
          merged: false,
          base: { ref: "main" },
          head: { ref: branch },
        },
        repository: { full_name: `${orgName}/${repo}` },
        sender: { login: author.github_username },
      },
    });

    if (rng.random() > 0.4) {
      const reviewer = rng.pick(
        members.filter((m) => m.name !== author.name) || [author],
      );
      const rts = new Date(ts.getTime() + rng.randomInt(1, 48) * 3600000);
      webhooks.push({
        delivery_id: `evt-${String(++counter.value).padStart(8, "0")}`,
        event_type: "pull_request_review",
        occurred_at: rts.toISOString(),
        payload: {
          action: "submitted",
          review: {
            id: rng.randomInt(10000, 99999),
            user: { login: reviewer.github_username },
            state: rng.pick(["approved", "changes_requested", "commented"]),
            body: rng.pick(PR_BODIES),
            submitted_at: rts.toISOString(),
          },
          pull_request: { number: prNum },
          repository: { full_name: `${orgName}/${repo}` },
          sender: { login: reviewer.github_username },
        },
      });
    }
  }
  return webhooks;
}

/**
 * Generate all webhook events from scenarios.
 * @param {import('../dsl/parser.js').UniverseAST} ast
 * @param {import('./rng.js').SeededRNG} rng
 * @param {object[]} people
 * @param {object[]} teams
 * @returns {object[]}
 */
export function generateWebhooks(ast, rng, people, teams) {
  const webhooks = [];
  const starts = ast.scenarios.map((s) => new Date(s.timerange_start + "-01"));
  const ends = ast.scenarios.map((s) => new Date(s.timerange_end + "-28"));
  const globalStart = new Date(Math.min(...starts, new Date("2024-07-01")));
  const globalEnd = new Date(Math.max(...ends, new Date("2026-01-28")));

  const membersByTeam = new Map();
  for (const team of teams)
    membersByTeam.set(
      team.id,
      people.filter((p) => p.team_id === team.id),
    );

  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  let week = new Date(globalStart);
  const counter = { value: 0 };
  const orgName = ast.orgs[0]?.id || "org";

  while (week < globalEnd) {
    const weekEnd = new Date(week.getTime() + oneWeek);

    for (const team of teams) {
      const members = membersByTeam.get(team.id) || [];
      if (members.length === 0) continue;

      const { cm, pm } = getMultipliers(ast.scenarios, team.id, week);

      webhooks.push(
        ...generatePushEvents(
          rng,
          members,
          cm,
          orgName,
          team,
          week,
          weekEnd,
          counter,
        ),
      );
      webhooks.push(
        ...generatePREvents(
          rng,
          members,
          pm,
          orgName,
          team,
          week,
          weekEnd,
          counter,
        ),
      );
    }

    week = weekEnd;
  }

  return webhooks;
}
