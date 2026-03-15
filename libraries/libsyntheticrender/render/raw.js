/**
 * Raw Document Renderer — generates individual JSON/YAML documents
 * destined for Supabase Storage or local output.
 *
 * Produces: GitHub webhooks, GetDX API payloads, people YAML,
 * roster YAML, and teams YAML.
 */

import YAML from "yaml";

/**
 * Render raw documents from entities.
 * @param {object} entities
 * @param {Map<string,string>} [proseMap] - Optional prose map for comment text
 * @returns {Map<string,string>} storage-path → content
 */
export function renderRawDocuments(entities, proseMap) {
  const files = new Map();

  renderGitHubWebhooks(entities, files);
  renderGetDXPayloads(entities, files);
  renderGetDXInitiatives(entities, files);
  renderGetDXScorecards(entities, files);
  renderGetDXComments(entities, files, proseMap);
  renderRosterSnapshots(entities, files);
  renderSummitYAML(entities, files);
  renderPeopleYAML(entities, files);

  return files;
}

/**
 * Render activity files (roster + teams) from entities.
 * @param {object} entities
 * @returns {Map<string,string>} path → YAML content
 */
export function renderActivityFiles(entities) {
  const files = new Map();
  files.set("roster.yaml", renderRoster(entities));
  files.set("teams.yaml", renderTeams(entities));
  return files;
}

/**
 * Render GitHub webhook JSON payloads.
 * @param {object} entities
 * @param {Map<string,string>} files
 */
function renderGitHubWebhooks(entities, files) {
  if (!entities.activity?.webhooks) return;

  for (const webhook of entities.activity.webhooks) {
    const path = `github/${webhook.delivery_id}.json`;
    files.set(path, JSON.stringify(webhook, null, 2));
  }

  // Index file for all webhooks
  const index = entities.activity.webhooks.map((w) => ({
    id: w.delivery_id,
    type: w.event_type,
    repo: w.payload?.repository?.full_name,
    actor: w.payload?.sender?.login,
    created_at: w.occurred_at,
  }));
  files.set("github/index.json", JSON.stringify(index, null, 2));
}

/**
 * Render GetDX API payloads.
 * @param {object} entities
 * @param {Map<string,string>} files
 */
function renderGetDXPayloads(entities, files) {
  // teams.list
  if (entities.activity?.activityTeams) {
    const teamsList = entities.activity.activityTeams.map((t) => ({
      id: t.getdx_team_id,
      name: t.name,
      parent_id: t.parent_id || null,
      parent: t.is_parent || false,
      manager_id: t.manager_id || null,
      contributors: t.contributors || 0,
      last_changed_at: t.last_changed_at || null,
      reference_id: t.reference_id || null,
      ancestors: t.ancestors || [],
    }));
    files.set(
      "getdx/teams.list.json",
      JSON.stringify({ ok: true, teams: teamsList }, null, 2),
    );
  }

  // snapshots.list
  if (entities.activity?.snapshots) {
    const snapshotsList = entities.activity.snapshots.map((s) => ({
      id: s.snapshot_id,
      account_id: s.account_id,
      last_result_change_at: s.last_result_change_at,
      scheduled_for: s.scheduled_for,
      completed_at: s.completed_at,
      completed_count: s.completed_count,
      deleted_at: s.deleted_at || null,
      total_count: s.total_count,
    }));
    files.set(
      "getdx/snapshots.list.json",
      JSON.stringify({ ok: true, snapshots: snapshotsList }, null, 2),
    );
  }

  // snapshots.info — one per snapshot with scores
  if (entities.activity?.snapshots && entities.activity?.scores) {
    const scoresBySnapshot = new Map();
    for (const score of entities.activity.scores) {
      const key = score.snapshot_id;
      if (!scoresBySnapshot.has(key)) scoresBySnapshot.set(key, []);
      scoresBySnapshot.get(key).push(score);
    }

    for (const [snapshotId, scores] of scoresBySnapshot) {
      const teamScores = scores.map((s) => ({
        snapshot_team: {
          id: s.snapshot_team_id,
          name: s.team_name,
          team_id: s.getdx_team_id,
          parent: s.is_parent || false,
          parent_id: s.parent_id || null,
          ancestors: s.ancestors || [],
        },
        item_id: s.item_id,
        item_type: s.item_type,
        item_name: s.item_name,
        response_count: s.response_count,
        score: s.score,
        contributor_count: s.contributor_count,
        vs_prev: s.vs_prev,
        vs_org: s.vs_org,
        vs_50th: s.vs_50th,
        vs_75th: s.vs_75th,
        vs_90th: s.vs_90th,
      }));

      files.set(
        `getdx/snapshots/${snapshotId}.json`,
        JSON.stringify(
          { ok: true, snapshot: { team_scores: teamScores } },
          null,
          2,
        ),
      );
    }
  }

  // evidence
  if (entities.activity?.evidence) {
    files.set(
      "getdx/evidence.json",
      JSON.stringify({ evidence: entities.activity.evidence }, null, 2),
    );
  }
}

