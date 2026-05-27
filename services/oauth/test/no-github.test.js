import { test, describe } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serviceDir = resolve(__dirname, "..");

describe("oauth no-github (SC#3)", () => {
  test("no github or octokit references in oauth source (excluding tests and docs)", () => {
    let output = "";
    try {
      output = execSync(
        `rg -i 'github|octokit' ${serviceDir} -g '!test/' -g '!*.md' -g '!*.json' --no-filename`,
        { encoding: "utf-8" },
      );
    } catch {
      output = "";
    }

    assert.strictEqual(
      output.trim(),
      "",
      `oauth source must not contain github/octokit references, found:\n${output}`,
    );
  });
});
