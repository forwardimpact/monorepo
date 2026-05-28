import { readFileSync } from "node:fs";
import { composeTaskFromGitHubEvent } from "../events/github.js";

/**
 * Resolve `--task-file` / `--task-text` / `--task-event` into the task string
 * the runner consumes. Exactly one of the three must be set; the helper is
 * shared across run/supervise/facilitate/discuss to keep the contract aligned.
 *
 * @param {object} values - Parsed option values from cli.parse()
 * @returns {string}
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

  if (taskFile) return readFileSync(taskFile, "utf8");
  if (taskText) return taskText;

  const payload = JSON.parse(readFileSync(taskEvent, "utf8"));
  const eventName = values["task-event-name"] ?? process.env.GITHUB_EVENT_NAME;
  if (!eventName) {
    throw new Error(
      "--task-event requires GITHUB_EVENT_NAME or --task-event-name",
    );
  }
  return composeTaskFromGitHubEvent(payload, {
    eventName,
    dispatchPrompt: values["task-event-dispatch-prompt"],
  });
}
