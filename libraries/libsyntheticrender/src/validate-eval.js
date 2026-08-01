/**
 * Eval Scenario Reference Validator.
 *
 * The validator checks that entity names and IRIs referenced in eval
 * scenarios exist in the generated data. It reports missing references.
 *
 * @module libterrain/validate-eval
 */

/**
 * Build lookup sets of IRIs and names from generated entity sources.
 * @param {object} generatedData - Full entity graph
 * @returns {{ allIris: Set<string>, allNames: Set<string> }}
 */
function buildLookupSets(generatedData) {
  const allIris = new Set();
  const allNames = new Set();

  const entitySources = [
    generatedData.orgs,
    generatedData.departments,
    generatedData.teams,
    generatedData.people,
    generatedData.projects,
  ];

  for (const source of entitySources) {
    if (!Array.isArray(source)) continue;
    for (const entity of source) {
      if (entity.iri) allIris.add(entity.iri);
      if (entity.name) allNames.add(entity.name);
      if (entity.id) allNames.add(entity.id);
    }
  }

  return { allIris, allNames };
}

/**
 * Collect IRI validation errors from a single eval scenario.
 * @param {object} scenario - Eval scenario definition
 * @param {Set<string>} allIris - Known IRIs
 * @returns {string[]}
 */
function collectScenarioErrors(scenario, allIris) {
  const errors = [];
  if (!scenario.evaluations) return errors;

  for (const evaluation of scenario.evaluations) {
    const data = evaluation.data;
    if (!data) continue;

    const iriMatches = data.match(/https?:\/\/[^\s"']+\/id\/[^\s"',)]+/g);
    if (!iriMatches) continue;

    for (const iri of iriMatches) {
      if (!allIris.has(iri)) {
        errors.push(
          `Scenario "${scenario.name}": IRI "${iri}" not found in generated data`,
        );
      }
    }
  }

  return errors;
}

/**
 * Validate eval scenario references against generated data.
 * @param {object[]} evalScenarios - Parsed eval scenario definitions
 * @param {object} generatedData - Full entity graph
 * @returns {{ passed: boolean, errors: string[] }}
 */
export function validateEvalReferences(evalScenarios, generatedData) {
  const { allIris } = buildLookupSets(generatedData);
  const errors = evalScenarios.flatMap((s) =>
    collectScenarioErrors(s, allIris),
  );

  return {
    passed: errors.length === 0,
    errors,
  };
}
