import { describe, test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  composeTaskFromGitHubEvent,
  TASK_TEMPLATE_ISSUE_OPENED,
  TASK_TEMPLATE_ISSUE_LABELED,
  TASK_TEMPLATE_PR_LABELED,
  TASK_TEMPLATE_PR_MERGED,
  TASK_TEMPLATE_ISSUE_COMMENT_ON_ISSUE,
  TASK_TEMPLATE_ISSUE_COMMENT_ON_PR,
  TASK_TEMPLATE_REVIEW_SUBMITTED,
} from "@forwardimpact/libeval";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "events",
);
const loadFixture = (name) =>
  JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));

describe("TASK_TEMPLATE_* constants carry the documented placeholders", () => {
  test("issue-shaped templates reference ${NUMBER}, ${ISSUE_TITLE}, ${URL}", () => {
    for (const tpl of [
      TASK_TEMPLATE_ISSUE_OPENED,
      TASK_TEMPLATE_ISSUE_LABELED,
    ]) {
      assert.ok(tpl.includes("${NUMBER}"));
      assert.ok(tpl.includes("${ISSUE_TITLE}"));
      assert.ok(tpl.includes("${URL}"));
    }
  });

  test("PR-shaped templates reference ${PR_TITLE} and ${NUMBER}", () => {
    for (const tpl of [TASK_TEMPLATE_PR_LABELED, TASK_TEMPLATE_PR_MERGED]) {
      assert.ok(tpl.includes("${PR_TITLE}"));
      assert.ok(tpl.includes("${NUMBER}"));
    }
  });

  test("comment-shaped templates reference ${AUTHOR} and ${AUTHOR_TYPE}", () => {
    for (const tpl of [
      TASK_TEMPLATE_ISSUE_COMMENT_ON_ISSUE,
      TASK_TEMPLATE_ISSUE_COMMENT_ON_PR,
      TASK_TEMPLATE_REVIEW_SUBMITTED,
    ]) {
      assert.ok(tpl.includes("${AUTHOR}"));
      assert.ok(tpl.includes("${AUTHOR_TYPE}"));
    }
  });

  test("labeled templates reference ${LABEL}", () => {
    assert.ok(TASK_TEMPLATE_ISSUE_LABELED.includes("${LABEL}"));
    assert.ok(TASK_TEMPLATE_PR_LABELED.includes("${LABEL}"));
  });
});

describe("composeTaskFromGitHubEvent matches the kata-dispatch shell output", () => {
  test("issues / opened", () => {
    const out = composeTaskFromGitHubEvent(loadFixture("issues-opened.json"), {
      eventName: "issues",
    });
    assert.strictEqual(
      out,
      'New issue: "Investigate flaky CI" (#42) by @alice (type: User). Issue URL: https://github.com/acme/repo/issues/42.',
    );
  });

  test("issues / labeled", () => {
    const out = composeTaskFromGitHubEvent(loadFixture("issues-labeled.json"), {
      eventName: "issues",
    });
    assert.strictEqual(
      out,
      'Label "agent:staff-engineer" was added to issue "Investigate flaky CI" (#42). Issue URL: https://github.com/acme/repo/issues/42.',
    );
  });

  test("pull_request_target / labeled", () => {
    const out = composeTaskFromGitHubEvent(loadFixture("pr-labeled.json"), {
      eventName: "pull_request_target",
    });
    assert.strictEqual(
      out,
      'Label "spec:approved" was added to PR "Wire up task-event" (#99). PR URL: https://github.com/acme/repo/pull/99.',
    );
  });

  test("pull_request_target / closed (merged)", () => {
    const out = composeTaskFromGitHubEvent(loadFixture("pr-merged.json"), {
      eventName: "pull_request_target",
    });
    assert.strictEqual(
      out,
      'PR "Wire up task-event" (#99) merged. PR URL: https://github.com/acme/repo/pull/99.',
    );
  });

  test("issue_comment / created — on issue", () => {
    const out = composeTaskFromGitHubEvent(
      loadFixture("issue-comment-on-issue.json"),
      { eventName: "issue_comment" },
    );
    assert.strictEqual(
      out,
      'New comment on issue "Investigate flaky CI" (#42) by @carol (type: User). Comment URL: https://github.com/acme/repo/issues/42#issuecomment-1.',
    );
  });

  test("issue_comment / created — on PR", () => {
    const out = composeTaskFromGitHubEvent(
      loadFixture("issue-comment-on-pr.json"),
      { eventName: "issue_comment" },
    );
    assert.strictEqual(
      out,
      "New comment on PR #99 by @carol (type: Bot). Comment URL: https://github.com/acme/repo/pull/99#issuecomment-2.",
    );
  });

  test("pull_request_review / submitted", () => {
    const out = composeTaskFromGitHubEvent(
      loadFixture("review-submitted.json"),
      { eventName: "pull_request_review" },
    );
    assert.strictEqual(
      out,
      'Review submitted on PR "Wire up task-event" (#99) by @dave (type: User). Review URL: https://github.com/acme/repo/pull/99#pullrequestreview-1.',
    );
  });

  test("workflow_dispatch returns dispatchPrompt verbatim", () => {
    const out = composeTaskFromGitHubEvent(
      { inputs: { prompt: "ignored" } },
      { eventName: "workflow_dispatch", dispatchPrompt: "Do the thing." },
    );
    assert.strictEqual(out, "Do the thing.");
  });
});

describe("composeTaskFromGitHubEvent error paths", () => {
  test("workflow_dispatch without dispatchPrompt throws", () => {
    assert.throws(
      () => composeTaskFromGitHubEvent({}, { eventName: "workflow_dispatch" }),
      /workflow_dispatch requires dispatchPrompt/,
    );
  });

  test("missing eventName throws", () => {
    assert.throws(
      () => composeTaskFromGitHubEvent({}, {}),
      /eventName is required/,
    );
  });

  test("unknown event/action throws", () => {
    assert.throws(
      () =>
        composeTaskFromGitHubEvent(
          { action: "deleted" },
          { eventName: "issues" },
        ),
      /no template for event_name="issues" action="deleted"/,
    );
  });

  test("unknown event_name throws", () => {
    assert.throws(
      () =>
        composeTaskFromGitHubEvent(
          { action: "created" },
          { eventName: "discussion" },
        ),
      /no template for event_name="discussion"/,
    );
  });
});
