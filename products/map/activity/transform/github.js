/**
 * GitHub Transform
 *
 * Reads stored GitHub webhook documents from Supabase Storage and produces
 * structured rows in github_events and github_artifacts tables.
 * Idempotent: running the same transform on the same raw data always produces
 * the same database state (via upsert).
 */

import { readRaw, listRaw } from "../storage.js";

/**
 * Artifact types extracted from GitHub events.
 * @readonly
 * @enum {string}
 */
export const ArtifactType = {
  PULL_REQUEST: "pull_request",
  REVIEW: "review",
  COMMIT: "commit",
};

/**
 * Transform a single stored GitHub webhook into DB rows.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} path - Storage path to the raw webhook document
 * @returns {Promise<{event: boolean, artifacts: number, errors: Array<string>}>}
 */
export async function transformGitHubWebhook(supabase, path) {
  const raw = JSON.parse(await readRaw(supabase, path));
  const { delivery_id, event_type, payload } = raw;

  // Insert into github_events
  const { error: eventError } = await supabase.from("github_events").upsert(
    {
      delivery_id,
      event_type,
      action: payload.action || null,
      repository: payload.repository?.full_name || "unknown",
      sender_github_username: payload.sender?.login || null,
      occurred_at: payload.created_at || raw.received_at,
      raw: payload,
    },
    { onConflict: "delivery_id" },
  );

  // Extract and store artifacts
  const artifacts = extractArtifacts(event_type, payload);
  let artifactCount = 0;
  const errors = eventError ? [eventError.message] : [];

  for (const artifact of artifacts) {
    const email = await resolveEmail(supabase, artifact.github_username);
    const { error } = await supabase.from("github_artifacts").upsert(
      {
        artifact_type: artifact.artifact_type,
        external_id: artifact.external_id,
        repository: artifact.repository,
        github_username: artifact.github_username,
        email,
        occurred_at: artifact.occurred_at,
        metadata: artifact.metadata,
        raw: artifact.raw,
      },
      { onConflict: "external_id" },
    );

    if (error) errors.push(`${artifact.external_id}: ${error.message}`);
    else artifactCount++;
  }

  return { event: !eventError, artifacts: artifactCount, errors };
}

/**
 * Transform all stored GitHub webhooks.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{events: number, artifacts: number, errors: Array<string>}>}
 */
export async function transformAllGitHub(supabase) {
  const files = await listRaw(supabase, "github/");
  let totalEvents = 0;
  let totalArtifacts = 0;
  const allErrors = [];

  for (const file of files) {
    const result = await transformGitHubWebhook(
      supabase,
      `github/${file.name}`,
    );
    if (result.event) totalEvents++;
    totalArtifacts += result.artifacts;
    allErrors.push(...result.errors);
  }

  return { events: totalEvents, artifacts: totalArtifacts, errors: allErrors };
}

// ── Artifact extraction ─────────────────────────────────────────────────────

/**
 * Extract artifacts from a webhook payload based on event type.
 * @param {string} eventType - GitHub event type
 * @param {object} payload - Webhook payload
 * @returns {Array<object>} Extracted artifact rows
 */
export function extractArtifacts(eventType, payload) {
  switch (eventType) {
    case "pull_request":
      return extractPullRequestArtifacts(payload);
    case "pull_request_review":
      return extractReviewArtifacts(payload);
    case "push":
      return extractCommitArtifacts(payload);
    default:
      return [];
  }
}

/**
 * Extract artifacts from a pull_request event.
 * @param {object} payload - Webhook payload
 * @returns {Array<object>} Extracted artifact rows
 */
function extractPullRequestArtifacts(payload) {
  const pr = payload.pull_request;
  if (!pr) return [];

  return [
    {
      artifact_type: ArtifactType.PULL_REQUEST,
      external_id: `pr:${payload.repository.full_name}#${pr.number}`,
      repository: payload.repository.full_name,
      github_username: pr.user?.login || null,
      occurred_at: pr.created_at || pr.updated_at,
      metadata: {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        additions: pr.additions,
        deletions: pr.deletions,
        changed_files: pr.changed_files,
        merged: pr.merged || false,
        base_branch: pr.base?.ref,
        head_branch: pr.head?.ref,
      },
      raw: pr,
    },
  ];
}

/**
 * Extract artifacts from a pull_request_review event.
 * @param {object} payload - Webhook payload
 * @returns {Array<object>} Extracted artifact rows
 */
function extractReviewArtifacts(payload) {
  const review = payload.review;
  if (!review) return [];

  return [
    {
      artifact_type: ArtifactType.REVIEW,
      external_id: `review:${payload.repository.full_name}#${payload.pull_request?.number}:${review.id}`,
      repository: payload.repository.full_name,
      github_username: review.user?.login || null,
      occurred_at: review.submitted_at,
      metadata: {
        pr_number: payload.pull_request?.number,
        state: review.state,
        body_length: review.body?.length || 0,
      },
      raw: review,
    },
  ];
}

/**
 * Extract artifacts from a push event (commits).
 * @param {object} payload - Webhook payload
 * @returns {Array<object>} Extracted artifact rows
 */
function extractCommitArtifacts(payload) {
  const commits = payload.commits || [];

  return commits.map((commit) => ({
    artifact_type: ArtifactType.COMMIT,
    external_id: `commit:${payload.repository.full_name}:${commit.id}`,
    repository: payload.repository.full_name,
    github_username: payload.sender?.login || null,
    occurred_at: commit.timestamp,
    metadata: {
      sha: commit.id,
      message: commit.message,
      added: commit.added?.length || 0,
      removed: commit.removed?.length || 0,
      modified: commit.modified?.length || 0,
    },
    raw: commit,
  }));
}

/**
 * Look up email for a GitHub username from organization_people.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} githubUsername - GitHub login
 * @returns {Promise<string|null>} Email or null if not found
 */
async function resolveEmail(supabase, githubUsername) {
  if (!githubUsername) return null;

  const { data } = await supabase
    .from("organization_people")
    .select("email")
    .eq("github_username", githubUsername)
    .single();

  return data?.email || null;
}