/**
 * Render GetDX initiatives API payloads.
 * @param {object} entities
 * @param {Map<string,string>} files
 */
function renderGetDXInitiatives(entities, files) {
  if (!entities.activity?.initiatives) return;

  const initiatives = entities.activity.initiatives.map((init) => ({
    id: init.id,
    name: init.name,
    description: init.description,
    scorecard_id: init.scorecard_id,
    scorecard_name: init.scorecard_name,
    priority: init.priority,
    published: init.published,
    complete_by: init.complete_by,
    percentage_complete: init.percentage_complete,
    passed_checks: init.passed_checks,
    total_checks: init.total_checks,
    remaining_dev_days: init.remaining_dev_days,
    owner: init.owner,
    tags: init.tags,
  }));

  files.set(
    "getdx/initiatives.list.json",
    JSON.stringify({ ok: true, initiatives }, null, 2),
  );

  for (const init of initiatives) {
    files.set(
      `getdx/initiatives/${init.id}.json`,
      JSON.stringify({ ok: true, initiative: init }, null, 2),
    );
  }
}

/**
 * Render GetDX scorecards API payloads.
 * @param {object} entities
 * @param {Map<string,string>} files
 */
function renderGetDXScorecards(entities, files) {
  if (!entities.activity?.scorecards) return;

  const scorecards = entities.activity.scorecards.map((sc) => ({
    id: sc.id,
    name: sc.name,
    description: sc.description,
    type: sc.type,
    published: sc.published,
    checks: sc.checks,
    levels: sc.levels,
    tags: sc.tags,
    entity_filter_type: "entity_types",
    entity_filter_sql: null,
    entity_filter_type_ids: [],
    editors: [],
    admins: [],
    sql_errors: [],
    empty_level_label: "Not assessed",
    empty_level_color: "#9ca3af",
  }));

  files.set(
    "getdx/scorecards.list.json",
    JSON.stringify({ ok: true, scorecards }, null, 2),
  );

  for (const sc of scorecards) {
    files.set(
      `getdx/scorecards/${sc.id}.json`,
      JSON.stringify({ ok: true, scorecard: sc }, null, 2),
    );
  }
}

/**
 * Render GetDX snapshot comments API payloads.
 * Uses LLM-generated prose from the prose map when available,
 * falls back to placeholder text.
 * @param {object} entities
 * @param {Map<string,string>} files
 * @param {Map<string,string>} [proseMap]
 */
function renderGetDXComments(entities, files, proseMap) {
  if (!entities.activity?.commentKeys) return;

  // Group comments by snapshot
  const bySnapshot = new Map();
  for (const ck of entities.activity.commentKeys) {
    if (!bySnapshot.has(ck.snapshot_id)) bySnapshot.set(ck.snapshot_id, []);
    bySnapshot.get(ck.snapshot_id).push(ck);
  }

  for (const [snapshotId, keys] of bySnapshot) {
    const comments = keys.map((ck) => {
      // Look up LLM-generated prose
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
      // Search by iterating if hash-based cache key doesn't match directly
      if (!text && proseMap) {
        for (const [, v] of proseMap) {
          // The prose map uses hashed keys, so we rely on generation order
        }
      }

      return {
        snapshot_id: ck.snapshot_id,
        email: ck.email,
        text: text || `[${ck.driver_name} — ${ck.trajectory}] Comment pending prose generation.`,
        timestamp: ck.timestamp,
        team_id: ck.team_id,
      };
    });

    files.set(
      `getdx/snapshots/${snapshotId}/comments.json`,
      JSON.stringify({ ok: true, comments }, null, 2),
    );
  }
}

