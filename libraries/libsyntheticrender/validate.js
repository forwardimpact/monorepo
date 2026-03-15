/**
 * Cross-content validation — pure function over the entity graph.
 *
 * @module libuniverse/validate
 */

/**
 * Validate cross-content integrity of generated entities.
 * @param {object} entities
 * @returns {{passed: boolean, total: number, failures: number, checks: object[]}}
 */
export function validateCrossContent(entities) {
  const checks = [
    checkPeopleCoverage(entities),
    checkPathwayValidity(entities),
    checkRosterCompleteness(entities),
    checkTeamAssignments(entities),
    checkManagerReferences(entities),
    checkGithubUsernames(entities),
    checkWebhookPayloadSchemas(entities),
    checkWebhookDeliveryIds(entities),
    checkWebhookSenderUsernames(entities),
    checkGetDXTeamsResponse(entities),
    checkGetDXSnapshotsListResponse(entities),
    checkGetDXSnapshotsInfoResponses(entities),
    checkSnapshotScoreDriverIds(entities),
    checkScoreTrajectories(entities),
    checkEvidenceProficiency(entities),
    checkEvidenceSkillIds(entities),
    checkInitiativeScorecardRefs(entities),
    checkInitiativeOwnerEmails(entities),
    checkInitiativeDriverRefs(entities),
    checkCommentSnapshotRefs(entities),
    checkCommentEmailRefs(entities),
    checkCommentTeamRefs(entities),
    checkScorecardCheckIds(entities),
    checkRosterSnapshotQuarters(entities),
    checkProjectTeamEmails(entities),
  ];

  const failures = checks.filter((c) => !c.passed);
  return {
    passed: failures.length === 0,
    total: checks.length,
    failures: failures.length,
    checks,
  };
}

// ─── Check functions ─────────────────────────────

function checkPeopleCoverage(entities) {
  const teamIds = new Set(entities.teams.map((t) => t.id));
  const uncovered = entities.people.filter((p) => !teamIds.has(p.team_id));
  return {
    name: "people_coverage",
    passed: uncovered.length === 0,
    message:
      uncovered.length === 0
        ? "All people assigned to valid teams"
        : `${uncovered.length} people assigned to unknown teams`,
  };
}

function checkPathwayValidity(entities) {
  const fw = entities.framework;
  const hasFramework = fw && fw.proficiencies && fw.proficiencies.length > 0;

  // Check for extended pathway structure (capabilities as objects with skills)
  const hasPathwayEntities =
    fw?.capabilities?.length > 0 && typeof fw.capabilities[0] === "object";

  if (!hasPathwayEntities) {
    // Legacy flat-array format — just check proficiencies exist
    return {
      name: "pathway_validity",
      passed: !!hasFramework,
      message: hasFramework
        ? "Framework config present with proficiencies"
        : "Missing framework configuration or proficiencies",
    };
  }

  // Extended pathway — validate cross-references
  const errors = [];
  const skillIds = new Set(fw.capabilities.flatMap((c) => c.skills || []));
  const behaviourIds = new Set(fw.behaviours.map((b) => b.id));

  // Check discipline skill references
  for (const disc of fw.disciplines || []) {
    for (const skillId of [
      ...(disc.core || []),
      ...(disc.supporting || []),
      ...(disc.broad || []),
    ]) {
      if (!skillIds.has(skillId)) {
        errors.push(
          `Discipline '${disc.id}' references unknown skill '${skillId}'`,
        );
      }
    }
  }

  // Check driver skill/behaviour references
  for (const driver of fw.drivers || []) {
    for (const skillId of driver.skills || []) {
      if (!skillIds.has(skillId)) {
        errors.push(
          `Driver '${driver.id}' references unknown skill '${skillId}'`,
        );
      }
    }
    for (const behId of driver.behaviours || []) {
      if (!behaviourIds.has(behId)) {
        errors.push(
          `Driver '${driver.id}' references unknown behaviour '${behId}'`,
        );
      }
    }
  }

  return {
    name: "pathway_validity",
    passed: errors.length === 0,
    message:
      errors.length === 0
        ? "Pathway data structure valid with cross-references"
        : `Pathway errors: ${errors.join("; ")}`,
  };
}

