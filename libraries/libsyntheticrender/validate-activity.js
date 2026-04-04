/**
 * Activity validation checks — webhook, GetDX, snapshot, initiative,
 * comment, scorecard, roster, and project team checks.
 *
 * Extracted from validate.js to reduce file length.
 *
 * @module libuniverse/validate-activity
 */

import { PROFICIENCY_LEVELS } from "@forwardimpact/libsyntheticgen/vocabulary.js";

export function checkWebhookPayloadSchemas(entities) {
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

export function checkWebhookDeliveryIds(entities) {
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

export function checkWebhookSenderUsernames(entities) {
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

export function checkGetDXTeamsResponse(entities) {
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

export function checkGetDXSnapshotsListResponse(entities) {
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

export function checkGetDXSnapshotsInfoResponses(entities) {
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

export function checkSnapshotScoreDriverIds(entities) {
  const scores = entities.activity?.scores || [];
  const validDrivers = new Set(
    (entities.framework?.drivers || []).map((d) => d.id),
  );
  const invalid = scores.filter((s) => !validDrivers.has(s.item_id));
  return {
    name: "snapshot_score_driver_ids",
    passed: invalid.length === 0,
    message:
      invalid.length === 0
        ? "All score driver IDs are valid"
        : `${invalid.length} scores with unknown driver IDs`,
  };
}

export function checkScoreTrajectories(entities) {
  const scores = entities.activity?.scores || [];
  const outOfRange = scores.filter((s) => s.score < 0 || s.score > 100);
  return {
    name: "score_trajectories",
    passed: outOfRange.length === 0,
    message:
      outOfRange.length === 0
        ? "All scores within 0-100 range"
        : `${outOfRange.length} scores out of 0-100 range`,
  };
}

export function checkEvidenceProficiency(entities) {
  const evidence = entities.activity?.evidence || [];
  const VALID_PROFICIENCIES = new Set(PROFICIENCY_LEVELS);
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

export function checkEvidenceSkillIds(entities) {
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

export function checkInitiativeScorecardRefs(entities) {
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

export function checkInitiativeOwnerEmails(entities) {
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

export function checkInitiativeDriverRefs(entities) {
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

export function checkCommentSnapshotRefs(entities) {
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

export function checkCommentEmailRefs(entities) {
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

export function checkCommentTeamRefs(entities) {
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

export function checkScorecardCheckIds(entities) {
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

export function checkRosterSnapshotQuarters(entities) {
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

export function checkProjectTeamEmails(entities) {
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
