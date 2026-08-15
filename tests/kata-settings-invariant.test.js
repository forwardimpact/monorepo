// Prove each kata-settings failure mode fires through the same engine
// `jidoka invariants` runs. Every case builds a scratch repository, runs
// the rule module through runRuleModules, and asserts the finding ids. A
// failing settings file can never sit committed on `main`, so these
// fixture runs demonstrate that the invariant stops the line.
import { test, describe, afterEach } from "node:test";
import assert from "node:assert";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

import { runRuleModules } from "@forwardimpact/libinvariant";
import { createTestRuntime } from "@forwardimpact/libmock";

import mod, { VOCABULARY } from "../.jidoka/invariants/kata-settings.rules.mjs";
import { fsSync, withRepo } from "../libraries/libinvariant/test/helpers.js";

const TRUST_REF = `# Trust Settings

<setting key="trustSource" default="top-contributors">

| Option | Meaning |
| --- | --- |
| \`top-contributors\` (default) | Trust the ranking. |
| \`allowlist\` | Trust the list. |

</setting>

<setting key="trustContributorCount" default="7">

Integer, minimum 1.

</setting>

<setting key="trustAllowlist" default="[]">

String list of tracker logins.

</setting>
`;

const RIGOR_REF = `# Rigor Settings

<setting key="reviewPanel" default="standard">

| Profile | Spec panels |
| --- | --- |
| \`light\` | product 1 |
| \`standard\` (default) | product 3 |
| \`thorough\` | product 5 |

</setting>

<setting key="reviewBlockingSeverity" default="medium">

| Option | Meaning |
| --- | --- |
| \`blocker\` | Blocker only. |
| \`high\` | Blocker and high. |
| \`medium\` (default) | Blocker, high, and medium. |
| \`low\` | Every confirmed finding. |

</setting>
`;

const CLEAN_REFS = {
  ".claude/skills/kata-release-merge/references/settings.md": TRUST_REF,
  ".claude/skills/kata-review/references/settings.md": RIGOR_REF,
};

const roots = [];

function runOn(layout) {
  const root = withRepo(layout);
  roots.push(root);
  const runtime = createTestRuntime({ fsSync });
  return runRuleModules([mod], {
    root,
    runtime,
    dir: resolve(root, ".jidoka/invariants"),
  });
}

const ids = (findings) => findings.map((f) => f.id).sort();

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