/**
 * Render quarterly roster snapshots for Summit trajectory.
 * @param {object} entities
 * @param {Map<string,string>} files
 */
function renderRosterSnapshots(entities, files) {
  if (!entities.activity?.rosterSnapshots) return;

  const snapshots = entities.activity.rosterSnapshots.map((rs) => ({
    quarter: rs.quarter,
    members: rs.members,
    changes: rs.changes,
    roster: rs.roster,
  }));

  files.set(
    "activity/roster-snapshots.json",
    JSON.stringify({ roster_snapshots: snapshots }, null, 2),
  );

  for (const rs of snapshots) {
    files.set(
      `activity/roster-snapshots/${rs.quarter}.yaml`,
      YAML.stringify(
        { quarter: rs.quarter, members: rs.members, changes: rs.changes, roster: rs.roster },
        { lineWidth: 120 },
      ),
    );
  }
}

/**
 * Render summit.yaml with project teams and allocation.
 * @param {object} entities
 * @param {Map<string,string>} files
 */
function renderSummitYAML(entities, files) {
  if (!entities.activity?.projectTeams) return;

  const teams = {};
  for (const pt of entities.activity.projectTeams) {
    teams[pt.id] = pt.members.map((m) => ({
      name: m.name,
      email: m.email,
      job: m.job,
      ...(m.allocation !== 1.0 ? { allocation: m.allocation } : {}),
    }));
  }

  // Also include reporting teams from roster
  const reportingTeams = {};
  if (entities.activity?.roster) {
    const teamMap = new Map();
    for (const person of entities.activity.roster) {
      if (!teamMap.has(person.team_id)) teamMap.set(person.team_id, []);
      teamMap.get(person.team_id).push({
        name: person.name,
        email: person.email,
        job: {
          discipline: person.discipline,
          level: person.level,
          ...(person.track ? { track: person.track } : {}),
        },
      });
    }
    for (const [teamId, members] of teamMap) {
      reportingTeams[teamId] = members;
    }
  }

  const summitData = { teams: reportingTeams, projects: teams };
  files.set(
    "activity/summit.yaml",
    YAML.stringify(summitData, { lineWidth: 120 }),
  );
}

/**
 * Render individual people YAML files.
 * @param {object} entities
 * @param {Map<string,string>} files
 */
function renderPeopleYAML(entities, files) {
  for (const person of entities.people) {
    const team = entities.teams.find((t) => t.id === person.team_id);
    const dept = entities.departments.find((d) => d.id === person.department);

    const data = {
      id: person.id,
      name: person.name,
      email: person.email,
      github: person.github,
      iri: person.iri,
      discipline: person.discipline,
      level: person.level,
      team: { id: team?.id, name: team?.name },
      department: { id: dept?.id, name: dept?.name },
      hire_date: person.hire_date,
      is_manager: person.is_manager || false,
    };

    files.set(
      `people/${person.id}.yaml`,
      YAML.stringify(data, { lineWidth: 120 }),
    );
  }

  // People index
  const index = entities.people.map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team_id,
    level: p.level,
  }));
  files.set("people/index.json", JSON.stringify(index, null, 2));
}

/**
 * Render roster YAML for GetDX integration.
 * @param {object} entities
 * @returns {string}
 */
function renderRoster(entities) {
  const roster = entities.people.map((person) => ({
    id: person.id,
    name: person.name,
    email: person.email,
    github: person.github,
    team: person.team_id,
    department: person.department,
    discipline: person.discipline,
    level: person.level,
    hire_date: person.hire_date,
    is_manager: person.is_manager || false,
  }));

  return YAML.stringify({ roster }, { lineWidth: 120 });
}

/**
 * Render teams YAML.
 * @param {object} entities
 * @returns {string}
 */
function renderTeams(entities) {
  const teams = entities.teams.map((team) => {
    const dept = entities.departments.find((d) => d.id === team.department);
    const members = entities.people.filter((p) => p.team_id === team.id);
    const manager = members.find((m) => m.is_manager);

    return {
      id: team.id,
      name: team.name,
      department: team.department,
      department_name: dept?.name || "",
      manager: manager?.name || "",
      manager_email: manager?.email || "",
      size: team.size,
      members: members.map((m) => ({
        name: m.name,
        email: m.email,
        level: m.level,
      })),
    };
  });

  return YAML.stringify({ teams }, { lineWidth: 120 });
}