function checkRosterCompleteness(entities) {
  const roster = entities.activity?.roster || [];
  const hasAll = entities.people.every((p) =>
    roster.some((r) => r.email === p.email),
  );
  return {
    name: "roster_completeness",
    passed: hasAll,
    message: hasAll
      ? "All people present in activity roster"
      : "Some people missing from activity roster",
  };
}

function checkTeamAssignments(entities) {
  const teamSizes = new Map();
  for (const person of entities.people) {
    teamSizes.set(person.team_id, (teamSizes.get(person.team_id) || 0) + 1);
  }
  const emptyTeams = entities.teams.filter(
    (t) => (teamSizes.get(t.id) || 0) === 0,
  );
  return {
    name: "team_assignments",
    passed: emptyTeams.length === 0,
    message:
      emptyTeams.length === 0
        ? "All teams have at least one member"
        : `${emptyTeams.length} teams have no members`,
  };
}

function checkManagerReferences(entities) {
  const managers = entities.people.filter((p) => p.is_manager);
  const teamIds = new Set(entities.teams.map((t) => t.id));
  const orphaned = managers.filter((m) => !teamIds.has(m.team_id));
  return {
    name: "manager_references",
    passed: orphaned.length === 0,
    message:
      orphaned.length === 0
        ? "All managers reference valid teams"
        : `${orphaned.length} managers reference unknown teams`,
  };
}

function checkGithubUsernames(entities) {
  const usernames = entities.people.map((p) => p.github).filter(Boolean);
  const unique = new Set(usernames);
  return {
    name: "github_usernames",
    passed: unique.size === usernames.length,
    message:
      unique.size === usernames.length
        ? "All GitHub usernames are unique"
        : `${usernames.length - unique.size} duplicate GitHub usernames`,
  };
}

function checkWebhookPayloadSchemas(entities) {
  const webhooks = entities.activity?.webhooks || [];
  const invalid = webhooks.filter(
    (w) =>
      !w.delivery_id ||
      !w.event_type ||
      !w.payload?.repository ||
      !w.payload?.sender,
  );
  return {
    name: "webhook_payload_schemas",
    passed: invalid.length === 0,
    message:
      invalid.length === 0
        ? `All ${webhooks.length} webhooks have valid schemas`
        : `${invalid.length} webhooks missing required fields`,
  };
}

function checkWebhookDeliveryIds(entities) {
  const webhooks = entities.activity?.webhooks || [];
  const ids = webhooks.map((w) => w.delivery_id);
  const unique = new Set(ids);
  return {
    name: "webhook_delivery_ids",
    passed: unique.size === ids.length,
    message:
      unique.size === ids.length
        ? "All webhook delivery IDs are unique"
        : `${ids.length - unique.size} duplicate webhook delivery IDs`,
  };
}

function checkWebhookSenderUsernames(entities) {
  const webhooks = entities.activity?.webhooks || [];
  const knownUsernames = new Set(entities.people.map((p) => p.github));
  const unknown = webhooks.filter(
    (w) =>
      w.payload?.sender?.login && !knownUsernames.has(w.payload.sender.login),
  );
  return {
    name: "webhook_sender_usernames",
    passed: unknown.length === 0,
    message:
      unknown.length === 0
        ? "All webhook senders are known users"
        : `${unknown.length} webhooks from unknown senders`,
  };
}

function checkGetDXTeamsResponse(entities) {
  const teams = entities.activity?.activityTeams || [];
  const hasRequired = teams.every((t) => t.getdx_team_id && t.name);
  return {
    name: "getdx_teams_response",
    passed: hasRequired && teams.length > 0,
    message:
      hasRequired && teams.length > 0
        ? `${teams.length} GetDX teams with valid structure`
        : "GetDX teams response missing or invalid",
  };
}

function checkGetDXSnapshotsListResponse(entities) {
  const snapshots = entities.activity?.snapshots || [];
  const hasRequired = snapshots.every(
    (s) => s.snapshot_id && s.scheduled_for && s.completed_at,
  );
  return {
    name: "getdx_snapshots_list_response",
    passed: hasRequired && snapshots.length > 0,
    message:
      hasRequired && snapshots.length > 0
        ? `${snapshots.length} snapshots with valid structure`
        : "GetDX snapshots list response missing or invalid",
  };
}