describe("kata-settings invariant", () => {
  test("clean: valid file and blocks that match VOCABULARY", async () => {
    const findings = await runOn({
      ...CLEAN_REFS,
      ".kata/settings.json": JSON.stringify({
        trustSource: "allowlist",
        trustAllowlist: ["alice"],
        reviewPanel: "light",
      }),
    });
    assert.deepEqual(findings, []);
  });

  test("absent settings file is clean", async () => {
    const findings = await runOn(CLEAN_REFS);
    assert.deepEqual(findings, []);
  });

  test("unknown key in the settings file", async () => {
    const findings = await runOn({
      ...CLEAN_REFS,
      ".kata/settings.json": JSON.stringify({ cadence: "daily" }),
    });
    assert.deepEqual(ids(findings), ["kata-settings.unknown-key"]);
  });

  test("out-of-vocabulary value", async () => {
    const findings = await runOn({
      ...CLEAN_REFS,
      ".kata/settings.json": JSON.stringify({ trustSource: "ranking" }),
    });
    assert.deepEqual(ids(findings), ["kata-settings.invalid-value"]);
  });

  test("under-minimum integer and non-list allowlist give two findings", async () => {
    const findings = await runOn({
      ...CLEAN_REFS,
      ".kata/settings.json": JSON.stringify({
        trustContributorCount: 0,
        trustAllowlist: "alice",
      }),
    });
    assert.deepEqual(ids(findings), [
      "kata-settings.invalid-value",
      "kata-settings.invalid-value",
    ]);
  });

  test("unparseable settings file", async () => {
    const findings = await runOn({
      ...CLEAN_REFS,
      ".kata/settings.json": "{ not json",
    });
    assert.deepEqual(ids(findings), ["kata-settings.file-invalid"]);
  });

  test("non-flat settings value", async () => {
    const findings = await runOn({
      ...CLEAN_REFS,
      ".kata/settings.json": JSON.stringify({ trust: { source: "x" } }),
    });
    assert.ok(ids(findings).includes("kata-settings.file-invalid"));
  });

  test("selector table option column differs from the vocabulary", async () => {
    const brokenRigor = RIGOR_REF.replace("| `thorough` | product 5 |\n", "");
    const findings = await runOn({
      ...CLEAN_REFS,
      ".claude/skills/kata-review/references/settings.md": brokenRigor,
    });
    assert.deepEqual(ids(findings), ["kata-settings.table-drift"]);
  });

  test("zero (default) marks", async () => {
    const noMark = TRUST_REF.replace(
      "| `top-contributors` (default) |",
      "| `top-contributors` |",
    );
    const findings = await runOn({
      ...CLEAN_REFS,
      ".claude/skills/kata-release-merge/references/settings.md": noMark,
    });
    assert.deepEqual(ids(findings), ["kata-settings.table-drift"]);
  });

  test("mark on a row that is not the default attribute", async () => {
    const wrongMark = RIGOR_REF.replace(
      "| `light` | product 1 |",
      "| `light` (default) | product 1 |",
    ).replace("| `standard` (default) |", "| `standard` |");
    const findings = await runOn({
      ...CLEAN_REFS,
      ".claude/skills/kata-review/references/settings.md": wrongMark,
    });
    assert.deepEqual(ids(findings), ["kata-settings.table-drift"]);
  });

  test("block default attribute differs from the vocabulary default", async () => {
    const wrongDefault = TRUST_REF.replace(
      '<setting key="trustContributorCount" default="7">',
      '<setting key="trustContributorCount" default="5">',
    );
    const findings = await runOn({
      ...CLEAN_REFS,
      ".claude/skills/kata-release-merge/references/settings.md": wrongDefault,
    });
    assert.deepEqual(ids(findings), ["kata-settings.default-drift"]);
  });

  test("missing and duplicate blocks", async () => {
    const trustTwice = TRUST_REF.replace(
      '<setting key="trustAllowlist" default="[]">\n\nString list of tracker logins.\n\n</setting>\n',
      `<setting key="trustSource" default="top-contributors">

| Option | Meaning |
| --- | --- |
| \`top-contributors\` (default) | Trust the ranking. |
| \`allowlist\` | Trust the list. |

</setting>
`,
    );
    const findings = await runOn({
      ...CLEAN_REFS,
      ".claude/skills/kata-release-merge/references/settings.md": trustTwice,
    });
    const drift = findings.filter(
      (f) => f.id === "kata-settings.block-key-drift",
    );
    assert.equal(drift.length, 2);
    assert.ok(drift.some((f) => f.message.includes("trustAllowlist")));
    assert.ok(drift.some((f) => f.message.includes("2 <setting> blocks")));
  });

  test("malformed opening tag and unclosed block", async () => {
    const broken = `${TRUST_REF}
<setting key="trustSource" default="top-contributors" type="select">

</setting>

<setting key="reviewPanel"
  default="standard">

</setting>
`;
    const findings = await runOn({
      ...CLEAN_REFS,
      ".claude/skills/kata-release-merge/references/settings.md": broken,
    });
    const grammar = findings.filter(
      (f) => f.id === "kata-settings.block-grammar",
    );
    assert.equal(grammar.length, 2);
  });

  test("fenced example blocks do not register", async () => {
    const fenced = `# Reference

\`\`\`markdown
<setting key="exampleKey" default="option-a">

| Option | Meaning |
| --- | --- |
| \`option-a\` (default) | Example. |

</setting>
\`\`\`
`;
    const findings = await runOn({
      ...CLEAN_REFS,
      ".claude/agents/x-kata-settings.md": fenced,
    });
    assert.deepEqual(findings, []);
  });

  test("live repository run is clean", async () => {
    const root = resolve(import.meta.dirname, "..");
    const runtime = createTestRuntime({ fsSync });
    const findings = await runRuleModules([mod], {
      root,
      runtime,
      dir: resolve(root, ".jidoka/invariants"),
    });
    assert.deepEqual(findings, []);
  });

  test("VOCABULARY carries the five phase-1 keys", () => {
    assert.deepEqual(Object.keys(VOCABULARY).sort(), [
      "reviewBlockingSeverity",
      "reviewPanel",
      "trustAllowlist",
      "trustContributorCount",
      "trustSource",
    ]);
  });
});
