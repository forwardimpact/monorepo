/**
 * Behaviour profile display component
 */

/** @typedef {import('../types.js').BehaviourProfileItem} BehaviourProfileItem */

import { div, table, thead, tbody, tr, th, td, a } from "../lib/render.js";
import { getBehaviourMaturityIndex } from "../lib/render.js";
import { createLevelCell } from "./detail.js";
import { truncate } from "../formatters/shared.js";

/**
 * Create a behaviour profile table
 * @param {BehaviourProfileItem[]} behaviourProfile - Behaviour profile entries
 * @returns {HTMLElement}
 */
export function createBehaviourProfile(behaviourProfile) {
  if (!behaviourProfile || behaviourProfile.length === 0) {
    return div({ className: "empty-state" }, "No behaviours in profile");
  }

  const rows = behaviourProfile.map((behaviour) => {
    const maturityIndex = getBehaviourMaturityIndex(behaviour.maturity);

    return tr(
      {},
      td(
        {},
        a(
          { href: `#/behaviour/${behaviour.behaviourId}` },
          behaviour.behaviourName,
        ),
      ),
      createLevelCell(maturityIndex, 5, behaviour.maturity),
      td(
        { className: "behaviour-description" },
        truncate(behaviour.maturityDescription, 80),
      ),
    );
  });

  return div(
    { className: "table-container" },
    table(
      { className: "table matrix-table behaviour-matrix" },
      thead(
        {},
        tr({}, th({}, "Behaviour"), th({}, "Maturity"), th({}, "Description")),
      ),
      tbody({}, ...rows),
    ),
  );
}
