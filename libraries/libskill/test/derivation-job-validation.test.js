import { test, describe } from "node:test";
import assert from "node:assert";

import { isValidJobCombination, generateJobTitle } from "../derivation.js";
import {
  makeDiscipline,
  makeManagementDiscipline,
  makeLevel,
  makeSeniorLevel,
  makeTrack,
} from "./derivation-fixtures.js";

describe("isValidJobCombination", () => {
  test("trackless job with empty validTracks is valid (legacy)", () => {
    const discipline = makeDiscipline({ validTracks: [] });
    const level = makeLevel();

    const result = isValidJobCombination({ discipline, level });
    assert.strictEqual(result, true);
  });

  test("trackless job with null in validTracks is valid", () => {
    const discipline = makeDiscipline({ validTracks: [null, "platform"] });
    const level = makeLevel();

    const result = isValidJobCombination({ discipline, level });
    assert.strictEqual(result, true);
  });

  test("trackless job with only track IDs in validTracks is invalid", () => {
    const discipline = makeDiscipline({ validTracks: ["platform", "data"] });
    const level = makeLevel();

    const result = isValidJobCombination({ discipline, level });
    assert.strictEqual(result, false);
  });

  test("tracked job with matching validTracks is valid", () => {
    const discipline = makeDiscipline({ validTracks: [null, "platform"] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });

    const result = isValidJobCombination({ discipline, level, track });
    assert.strictEqual(result, true);
  });

  test("tracked job with non-matching validTracks is invalid", () => {
    const discipline = makeDiscipline({ validTracks: [null, "data"] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });

    const result = isValidJobCombination({ discipline, level, track });
    assert.strictEqual(result, false);
  });

  test("tracked job with validTracks containing only null rejects tracks", () => {
    const discipline = makeDiscipline({ validTracks: [null] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });

    const result = isValidJobCombination({ discipline, level, track });
    assert.strictEqual(result, false);
  });

  test("tracked job with empty validTracks is valid (legacy)", () => {
    const discipline = makeDiscipline({ validTracks: [] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });

    const result = isValidJobCombination({ discipline, level, track });
    assert.strictEqual(result, true);
  });

  test("discipline minLevel constraint rejects lower levels", () => {
    const discipline = makeDiscipline({ minLevel: "level_3" });
    const level = makeLevel({ id: "level_1", ordinalRank: 1 });
    const levels = [
      makeLevel({ id: "level_1", ordinalRank: 1 }),
      makeLevel({ id: "level_3", ordinalRank: 3 }),
    ];

    const result = isValidJobCombination({ discipline, level, levels });
    assert.strictEqual(result, false);
  });

  test("discipline minLevel constraint allows equal level", () => {
    const discipline = makeDiscipline({ minLevel: "level_3" });
    const level = makeLevel({ id: "level_3", ordinalRank: 3 });
    const levels = [makeLevel({ id: "level_3", ordinalRank: 3 })];

    const result = isValidJobCombination({ discipline, level, levels });
    assert.strictEqual(result, true);
  });

  test("track minLevel constraint rejects lower levels", () => {
    const discipline = makeDiscipline({ validTracks: ["platform"] });
    const level = makeLevel({ id: "level_1", ordinalRank: 1 });
    const track = makeTrack({ id: "platform", minLevel: "level_3" });
    const levels = [
      makeLevel({ id: "level_1", ordinalRank: 1 }),
      makeLevel({ id: "level_3", ordinalRank: 3 }),
    ];

    const result = isValidJobCombination({
      discipline,
      level,
      track,
      levels,
    });
    assert.strictEqual(result, false);
  });

  test("track minLevel constraint allows higher level", () => {
    const discipline = makeDiscipline({ validTracks: ["platform"] });
    const level = makeSeniorLevel({ id: "level_5", ordinalRank: 5 });
    const track = makeTrack({ id: "platform", minLevel: "level_3" });
    const levels = [
      makeLevel({ id: "level_3", ordinalRank: 3 }),
      makeSeniorLevel({ id: "level_5", ordinalRank: 5 }),
    ];

    const result = isValidJobCombination({
      discipline,
      level,
      track,
      levels,
    });
    assert.strictEqual(result, true);
  });

  test("invalidCombinations rule rejects matching combo", () => {
    const discipline = makeDiscipline({ validTracks: ["platform"] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });
    const validationRules = {
      invalidCombinations: [
        {
          discipline: "software_engineering",
          track: "platform",
          level: "level_3",
        },
      ],
    };

    const result = isValidJobCombination({
      discipline,
      level,
      track,
      validationRules,
    });
    assert.strictEqual(result, false);
  });

  test("invalidCombinations with partial match still rejects", () => {
    const discipline = makeDiscipline({ validTracks: ["platform"] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });
    const validationRules = {
      invalidCombinations: [
        { discipline: "software_engineering", track: "platform" },
      ],
    };

    const result = isValidJobCombination({
      discipline,
      level,
      track,
      validationRules,
    });
    assert.strictEqual(result, false);
  });

  test("invalidCombinations non-matching combo allows it", () => {
    const discipline = makeDiscipline({ validTracks: ["platform"] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });
    const validationRules = {
      invalidCombinations: [
        { discipline: "other_discipline", track: "platform" },
      ],
    };

    const result = isValidJobCombination({
      discipline,
      level,
      track,
      validationRules,
    });
    assert.strictEqual(result, true);
  });

  test("no validationRules allows everything", () => {
    const discipline = makeDiscipline({ validTracks: ["platform"] });
    const level = makeLevel();
    const track = makeTrack({ id: "platform" });

    const result = isValidJobCombination({ discipline, level, track });
    assert.strictEqual(result, true);
  });
});

