import { describe, test } from "node:test";
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("libconfig README — Bootstrap onboarding contract", () => {
  test("documents entry point, namespace declaration, overwrite-intent, and libsecret cross-link", async () => {
    const text = await readFile(join(__dirname, "..", "README.md"), "utf8");
    const heading = "## Bootstrap";
    const idx = text.indexOf(heading);
    assert.ok(idx >= 0, "README is missing the `## Bootstrap` section");
    // Scope substring assertions to the new section so unrelated mentions
    // elsewhere can't satisfy them.
    const nextHeading = text.indexOf("\n## ", idx + heading.length);
    const section = text.slice(idx, nextHeading >= 0 ? nextHeading : undefined);
    for (const needle of [
      "bootstrapProject",
      "fragment",
      "overwrites",
      "libsecret",
    ]) {
      assert.ok(
        section.includes(needle),
        `README ## Bootstrap section missing "${needle}"`,
      );
    }
  });
});
