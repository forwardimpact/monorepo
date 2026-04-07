/**
 * View builder for behaviour entities.
 */

import { behaviourIri, driverIri } from "../iri.js";

/**
 * @param {object} behaviour - Raw behaviour entity
 * @param {object} ctx
 * @param {Array} ctx.drivers
 * @returns {object}
 */
export function buildBehaviourView(behaviour, ctx) {
  const { drivers = [] } = ctx || {};

  const maturities = Object.entries(behaviour.maturityDescriptions || {}).map(
    ([level, description]) => ({ level, description }),
  );

  const relatedDrivers = drivers
    .filter((d) => (d.contributingBehaviours || []).includes(behaviour.id))
    .map((d) => ({ iri: driverIri(d.id), id: d.id, name: d.name }));

  return {
    iri: behaviourIri(behaviour.id),
    id: behaviour.id,
    name: behaviour.name,
    description: behaviour.description || "",
    maturities,
    relatedDrivers,
  };
}