// =============================================================================
// generateJobTitle
// =============================================================================

describe("generateJobTitle", () => {
  test("IC without track: professionalTitle + roleTitle", () => {
    const discipline = makeDiscipline();
    const level = makeSeniorLevel({ professionalTitle: "Staff" });

    const title = generateJobTitle(discipline, level);
    assert.strictEqual(title, "Staff Software Engineer");
  });

  test("IC with Level prefix without track: roleTitle + professionalTitle", () => {
    const discipline = makeDiscipline();
    const level = makeLevel({ professionalTitle: "Level III" });

    const title = generateJobTitle(discipline, level);
    assert.strictEqual(title, "Software Engineer Level III");
  });

  test("IC with track: professionalTitle + roleTitle - trackName", () => {
    const discipline = makeDiscipline();
    const level = makeSeniorLevel({ professionalTitle: "Staff" });
    const track = makeTrack({ name: "Platform" });

    const title = generateJobTitle(discipline, level, track);
    assert.strictEqual(title, "Staff Software Engineer - Platform");
  });

  test("IC with Level prefix and track: roleTitle + professionalTitle - trackName", () => {
    const discipline = makeDiscipline();
    const level = makeLevel({ professionalTitle: "Level III" });
    const track = makeTrack({ name: "Platform" });

    const title = generateJobTitle(discipline, level, track);
    assert.strictEqual(title, "Software Engineer Level III - Platform");
  });

  test("management without track: managementTitle, roleTitle", () => {
    const discipline = makeManagementDiscipline();
    const level = makeLevel({ managementTitle: "Manager" });

    const title = generateJobTitle(discipline, level);
    assert.strictEqual(title, "Manager, Engineering");
  });

  test("management with track: managementTitle, roleTitle - trackName", () => {
    const discipline = makeManagementDiscipline();
    const level = makeLevel({ managementTitle: "Manager" });
    const track = makeTrack({ name: "Platform" });

    const title = generateJobTitle(discipline, level, track);
    // Uses en-dash
    assert.strictEqual(title, "Manager, Engineering \u2013 Platform");
  });

  test("IC without track uses non-Level professionalTitle", () => {
    const discipline = makeDiscipline();
    const level = makeLevel({ professionalTitle: "Principal" });

    const title = generateJobTitle(discipline, level);
    assert.strictEqual(title, "Principal Software Engineer");
  });
});

// =============================================================================
// deriveResponsibilities
// =============================================================================
