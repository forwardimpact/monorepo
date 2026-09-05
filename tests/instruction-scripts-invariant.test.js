// Prove each instruction-scripts failure mode fires through the same engine
// `jidoka invariants` runs. Every case builds a scratch repository, runs the
// rule module through runRuleModules, and asserts the finding ids. A layer
// that runs a script the pack cannot carry works in this repository and fails
// in every installation, so the invariant has to stop the line before the
// pack ships. The live tree is not re-run here: `bun run invariants` is that
// enforcement (CONTRIBUTING.md § Testing).
import { test, describe, afterEach } from "node:test";
import assert from "node:assert";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

import { runRuleModules } from "@forwardimpact/libinvariant";
import { createTestRuntime } from "@forwardimpact/libmock";

import mod from "../.jidoka/invariants/instruction-scripts.rules.mjs";
import { fsSync, withRepo } from "../libraries/libinvariant/test/helpers.js";

const PROFILE = `---
name: staff-engineer
description: Owns the design arc.
---

## Every Run
`;

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

describe("instruction-scripts invariant", () => {
  test("clean: a skill runs its own script from the skill root", async () => {
    const findings = await runOn({
      ".claude/skills/req-scan/SKILL.md": "Run `node scripts/state.mjs`.\n",
      ".claude/skills/req-scan/scripts/state.mjs": "// state\n",
    });
    assert.deepEqual(findings, []);
  });

  test("clean: a reference file addresses the skill root", async () => {
    const findings = await runOn({
      ".claude/skills/req-scan/SKILL.md": "See the reference.\n",
      ".claude/skills/req-scan/references/state.md":
        "Run `node scripts/state.mjs`.\n",
      ".claude/skills/req-scan/scripts/state.mjs": "// state\n",
    });
    assert.deepEqual(findings, []);
  });

  test("clean: a layer addresses its script from the install root", async () => {
    const findings = await runOn({
      ".claude/skills/deck/SKILL.md":
        "Run `node .claude/skills/deck/scripts/render.mjs`.\n",
      ".claude/skills/deck/scripts/render.mjs": "// render\n",
    });
    assert.deepEqual(findings, []);
  });

  test("clean: a layer runs a sibling skill's script from the same pack", async () => {
    const findings = await runOn({
      ".claude/skills/req-bundle/SKILL.md":
        "Run `node .claude/skills/req-workday/scripts/parse.mjs`.\n",
      ".claude/skills/req-workday/scripts/parse.mjs": "// parse\n",
    });
    assert.deepEqual(findings, []);
  });

  test("clean: an agent profile runs a skill script the pack carries", async () => {
    const findings = await runOn({
      ".claude/agents/librarian.md": `${PROFILE}Run \`node .claude/skills/deck/scripts/render.mjs\`.\n`,
      ".claude/skills/deck/scripts/render.mjs": "// render\n",
    });
    assert.deepEqual(findings, []);
  });

  test("clean: prose names a root script without running it", async () => {
    const findings = await runOn({
      ".claude/skills/monorepo-setup/SKILL.md":
        "Confirm `scripts/bootstrap.sh` exists and is executable.\n",
      "scripts/bootstrap.sh": "#!/usr/bin/env bash\n",
    });
    assert.deepEqual(findings, []);
  });

  test("clean: the allow list exempts a command written for another repo", async () => {
    const findings = await runOn({
      ".jidoka/invariants/instruction-scripts.allow.yml":
        ".claude/skills/setup/SKILL.md:\n  - scripts/bootstrap.sh\n",
      ".claude/skills/setup/SKILL.md":
        'Write `"command": "bash scripts/bootstrap.sh"` into settings.\n',
    });
    assert.deepEqual(findings, []);
  });

  test("fails: an agent profile runs a root script", async () => {
    const findings = await runOn({
      ".claude/agents/staff-engineer.md": `${PROFILE}Run \`Bash: node scripts/record-prior-trace.mjs\` at boot.\n`,
      "scripts/record-prior-trace.mjs": "// recorder\n",
    });
    assert.deepEqual(ids(findings), ["instruction-scripts.outside-pack"]);
  });

  test("fails: a skill runs a root script", async () => {
    const findings = await runOn({
      ".claude/skills/audit/SKILL.md": "Run `bash scripts/wiki-audit.sh`.\n",
      "scripts/wiki-audit.sh": "#!/usr/bin/env bash\n",
    });
    assert.deepEqual(ids(findings), ["instruction-scripts.outside-pack"]);
  });

  test("fails: a relative path climbs out of the skill directory", async () => {
    const findings = await runOn({
      ".claude/skills/audit/SKILL.md":
        "Run `node ../../../scripts/audit.mjs`.\n",
      "scripts/audit.mjs": "// audit\n",
    });
    assert.deepEqual(ids(findings), ["instruction-scripts.outside-pack"]);
  });

  test("fails: the script the layer runs does not exist", async () => {
    const findings = await runOn({
      ".claude/skills/audit/SKILL.md": "Run `node scripts/missing.mjs`.\n",
    });
    assert.deepEqual(ids(findings), ["instruction-scripts.outside-pack"]);
  });

  test("fails: one finding per line, and a repeat line reports once", async () => {
    const findings = await runOn({
      ".claude/skills/audit/SKILL.md":
        "Run `node scripts/a.mjs`.\nThen `node scripts/a.mjs` again.\n",
    });
    assert.equal(findings.length, 2);
    assert.deepEqual(
      findings.map((f) => f.lineNo),
      [1, 2],
    );
  });

  test("clean: a released installer URL is a download, not a path", async () => {
    const findings = await runOn({
      ".claude/skills/setup/SKILL.md":
        "Run `curl -fsSL https://example.com/fit-install.sh | bash`.\n",
    });
    assert.deepEqual(findings, []);
  });

  test("clean: a bare CLI invocation carries no script path", async () => {
    const findings = await runOn({
      ".claude/skills/audit/SKILL.md": "Run `bunx fit-map validate`.\n",
    });
    assert.deepEqual(findings, []);
  });
});