function checkGetDXSnapshotsInfoResponses(entities) {
  const scores = entities.activity?.scores || [];
  const hasRequired = scores.every(
    (s) =>
      s.snapshot_id &&
      s.getdx_team_id &&
      s.item_id &&
      typeof s.score === "number",
  );
  return {
    name: "getdx_snapshots_info_responses",
    passed: hasRequired && scores.length > 0,
    message:
      hasRequired && scores.length > 0
        ? `${scores.length} snapshot scores with valid structure`
        : "GetDX snapshot scores missing or invalid",
  };
}

function checkSnapshotScoreDriverIds(entities) {
  const scores = entities.activity?.scores || [];
  const VALID_DRIVERS = new Set([
    "clear_direction",
    "say_on_priorities",
    "requirements_quality",
    "ease_of_release",
    "test_efficiency",
    "managing_tech_debt",
    "code_review",
    "documentation",
    "codebase_experience",
    "incident_response",
    "learning_culture",
    "experimentation",
    "connectedness",
    "efficient_processes",
    "deep_work",
    "leveraging_user_feedback",
  ]);
  const invalid = scores.filter((s) => !VALID_DRIVERS.has(s.item_id));
  return {
    name: "snapshot_score_driver_ids",
    passed: invalid.length === 0,
    message:
      invalid.length === 0
        ? "All score driver IDs are valid"
        : `${invalid.length} scores with unknown driver IDs`,
  };
}

function checkScoreTrajectories(entities) {
  const scores = entities.activity?.scores || [];
  const outOfRange = scores.filter((s) => s.score < 0 || s.score > 100);
  return {
    name: "score_trajectories",
    passed: outOfRange.length === 0,
    message:
      outOfRange.length === 0
        ? "All scores within 0–100 range"
        : `${outOfRange.length} scores out of 0–100 range`,
  };
}

function checkEvidenceProficiency(entities) {
  const evidence = entities.activity?.evidence || [];
  const VALID_PROFICIENCIES = new Set([
    "awareness",
    "foundational",
    "working",
    "practitioner",
    "expert",
  ]);
  const invalid = evidence.filter(
    (e) => e.proficiency && !VALID_PROFICIENCIES.has(e.proficiency),
  );
  return {
    name: "evidence_proficiency",
    passed: invalid.length === 0,
    message:
      invalid.length === 0
        ? "All evidence proficiency levels are valid"
        : `${invalid.length} evidence entries with invalid proficiency`,
  };
}

function checkEvidenceSkillIds(entities) {
  const evidence = entities.activity?.evidence || [];
  const hasIds = evidence.every((e) => e.skill_id);
  return {
    name: "evidence_skill_ids",
    passed: hasIds || evidence.length === 0,
    message:
      hasIds || evidence.length === 0
        ? "All evidence entries have skill IDs"
        : "Some evidence entries missing skill IDs",
  };
}

function checkInitiativeScorecardRefs(entities) {
  const initiatives = entities.activity?.initiatives || [];
  const scorecardIds = new Set(
    (entities.activity?.scorecards || []).map((s) => s.id),
  );
  const invalid = initiatives.filter(
    (i) => i.scorecard_id && !scorecardIds.has(i.scorecard_id),
  );
  return {
    name: "initiative_scorecard_refs",
    passed: invalid.length === 0,
    message:
      invalid.length === 0
        ? "All initiative scorecard references are valid"
        : `${invalid.length} initiatives reference unknown scorecards`,
  };
}

function checkInitiativeOwnerEmails(entities) {
  const initiatives = entities.activity?.initiatives || [];
  const emails = new Set(entities.people.map((p) => p.email));
  const invalid = initiatives.filter(
    (i) => i.owner?.email && !emails.has(i.owner.email),
  );
  return {
    name: "initiative_owner_emails",
    passed: invalid.length === 0,
    message:
      invalid.length === 0
        ? "All initiative owners are known people"
        : `${invalid.length} initiatives with unknown owner emails`,
  };
}

