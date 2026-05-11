import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

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
  return {
    skillDirs,
    layers: [
      {
        id: "L1",
        name: "CLAUDE.md",
        maxLines: 192,
        maxWords: 896,
        files: await findByName(root, "CLAUDE.md", "file"),
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
        maxWords: 1408,
        files: ["JTBD.md"],
      },
      {
        id: "L3",
        name: "agent profile",
        maxLines: 64,
        maxWords: 384,
        files: await findAgentProfiles(root, claudeDirs),
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

async function checkLayer(root, layer, errors) {
  for (const path of layer.files) {
    const text = await readText(root, path);
    if (text == null) continue;
    const lines = lineCount(text);
    const words = wordCount(text);
    if (lines > layer.maxLines) {
      errors.push(
        `${path} has ${lines} lines (max ${layer.maxLines}, ${layer.id} ${layer.name})`,
      );
    }
    if (words > layer.maxWords) {
      errors.push(
        `${path} has ${words} words (max ${layer.maxWords}, ${layer.id} ${layer.name})`,
      );
    }
  }
}

async function checkChecklists(root, sources, errors) {
  for (const path of sources) {
    const text = await readText(root, path);
    if (text == null) continue;
    let m;
    let index = 0;
    while ((m = CHECKLIST_RE.exec(text))) {
      index += 1;
      const type = m[1];
      const items = m[2].split(ITEM_SPLIT_RE).slice(1);
      if (items.length > L6_MAX_ITEMS) {
        errors.push(
          `${path} checklist #${index} (${type}) has ${items.length} items (max ${L6_MAX_ITEMS}, L6 checklist)`,
        );
      }
      items.forEach((raw, i) => {
        const w = wordCount(raw.trim());
        if (w > L6_MAX_WORDS_PER_ITEM) {
          errors.push(
            `${path} checklist #${index} (${type}) item ${i + 1} has ${w} words (max ${L6_MAX_WORDS_PER_ITEM}, L6 checklist item)`,
          );
        }
      });
    }
  }
}

/**
 * Walk the repo rooted at `root`, applying the L1–L6 caps from COALIGNED.md.
 * Each layer is gated by a line cap AND a word cap; either breach fails.
 *
 * @param {{ root: string }} options
 * @returns {Promise<string[]>} List of human-readable error messages; empty when the repo is conformant.
 */
export async function checkInstructions({ root }) {
  const errors = [];
  const { layers, skillDirs } = await buildLayers(root);

  for (const layer of layers) await checkLayer(root, layer, errors);

  const checklistSources = [
    "CONTRIBUTING.md",
    ...skillDirs.map((d) => `${d}/SKILL.md`),
  ];
  await checkChecklists(root, checklistSources, errors);

  return errors;
}
