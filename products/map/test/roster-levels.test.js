/**
 * Unit tests for the seeding invariant: every seeded level must exist
 * in the installed standard's levels.yaml, and the check is vacuous
 * (skipped) when no standard is installed.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createTestRuntime, createMockFs } from "@forwardimpact/libmock";

import { assertSeededLevelsCovered } from "../src/lib/roster-levels.js";

function orgClient(people) {
  return {
    from: () => ({
      select: () => ({ order: async () => ({ data: people, error: null }) }),
    }),
  };
}

const STARTER_LEVELS = "- id: J040\n- id: J060\n";

describe("assertSeededLevelsCovered", () => {
  test("throws naming each missing level once, sorted", async () => {
    const runtime = createTestRuntime({
      fs: createMockFs({ "/work/data/pathway/levels.yaml": STARTER_LEVELS }),
    });

    await assert.rejects(
      () =>
        assertSeededLevelsCovered({
          supabase: orgClient([
            { level: "J040" },
            { level: "J100" },
            { level: "J080" },
            { level: "J080" },
          ]),
          pathwayDir: "/work/data/pathway",
          runtime,
        }),
      /missing from the installed standard.*J080, J100/,
    );
  });

  test("passes when every seeded level is installed; null levels ignored", async () => {
    const runtime = createTestRuntime({
      fs: createMockFs({ "/work/data/pathway/levels.yaml": STARTER_LEVELS }),
    });

    await assertSeededLevelsCovered({
      supabase: orgClient([{ level: "J040" }, { level: null }]),
      pathwayDir: "/work/data/pathway",
      runtime,
    });
  });

  test("skips without querying when no standard is installed", async () => {
    const runtime = createTestRuntime({ fs: createMockFs({}) });
    const neverQueried = {
      from: () => {
        throw new Error("must not query without an installed standard");
      },
    };

    await assertSeededLevelsCovered({
      supabase: neverQueried,
      pathwayDir: "/work/data/pathway",
      runtime,
    });
  });
});
