import { test, describe } from "node:test";
import assert from "node:assert";

import { checkInstructions } from "../src/index.js";
import { createMockFs, createTestRuntime } from "@forwardimpact/libmock";

const ROOT = "/repo";

/**
 * Build a runtime over an in-memory fs seeded with `files` (a path→content map
 * rooted at `/repo`), injected through `checkInstructions`'s `runtime` param.
 */
function runtimeWith(files = {}) {
  return createTestRuntime({ fs: createMockFs(files) });
}

describe("checkInstructions", () => {
  test("returns no findings for an empty repo", async () => {
    const findings = await checkInstructions({
      root: ROOT,
      runtime: runtimeWith(),
    });
    assert.deepStrictEqual(findings, []);
  });

  test("flags an oversized root CLAUDE.md against L1 line cap", async () => {
    const oversize = "line\n".repeat(200);
    const findings = await checkInstructions({
      root: ROOT,
      runtime: runtimeWith({ [`${ROOT}/CLAUDE.md`]: oversize }),
    });
    const f = findings.find(
      (x) =>
        x.id === "instructions.line-budget" && x.path.endsWith("CLAUDE.md"),
    );
    assert.ok(
      f,
      `expected an instructions.line-budget finding, got: ${JSON.stringify(findings)}`,
    );
    assert.match(f.message, /root CLAUDE\.md/);
    assert.equal(f.level, "fail");
  });

  test("flags an oversized subdir CLAUDE.md at the tighter 128-line cap", async () => {
    // 140 lines exceeds the 128-line subdir cap but stays under the 192
    // root cap — proves the tighter rule applies to subdirectories only.
    const oversize = "line\n".repeat(140);
    const findings = await checkInstructions({
      root: ROOT,
      runtime: runtimeWith({ [`${ROOT}/products/CLAUDE.md`]: oversize }),
    });
    const f = findings.find(
      (x) =>
        x.id === "instructions.line-budget" &&
        x.path.endsWith("products/CLAUDE.md"),
    );
    assert.ok(
      f,
      `expected an instructions.line-budget finding for products/CLAUDE.md, got: ${JSON.stringify(findings)}`,
    );
    assert.match(f.message, /subdir CLAUDE\.md/);
  });

  test("flags an oversized agent reference at the 192-line cap", async () => {
    const oversize = "line\n".repeat(200);
    const findings = await checkInstructions({
      root: ROOT,
      runtime: runtimeWith({
        [`${ROOT}/.claude/agents/references/big.md`]: oversize,
      }),
    });
    const f = findings.find(
      (x) =>
        x.id === "instructions.line-budget" &&
        x.path.endsWith(".claude/agents/references/big.md"),
    );
    assert.ok(
      f,
      `expected an agent-reference line-budget finding, got: ${JSON.stringify(findings)}`,
    );
    assert.match(f.message, /agent reference/);
  });

  test("admits memory-protocol.md above the default L4 cap", async () => {
    // 200 lines exceeds the 192-line default agent-reference cap but stays
    // under the memory-protocol override (212) — proves the per-file budget
    // applies to this one reference.
    const oversize = "line\n".repeat(200);
    const findings = await checkInstructions({
      root: ROOT,
      runtime: runtimeWith({
        [`${ROOT}/.claude/agents/references/memory-protocol.md`]: oversize,
      }),
    });
    const f = findings.find(
      (x) =>
        x.id === "instructions.line-budget" &&
        x.path.endsWith("memory-protocol.md"),
    );
    assert.equal(
      f,
      undefined,
      `expected no line-budget finding under the override, got: ${JSON.stringify(findings)}`,
    );
  });

  test("flags memory-protocol.md above its override cap", async () => {
    const oversize = "line\n".repeat(220);
    const findings = await checkInstructions({
      root: ROOT,
      runtime: runtimeWith({
        [`${ROOT}/.claude/agents/references/memory-protocol.md`]: oversize,
      }),
    });
    const f = findings.find(
      (x) =>
        x.id === "instructions.line-budget" &&
        x.path.endsWith("memory-protocol.md"),
    );
    assert.ok(
      f,
      `expected a line-budget finding above the override, got: ${JSON.stringify(findings)}`,
    );
    assert.match(f.message, /memory-protocol agent reference/);
  });

  test("admits kata-release-merge SKILL.md above the default L5 cap", async () => {
    // 250 lines exceeds the 192-line default skill cap but stays under the
    // kata-release-merge override (320) — proves the per-skill budget applies.
    const oversize = "line\n".repeat(250);
    const findings = await checkInstructions({
      root: ROOT,
      runtime: runtimeWith({
        [`${ROOT}/.claude/skills/kata-release-merge/SKILL.md`]: oversize,
      }),
    });
    const f = findings.find(
      (x) =>
        x.id === "instructions.line-budget" &&
        x.path.endsWith("kata-release-merge/SKILL.md"),
    );
    assert.equal(
      f,
      undefined,
      `expected no line-budget finding under the override, got: ${JSON.stringify(findings)}`,
    );
  });

  test("flags kata-release-merge SKILL.md above its override cap", async () => {
    const oversize = "line\n".repeat(330);
    const findings = await checkInstructions({
      root: ROOT,
      runtime: runtimeWith({
        [`${ROOT}/.claude/skills/kata-release-merge/SKILL.md`]: oversize,
      }),
    });
    const f = findings.find(
      (x) =>
        x.id === "instructions.line-budget" &&
        x.path.endsWith("kata-release-merge/SKILL.md"),
    );
    assert.ok(
      f,
      `expected a line-budget finding above the override, got: ${JSON.stringify(findings)}`,
    );
    assert.match(f.message, /kata-release-merge skill procedure/);
  });

  test("flags a checklist that exceeds 9 items", async () => {
    const items = Array.from({ length: 12 }, (_, i) => `- [ ] item ${i + 1}.`);
    const skill = [
      "# Demo",
      "",
      '<read_do_checklist goal="Test">',
      "",
      ...items,
      "",
      "</read_do_checklist>",
      "",
    ].join("\n");
    const findings = await checkInstructions({
      root: ROOT,
      runtime: runtimeWith({
        [`${ROOT}/.claude/skills/demo/SKILL.md`]: skill,
      }),
    });
    const f = findings.find((x) => x.id === "L7.too-many-items");
    assert.ok(
      f,
      `expected an L7.too-many-items finding, got: ${JSON.stringify(findings)}`,
    );
    assert.match(f.message, /12 items/);
    assert.ok(f.path.endsWith(".claude/skills/demo/SKILL.md"));
    assert.ok(typeof f.lineNo === "number" && f.lineNo > 0);
  });
});
