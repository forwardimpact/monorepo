import { readFileSync } from "node:fs";
import { composeTaskFromGitHubEvent } from "../events/github.js";

/**
 * Resolve `--task-file` / `--task-text` / `--task-event` into the task pair the
 * runner consumes. Exactly one of the three must be set. For `--task-event`,
 * libeval reads the event payload and extracts both the main task (from the
 * template that matches `$GITHUB_EVENT_NAME` + `payload.action`) and the
 * amendment (from `payload.inputs?.prompt`) — so the workflow doesn't need to
 * wire `--task-amend` separately. For the other two modes, `--task-amend`
 * works as before.
 *
 * @param {object} values - Parsed option values from cli.parse()
 * @returns {{ task: string, amend: string | undefined }}
 */
export function resolveTaskContent(values) {
  const taskFile = values["task-file"];
  const taskText = values["task-text"];
  const taskEvent = values["task-event"];

  const set = [taskFile, taskText, taskEvent].filter(Boolean).length;
  if (set === 0) {
    throw new Error(
      "one of --task-file, --task-text, --task-event is required",
    );
  }
  if (set > 1) {
    throw new Error(
      "--task-file, --task-text, --task-event are mutually exclusive",
    );
  }

  const amendFlag = values["task-amend"] ?? undefined;

  if (taskFile) {
    return { task: readFileSync(taskFile, "utf8"), amend: amendFlag };
  }
  if (taskText) {
    return { task: taskText, amend: amendFlag };
  }

  const eventName = process.env.GITHUB_EVENT_NAME;
  if (!eventName) {
    throw new Error("--task-event requires GITHUB_EVENT_NAME to be set");
  }
  const payload = JSON.parse(readFileSync(taskEvent, "utf8"));
  const composed = composeTaskFromGitHubEvent(payload, eventName);
  return { task: composed.task, amend: amendFlag ?? composed.amend };
}
