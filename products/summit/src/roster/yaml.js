/**
 * Parse Summit roster YAML into a normalized Roster object.
 *
 * Summit's YAML format is a superset of Map's `people:` file. It declares
 * `teams:` (reporting teams) and optional `projects:` (project teams with
 * allocation). A project member may reference a reporting team member by
 * email alone. The parser then resolves their job from the reporting team.
 *
 * The parser is pure. It takes a string and returns plain data, no I/O.
 */

import { parse as parseYaml } from "yaml";

/**
 * @typedef {object} RosterPerson
 * @property {string} name
 * @property {string} email
 * @property {{ discipline: string, level: string, track?: string }} job
 * @property {number} [allocation] - Project teams only. Defaults to 1.0.
 */

/**
 * @typedef {object} RosterTeam
 * @property {string} id
 * @property {"reporting" | "project"} type
 * @property {RosterPerson[]} members
 * @property {string|null} [managerEmail] - Map-sourced teams populate this.
 */

/**
 * @typedef {object} Roster
 * @property {"map" | "yaml"} source
 * @property {Map<string, RosterTeam>} teams
 * @property {Map<string, RosterTeam>} projects
 */

/**
 * Parse a Summit roster YAML document.
 *
 * @param {string} content - YAML document contents.
 * @returns {Roster}
 */
export function parseRosterYaml(content) {
  const parsed = parseYaml(content);
  validateRosterShape(parsed);

  const teams = parseTeams(parsed.teams);
  const projects = parseProjects(parsed.projects ?? {}, teams);

  return { source: "yaml", teams, projects };
}

function validateRosterShape(parsed) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error(
      "summit: roster YAML must be an object with a `teams:` key.",
    );
  }
  if (Array.isArray(parsed)) {
    throw new Error(
      "summit: roster YAML must be an object with a `teams:` key. Summit does not support a bare list of people.",
    );
  }
  if (!parsed.teams || typeof parsed.teams !== "object") {
    throw new Error(
      "summit: roster YAML must define at least one team under `teams:`.",
    );
  }
}

function parseTeams(teamsRaw) {
  const teams = new Map();
  for (const [teamId, entries] of Object.entries(teamsRaw)) {
    if (!Array.isArray(entries)) {
      throw new Error(`summit: team "${teamId}" must be a list of members.`);
    }
    const members = entries.map((raw) => normalizeReportingPerson(raw, teamId));
    teams.set(teamId, {
      id: teamId,
      type: "reporting",
      members,
      managerEmail: null,
    });
  }
  return teams;
}

function parseProjects(projectsRaw, teams) {
  const projects = new Map();
  if (!projectsRaw || typeof projectsRaw !== "object") return projects;
  for (const [projectId, entries] of Object.entries(projectsRaw)) {
    if (!Array.isArray(entries)) {
      throw new Error(
        `summit: project "${projectId}" must be a list of members.`,
      );
    }
    const members = entries.map((raw) =>
      resolveProjectMember(raw, projectId, teams),
    );
    projects.set(projectId, {
      id: projectId,
      type: "project",
      members,
      managerEmail: null,
    });
  }
  return projects;
}

function normalizeReportingPerson(raw, teamId) {
  if (!raw || typeof raw !== "object") {
    throw new Error(
      `summit: team "${teamId}" contains a non-object member entry.`,
    );
  }
  if (!raw.name || typeof raw.name !== "string") {
    throw new Error(
      `summit: team "${teamId}" has a member missing required field "name".`,
    );
  }
  if (!raw.email || typeof raw.email !== "string") {
    throw new Error(
      `summit: team "${teamId}" member "${raw.name}" is missing required field "email".`,
    );
  }
  if (!raw.job || typeof raw.job !== "object") {
    throw new Error(
      `summit: team "${teamId}" member "${raw.name}" is missing required field "job".`,
    );
  }
  if ("allocation" in raw) {
    throw new Error(
      `summit: team "${teamId}" member "${raw.name}" has "allocation" set, but allocation is only allowed on project team members.`,
    );
  }
  const job = normalizeJob(raw.job, `${teamId} / ${raw.name}`);
  return {
    name: raw.name,
    email: raw.email,
    job,
  };
}

function resolveProjectMember(raw, projectId, teams) {
  if (!raw || typeof raw !== "object") {
    throw new Error(
      `summit: project "${projectId}" contains a non-object member entry.`,
    );
  }

  const allocation = normalizeAllocation(raw.allocation, projectId);
  const hasEmail = Boolean(raw.email);
  const hasInline = Boolean(raw.name || raw.job);

  if (hasEmail && !hasInline) {
    return resolveProjectByEmail(raw, projectId, teams, allocation);
  }
  if (hasEmail && hasInline) {
    return mergeProjectMember(raw, projectId, teams, allocation);
  }
  if (raw.name && raw.job) {
    return inlineProjectMember(raw, projectId, allocation);
  }

  throw new Error(
    `summit: project "${projectId}" member is missing required fields (email, or name + job).`,
  );
}

function resolveProjectByEmail(raw, projectId, teams, allocation) {
  const resolved = findByEmail(teams, raw.email);
  if (!resolved) {
    throw new Error(
      `summit: project "${projectId}" references unknown member by email "${raw.email}". Add the person to a reporting team or provide a name + job inline.`,
    );
  }
  return {
    name: resolved.name,
    email: resolved.email,
    job: { ...resolved.job },
    allocation,
  };
}

function mergeProjectMember(raw, projectId, teams, allocation) {
  const resolved = findByEmail(teams, raw.email);
  const name = raw.name ?? resolved?.name;
  const job = raw.job
    ? normalizeJob(raw.job, `${projectId} / ${raw.email}`)
    : resolved?.job && { ...resolved.job };
  if (!name || !job) {
    throw new Error(
      `summit: project "${projectId}" member "${raw.email}" is missing name or job.`,
    );
  }
  return { name, email: raw.email, job, allocation };
}

function inlineProjectMember(raw, projectId, allocation) {
  return {
    name: raw.name,
    email: raw.email ?? `__external__${projectId}__${sanitize(raw.name)}`,
    job: normalizeJob(raw.job, `${projectId} / ${raw.name}`),
    allocation,
  };
}

function normalizeAllocation(value, projectId) {
  if (value === undefined || value === null) return 1.0;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(
      `summit: project "${projectId}" has invalid allocation "${value}". Allocation must be a non-negative number.`,
    );
  }
  return n;
}

function normalizeJob(job, context) {
  if (!job.discipline || typeof job.discipline !== "string") {
    throw new Error(
      `summit: ${context} job is missing required field "discipline".`,
    );
  }
  if (!job.level || typeof job.level !== "string") {
    throw new Error(
      `summit: ${context} job is missing required field "level".`,
    );
  }
  const out = { discipline: job.discipline, level: job.level };
  if (job.track) out.track = job.track;
  return out;
}

function findByEmail(teams, email) {
  for (const team of teams.values()) {
    for (const member of team.members) {
      if (member.email === email) return member;
    }
  }
  return null;
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
}
