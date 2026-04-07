/**
 * View builder for driver entities.
 */

import { driverIri, skillIri, behaviourIri } from "../iri.js";

/**
 * @param {object} driver - Raw driver entity
 * @returns {object}
 */
export function buildDriverView(driver) {
  const contributingSkills = (driver.contributingSkills || []).map((id) => ({
    iri: skillIri(id),
    id,
  }));
  const contributingBehaviours = (driver.contributingBehaviours || []).map(
    (id) => ({ iri: behaviourIri(id), id }),
  );

  return {
    iri: driverIri(driver.id),
    id: driver.id,
    name: driver.name,
    description: driver.description || "",
    contributingSkills,
    contributingBehaviours,
  };
}
