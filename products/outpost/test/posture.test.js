/**
 * Posture module unit tests — record read/write, the posture-less default,
 * manifest loading, and draft-side resolution.
 */
import { test, describe } from "node:test";
import assert from "node:assert";
import { createMockFs } from "@forwardimpact/libmock";

import {
  readPosture,
  writePosture,
  effectivePosture,
  loadManifest,
  draftSkills,
  POSTURES,
  DEFAULT_POSTURE,
} from "../src/posture.js";

const POSTURE_PATH = "/home/u/.fit/outpost/posture.json";
const MANIFEST_PATH = "/pkg/config/skill-postures.json";

describe("readPosture", () => {
  test("returns the recorded posture when present", async () => {
    const fs = createMockFs({
      [POSTURE_PATH]: JSON.stringify({ posture: "brief+draft" }),
    });
    assert.strictEqual(await readPosture(fs, POSTURE_PATH), "brief+draft");
  });

  test("returns null when the record is absent", async () => {
    const fs = createMockFs({});
    assert.strictEqual(await readPosture(fs, POSTURE_PATH), null);
  });

  test("returns null on unparseable content", async () => {
    const fs = createMockFs({ [POSTURE_PATH]: "not json" });
    assert.strictEqual(await readPosture(fs, POSTURE_PATH), null);
  });

  test("returns null when the value is not a committed string", async () => {
    const fs = createMockFs({
      [POSTURE_PATH]: JSON.stringify({ posture: "loud" }),
    });
    assert.strictEqual(await readPosture(fs, POSTURE_PATH), null);
  });
});

describe("writePosture", () => {
  test("persists a valid posture as a single-key record", async () => {
    const fs = createMockFs({});
    await writePosture(fs, POSTURE_PATH, "brief");
    assert.strictEqual(
      await readPosture(fs, POSTURE_PATH),
      "brief",
      "round-trips through readPosture",
    );
    assert.strictEqual(fs.data.get(POSTURE_PATH), '{"posture":"brief"}\n');
  });

  test("rejects an invalid posture", async () => {
    const fs = createMockFs({});
    await assert.rejects(
      () => writePosture(fs, POSTURE_PATH, "loud"),
      /invalid posture/,
    );
  });
});

describe("effectivePosture", () => {
  test("defaults a null record to brief (interim window)", () => {
    assert.strictEqual(effectivePosture(null), DEFAULT_POSTURE);
    assert.strictEqual(effectivePosture(null), "brief");
  });

  test("passes a recorded posture through", () => {
    assert.strictEqual(effectivePosture("brief+draft"), "brief+draft");
  });
});

describe("loadManifest / draftSkills", () => {
  test("loads the manifest and resolves the draft set", async () => {
    const manifest = {
      "draft-emails": "draft",
      "send-chat": "draft",
      "meeting-prep": "brief",
    };
    const fs = createMockFs({ [MANIFEST_PATH]: JSON.stringify(manifest) });
    const loaded = await loadManifest(fs, MANIFEST_PATH);
    assert.deepStrictEqual(draftSkills(loaded), ["draft-emails", "send-chat"]);
  });
});

describe("committed strings", () => {
  test("POSTURES are exactly the two spec-committed identifiers", () => {
    assert.deepStrictEqual(POSTURES, ["brief", "brief+draft"]);
  });
});
