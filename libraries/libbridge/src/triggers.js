/**
 * @typedef {object} ResumeTrigger
 * @property {"missing_input"|"escalation_needed"|"elapsed"} kind
 * @property {number} [replies] - Required for `kind: "missing_input"`.
 *   Number of new replies on the dispatching thread needed to fire.
 * @property {string} [elapsed] - Required for `kind: "elapsed"`.
 *   ISO-8601 duration, e.g. `"P14D"`, `"PT12H"`, `"P1DT6H"`.
 * @property {string} [signal] - Required for `kind: "escalation_needed"`.
 *   Reserved for future use. The bridge throws when evaluating this kind
 *   until signal-based resume support lands.
 */

const ISO_8601_DURATION =
  /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;
const MS_IN_SECOND = 1000;
const MS_IN_MINUTE = 60 * MS_IN_SECOND;
const MS_IN_HOUR = 60 * MS_IN_MINUTE;
const MS_IN_DAY = 24 * MS_IN_HOUR;

/**
 * Parse an ISO-8601 duration into milliseconds. Supports the day/hour/
 * minute/second subset used by the resume-trigger contract.
 *
 * @param {string} duration - e.g. `"P14D"`, `"PT12H"`, `"P1DT6H"`, `"PT30M"`
 * @returns {number} Duration in milliseconds
 */
export function parseIsoDuration(duration) {
  if (typeof duration !== "string" || !duration) {
    throw new Error("duration must be a non-empty ISO-8601 string");
  }
  const match = ISO_8601_DURATION.exec(duration);
  if (!match || duration === "P" || duration === "PT") {
    throw new Error(`Unsupported ISO-8601 duration: ${duration}`);
  }
  const [, days, hours, minutes, seconds] = match;
  return (
    (Number(days) || 0) * MS_IN_DAY +
    (Number(hours) || 0) * MS_IN_HOUR +
    (Number(minutes) || 0) * MS_IN_MINUTE +
    (Number(seconds) || 0) * MS_IN_SECOND
  );
}

/**
 * Evaluate whether a resume trigger has fired.
 *
 * @param {ResumeTrigger} trigger
 * @param {{replies?: number, opened_at?: number}} observed
 * @param {number} now - ms epoch (caller-provided for testability)
 * @returns {{fired: boolean, due_at?: number}}
 */
export function evaluateTrigger(trigger, observed, now) {
  if (!trigger || typeof trigger !== "object") {
    throw new Error("trigger is required");
  }
  if (typeof now !== "number" || Number.isNaN(now)) {
    throw new Error("now must be a number (ms epoch)");
  }
  observed ??= {};

  switch (trigger.kind) {
    case "missing_input":
      return evaluateMissingInput(trigger, observed);
    case "elapsed":
      return evaluateElapsed(trigger, observed, now);
    case "escalation_needed":
      throw new Error(
        "escalation_needed is reserved for future use. See the follow-up spec for signal-based resume.",
      );
    default:
      throw new Error(`Unsupported trigger kind: ${trigger.kind}`);
  }
}

function evaluateMissingInput(trigger, observed) {
  if (typeof trigger.replies !== "number" || trigger.replies < 1) {
    throw new Error(
      'trigger.replies must be a positive number for kind "missing_input"',
    );
  }
  const seen = observed.replies ?? 0;
  return { fired: seen >= trigger.replies };
}

function evaluateElapsed(trigger, observed, now) {
  if (typeof trigger.elapsed !== "string") {
    throw new Error(
      'trigger.elapsed must be an ISO-8601 string for kind "elapsed"',
    );
  }
  if (typeof observed.opened_at !== "number") {
    return { fired: false };
  }
  const dueAt = observed.opened_at + parseIsoDuration(trigger.elapsed);
  return now >= dueAt
    ? { fired: true, due_at: dueAt }
    : { fired: false, due_at: dueAt };
}
