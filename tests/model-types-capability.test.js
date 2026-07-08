import { describe, it } from "node:test";
import assert from "node:assert";

import {
  getCapabilityById,
  getCapabilityOrder,
  getCapabilityEmoji,
  getCapabilityResponsibility,
  getConceptEmoji,
} from "@forwardimpact/libskill/levels";

import { testCategories } from "./model-fixtures.js";

// ============================================================================
// Capability Function Tests
// ============================================================================

describe("Capability Functions", () => {
  describe("getCapabilityById", () => {
    it("returns capability by ID", () => {
      const capability = getCapabilityById(testCategories, "scale");
      assert.ok(capability);
      assert.strictEqual(capability.id, "scale");
      assert.strictEqual(capability.name, "Scale");
    });

    it("returns undefined for unknown ID", () => {
      const capability = getCapabilityById(testCategories, "unknown");
      assert.strictEqual(capability, undefined);
    });
  });

  describe("getCapabilityOrder", () => {
    it("returns capabilities sorted by order", () => {
      const ordered = getCapabilityOrder(testCategories);
      assert.strictEqual(ordered[0], "scale");
      assert.strictEqual(ordered[1], "ai");
      assert.strictEqual(ordered[2], "people");
    });

    it("handles empty array", () => {
      const ordered = getCapabilityOrder([]);
      assert.strictEqual(ordered.length, 0);
    });
  });

  describe("getCapabilityEmoji", () => {
    it("returns emoji for capability", () => {
      const emoji = getCapabilityEmoji(testCategories, "scale");
      assert.strictEqual(emoji, "📐");
    });

    it("returns default for unknown capability", () => {
      const emoji = getCapabilityEmoji(testCategories, "unknown");
      assert.strictEqual(emoji, "💡");
    });
  });

  describe("getCapabilityResponsibility", () => {
    it("returns responsibility for capability and level", () => {
      const responsibility = getCapabilityResponsibility(
        testCategories,
        "scale",
        "working",
      );
      assert.strictEqual(responsibility, "Design scalable components");
    });

    it("returns undefined for unknown capability", () => {
      const responsibility = getCapabilityResponsibility(
        testCategories,
        "unknown",
        "working",
      );
      assert.strictEqual(responsibility, undefined);
    });

    it("returns undefined for unknown level", () => {
      const responsibility = getCapabilityResponsibility(
        testCategories,
        "scale",
        "mythical",
      );
      assert.strictEqual(responsibility, undefined);
    });
  });
});

describe("Standard emoji function", () => {
  describe("getConceptEmoji", () => {
    const testStandard = {
      entityDefinitions: {
        driver: { emojiIcon: "🎯" },
        skill: { emojiIcon: "💼" },
        behaviour: { emojiIcon: "🧠" },
        discipline: { emojiIcon: "🔧" },
        level: { emojiIcon: "📊" },
        track: { emojiIcon: "🛤️" },
      },
    };

    it("returns emoji for valid concept", () => {
      assert.strictEqual(getConceptEmoji(testStandard, "driver"), "🎯");
      assert.strictEqual(getConceptEmoji(testStandard, "skill"), "💼");
      assert.strictEqual(getConceptEmoji(testStandard, "behaviour"), "🧠");
      assert.strictEqual(getConceptEmoji(testStandard, "discipline"), "🔧");
      assert.strictEqual(getConceptEmoji(testStandard, "level"), "📊");
      assert.strictEqual(getConceptEmoji(testStandard, "track"), "🛤️");
    });

    it("returns default emoji for unknown concept", () => {
      const emoji = getConceptEmoji(testStandard, "unknown");
      assert.strictEqual(emoji, "💡");
    });

    it("returns default emoji when standard is null", () => {
      const emoji = getConceptEmoji(null, "driver");
      assert.strictEqual(emoji, "💡");
    });

    it("returns default emoji when concept has no emoji", () => {
      const standard = { entityDefinitions: { driver: { name: "Drivers" } } };
      const emoji = getConceptEmoji(standard, "driver");
      assert.strictEqual(emoji, "💡");
    });
  });
});
