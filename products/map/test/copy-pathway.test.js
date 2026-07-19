/**
 * Unit tests for the copyPathway staging helper: wholesale replacement
 * (never a merge that blends starter and source files), the starter
 * fallback when no source pathway exists, and the self-copy guard when
 * staging into the data root itself.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createTestRuntime, createMockFs } from "@forwardimpact/libmock";

import { copyPathway } from "../src/lib/copy-activity.js";

describe("copyPathway", () => {
  test("replaces the staged pathway wholesale with the source", async () => {
    const fs = createMockFs({
      "/repo/data/pathway/levels.yaml": "- id: J080\n",
      "/work/data/pathway/levels.yaml": "- id: J040\n",
      "/work/data/pathway/starter-only.yaml": "starter\n",
    });
    const runtime = createTestRuntime({ fs });

    await copyPathway({
      source: "/repo/data/pathway",
      target: "/work",
      runtime,
    });

    assert.equal(fs.data.get("/work/data/pathway/levels.yaml"), "- id: J080\n");
    assert.equal(fs.data.has("/work/data/pathway/starter-only.yaml"), false);
  });

  test("keeps the starter fallback when no source pathway exists", async () => {
    const fs = createMockFs({
      "/work/data/pathway/levels.yaml": "- id: J040\n",
    });
    const runtime = createTestRuntime({ fs });

    await copyPathway({
      source: "/repo/data/pathway",
      target: "/work",
      runtime,
    });

    assert.equal(fs.data.get("/work/data/pathway/levels.yaml"), "- id: J040\n");
  });

  test("skips the copy when source resolves to the destination", async () => {
    const fs = createMockFs({
      "/work/data/pathway/levels.yaml": "- id: J040\n",
    });
    const runtime = createTestRuntime({ fs });

    await copyPathway({
      source: "/work/data/pathway",
      target: "/work",
      runtime,
    });

    assert.equal(fs.data.get("/work/data/pathway/levels.yaml"), "- id: J040\n");
    assert.equal(fs.rm.mock.callCount(), 0);
  });
});
