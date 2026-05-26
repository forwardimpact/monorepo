import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { runRules } from "@forwardimpact/libutil";

const SKIP_DIRS = new Set([
  ".cache",
  ".git",
  "build",
  "dist",
  "generated",
  "node_modules",
  "tmp",
  "wiki",
  "worktrees",
]);

const L6_MAX_ITEMS = 9;
const L6_MAX_WORDS_PER_ITEM = 32;

const CHECKLIST_RE =
  /<(read_do_checklist|do_confirm_checklist)\b[^>]*>([\s\S]*?)<\/\1>/g;
const ITEM_SPLIT_RE = /^\s*-\s*\[[ xX]\]\s*/m;

const lineCount = (text) => (text.match(/\n/g) || []).length;
const wordCount = (text) => (text.match(/\S+/g) || []).length;

async function walk(root, dir, visit) {
  let entries;
  try {
    entries = await readdir(resolve(root, dir), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const path = dir === "." ? e.name : `${dir}/${e.name}`;
    await visit(e, path);
    if (e.isDirectory()) await walk(root, path, visit);
  }
}

async function listFiles(root, dir, match) {
  try {
    const entries = await readdir(resolve(root, dir), { withFileTypes: true });
    return entries.filter(match).map((e) => `${dir}/${e.name}`);
  } catch {
    return [];
  }
}

async function readText(root, path) {
  try {
    return await readFile(resolve(root, path), "utf8");
  } catch {
    return null;
  }
}

async function findByName(root, name, kind) {
  const out = [];
  await walk(root, ".", (e, path) => {
    const isMatch = kind === "file" ? e.isFile() : e.isDirectory();
    if (isMatch && e.name === name) out.push(path);
  });
  return out;
}

async function findAgentProfiles(root, claudeDirs) {
  const out = [];
  for (const d of claudeDirs) {
    const files = await listFiles(
      root,
      `${d}/agents`,
      (e) => e.isFile() && e.name.endsWith(".md"),
    );
    out.push(...files);
  }
  return out;
}

async function findAgentReferences(root, claudeDirs) {
  const out = [];
  for (const d of claudeDirs) {
    const files = await listFiles(
      root,
      `${d}/agents/references`,
      (e) => e.isFile() && e.name.endsWith(".md"),
    );
    out.push(...files);
  }
  return out;
}

async function findSkillDirs(root, claudeDirs) {
  const out = [];
  for (const d of claudeDirs) {
    const dirs = await listFiles(root, `${d}/skills`, (e) => e.isDirectory());
    out.push(...dirs);
  }
  return out;
}

async function findSkillReferences(root, skillDirs) {
  const out = [];
  for (const d of skillDirs) {
    const files = await listFiles(
      root,
      `${d}/references`,
      (e) => e.isFile() && e.name.endsWith(".md"),
    );
    out.push(...files);
  }
  return out;
}

async function buildLayers(root) {
  const claudeDirs = await findByName(root, ".claude", "dir");
  const skillDirs = await findSkillDirs(root, claudeDirs);
  const allClaude = await findByName(root, "CLAUDE.md", "file");
  const rootClaude = allClaude.filter((p) => p === "CLAUDE.md");
  const subdirClaude = allClaude.filter((p) => p !== "CLAUDE.md");
  return {
    skillDirs,
    layers: [
      {
        id: "L1",
        name: "root CLAUDE.md",
        maxLines: 192,
        maxWords: 896,
        files: rootClaude,
      },
      {
        id: "L1",
        name: "subdir CLAUDE.md",
        maxLines: 128,
        maxWords: 768,
        files: subdirClaude,
      },
      {
        id: "L2",
        name: "CONTRIBUTING.md",
        maxLines: 320,
        maxWords: 1408,
        files: ["CONTRIBUTING.md"],
      },
      {
        id: "L2",
        name: "JTBD.md",
        maxLines: 320,
        // Larger than the L2 default to absorb a fifth persona block.
        maxWords: 1664,
        files: ["JTBD.md"],
      },
      {
        id: "L3",
        name: "agent profile",
        maxLines: 72,
        maxWords: 448,
        files: await findAgentProfiles(root, claudeDirs),
      },
      {
        id: "L3",
        name: "agent reference",
        maxLines: 192,
        maxWords: 1280,
        files: await findAgentReferences(root, claudeDirs),
      },
      {
        id: "L4",
        name: "skill procedure",
        maxLines: 192,
        maxWords: 1280,
        files: skillDirs.map((d) => `${d}/SKILL.md`),
      },
      {
        id: "L5",
        name: "skill reference",
        maxLines: 128,
        maxWords: 768,
        files: await findSkillReferences(root, skillDirs),
      },
    ],
  };
}

function offsetToLine(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

// -- Subject builders ----------------------------------------------------

async function buildFileSubjects(root, layers) {
  const subjects = [];
  for (const layer of layers) {
    for (const relPath of layer.files) {
      const text = await readText(root, relPath);
      if (text == null) continue;
      subjects.push({
        path: resolve(root, relPath),
        layer: { id: layer.id, name: layer.name },
        lines: lineCount(text),
        words: wordCount(text),
        maxLines: layer.maxLines,
        maxWords: layer.maxWords,
      });
    }
  }
  return subjects;
}

async function buildChecklistSubjects(root, sources) {
  const subjects = [];
  for (const relPath of sources) {
    const text = await readText(root, relPath);
    if (text == null) continue;
    const absPath = resolve(root, relPath);
    CHECKLIST_RE.lastIndex = 0;
    let m;
    let blockIndex = 0;
    while ((m = CHECKLIST_RE.exec(text))) {
      blockIndex += 1;
      const items = m[2].split(ITEM_SPLIT_RE).slice(1);
      subjects.push({
        path: absPath,
        lineNo: offsetToLine(text, m.index),
        type: m[1],
        blockIndex,
        items: items.map((raw) => ({ words: wordCount(raw.trim()) })),
      });
    }
  }
  return subjects;
}

const HINT_LAYER_BUDGET =
  "trim prose to fit the layer cap — see COALIGNED.md for the layered-instruction model";

// -- Rule catalogue ------------------------------------------------------

export const INSTRUCTION_RULES = [
  {
    id: "instructions.line-budget",
    scope: "instruction-file",
    severity: "fail",
    check: (s) =>
      s.lines > s.maxLines ? { value: s.lines, max: s.maxLines } : null,
    message: (s, r) => `${r.value} lines (max ${r.max}, ${s.layer.name})`,
    hint: HINT_LAYER_BUDGET,
  },
  {
    id: "instructions.word-budget",
    scope: "instruction-file",
    severity: "fail",
    check: (s) =>
      s.words > s.maxWords ? { value: s.words, max: s.maxWords } : null,
    message: (s, r) => `${r.value} words (max ${r.max}, ${s.layer.name})`,
    hint: HINT_LAYER_BUDGET,
  },
  {
    id: "L6.too-many-items",
    scope: "checklist-block",
    severity: "fail",
    check: (s) =>
      s.items.length > L6_MAX_ITEMS
        ? { count: s.items.length, max: L6_MAX_ITEMS }
        : null,
    message: (s, r) =>
      `checklist #${s.blockIndex} (${s.type}) has ${r.count} items (max ${r.max})`,
    hint: "split the checklist into multiple sections, or remove items not load-bearing for the goal",
  },
  {
    id: "L6.item-too-many-words",
    scope: "checklist-block",
    severity: "fail",
    check: (s) => {
      const offenders = [];
      s.items.forEach((item, i) => {
        if (item.words > L6_MAX_WORDS_PER_ITEM) {
          offenders.push({
            itemIndex: i + 1,
            words: item.words,
            max: L6_MAX_WORDS_PER_ITEM,
          });
        }
      });
      return offenders.length === 0 ? null : offenders;
    },
    message: (s, r) =>
      `checklist #${s.blockIndex} (${s.type}) item ${r.itemIndex} has ${r.words} words (max ${r.max})`,
    hint: "rewrite the item more concisely — checklist items are pointers, not explanations",
  },
];

// -- Public entry --------------------------------------------------------

/**
 * Walk the repo rooted at `root`, applying the L1–L6 caps from COALIGNED.md.
 * Each layer is gated by a line cap AND a word cap; either breach fails.
 *
 * @param {{ root: string }} options
 * @returns {Promise<Finding[]>} Structured findings; empty when conformant.
 *   Each Finding is `{ id, level, path, lineNo?, message, hint? }` for use
 *   with `emitFindingsText` / `emitFindingsJson` from libutil.
 */
export async function checkInstructions({ root }) {
  const { layers, skillDirs } = await buildLayers(root);
  const fileSubjects = await buildFileSubjects(root, layers);
  const checklistSubjects = await buildChecklistSubjects(root, [
    "CONTRIBUTING.md",
    ...skillDirs.map((d) => `${d}/SKILL.md`),
  ]);

  const ctx = {
    subjects: {
      "instruction-file": fileSubjects,
      "checklist-block": checklistSubjects,
    },
  };
  const resolveScope = (scopeKey) => ctx.subjects[scopeKey] ?? [];
  return runRules(INSTRUCTION_RULES, ctx, { resolveScope });
}
