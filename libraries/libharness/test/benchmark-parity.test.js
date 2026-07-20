/**
 * Skill ↔ CLI parity (spec criterion 13). Both must list the same
 * documentation entries in the same order — same title, same url, same
 * description.
 */

import { describe, test } from "node:test";
import assert from "node:assert";
import { readFile } from "node:fs/promises";

import { definition } from "../src/commands/benchmark-definition.js";

const SKILL_PATH = new URL(
  "../../../.claude/skills/gemba-benchmark/SKILL.md",
  import.meta.url,
).pathname;

/**
 * Parse the `## Documentation` list out of the skill markdown. Each entry
 * is shaped `- [Title](url) — description`. Returns `{title, url, description}`.
 */
function parseSkillDocumentation(body) {
  const items = collectDocumentationItems(body);
  return items.map(parseDocumentationItem).filter(Boolean);
}

function collectDocumentationItems(body) {
  const lines = body.split("\n");
  const start = lines.findIndex((l) => l.trim() === "## Documentation");
  assert.ok(start !== -1, "skill must contain a '## Documentation' section");
  const items = [];
  let current = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) break;
    if (/^- /.test(line)) {
      if (current) items.push(current);
      current = line.replace(/^- /, "").trim();
    } else if (current && line.trim().length > 0) {
      current += " " + line.trim();
    }
  }
  if (current) items.push(current);
  return items;
}

function parseDocumentationItem(item) {
  const m = /^\[([^\]]+)\]\(([^)]+)\)\s*[—-]\s*(.+)$/.exec(item);
  if (!m) return null;
  return {
    title: m[1].trim(),
    url: m[2].trim(),
    description: m[3].trim().replace(/\s+/g, " "),
  };
}

describe("gemba-benchmark: skill ↔ CLI documentation parity", () => {
  test("same titles, urls, and descriptions in the same order", async () => {
    const body = await readFile(SKILL_PATH, "utf8");
    const skillEntries = parseSkillDocumentation(body);
    const cliEntries = definition.documentation.map((d) => ({
      title: d.title,
      url: d.url,
      description: d.description.replace(/\s+/g, " ").trim(),
    }));
    assert.deepStrictEqual(skillEntries, cliEntries);
  });
});
