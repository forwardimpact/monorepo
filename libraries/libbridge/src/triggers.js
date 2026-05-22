/**
 * @typedef {object} ResumeTrigger
 * @property {"responses"|"elapsed"|"either"} kind
 * @property {number} [responses] - Number of new responses needed.
 *   For `kind: "either"`, optional alongside `elapsed`.
 * @property {string} [elapsed] - ISO-8601 duration, e.g. `"P14D"`, `"PT12H"`,
 *   `"P1DT6H"`. Required for `kind: "elapsed"`; optional for `"either"`.
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
 * @param {{responses?: number, opened_at?: number}} observed
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
    case "responses":
      return evaluateResponses(trigger, observed);
    case "elapsed":
      return evaluateElapsed(trigger, observed, now);
    case "either": {
      const r =
        trigger.responses !== undefined
          ? evaluateResponses(trigger, observed)
          : { fired: false };
      const e =
        trigger.elapsed !== undefined
          ? evaluateElapsed(trigger, observed, now)
          : { fired: false };
      if (r.fired || e.fired) return { fired: true };
      return e.due_at !== undefined
        ? { fired: false, due_at: e.due_at }
        : { fired: false };
    }
    default:
      throw new Error(`Unsupported trigger kind: ${trigger.kind}`);
  }
}

function evaluateResponses(trigger, observed) {
  if (typeof trigger.responses !== "number" || trigger.responses < 1) {
    throw new Error(
      'trigger.responses must be a positive number for kind "responses"',
    );
  }
  const seen = observed.responses ?? 0;
  return { fired: seen >= trigger.responses };
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
