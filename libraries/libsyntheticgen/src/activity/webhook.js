/**
 * Webhook-stream ProseActivity — binds the GitHub webhook output to the
 * three pipeline stages: deterministic generation (events + per-event
 * prose keys), prose-context construction (PR-body and review-body
 * entries), and output rendering (per-event JSON + index).
 *
 * `TOut = { events, keys }` per design 820-A — `events` feeds render,
 * `keys` feeds prose-context. Internal branching in `proseKeys`
 * (PR-body vs review-body) is allowed inside the per-output method
 * body; the call sites do not name the branches (criterion #2 of spec
 * 820 governs call sites, not method internals).
 *
 * @module libsyntheticgen/activity/webhook
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

const REVIEW_BODIES = [
  "LGTM",
  "Looks good to me!",
  "Nice work.",
  "A few minor comments.",
  "Please address the feedback.",
  "Approved with minor suggestions.",
];

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
            body: rng.pick(REVIEW_BODIES),
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
 * @param {import('../dsl/parser.js').TerrainAST} ast
 * @param {import('../engine/rng.js').SeededRNG} rng
 * @param {object[]} people
 * @param {object[]} teams
 * @returns {object[]}
 */
function generateWebhookEvents(ast, rng, people, teams) {
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

function isScenarioActive(scenario, week) {
  const sStart = new Date(scenario.timerange_start + "-01");
  const sEnd = new Date(scenario.timerange_end + "-28");
  return week >= sStart && week <= sEnd;
}

function extractDriversFromAffect(affect) {
  return (affect.dx_drivers || []).map((dx) => ({
    driver_id: dx.driver_id,
    trajectory: dx.trajectory,
    magnitude: dx.magnitude,
  }));
}

/**
 * Extract DX driver context for a team during a given week.
 * @param {object[]} scenarios
 * @param {string} teamId
 * @param {Date} week
 * @returns {Array<{driver_id: string, trajectory: string, magnitude: number}>}
 */
function getDriverContext(scenarios, teamId, week) {
  return scenarios
    .filter((s) => isScenarioActive(s, week))
    .flatMap((s) => s.affects.filter((a) => a.team_id === teamId))
    .flatMap(extractDriversFromAffect);
}

function findActiveScenarioForTeam(scenarios, teamId, week) {
  return scenarios.find(
    (s) =>
      isScenarioActive(s, week) && s.affects.some((a) => a.team_id === teamId),
  );
}

function getWebhookLogin(wh) {
  if (wh.event_type === "pull_request") {
    return wh.payload.pull_request?.user?.login;
  }
  if (wh.event_type === "pull_request_review") {
    return wh.payload.review?.user?.login;
  }
  return null;
}

function resolvePerson(login, peopleByLogin, teamMap) {
  const person = peopleByLogin.get(login);
  if (!person) return null;
  const team = teamMap.get(person.team_id);
  if (!team) return null;
  return { person, team };
}

function buildPRKey(wh, person, team, drivers, activeScenario) {
  const pr = wh.payload.pull_request;
  return {
    delivery_id: wh.delivery_id,
    prose_type: "pr_body",
    email: person.email,
    team_id: person.team_id,
    repo: wh.payload.repository?.full_name,
    title: pr.title,
    additions: pr.additions,
    deletions: pr.deletions,
    changed_files: pr.changed_files,
    drivers,
    person_level: person.level,
    person_discipline: person.discipline,
    scenario_name: activeScenario?.name || null,
    team_name: team.name,
  };
}

function buildReviewKey(wh, person, team, drivers, activeScenario) {
  return {
    delivery_id: wh.delivery_id,
    prose_type: "review_body",
    email: person.email,
    team_id: person.team_id,
    repo: wh.payload.repository?.full_name,
    review_state: wh.payload.review.state,
    drivers,
    person_level: person.level,
    person_discipline: person.discipline,
    scenario_name: activeScenario?.name || null,
    team_name: team.name,
  };
}

function webhookToKey(wh, scenarios, peopleByLogin, teamMap) {
  const login = getWebhookLogin(wh);
  if (!login) return [];

  const resolved = resolvePerson(login, peopleByLogin, teamMap);
  if (!resolved) return [];
  const { person, team } = resolved;

  const week = new Date(wh.occurred_at);
  const drivers = getDriverContext(scenarios, person.team_id, week);
  if (drivers.length === 0) return [];

  const scenario = findActiveScenarioForTeam(scenarios, person.team_id, week);

  if (wh.event_type === "pull_request") {
    return [buildPRKey(wh, person, team, drivers, scenario)];
  }
  if (wh.event_type === "pull_request_review") {
    return [buildReviewKey(wh, person, team, drivers, scenario)];
  }
  return [];
}

/**
 * Build prose-key metadata for webhook events. Keys are capped per
 * `ast.snapshots.webhook_prose_cap` so a small fixture does not balloon
 * the prose budget.
 *
 * @param {import('../dsl/parser.js').TerrainAST} ast
 * @param {object[]} webhooks
 * @param {object[]} people
 * @param {object[]} teams
 * @returns {object[]}
 */
function generateWebhookKeys(ast, webhooks, people, teams) {
  const peopleByLogin = new Map(people.map((p) => [p.github_username, p]));
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const keys = webhooks.flatMap((wh) =>
    webhookToKey(wh, ast.scenarios, peopleByLogin, teamMap),
  );

  const cap = ast.snapshots?.webhook_prose_cap;
  if (cap && keys.length > cap) {
    const step = keys.length / cap;
    return Array.from({ length: cap }, (_, i) => keys[Math.floor(i * step)]);
  }

  return keys;
}

/**
 * Generate webhook events + their prose keys.
 *
 * @param {object} ctx
 * @param {import('../dsl/parser.js').TerrainAST} ctx.ast
 * @param {import('../engine/rng.js').SeededRNG} ctx.rng
 * @param {object} ctx.entities
 * @param {object[]} ctx.entities.people
 * @param {object[]} ctx.entities.teams
 * @returns {{ events: object[], keys: object[] }}
 */
function generateWebhook(ctx) {
  const { ast, rng, entities } = ctx;
  const { people, teams } = entities;
  const events = generateWebhookEvents(ast, rng, people, teams);
  const keys = generateWebhookKeys(ast, events, people, teams);
  return { events, keys };
}

/**
 * Yield prose-context entries for PR-body and review-body prose. The
 * branch by `prose_type` is internal to this method — the call site
 * does not see it (criterion #2 of spec 820).
 *
 * @param {{ keys: object[] }} output
 * @param {{ domain: string, orgName: string }} ctx
 * @returns {Iterable<[string, import('./index.js').ProseContext]>}
 */
function* webhookProseKeys(output, { domain, orgName }) {
  for (const wk of output.keys) {
    if (wk.prose_type === "pr_body") {
      yield [
        `pr_body_${wk.delivery_id}`,
        {
          topic:
            `Pull request description for "${wk.title}" in ${wk.repo} ` +
            `(${wk.additions} additions, ${wk.deletions} deletions, ${wk.changed_files} files)`,
          tone: "technical, first-person developer voice",
          length: "2-4 sentences",
          maxTokens: 200,
          domain,
          orgName,
          role: `${wk.person_level} ${wk.person_discipline} on the ${wk.team_name}`,
          scenario: wk.scenario_name,
          drivers: wk.drivers,
        },
      ];
    } else if (wk.prose_type === "review_body") {
      yield [
        `review_body_${wk.delivery_id}`,
        {
          topic: `Code review (${wk.review_state}) on a PR in ${wk.repo}`,
          tone: "professional, reviewer voice",
          length: "1-3 sentences",
          maxTokens: 150,
          domain,
          orgName,
          role: `${wk.person_level} ${wk.person_discipline} on the ${wk.team_name}`,
          scenario: wk.scenario_name,
          drivers: wk.drivers,
        },
      ];
    }
  }
}

/**
 * Inject LLM-generated PR/review prose into a webhook event in-place.
 * @param {object} webhook
 * @param {Map<string,string>} [proseMap]
 */
function injectWebhookProse(webhook, proseMap) {
  if (!proseMap) return;
  const prefix =
    webhook.event_type === "pull_request"
      ? "pr_body_"
      : webhook.event_type === "pull_request_review"
        ? "review_body_"
        : null;
  if (!prefix) return;

  const body = proseMap.get(`${prefix}${webhook.delivery_id}`);
  if (!body) return;

  if (webhook.event_type === "pull_request") {
    webhook.payload.pull_request.body = body;
  } else {
    webhook.payload.review.body = body;
  }
}

/**
 * Render webhook event JSONs (one per delivery) plus an index file.
 *
 * @param {{ events: object[] }} output
 * @param {Map<string,string>} files
 * @param {Map<string,string>} [proseMap]
 */
function renderWebhook(output, files, proseMap) {
  if (!output?.events?.length) return;

  for (const webhook of output.events) {
    injectWebhookProse(webhook, proseMap);
    const path = `github/${webhook.delivery_id}.json`;
    files.set(path, JSON.stringify(webhook, null, 2));
  }

  // Index file for all webhooks
  const index = output.events.map((w) => ({
    id: w.delivery_id,
    type: w.event_type,
    repo: w.payload?.repository?.full_name,
    actor: w.payload?.sender?.login,
    created_at: w.occurred_at,
  }));
  files.set("github/index.json", JSON.stringify(index, null, 2));
}

/** @type {import('./index.js').ProseActivity} */
export const webhookActivity = {
  id: "webhook",
  generate: generateWebhook,
  proseKeys: webhookProseKeys,
  render: renderWebhook,
};
