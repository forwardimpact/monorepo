import { describe, test } from "node:test";
import assert from "node:assert";

import {
  colorForSource,
  ERROR_COLOR,
  RESET,
  paletteSize,
} from "../src/render/palette.js";

describe("palette.colorForSource", () => {
  test("is deterministic — same name always maps to the same color", () => {
    const first = colorForSource("staff-engineer");
    for (let i = 0; i < 100; i++) {
      assert.strictEqual(colorForSource("staff-engineer"), first);
    }
  });

  test("never returns the reserved error color for any profile name", () => {
    const profiles = [
      "facilitator",
      "staff-engineer",
      "security-engineer",
      "product-manager",
      "technical-writer",
      "improvement-coach",
      "release-engineer",
      "supervisor",
      "agent",
      "orchestrator",
    ];
    for (const name of profiles) {
      assert.notStrictEqual(colorForSource(name), ERROR_COLOR);
    }
  });

  test("assigns 6 distinct colors to the facilitator + 5 domain agents", () => {
    const cast = [
      "facilitator",
      "staff-engineer",
      "security-engineer",
      "product-manager",
      "technical-writer",
      "improvement-coach",
    ];
    const colors = new Set(cast.map(colorForSource));
    assert.strictEqual(
      colors.size,
      cast.length,
      `expected ${cast.length} distinct colors for ${cast.join(", ")}, got ${colors.size}`,
    );
  });

  test("returns RESET for empty or missing names", () => {
    assert.strictEqual(colorForSource(""), RESET);
    assert.strictEqual(colorForSource(null), RESET);
    assert.strictEqual(colorForSource(undefined), RESET);
  });

  test("ERROR_COLOR is the 24-bit RGB red escape", () => {
    assert.strictEqual(ERROR_COLOR, "\u001b[38;2;241;76;76m");
  });

  test("RESET is the SGR reset sequence", () => {
    assert.strictEqual(RESET, "\u001b[0m");
  });

  test("palette has at least 8 colors (≥ largest cast + headroom)", () => {
    assert.ok(
      paletteSize() >= 8,
      `palette must cover ≥ 6 agents with headroom; got ${paletteSize()}`,
    );
  });

  test("every palette slot is distinct", () => {
    // Probe a wide range of names to enumerate all palette slots in use.
    const reached = new Set();
    for (let i = 0; i < 1000; i++) {
      reached.add(colorForSource(`probe-${i}`));
    }
    // Every slot reached should be a unique string.
    assert.strictEqual(reached.size, new Set([...reached]).size);
    // None of the reached slots should be the error color.
    for (const c of reached) {
      assert.notStrictEqual(c, ERROR_COLOR);
    }
  });
});
