// A rule pairs one probe with the threshold its count must stay below. A new
// guardrail adds a rule set and a probe, not a second script.

import {
  commentsProbe,
  commitsProbe,
  issuesProbe,
  pullsProbe,
} from "./sources/github-activity.js";

/**
 * Build one guardrail rule.
 * @param {object} input
 * @param {string} input.id - The counter's id, which the reason names.
 * @param {number} input.threshold - The count that counts as a breach.
 * @param {Function} input.probe - The probe that reads the count.
 * @returns {Readonly<{id: string, threshold: number, probe: Function}>} The rule.
 */
export function createRule({ id, threshold, probe }) {
  return Object.freeze({ id, threshold, probe });
}

/**
 * Build the four repository-activity rules, each carrying the same threshold.
 * @param {number} threshold - The threshold every counter carries.
 * @returns {Array<Readonly<object>>} The rules, in report order.
 */
export function activityRules(threshold) {
  return [
    createRule({ id: "commits", threshold, probe: commitsProbe }),
    createRule({ id: "pulls", threshold, probe: pullsProbe }),
    createRule({ id: "issues", threshold, probe: issuesProbe }),
    createRule({ id: "comments", threshold, probe: commentsProbe }),
  ];
}
