import { createSupabaseClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const deliveryId = req.headers.get("X-GitHub-Delivery");
  const eventType = req.headers.get("X-GitHub-Event");

  if (!deliveryId || !eventType) {
    return new Response("Missing required GitHub headers", { status: 400 });
  }

  const payload = await req.json();
  const supabase = createSupabaseClient();

  // Extract: store raw webhook
  const rawPath = `github/${deliveryId}.json`;
  const document = JSON.stringify({
    delivery_id: deliveryId,
    event_type: eventType,
    received_at: new Date().toISOString(),
    payload,
  });

  const { error: storeError } = await supabase.storage
    .from("raw")
    .upload(rawPath, document, {
      contentType: "application/json",
      upsert: true,
    });

  if (storeError) {
    return new Response(JSON.stringify({ error: storeError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Transform: process webhook into events + artifacts
  const eventRow = {
    delivery_id: deliveryId,
    event_type: eventType,
    action: payload.action || null,
    repository: payload.repository?.full_name || "unknown",
    sender_github_username: payload.sender?.login || null,
    occurred_at: payload.created_at || new Date().toISOString(),
    raw: payload,
  };

  const { error: eventError } = await supabase
    .from("github_events")
    .upsert(eventRow, { onConflict: "delivery_id" });

  // Extract artifacts and store them
  const artifacts = extractArtifacts(eventType, payload);
  let artifactCount = 0;

  for (const artifact of artifacts) {
    const { data: person } = await supabase
      .from("organization_people")
      .select("email")
      .eq("github_username", artifact.github_username)
      .single();

    const { error } = await supabase.from("github_artifacts").upsert(
      {
        ...artifact,
        email: person?.email || null,
      },
      { onConflict: "external_id" },
    );

    if (!error) artifactCount++;
  }

  return new Response(
    JSON.stringify({
      event: !eventError,
      artifacts: artifactCount,
      raw: rawPath,
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
});

function extractArtifacts(eventType: string, payload: Record<string, unknown>) {
  switch (eventType) {
    case "pull_request":
      return extractPR(payload);
    case "pull_request_review":
      return extractReview(payload);
    case "push":
      return extractCommits(payload);
    default:
      return [];
  }
}

function extractPR(payload: Record<string, unknown>) {
  const pr = (payload as Record<string, Record<string, unknown>>).pull_request;
  if (!pr) return [];
  const repo = (payload as Record<string, Record<string, unknown>>).repository;
  return [
    {
      artifact_type: "pull_request",
      external_id: `pr:${repo?.full_name}#${pr.number}`,
      repository: repo?.full_name as string,
      github_username:
        ((pr.user as Record<string, unknown>)?.login as string) || null,
      occurred_at: (pr.created_at || pr.updated_at) as string,
      metadata: {
        number: pr.number,
        title: pr.title,
        state: pr.state,
        additions: pr.additions,
        deletions: pr.deletions,
        changed_files: pr.changed_files,
        merged: pr.merged || false,
        base_branch: (pr.base as Record<string, unknown>)?.ref,
        head_branch: (pr.head as Record<string, unknown>)?.ref,
      },
      raw: pr,
    },
  ];
}

function extractReview(payload: Record<string, unknown>) {
  const review = (payload as Record<string, Record<string, unknown>>).review;
  if (!review) return [];
  const repo = (payload as Record<string, Record<string, unknown>>).repository;
  const pullRequest = (payload as Record<string, Record<string, unknown>>)
    .pull_request;
  return [
    {
      artifact_type: "review",
      external_id: `review:${repo?.full_name}#${pullRequest?.number}:${review.id}`,
      repository: repo?.full_name as string,
      github_username:
        ((review.user as Record<string, unknown>)?.login as string) || null,
      occurred_at: review.submitted_at as string,
      metadata: {
        pr_number: pullRequest?.number,
        state: review.state,
        body_length: (review.body as string)?.length || 0,
      },
      raw: review,
    },
  ];
}

function extractCommits(payload: Record<string, unknown>) {
  const commits = (payload.commits || []) as Record<string, unknown>[];
  const repo = (payload as Record<string, Record<string, unknown>>).repository;
  return commits.map((commit) => ({
    artifact_type: "commit",
    external_id: `commit:${repo?.full_name}:${commit.id}`,
    repository: repo?.full_name as string,
    github_username:
      ((payload.sender as Record<string, unknown>)?.login as string) || null,
    occurred_at: commit.timestamp as string,
    metadata: {
      sha: commit.id,
      message: commit.message,
      added: (commit.added as string[])?.length || 0,
      removed: (commit.removed as string[])?.length || 0,
      modified: (commit.modified as string[])?.length || 0,
    },
    raw: commit,
  }));
}
