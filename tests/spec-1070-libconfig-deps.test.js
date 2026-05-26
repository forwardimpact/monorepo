/**
 * Manifest assertion: each of the four products (map, landmark, summit, guide)
 * declares `@forwardimpact/libconfig` in `dependencies` at a range whose
 * `semver.minVersion` is exactly `0.1.79` — the first published version
 * that ships `bootstrapProject`.
 */
import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import semver from "semver";

const ROOT = resolve(import.meta.dirname, "..");
const PRODUCTS = ["map", "landmark", "summit", "guide"];
const FLOOR = "0.1.79";
const PACKAGE = "@forwardimpact/libconfig";

describe("libconfig declared at floor 0.1.79", () => {
  for (const product of PRODUCTS) {
    test(`products/${product}/package.json declares ${PACKAGE} at >= ${FLOOR}`, () => {
      const manifest = JSON.parse(
        readFileSync(
          resolve(ROOT, "products", product, "package.json"),
          "utf8",
        ),
      );
      const range = manifest.dependencies?.[PACKAGE];
      assert.ok(
        range,
        `products/${product}/package.json must declare ${PACKAGE} in dependencies`,
      );
      const min = semver.minVersion(range);
      assert.ok(
        min,
        `range "${range}" in products/${product}/package.json is not a valid semver range`,
      );
      assert.strictEqual(
        min.version,
        FLOOR,
        `products/${product}/package.json declares ${PACKAGE} at ${range} (minVersion ${min.version}); libconfig dependency must meet minVersion ${FLOOR}`,
      );
    });
  }
});