function checkInitiativeDriverRefs(entities) {
  const initiatives = entities.activity?.initiatives || [];
  const driverIds = new Set(
    (entities.framework?.drivers || []).map((d) => d.id),
  );
  const invalid = initiatives.filter(
    (i) => i._driver_id && !driverIds.has(i._driver_id),
  );
  return {
    name: "initiative_driver_refs",
    passed: invalid.length === 0,
    message:
      invalid.length === 0
        ? "All initiative driver references are valid"
        : `${invalid.length} initiatives reference unknown drivers`,
  };
}

function checkCommentSnapshotRefs(entities) {
  const comments = entities.activity?.commentKeys || [];
  const snapshotIds = new Set(
    (entities.activity?.snapshots || []).map((s) => s.snapshot_id),
  );
  const invalid = comments.filter(
    (c) => c.snapshot_id && !snapshotIds.has(c.snapshot_id),
  );
  return {
    name: "comment_snapshot_refs",
    passed: invalid.length === 0,
    message:
      invalid.length === 0
        ? "All comment snapshot references are valid"
        : `${invalid.length} comments reference unknown snapshots`,
  };
}

function checkCommentEmailRefs(entities) {
  const comments = entities.activity?.commentKeys || [];
  const emails = new Set(entities.people.map((p) => p.email));
  const invalid = comments.filter((c) => c.email && !emails.has(c.email));
  return {
    name: "comment_email_refs",
    passed: invalid.length === 0,
    message:
      invalid.length === 0
        ? "All comment respondent emails are known people"
        : `${invalid.length} comments from unknown emails`,
  };
}

function checkCommentTeamRefs(entities) {
  const comments = entities.activity?.commentKeys || [];
  const teamIds = new Set(entities.teams.map((t) => t.id));
  const invalid = comments.filter((c) => c.team_id && !teamIds.has(c.team_id));
  return {
    name: "comment_team_refs",
    passed: invalid.length === 0,
    message:
      invalid.length === 0
        ? "All comment team references are valid"
        : `${invalid.length} comments reference unknown teams`,
  };
}

function checkScorecardCheckIds(entities) {
  const scorecards = entities.activity?.scorecards || [];
  const allCheckIds = scorecards.flatMap((s) =>
    (s.checks || []).map((c) => c.id),
  );
  const unique = new Set(allCheckIds);
  return {
    name: "scorecard_check_ids",
    passed: unique.size === allCheckIds.length,
    message:
      unique.size === allCheckIds.length
        ? "All scorecard check IDs are unique"
        : `${allCheckIds.length - unique.size} duplicate scorecard check IDs`,
  };
}

function checkRosterSnapshotQuarters(entities) {
  const rosterSnapshots = entities.activity?.rosterSnapshots || [];
  const snapshotIds = new Set(
    (entities.activity?.snapshots || []).map((s) => s.snapshot_id),
  );
  const invalid = rosterSnapshots.filter(
    (rs) => rs.snapshot_id && !snapshotIds.has(rs.snapshot_id),
  );
  return {
    name: "roster_snapshot_quarters",
    passed: invalid.length === 0,
    message:
      invalid.length === 0
        ? "All roster snapshots align with survey snapshots"
        : `${invalid.length} roster snapshots without matching survey snapshots`,
  };
}

function checkProjectTeamEmails(entities) {
  const projectTeams = entities.activity?.projectTeams || [];
  const emails = new Set(entities.people.map((p) => p.email));
  const invalid = projectTeams.flatMap((pt) =>
    pt.members.filter((m) => m.email && !emails.has(m.email)),
  );
  return {
    name: "project_team_emails",
    passed: invalid.length === 0,
    message:
      invalid.length === 0
        ? "All project team member emails are known people"
        : `${invalid.length} project team members with unknown emails`,
  };
}

/**
 * Content validator class with DI.
 */
export class ContentValidator {
  /**
   * @param {object} logger - Logger instance
   */
  constructor(logger) {
    if (!logger) throw new Error("logger is required");
    this.logger = logger;
  }

  /**
   * Validate cross-content integrity of generated entities.
   * @param {object} entities
   * @returns {{passed: boolean, total: number, failures: number, checks: object[]}}
   */
  validate(entities) {
    return validateCrossContent(entities);
  }
}
