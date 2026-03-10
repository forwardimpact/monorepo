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
 * @returns {Map<string,string>} storage-path → content
 */
export function renderRawDocuments(entities) {
  const files = new Map();

  renderGitHubWebhooks(entities, files);
  renderGetDXPayloads(entities, files);
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
