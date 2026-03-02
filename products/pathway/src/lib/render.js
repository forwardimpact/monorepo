/**
 * DOM rendering utilities
 *
 * Re-exports generic utilities from @forwardimpact/libui/render
 * and adds domain-specific display helpers.
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
} from "@forwardimpact/map/levels";

/**
 * Get the index for a skill proficiency (1-5)
 * @param {string} level
 * @returns {number}
 */
export function getSkillProficiencyIndex(level) {
  return SKILL_PROFICIENCY_ORDER.indexOf(level) + 1;
}

/**
 * Get the index for a behaviour maturity (1-5)
 * @param {string} maturity
 * @returns {number}
 */
export function getBehaviourMaturityIndex(maturity) {
  return BEHAVIOUR_MATURITY_ORDER.indexOf(maturity) + 1;
}
