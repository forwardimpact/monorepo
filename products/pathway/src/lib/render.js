/**
 * Utilities that render the DOM
 *
 * Re-exports generic utilities from @forwardimpact/libui/render.
 * Adds domain-specific display helpers.
 */

export {
  getContainer,
  render,
  createElement,
  div,
  span,
  h1,
  h2,
  h3,
  h4,
  p,
  a,
  ul,
  li,
  table,
  thead,
  tbody,
  tr,
  th,
  td,
  pre,
  code,
  button,
  input,
  select,
  option,
  optgroup,
  label,
  form,
  section,
  article,
  header,
  footer,
  nav,
  main,
  details,
  summary,
  heading1,
  heading2,
  heading3,
  fragment,
  showLoading,
  showError,
  formatLevel,
} from "@forwardimpact/libui/render";

import {
  SKILL_PROFICIENCY_ORDER,
  BEHAVIOUR_MATURITY_ORDER,
} from "@forwardimpact/libskill/levels";

/**
 * Rank a skill proficiency on its scale
 *
 * The rank counts levels, so 'awareness' ranks 1 and 'expert' ranks 5.
 * `getSkillProficiencyIndex` in libskill returns the 0-based index instead.
 * @param {string} level
 * @returns {number} 1-5, or 0 when the level is unknown
 */
export function rankSkillProficiency(level) {
  return SKILL_PROFICIENCY_ORDER.indexOf(level) + 1;
}

/**
 * Rank a behaviour maturity on its scale
 *
 * The rank counts levels, so 'emerging' ranks 1 and 'exemplifying' ranks 5.
 * `getBehaviourMaturityIndex` in libskill returns the 0-based index instead.
 * @param {string} maturity
 * @returns {number} 1-5, or 0 when the maturity is unknown
 */
export function rankBehaviourMaturity(maturity) {
  return BEHAVIOUR_MATURITY_ORDER.indexOf(maturity) + 1;
}
