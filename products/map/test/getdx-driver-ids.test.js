/**
 * Anchors spec(1180) criterion 1: the starter `drivers.yaml` ids equal the
 * `ALL_DRIVERS` set the synthetic engine emits as `scoreRow.item_id`. Drift
 * on either side breaks the clean-install fit-landmark health view.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse } from "yaml";
import { ALL_DRIVERS } from "@forwardimpact/libsyntheticgen/engine/activity";

const __dirname = dirname(fileURLToPath(import.meta.url));
const starterPath = join(__dirname, "..", "starter", "drivers.yaml");

test("starter drivers.yaml id set equals ALL_DRIVERS", () => {
  const text = readFileSync(starterPath, "utf8");
  const entries = parse(text);
  const starterIds = entries.map((e) => e.id);

  assert.equal(starterIds.length, 16, "expected 16 starter driver entries");
  assert.equal(ALL_DRIVERS.length, 16, "expected 16 ALL_DRIVERS entries");

  const starterSet = new Set(starterIds);
  const allSet = new Set(ALL_DRIVERS);
  assert.deepEqual([...starterSet].sort(), [...allSet].sort());
});
