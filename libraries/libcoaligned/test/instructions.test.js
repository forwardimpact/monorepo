import { test, describe } from "node:test";
import assert from "node:assert";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkInstructions } from "../src/index.js";

async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), "libcoaligned-instr-"));
  await mkdir(join(root, ".claude", "skills", "demo"), { recursive: true });
  return root;
}

describe("checkInstructions", () => {
  test("returns no findings for an empty repo", async () => {
    const root = await makeRepo();
    try {
      const findings = await checkInstructions({ root });
      assert.deepStrictEqual(findings, []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("flags an oversized root CLAUDE.md against L1 line cap", async () => {
    const root = await makeRepo();
    try {
      const oversize = "line\n".repeat(200);
      await writeFile(join(root, "CLAUDE.md"), oversize);
      const findings = await checkInstructions({ root });
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
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("flags an oversized subdir CLAUDE.md at the tighter 128-line cap", async () => {
    const root = await makeRepo();
    try {
      await mkdir(join(root, "products"), { recursive: true });
      // 140 lines exceeds the 128-line subdir cap but stays under the 192
      // root cap — proves the tighter rule applies to subdirectories only.
      const oversize = "line\n".repeat(140);
      await writeFile(join(root, "products", "CLAUDE.md"), oversize);
      const findings = await checkInstructions({ root });
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
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("flags an oversized agent reference at the 192-line cap", async () => {
    const root = await makeRepo();
    try {
      await mkdir(join(root, ".claude", "agents", "references"), {
        recursive: true,
      });
      const oversize = "line\n".repeat(200);
      await writeFile(join(root, ".claude/agents/references/big.md"), oversize);
      const findings = await checkInstructions({ root });
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
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("flags a checklist that exceeds 9 items", async () => {
    const root = await makeRepo();
    try {
      const items = Array.from(
        { length: 12 },
        (_, i) => `- [ ] item ${i + 1}.`,
      );
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
      await writeFile(join(root, ".claude/skills/demo/SKILL.md"), skill);
      const findings = await checkInstructions({ root });
      const f = findings.find((x) => x.id === "L6.too-many-items");
      assert.ok(
        f,
        `expected an L6.too-many-items finding, got: ${JSON.stringify(findings)}`,
      );
      assert.match(f.message, /12 items/);
      assert.ok(f.path.endsWith(".claude/skills/demo/SKILL.md"));
      assert.ok(typeof f.lineNo === "number" && f.lineNo > 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
