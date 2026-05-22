/**
 * Trigger a GitHub Actions `workflow_dispatch` for the channel-agnostic
 * Kata dispatch workflow. Both `services/ghbridge` and `services/msbridge`
 * route through this helper so the request body and headers stay byte-
 * identical across bridges.
 *
 * Only includes `discussion_id` and `resume_context` in the `inputs` body
 * when defined, so callers that omit them stay byte-identical to the legacy
 * msteams dispatcher.
 *
 * @param {object} params
 * @param {string} params.workflowFile - Workflow filename, e.g. `"kata-dispatch.yml"`
 * @param {string} [params.ref] - Git ref to dispatch against (default `"main"`)
 * @param {string} params.repo - `"owner/repo"`
 * @param {string} params.token - GitHub installation/access token
 * @param {string} params.prompt - The facilitator prompt
 * @param {string} params.callbackUrl - Where the workflow posts the reply
 * @param {string} params.correlationId - UUID linking dispatch → callback
 * @param {string} [params.discussionId] - For trace linkage in libeval
 * @param {string} [params.resumeContext] - JSON string carried across resumes
 * @returns {Promise<void>}
 */
export async function dispatchWorkflow({
  workflowFile,
  ref = "main",
  repo,
  token,
  prompt,
  callbackUrl,
  correlationId,
  discussionId,
  resumeContext,
}) {
  if (!workflowFile) throw new Error("workflowFile is required");
  if (!repo) throw new Error("repo is required");
  if (!token) throw new Error("token is required");

  const inputs = {
    prompt,
    callback_url: callbackUrl,
    correlation_id: correlationId,
  };
  if (discussionId !== undefined) inputs.discussion_id = discussionId;
  if (resumeContext !== undefined) inputs.resume_context = resumeContext;

  const url = `https://api.github.com/repos/${repo}/actions/workflows/${workflowFile}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref, inputs }),
  });

  if (!res.ok) {
    // GitHub's error body sometimes echoes the dispatched inputs, including
    // the callback URL which carries a single-use token. Surface only the
    // status — operators can inspect the run log if they need more.
    throw new Error(
      `workflow_dispatch failed: ${res.status} ${res.statusText}`,
    );
  }
}
