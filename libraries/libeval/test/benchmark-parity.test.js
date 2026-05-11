/**
 * Skill ↔ CLI documentation parity (spec 870 plan-a Step 14).
 *
 * `.claude/skills/CLAUDE.md` requires the skill's `## Documentation` list and
 * the CLI's `documentation` array to carry the same entries in the same
 * order. This test asserts structural equality: title, url, and description
 * tuples must match.
 */

import { describe, test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { definition } from "../bin/fit-benchmark.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = resolve(
  HERE,
  "../../../.claude/skills/fit-benchmark/SKILL.md",
);

function isBulletStop(line) {
  return line.startsWith("- ") || line.startsWith("## ");
}

function collectDescriptionLines(lines, start) {
  let description = "";
  let j = start;
  while (j < lines.length) {
    if (isBulletStop(lines[j])) break;
    const trimmed = lines[j].trim();
    if (trimmed !== "") {
      const descPart = trimmed.replace(/^—\s*/, "");
      description += description ? ` ${descPart}` : descPart;
    }
    j++;
  }
  return { description: description.replace(/\s+/g, " ").trim(), nextIndex: j };
}

function parseBullet(lines, i) {
  const titleUrlMatch = lines[i].match(/^- \[([^\]]+)\]\(([^)]+)\)/);
  if (!titleUrlMatch) {
    throw new Error(`Malformed bullet at line ${i + 1}: ${lines[i]}`);
  }
  const [, title, url] = titleUrlMatch;
  const { description, nextIndex } = collectDescriptionLines(lines, i + 1);
  return { entry: { title, url, description }, nextIndex };
}

function parseSkillDocumentation(md) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.trim() === "## Documentation");
  if (start === -1) {
    throw new Error("Skill is missing ## Documentation section");
  }
  const entries = [];
  let i = start + 1;
  while (i < lines.length) {
    if (lines[i].startsWith("## ")) break;
    if (lines[i].startsWith("- [")) {
      const { entry, nextIndex } = parseBullet(lines, i);
      entries.push(entry);
      i = nextIndex;
      continue;
    }
    i++;
  }
  return entries;
}

function normalise(s) {
  return s.replace(/\s+/g, " ").trim();
}

describe("fit-benchmark skill ↔ CLI documentation parity", () => {
  test("skill ## Documentation list matches CLI definition.documentation array", () => {
    const md = readFileSync(SKILL_PATH, "utf8");
    const skillEntries = parseSkillDocumentation(md);
    const cliEntries = definition.documentation;
    assert.strictEqual(skillEntries.length, cliEntries.length, "entry count");
    for (let i = 0; i < skillEntries.length; i++) {
      assert.strictEqual(
        skillEntries[i].title,
        cliEntries[i].title,
        `title[${i}]`,
      );
      assert.strictEqual(skillEntries[i].url, cliEntries[i].url, `url[${i}]`);
      assert.strictEqual(
        normalise(skillEntries[i].description),
        normalise(cliEntries[i].description),
        `description[${i}]`,
      );
    }
  });
});
