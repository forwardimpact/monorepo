/**
 * GitHub event → task-prompt composition. Replaces ~70 lines of shell in
 * kata-dispatch.yml's `Compose task text` step. Each branch in the dispatch
 * function corresponds to one (event_name, action) the agent workflows react
 * to; the rendered string is identical to what the shell `case` block
 * produced, so existing facilitator behaviour is preserved.
 *
 * Templates live as named `export const` declarations at the top of the file,
 * mirroring `SUPERVISOR_SYSTEM_PROMPT` / `JUDGE_SYSTEM_PROMPT` / etc., so a
 * reader scanning libeval source can find the exact string that an agent
 * receives. Substitutions use `${KEY}` so the literal placeholders are
 * grep-discoverable.
 */

export const TASK_TEMPLATE_ISSUE_OPENED =
  'New issue: "${ISSUE_TITLE}" (#${NUMBER}) by @${AUTHOR} (type: ${AUTHOR_TYPE}). Issue URL: ${URL}.';

export const TASK_TEMPLATE_ISSUE_LABELED =
  'Label "${LABEL}" was added to issue "${ISSUE_TITLE}" (#${NUMBER}). Issue URL: ${URL}.';

export const TASK_TEMPLATE_PR_LABELED =
  'Label "${LABEL}" was added to PR "${PR_TITLE}" (#${NUMBER}). PR URL: ${URL}.';

export const TASK_TEMPLATE_PR_MERGED =
  'PR "${PR_TITLE}" (#${NUMBER}) merged. PR URL: ${URL}.';

export const TASK_TEMPLATE_ISSUE_COMMENT_ON_ISSUE =
  'New comment on issue "${ISSUE_TITLE}" (#${NUMBER}) by @${AUTHOR} (type: ${AUTHOR_TYPE}). Comment URL: ${URL}.';

export const TASK_TEMPLATE_ISSUE_COMMENT_ON_PR =
  "New comment on PR #${NUMBER} by @${AUTHOR} (type: ${AUTHOR_TYPE}). Comment URL: ${URL}.";

export const TASK_TEMPLATE_REVIEW_SUBMITTED =
  'Review submitted on PR "${PR_TITLE}" (#${NUMBER}) by @${AUTHOR} (type: ${AUTHOR_TYPE}). Review URL: ${URL}.';

function render(template, fields) {
  let out = template;
  for (const [key, value] of Object.entries(fields)) {
    out = out.replaceAll("${" + key + "}", value ?? "");
  }
  return out;
}

function extractCommonFields(payload) {
  return {
    NUMBER: String(payload.issue?.number ?? payload.pull_request?.number ?? ""),
    ISSUE_TITLE: payload.issue?.title ?? "",
    PR_TITLE: payload.pull_request?.title ?? "",
    LABEL: payload.label?.name ?? "",
    AUTHOR:
      payload.comment?.user?.login ??
      payload.review?.user?.login ??
      payload.issue?.user?.login ??
      payload.pull_request?.user?.login ??
      "",
    AUTHOR_TYPE:
      payload.comment?.user?.type ??
      payload.review?.user?.type ??
      payload.issue?.user?.type ??
      payload.pull_request?.user?.type ??
      "User",
    URL:
      payload.comment?.html_url ??
      payload.review?.html_url ??
      payload.issue?.html_url ??
      payload.pull_request?.html_url ??
      "",
  };
}

// Static `(event_name, action)` → template lookup. The "issue_comment" /
// "created" entry needs payload context (issue vs PR), so it returns a chooser
// instead of a template. Anything missing from the table throws downstream.
const TEMPLATE_DISPATCH = {
  "issues:opened": () => TASK_TEMPLATE_ISSUE_OPENED,
  "issues:labeled": () => TASK_TEMPLATE_ISSUE_LABELED,
  "pull_request:closed": () => TASK_TEMPLATE_PR_MERGED,
  "pull_request:labeled": () => TASK_TEMPLATE_PR_LABELED,
  "pull_request_target:closed": () => TASK_TEMPLATE_PR_MERGED,
  "pull_request_target:labeled": () => TASK_TEMPLATE_PR_LABELED,
  "pull_request_review:submitted": () => TASK_TEMPLATE_REVIEW_SUBMITTED,
  "issue_comment:created": (payload) =>
    payload.issue?.pull_request != null
      ? TASK_TEMPLATE_ISSUE_COMMENT_ON_PR
      : TASK_TEMPLATE_ISSUE_COMMENT_ON_ISSUE,
};

function pickTemplate(payload, eventName) {
  const chooser = TEMPLATE_DISPATCH[`${eventName}:${payload.action}`];
  return chooser ? chooser(payload) : null;
}

/**
 * Compose the task a libeval lead receives from a native GitHub event payload.
 * Returns `{ task, amend }`: `task` is the template-rendered context for real
 * events (or empty string for `workflow_dispatch`); `amend` is read from
 * `payload.inputs?.prompt` so an ad-hoc dispatcher (workflow_dispatch trigger
 * or bridge) can layer instructions on top without the workflow wiring
 * `--task-amend` separately. The runner combines them via the existing
 * taskAmend path.
 *
 * Throws on unknown (event_name, action) combos so a typo doesn't silently
 * ship a misleading prompt.
 *
 * @param {object} payload - Native event payload (shape mirrors
 *   `$GITHUB_EVENT_PATH` JSON written by the runner).
 * @param {string} eventName - Value of `$GITHUB_EVENT_NAME` for the run.
 * @returns {{ task: string, amend: string }}
 */
export function composeTaskFromGitHubEvent(payload, eventName) {
  if (!eventName) {
    throw new Error("composeTaskFromGitHubEvent: eventName is required");
  }

  const amend = payload.inputs?.prompt ?? "";

  if (eventName === "workflow_dispatch") {
    if (!amend) {
      throw new Error(
        "composeTaskFromGitHubEvent: workflow_dispatch payload must include inputs.prompt",
      );
    }
    return { task: "", amend };
  }

  const template = pickTemplate(payload, eventName);
  if (!template) {
    throw new Error(
      `composeTaskFromGitHubEvent: no template for event_name="${eventName}" action="${payload.action}"`,
    );
  }
  return { task: render(template, extractCommonFields(payload)), amend };
}
