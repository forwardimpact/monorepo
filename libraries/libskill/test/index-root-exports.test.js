/**
 * Regression test for the root package import.
 *
 * The root `src/index.js` re-exports a curated surface from several
 * submodules. A name re-exported from the wrong submodule produces an
 * ESM `SyntaxError: export 'X' not found in './module.js'` at link time.
 * No existing test catches it, because every other test imports directly
 * from its submodule under test. This test imports the root. The import
 * exercises the full re-export graph and fails loudly if any re-export
 * points at the wrong submodule.
 *
 * History: `./modifiers.js` re-exported `getSkillTypeForDiscipline`, but
 * `./derivation.js` defined it. The mismatch broke the root import and
 * gave no warning. Nobody found the bug until a new consumer (outside the
 * monorepo's own import conventions) tried to import from the package
 * root.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import * as libskill from "@forwardimpact/libskill";

test("root import resolves without ESM link errors", () => {
  // If any re-export in src/index.js points at the wrong submodule,
  // the import above throws at module-graph link time and this test
  // never even runs. This line runs only when the root links cleanly.
  assert.ok(libskill, "root import returned a module namespace");
});

test("every documented export is callable from the root", () => {
  // Keep this list aligned with src/index.js. Any function that the
  // root re-exports should appear here so misrouted re-exports break
  // immediately.
  const expected = [
    // Core derivation
    "deriveSkillMatrix",
    "deriveBehaviourProfile",
    "generateJobTitle",
    "generateJobId",
    "deriveJob",
    "getDisciplineSkillIds",
    "getSkillTypeForDiscipline",
    "generateAllJobs",
    "isValidJobCombination",
    "deriveResponsibilities",
    // Job operations
    "prepareJobDetail",
    "prepareJobSummary",
    "prepareJobBuilderPreview",
    // Job caching
    "buildJobKey",
    "createJobCache",
    // Modifiers
    "isCapability",
    "getSkillsByCapability",
    "buildCapabilityToSkillsMap",
    "expandModifiersToSkills",
    "extractCapabilityModifiers",
    "extractSkillModifiers",
    "resolveSkillModifier",
    // Matching
    "calculateJobMatch",
    "findMatchingJobs",
    "estimateBestFitLevel",
    "findRealisticMatches",
    // Development path
    "deriveDevelopmentPath",
    "findNextStepJob",
    "analyzeCandidate",
    // Progression
    "analyzeProgression",
    "analyzeLevelProgression",
    "analyzeTrackComparison",
    "getValidTracksForComparison",
    "getNextLevel",
    "getPreviousLevel",
    "analyzeCustomProgression",
    "getValidLevelTrackCombinations",
  ];

  for (const name of expected) {
    assert.equal(
      typeof libskill[name],
      "function",
      `libskill.${name} should be a function at the root`,
    );
  }
});
