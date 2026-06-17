import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { extractRefs } from "../src/action-refs.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(here, "fixtures", "skill-refs-prefix");

function loadFixture() {
  const rel = [
    "SKILL.md",
    "references/workflow-agent.md",
    "references/workflow-facilitate.md",
    "references/workflow-react.md",
  ];
  return rel.map((path) => ({
    path: `.claude/skills/kata-setup/${path}`,
    text: readFileSync(join(fixtureRoot, path), "utf8"),
  }));
}

describe("extractRefs", () => {
  test("classifies post-@ token shapes", () => {
    const refs = extractRefs([
      {
        path: "a/SKILL.md",
        text: [
          "- uses: forwardimpact/kata-agent@b4a5b262 # v1.0.0",
          "- uses: forwardimpact/kata-agent@{{KATA_AGENT_REF}}",
          "- uses: forwardimpact/kata-agent@<full-sha>",
          "the `forwardimpact/fit-benchmark` action",
        ].join("\n"),
      },
    ]);
    const byLine = Object.fromEntries(refs.map((r) => [r.line, r]));
    assert.strictEqual(byLine[1].class, "qualified");
    assert.strictEqual(byLine[1].refToken.kind, "literal");
    assert.strictEqual(byLine[2].class, "placeholder");
    assert.strictEqual(byLine[2].refToken.kind, "placeholder");
    assert.strictEqual(byLine[3].class, "illustrative");
    assert.strictEqual(byLine[3].refToken.kind, "illustrative");
    assert.strictEqual(byLine[4].class, "contextual-qualified");
    assert.strictEqual(byLine[4].refToken.kind, "none");
  });

  test("drops path-form, npm, and fully-schematic tokens", () => {
    const refs = extractRefs([
      {
        path: "a/SKILL.md",
        text: [
          "uses: ./.github/actions/foo",
          "the `bar/action.yml` path string",
          "npm install @forwardimpact/libskill",
          "a `<owner>/<repo>@<ref>` schematic token",
        ].join("\n"),
      },
    ]);
    // None of these name a real action repository.
    assert.ok(
      !refs.some((r) => r.owner === "@forwardimpact"),
      "npm specifier dropped",
    );
    assert.ok(
      !refs.some((r) => r.repo === "action.yml"),
      "path string dropped",
    );
    assert.ok(
      !refs.some((r) => r.owner === "<owner>"),
      "schematic token dropped",
    );
    assert.ok(
      !refs.some((r) => r.owner === "."),
      "local path dropped",
    );
  });

  test("owner-less package/metric prose extracts as contextual (not dropped)", () => {
    const refs = extractRefs([
      {
        path: "a/SKILL.md",
        text: [
          "install `libfoo@v0.1.5` and `pathway@v0.25.0`",
          "measure `pass@k` across runs",
          "run `fit-codegen` to generate",
        ].join("\n"),
      },
    ]);
    assert.ok(refs.some((r) => r.repo === "libfoo" && r.class === "contextual"));
    assert.ok(
      refs.some((r) => r.repo === "pathway" && r.class === "contextual"),
    );
    assert.ok(refs.some((r) => r.repo === "pass" && r.class === "contextual"));
    assert.ok(
      refs.some((r) => r.repo === "fit-codegen" && r.class === "contextual"),
    );
  });

  test("the pre-fix corpus yields the 11 kata-action-* sites", () => {
    const refs = extractRefs(loadFixture());
    const defect = refs.filter(
      (r) => r.repo === "kata-action-agent" || r.repo === "kata-action-eval",
    );
    // 11 reference-carrying lines; the workflow-react.md bare-name line carries
    // two tokens, for 12 finding-bearing tokens total.
    const sites = new Set(defect.map((r) => `${r.file}:${r.line}`));
    assert.strictEqual(sites.size, 11, "11 reference-carrying sites");
    assert.strictEqual(defect.length, 12, "12 tokens (react bare-name = 2)");

    // The two-token react site.
    const reactBare = defect.filter((r) =>
      r.file.endsWith("workflow-react.md"),
    );
    const reactBareNames = reactBare
      .filter((r) => r.line === 103)
      .map((r) => r.repo)
      .sort();
    assert.deepStrictEqual(reactBareNames, [
      "kata-action-agent",
      "kata-action-eval",
    ]);
  });
});
